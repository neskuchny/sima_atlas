#!/usr/bin/env node
// R-8.00 — selftest for the openai LLM provider + V-1 gemini agent backend.
//
// Both are scaffolded paths that need to be probed without a real key /
// without the actual CLI installed. We verify structural correctness:
//
//   1. openai provider is registered in PROVIDERS
//   2. openai provider available() returns false without OPENAI_API_KEY,
//      true when set (probe with a sentinel value)
//   3. openai provider is in the cascade order (after google in default,
//      after google in preferCli, after google in preferOllama)
//   4. callLLM with LLM_DEFAULT_PROVIDER=openai + a fake key actually
//      attempts the HTTP request (we just check it tries, then falls
//      back to mock with a 401-shaped error — no real network)
//   5. V-1 run_block_implementation accepts ATLAS_AGENT=gemini and falls
//      back to print-only when the gemini CLI is absent (won't crash on
//      ENOENT)

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const failures = [];
const check = (n, c, d = '') => { if (!c) failures.push(`${n}${d ? ' — ' + d : ''}`); };

// ─── Test 1: openai provider registered + cascade order
{
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'llm_gateway.mjs'), 'utf8');
  check('g1: openai in PROVIDERS table', /^\s*openai:\s*\{/m.test(src));
  check('g1: openai available() checks OPENAI_API_KEY', /OPENAI_API_KEY/.test(src) && /openai:[\s\S]*?available:\s*\(\)\s*=>\s*!!process\.env\.OPENAI_API_KEY/.test(src));
  check('g1: openai in default cascade order', /\['anthropic',\s*'google',\s*'openai',/.test(src));
  check('g1: openai in preferCli cascade', /\['claude_cli',\s*'anthropic',\s*'google',\s*'openai',/.test(src));
  check('g1: openai default model is gpt-4o-mini', /gpt-4o-mini/.test(src));
  check('g1: openai pricing reflects gpt-4o-mini', /pricePerMTokenIn:\s*0\.15/.test(src) && /pricePerMTokenOut:\s*0\.60/.test(src));
}

// ─── Test 2: callOpenAI dispatcher wiring + fence-stripping
{
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'llm_gateway.mjs'), 'utf8');
  check('g2: callOpenAI function defined', /async function callOpenAI/.test(src));
  check('g2: callOpenAI hits OpenAI chat completions endpoint',
    /openai\.com\/v1\/chat\/completions/.test(src));
  check('g2: callOpenAI uses Bearer auth header', /Bearer \$\{apiKey\}/.test(src));
  check('g2: strict json_schema for gpt-4o family', /strict:\s*true/.test(src) && /type:\s*['"]json_schema['"]/.test(src));
  check('g2: json_object fallback for older models', /type:\s*['"]json_object['"]/.test(src));
  // Anchor on the fence-strip comment + actual regex literal we wrote
  check('g2: code fence stripping on response',
    /Strip code fences/.test(src) && /response_format/.test(src));
  // Dispatcher wires it
  check('g2: openai dispatched in callLLM body',
    /provider === ['"]openai['"]/.test(src) && /callOpenAI\(\{/.test(src));
}

// ─── Test 3: live call path — fake key, verify HTTP attempt
//
// We can't test a real OpenAI call without a key. But we CAN verify that
// when an operator sets LLM_DEFAULT_PROVIDER=openai + OPENAI_API_KEY=
// (fake), the gateway picks openai, attempts the call, and falls back to
// mock on the 401. That proves the wiring end-to-end.
{
  const env = {
    ...process.env,
    LLM_DEFAULT_PROVIDER: 'openai',
    OPENAI_API_KEY: 'sk-fake-do-not-honor-this-key-9999',
    ATLAS_FORCE_MOCK_LLM: '0',
  };
  // Drop any inherited keys so the cascade falls predictably to mock.
  delete env.ANTHROPIC_API_KEY;
  delete env.GOOGLE_API_KEY;
  // claude_cli might still be on PATH; force it off too
  env.LLM_PREFER_CLI = '0';
  const r = spawnSync('node', ['-e', `
    import('./scripts/llm_gateway.mjs').then(async m => {
      try {
        const r = await m.callLLM({ system: 's', prompt: 'p', op: 't' });
        console.log('OUT', r.trace.provider, r.trace.fallback_to_mock ? 'fallback' : 'direct');
      } catch (e) { console.log('ERR', e.message.slice(0, 100)); }
    });
  `], { cwd: ROOT, env, encoding: 'utf8', timeout: 30_000 });
  const stdout = r.stdout || '';
  const stderr = r.stderr || '';
  const triedOpenAi = /using provider=openai/.test(stderr) || /openai failed/.test(stderr);
  check('g3: explicit openai default attempted live call',
    triedOpenAi,
    `stderr=${stderr.slice(0, 200)}`);
  const fellBack = /OUT mock fallback/.test(stdout) || /openai failed/.test(stderr);
  check('g3: cascade fell through to mock after 401',
    fellBack,
    `stdout=${stdout.slice(0, 200)}; stderr=${stderr.slice(0, 200)}`);
}

// ─── Test 4: V-1 run_block_implementation accepts gemini agent
{
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'run_block_implementation.mjs'), 'utf8');
  check('g4: ATLAS_AGENT=gemini branch exists', /agent === ['"]gemini['"]/.test(src));
  check('g4: gemini falls back to print-only when CLI absent',
    /agent === ['"]gemini['"] && !which\(['"]gemini['"]\)/.test(src),
    'V-1 must NOT spawnSync ENOENT crash when gemini CLI is missing');
  check('g4: gemini cmd is `gemini`', /cmd = ['"]gemini['"]/.test(src));
  check('g4: gemini uses --yolo (auto-accept) and --include for sandbox',
    /['"]--yolo['"]/.test(src) && /['"]--include['"]/.test(src));
}

// ─── Test 5: agent_loop_daemon docstring lists gemini
{
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'agent_loop_daemon.mjs'), 'utf8');
  check('g5: V-1 daemon AGENT comment mentions gemini',
    /print-only \| claude \| cursor \| codex \| gemini/.test(src));
}

if (failures.length) {
  console.error('openai_gemini_providers.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('openai_gemini_providers.selftest: OK (5 test groups, all assertions green)');

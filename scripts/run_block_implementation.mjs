#!/usr/bin/env node
// PR4.5: run_block_implementation
//
// Single entry point that asks the user's coding agent to implement a block:
//   1. builds the deterministic context-pack via scripts/build_context_pack.mjs
//   2. composes a prompt = block tasks + acceptance + caller's free-form prompt
//   3. tries to invoke `claude --print --add-dir atlas/blocks/<id>` (Claude Code
//      CLI). If `claude` is not on PATH, falls back to printing a ready-to-paste
//      prompt and saving it to atlas/agent_invocations/<UTC>__<block>.txt so
//      Cursor / any other agent can pick it up.
//   4. logs an `agent_invocation` line into the block's checks.log.
//
// Usage:
//   node scripts/run_block_implementation.mjs <block_id> [-- "<additional prompt>"]
//   ATLAS_AGENT=claude node scripts/run_block_implementation.mjs b.docs -- "fix mermaid render"
//
// Env:
//   ATLAS_AGENT       — 'claude' (default) | 'codex' | 'cursor' | 'print-only'
//   ATLAS_AGENT_FLAGS — extra flags forwarded to the CLI (e.g. "--model claude-haiku-4-5")

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');
const BLOCKS = path.join(ATLAS, 'blocks');
const INVOCATIONS_DIR = path.join(ATLAS, 'agent_invocations');

const argv = process.argv.slice(2);
const dashDash = argv.indexOf('--');
const blockId = argv[0];
const extraPrompt = dashDash >= 0 ? argv.slice(dashDash + 1).join(' ').trim() : '';
if (!blockId) {
  console.error('Usage: node scripts/run_block_implementation.mjs <block_id> [-- "<extra prompt>"]');
  process.exit(1);
}

const blockDir = path.join(BLOCKS, blockId);
if (!fs.existsSync(blockDir)) {
  console.error(`run_block_implementation: block dir not found → ${blockDir}`);
  process.exit(2);
}

// 1. Build context-pack (rebuilds atlas/context_packs/<id>.json)
try {
  execFileSync('node', ['scripts/build_context_pack.mjs', blockId], { cwd: ROOT, stdio: 'pipe' });
} catch (e) {
  console.error(`run_block_implementation: build_context_pack failed → ${e.message}`);
  process.exit(3);
}

// 2. Compose the prompt
function readSafe(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }
const mission = readSafe(path.join(blockDir, 'mission.md'));
const kpi = readSafe(path.join(blockDir, 'kpi.md'));
const acceptance = readSafe(path.join(blockDir, 'acceptance.md'));
const tasks = readSafe(path.join(blockDir, 'tasks.md'));
const filesList = readSafe(path.join(blockDir, 'files.md'));
const rules = readSafe(path.join(ATLAS, 'rules.md'));
const techStack = readSafe(path.join(ATLAS, 'tech_stack.md'));

const prompt = [
  `# Implement block ${blockId}`,
  '',
  '## Mission',
  mission.trim(),
  '',
  '## Tasks (pick the first unchecked one)',
  tasks.trim(),
  '',
  '## KPI to satisfy',
  kpi.trim(),
  '',
  '## Acceptance criteria',
  acceptance.trim(),
  '',
  '## Files you may edit (alive only)',
  filesList.trim(),
  '',
  '## Project rules',
  rules.trim(),
  '',
  '## Tech stack (forbidden commands enforced via guard_against_drift)',
  techStack.trim(),
  '',
  extraPrompt ? `## Operator note\n${extraPrompt}\n` : '',
  '## How to report progress',
  `Append a line to \`atlas/blocks/${blockId}/checks.log\` with the test/check result.`,
  'When done, set status to `review` via MCP transition_block.',
  '',
].filter(Boolean).join('\n');

// 3. Persist invocation prompt for audit / Cursor pickup
fs.mkdirSync(INVOCATIONS_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const invocationPath = path.join(INVOCATIONS_DIR, `${ts}__${blockId}.txt`);
fs.writeFileSync(invocationPath, prompt, 'utf8');

// 4. Invoke the agent
const agent = (process.env.ATLAS_AGENT || 'claude').toLowerCase();
const extraFlags = (process.env.ATLAS_AGENT_FLAGS || '').split(/\s+/).filter(Boolean);

function which(cmd) {
  const looker = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  if (looker.status === 0) return looker.stdout.split(/\r?\n/)[0].trim() || null;
  return null;
}

function appendCheck(kind, result, note) {
  const checks = path.join(blockDir, 'checks.log');
  fs.appendFileSync(checks, `${new Date().toISOString()}\t${kind}\t${result}\t${note}\n`, 'utf8');
}

function runCli(cmd, args, opts) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 240_000,
    ...opts,
  });
  return r;
}

if (agent === 'print-only' || (agent === 'claude' && !which('claude')) || (agent === 'codex' && !which('codex'))) {
  // Graceful fallback: print the prompt for the user to paste anywhere.
  console.log(`run_block_implementation: agent CLI "${agent}" not on PATH or print-only mode`);
  console.log(`  prompt saved to: ${path.relative(ROOT, invocationPath)}`);
  console.log(`  context-pack:   atlas/context_packs/${blockId}.json`);
  console.log('');
  console.log('--- prompt below — paste into any coding agent ---');
  console.log(prompt);
  appendCheck('agent_invocation', 'pass', `agent=${agent} mode=print-only file=${path.relative(ROOT, invocationPath)}`);
  process.exit(0);
}

let cmd, args;
if (agent === 'claude') {
  cmd = 'claude';
  args = ['--print', '--add-dir', `atlas/blocks/${blockId}`, '--add-dir', 'atlas', ...extraFlags];
} else if (agent === 'codex') {
  cmd = 'codex';
  args = ['exec', '--add-dir', `atlas/blocks/${blockId}`, ...extraFlags];
} else if (agent === 'cursor') {
  cmd = 'cursor-agent';
  args = ['--print', ...extraFlags];
} else {
  console.error(`run_block_implementation: unknown ATLAS_AGENT=${agent}`);
  process.exit(4);
}

const r = runCli(cmd, args, { input: prompt });
if (r.error) {
  console.error(`run_block_implementation: ${cmd} failed → ${r.error.message}`);
  appendCheck('agent_invocation', 'fail', `agent=${agent} error=${r.error.message}`);
  process.exit(5);
}
if (r.status !== 0) {
  console.error(`run_block_implementation: ${cmd} exited ${r.status}`);
  console.error((r.stderr || '').slice(0, 1000));
  appendCheck('agent_invocation', 'fail', `agent=${agent} exit=${r.status}`);
  process.exit(r.status || 1);
}

const out = (r.stdout || '').trim();
const summary = out.split(/\r?\n/).slice(0, 8).join(' / ').slice(0, 240);
appendCheck('agent_invocation', 'pass', `agent=${agent} summary=${summary}`);

console.log(`run_block_implementation: agent=${agent} block=${blockId}`);
console.log(`  prompt:   ${path.relative(ROOT, invocationPath)}`);
console.log(`  output:`);
console.log(out.split(/\r?\n/).map((l) => '    ' + l).join('\n'));

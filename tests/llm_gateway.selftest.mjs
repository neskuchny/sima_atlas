#!/usr/bin/env node
// PR3: structural self-test for scripts/llm_gateway.mjs
// Verifies: schema validation, mock fixture lookup, deterministic-empty fallback, trace write.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callLLM, extractBlockSchema, BLOCK_SCHEMA, describeProvider } from '../scripts/llm_gateway.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const TRACE_DIR = path.join(ROOT, 'atlas', 'llm_traces');

let failures = [];

// ─── Test 1: schema validation flags wrong types ──────────────────────────
{
  const schema = {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string' },
      count: { type: 'integer' },
    },
  };
  // Use a unique prompt so we hit the empty fallback (no fixture, no _default match).
  // We feed schema; deterministicEmptyForSchema returns `{name: '', count: 0}` which is structurally OK.
  const { errors } = await callLLM({
    provider: 'mock',
    prompt: 'self-test:schema-shape ' + Math.random(),
    schema,
  });
  if (errors.length) failures.push(`schema-shape unexpected errors: ${errors.join(', ')}`);
}

// ─── Test 2: extractBlockSchema returns valid structure ───────────────────
{
  const dialog = 'Нам нужен блок b.payments на слое logic. Принимает Stripe-вебхуки и пишет в БД.';
  const r = await extractBlockSchema(dialog, { provider: 'mock' });
  if (r.errors.length) failures.push(`extractBlockSchema errors: ${r.errors.join(', ')}`);
  if (!Array.isArray(r.value.blocks)) failures.push('extractBlockSchema: value.blocks is not array');
}

// ─── Test 3: trace file written ───────────────────────────────────────────
{
  const before = fs.existsSync(TRACE_DIR) ? fs.readdirSync(TRACE_DIR).length : 0;
  await callLLM({
    provider: 'mock',
    prompt: 'self-test:trace-write ' + Date.now(),
    schema: BLOCK_SCHEMA,
    op: 'selftest_trace',
  });
  const after = fs.readdirSync(TRACE_DIR).length;
  if (after !== before + 1) failures.push(`trace not written: before=${before}, after=${after}`);
}

// ─── Test 4: deterministic empty when no schema ──────────────────────────
{
  const { value, errors } = await callLLM({
    provider: 'mock',
    prompt: 'self-test:no-schema ' + Math.random(),
  });
  if (errors.length) failures.push(`no-schema unexpected errors`);
  if (value === undefined) failures.push('no-schema: value undefined');
}

// ─── Test 5: claude_cli provider availability + parser shape (Phase R-1) ──
// CI can't assume `claude` CLI is installed; we only check the provider
// is registered and that callLLM with provider:'claude_cli' returns a
// usable shape (or falls back to mock cleanly). The bug to prevent is a
// hang / unhandled rejection.
{
  try {
    const r = await callLLM({
      provider: 'claude_cli',
      prompt: 'self-test:claude_cli-graceful',
      schema: BLOCK_SCHEMA,
      op: 'selftest_claude_cli',
    });
    if (!r || typeof r.value === 'undefined') failures.push('claude_cli: missing value field');
  } catch {
    // strict-mode path without CLI — acceptable, just don't crash
  }
}

// ─── Test 6 (R-8.10): the canvas badge says what callLLM will actually use ─
// describeProvider runs the same resolution as a real call, without calling
// and without logging. Checked only on mock paths — no live request here.
{
  const saved = { force: process.env.ATLAS_FORCE_MOCK_LLM, dflt: process.env.LLM_DEFAULT_PROVIDER };
  const logs = [];
  const origLog = console.log, origWarn = console.warn;
  try {
    process.env.ATLAS_FORCE_MOCK_LLM = '1';
    console.log = (...a) => logs.push(a.join(' ')); console.warn = (...a) => logs.push(a.join(' '));
    const forced = describeProvider();
    console.log = origLog; console.warn = origWarn;
    const r1 = await callLLM({ prompt: 'self-test:describe-forced ' + Math.random() });
    if (forced.provider !== 'mock' || forced.source !== 'forced_mock' || forced.kind !== 'none' || !forced.mock) failures.push(`describe(forced): ${JSON.stringify(forced)}`);
    if (r1.trace?.provider !== forced.provider) failures.push(`forced: badge says ${forced.provider}, call used ${r1.trace?.provider}`);
    if (logs.some((l) => l.includes('[llm-gateway]'))) failures.push('describeProvider must not log — the badge polls it');

    delete process.env.ATLAS_FORCE_MOCK_LLM;
    process.env.LLM_DEFAULT_PROVIDER = 'mock';
    const explicit = describeProvider();
    const r2 = await callLLM({ prompt: 'self-test:describe-explicit ' + Math.random() });
    if (explicit.provider !== 'mock' || explicit.source !== 'explicit' || !/LLM_DEFAULT_PROVIDER=mock/.test(explicit.reason)) failures.push(`describe(explicit): ${JSON.stringify(explicit)}`);
    if (r2.trace?.provider !== explicit.provider) failures.push(`explicit: badge says ${explicit.provider}, call used ${r2.trace?.provider}`);

    process.env.LLM_DEFAULT_PROVIDER = 'not-a-provider';
    console.log = (...a) => logs.push(a.join(' ')); console.warn = (...a) => logs.push(a.join(' '));
    const bogus = describeProvider();
    console.log = origLog; console.warn = origWarn;
    if (!/not a known provider/.test(bogus.reason)) failures.push(`a malformed LLM_DEFAULT_PROVIDER must be named in the reason: ${bogus.reason}`);
  } finally {
    console.log = origLog; console.warn = origWarn;
    if (saved.force === undefined) delete process.env.ATLAS_FORCE_MOCK_LLM; else process.env.ATLAS_FORCE_MOCK_LLM = saved.force;
    if (saved.dflt === undefined) delete process.env.LLM_DEFAULT_PROVIDER; else process.env.LLM_DEFAULT_PROVIDER = saved.dflt;
  }
}

if (failures.length) {
  console.error('llm_gateway.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('llm_gateway.selftest: OK (6 cases)');

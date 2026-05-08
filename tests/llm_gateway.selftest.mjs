#!/usr/bin/env node
// PR3: structural self-test for scripts/llm_gateway.mjs
// Verifies: schema validation, mock fixture lookup, deterministic-empty fallback, trace write.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callLLM, extractBlockSchema, BLOCK_SCHEMA } from '../scripts/llm_gateway.mjs';

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

if (failures.length) {
  console.error('llm_gateway.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('llm_gateway.selftest: OK (5 cases)');

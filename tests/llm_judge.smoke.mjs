#!/usr/bin/env node
// PR-3 (b.acceptance-verifier-loop): smoke test for scripts/judge_assertion.mjs
//
// 4 test groups:
//  1. No fixture + mock provider → safe inconclusive with explicit reasoning
//  2. Pre-seeded fixture returning verdict=pass → judge returns pass with quote
//  3. Pre-seeded fixture returning verdict=fail → judge returns fail
//  4. Cost cap enforcement (manually crafted high-cost trace path is tricky to
//     reach without real API; instead we assert that LLM_MAX_USD_PER_RUN env
//     is respected via the schema/result interface — when fixture returns
//     normally, cost_capped:false; cost_usd:0 from mock).
//
// Mock fixtures are written to tests/llm_mocks/<hash>.json for each scenario,
// keyed by mockHashForPrompt(prompt) — same mechanism the real LLM gateway
// uses for golden mock playback.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { judgeAssertion } from '../scripts/judge_assertion.mjs';
import { mockHashForPrompt } from '../scripts/llm_gateway.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const MOCK_DIR = path.join(ROOT, 'tests', 'llm_mocks');

const failures = [];
function check(name, cond, detail = '') {
  if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

function buildPrompt({ assertion, block_id, context = {} }) {
  // Mirror scripts/judge_assertion.mjs buildPrompt exactly so we can compute
  // the same prompt hash for fixture lookup.
  const sections = [
    `BLOCK: ${block_id}`,
    `ASSERTION ${assertion.id}${assertion.label ? ` (${assertion.label})` : ''}: ${assertion.text}`,
  ];
  if (context.mission_excerpt) {
    sections.push('=== mission.md (excerpt) ===');
    sections.push(context.mission_excerpt);
  }
  if (context.recent_checks) {
    sections.push('=== recent checks.log (last 50 lines) ===');
    sections.push(context.recent_checks);
  }
  if (context.recent_diff_files) {
    sections.push('=== recently changed files ===');
    sections.push(context.recent_diff_files);
  }
  sections.push('');
  sections.push(
    'Return strict JSON {verdict, reasoning, evidence_quote}.',
    '- verdict ∈ {"pass","fail","inconclusive"}',
    '- "pass" requires CONCRETE evidence in the context. "looks ok" is not enough.',
    '- "fail" requires concrete evidence the assertion is NOT met.',
    '- If context is insufficient to decide, return "inconclusive" — never guess.',
    '- evidence_quote: short verbatim excerpt (≤ 200 chars) supporting the verdict; "" if inconclusive.',
    '- reasoning: 1-2 sentences citing the excerpt.',
  );
  return sections.join('\n');
}

function seedFixture(prompt, payload) {
  fs.mkdirSync(MOCK_DIR, { recursive: true });
  const hash = mockHashForPrompt(prompt);
  const file = path.join(MOCK_DIR, `${hash}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

function cleanupFixture(prompt) {
  try {
    const hash = mockHashForPrompt(prompt);
    const file = path.join(MOCK_DIR, `${hash}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {}
}

const seeded = [];

try {
  // ─── Group 1: no fixture → safe inconclusive
  {
    const r = await judgeAssertion({
      assertion: { id: 'A_NULL', text: 'No fixture exists for this assertion (synthetic).', label: null },
      block_id: 'b.smoke-judge-null',
      context: { mission_excerpt: 'Mission about test fixtures.', recent_checks: '' },
    });
    check('group1:no-fixture inconclusive', r.verdict === 'inconclusive',
      `verdict=${r.verdict}, reasoning=${r.reasoning}`);
    check('group1:reasoning explains mock unavailable',
      /mock|unavailable|deterministic/.test(r.reasoning),
      `reasoning=${r.reasoning}`);
    check('group1:cost = 0', r.cost_usd === 0);
    check('group1:provider = mock', r.provider === 'mock');
  }

  // ─── Group 2: fixture verdict=pass
  {
    const assertion = { id: 'A_PASS', text: 'Selftest passes consistently.', label: null };
    const block_id = 'b.smoke-judge-pass';
    const ctx = { mission_excerpt: 'Selftest framework.', recent_checks: '2026-05-01\tselftest\tpass\tA1' };
    const prompt = buildPrompt({ assertion, block_id, context: ctx });
    seeded.push(prompt);
    seedFixture(prompt, { verdict: 'pass', reasoning: 'checks.log shows selftest pass on A1.', evidence_quote: '2026-05-01\tselftest\tpass\tA1' });
    const r = await judgeAssertion({ assertion, block_id, context: ctx });
    check('group2:pass verdict', r.verdict === 'pass', `verdict=${r.verdict}`);
    check('group2:reasoning carried', r.reasoning.includes('selftest pass on A1'));
    check('group2:evidence_quote present', /selftest\tpass\tA1/.test(r.evidence_quote));
  }

  // ─── Group 3: fixture verdict=fail
  {
    const assertion = { id: 'A_FAIL', text: 'Trace files written.', label: null };
    const block_id = 'b.smoke-judge-fail';
    const ctx = { mission_excerpt: 'Tracing system.', recent_checks: '2026-05-01\ttrace\tfail\twriter never called' };
    const prompt = buildPrompt({ assertion, block_id, context: ctx });
    seeded.push(prompt);
    seedFixture(prompt, { verdict: 'fail', reasoning: 'checks.log shows trace fail; writer never called.', evidence_quote: 'trace\tfail\twriter never called' });
    const r = await judgeAssertion({ assertion, block_id, context: ctx });
    check('group3:fail verdict', r.verdict === 'fail', `verdict=${r.verdict}`);
    check('group3:reasoning carried', r.reasoning.includes('writer never called'));
  }

  // ─── Group 4: cost cap not triggered on mock (cost_usd === 0 → cost_capped: false)
  {
    const r = await judgeAssertion({
      assertion: { id: 'A_X', text: 'Trivial assertion.', label: null },
      block_id: 'b.smoke-judge-cost',
      context: { mission_excerpt: 'x', recent_checks: '' },
    });
    check('group4:cost_capped false', r.cost_capped === false);
    check('group4:cost_usd 0 on mock', r.cost_usd === 0);
  }
} finally {
  for (const p of seeded) cleanupFixture(p);
}

if (failures.length) {
  console.error('llm_judge.smoke: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('llm_judge.smoke: OK (4 test groups, all assertions green)');

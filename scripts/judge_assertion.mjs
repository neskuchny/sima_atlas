#!/usr/bin/env node
// PR-3 (b.acceptance-verifier-loop): LLM-judge fallback for assertions whose
// evidence cannot be measured by the deterministic collectors (PR-2).
//
// The judge takes (assertion, block context) → returns a structured verdict
// through b.llm-gateway. The schema's `verdict` enum is intentionally ordered
// `[inconclusive, pass, fail]` so that the deterministic-empty fallback (when
// no API key + no mock fixture) produces a SAFE `inconclusive` rather than a
// silent `pass` — that preserves the project's gate principle "no false done".
//
// API:
//   import { judgeAssertion } from './judge_assertion.mjs';
//   const r = await judgeAssertion({
//     assertion: { id: 'A1', text: '...', label: 'live flow' },
//     block_id: 'b.x',
//     context: {  // any subset is fine
//       mission_excerpt: '...',           // first ~500 chars of mission.md
//       recent_checks: 'last 50 lines',   // tail of checks.log
//       recent_diff_files: 'a.ts\nb.ts',  // git diff --name-only
//     },
//   });
//   // → { verdict: 'pass'|'fail'|'inconclusive', reasoning, evidence_quote,
//   //     cost_usd, provider, model, prompt_hash, duration_ms }
//
// CLI:
//   node scripts/judge_assertion.mjs --block b.x --id A3
//
// Env:
//   LLM_DEFAULT_PROVIDER, ANTHROPIC_API_KEY, GOOGLE_API_KEY — see llm_gateway.mjs
//   LLM_MAX_USD_PER_RUN (default 0.02) — cost cap per assertion judge call

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callLLM } from './llm_gateway.mjs';
import { parseAcceptance } from './parse_acceptance.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');
const COST_CAP_USD = Number(process.env.LLM_MAX_USD_PER_RUN || 0.02);

export const JUDGE_SCHEMA = {
  type: 'object',
  required: ['verdict', 'reasoning', 'evidence_quote'],
  additionalProperties: false,
  properties: {
    // Order matters: deterministic-empty for `enum: [...]` returns enum[0],
    // so we put the SAFE verdict (`inconclusive`) first. When the mock provider
    // is hit without a matching fixture, we get inconclusive — never a silent
    // false-positive `pass`.
    verdict: { type: 'string', enum: ['inconclusive', 'pass', 'fail'] },
    reasoning: { type: 'string' },
    evidence_quote: { type: 'string' },
  },
};

function readBlockContext(blockId) {
  const dir = path.join(ATLAS, 'blocks', blockId);
  const out = {};
  const missionPath = path.join(dir, 'mission.md');
  if (fs.existsSync(missionPath)) {
    out.mission_excerpt = fs.readFileSync(missionPath, 'utf8').slice(0, 800);
  }
  const checksPath = path.join(dir, 'checks.log');
  if (fs.existsSync(checksPath)) {
    const lines = fs.readFileSync(checksPath, 'utf8').split(/\r?\n/);
    out.recent_checks = lines.slice(-50).join('\n');
  }
  return out;
}

function buildPrompt({ assertion, block_id, context = {} }) {
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

export async function judgeAssertion({ assertion, block_id, context }) {
  if (!assertion || typeof assertion.text !== 'string' || !assertion.id) {
    throw new Error('judgeAssertion: assertion.{id,text} required');
  }
  const ctx = context && Object.keys(context).length ? context : readBlockContext(block_id);
  const prompt = buildPrompt({ assertion, block_id, context: ctx });
  const t0 = Date.now();
  const result = await callLLM({
    prompt,
    schema: JUDGE_SCHEMA,
    op: 'judge_assertion',
    max_tokens: 256,
    temperature: 0,
  });
  const trace = result.trace || {};
  const v = result.value || {};
  const cost = Number(trace.cost_usd || 0);
  if (cost > COST_CAP_USD) {
    return {
      verdict: 'inconclusive',
      reasoning: `cost cap exceeded ($${cost.toFixed(4)} > $${COST_CAP_USD})`,
      evidence_quote: '',
      cost_usd: cost,
      provider: trace.provider,
      model: trace.model,
      prompt_hash: trace.prompt_hash,
      duration_ms: Date.now() - t0,
      cost_capped: true,
    };
  }
  // Schema validation already happened in callLLM (or fell back to mock empty).
  // Coerce missing fields defensively.
  let verdict = (v.verdict === 'pass' || v.verdict === 'fail' || v.verdict === 'inconclusive')
    ? v.verdict : 'inconclusive';
  // Mock-empty default-fixture detection: when provider=mock AND value is the
  // pure deterministic-empty (verdict==='inconclusive' AND empty strings) AND no
  // fixture matched the prompt hash → keep verdict as inconclusive and tag
  // reasoning so callers know it's not a real judgement.
  let reasoning = (typeof v.reasoning === 'string' && v.reasoning.trim()) ? v.reasoning : '';
  const evidence_quote = (typeof v.evidence_quote === 'string') ? v.evidence_quote : '';
  if (trace.provider === 'mock' && verdict === 'inconclusive' && !reasoning) {
    reasoning = 'LLM judge unavailable: mock provider returned deterministic-empty (no fixture matched, no API key configured)';
  } else if (!reasoning) {
    reasoning = `LLM returned ${verdict} without reasoning`;
  }
  return {
    verdict,
    reasoning,
    evidence_quote,
    cost_usd: cost,
    provider: trace.provider,
    model: trace.model,
    prompt_hash: trace.prompt_hash,
    duration_ms: Date.now() - t0,
    cost_capped: false,
  };
}

// CLI helper for one-off inspection.
export async function judgeAssertionCli({ block_id, assertion_id }) {
  const parsed = parseAcceptance(block_id);
  const a = parsed.assertions.find((x) => x.id === assertion_id);
  if (!a) throw new Error(`Assertion ${assertion_id} not found in ${block_id}`);
  return judgeAssertion({ assertion: a, block_id });
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const blockIdx = argv.indexOf('--block');
  const idIdx = argv.indexOf('--id');
  if (blockIdx < 0 || idIdx < 0) {
    console.error('Usage: node scripts/judge_assertion.mjs --block <id> --id <A1>');
    process.exit(1);
  }
  const block_id = argv[blockIdx + 1];
  const assertion_id = argv[idIdx + 1];
  judgeAssertionCli({ block_id, assertion_id }).then((r) => {
    if (argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
    else console.log(`${block_id}/${assertion_id} [${r.provider}]: ${r.verdict} — ${r.reasoning}\n  evidence: ${r.evidence_quote}`);
  }).catch((e) => { console.error('judge_assertion failed:', e.message); process.exit(2); });
}

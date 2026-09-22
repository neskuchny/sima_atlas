#!/usr/bin/env node
// PR-Eval: golden-set evaluation with category breakdown + history.
//
// Loads tests/fixtures/extraction_golden.json (30 cases across 6 categories:
// A_single_block / B_multi_block / C_no_block / D_layer_classification /
// E_dependency / F_confidence). Runs extractBlockSchema() on every dialog,
// scores per case (idRecall + layerAcc + missionAcc), aggregates per-category
// and overall, writes a snapshot to atlas/eval_history/<UTC>.json, and
// regression-checks against the previous snapshot:
//
//   PASS criteria:
//     * overall avg >= 0.70
//     * per-category avg >= 0.50
//     * regression: overall avg may not drop more than 0.05 below previous best
//
// R-8.10 — which provider answered decides what this run can claim.
// scripts/seed_llm_mocks.mjs writes the golden answers themselves into the
// mock fixtures, so on the mock provider the eval compares the golden set with
// itself: 1.00 every night, and it measures the plumbing (fixture lookup,
// schema lift, scoring), not extraction quality. Worse, those 1.00 snapshots
// became the regression baseline — all 35 in atlas/eval_history were mock —
// so the first real run at, say, 0.85 (well above the 0.70 target) would
// have FAILED as a «regression». Now:
//   * mock    — a plumbing check: anything below 1.00 is a broken pipeline
//               (exit 1); the report says quality was NOT measured.
//   * live    — the targets and the regression check, against live runs only.
//   * mixed   — some cases fell back to mock: quality inconclusive, the
//               snapshot is kept but never becomes a baseline.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBlockSchema } from '../scripts/llm_gateway.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const GOLDEN = path.join(ROOT, 'tests', 'fixtures', 'extraction_golden.json');
const HISTORY_DIR = path.join(ROOT, 'atlas', 'eval_history');

const TARGET_OVERALL = 0.70;
const TARGET_CATEGORY = 0.50;
const REGRESSION_TOLERANCE = 0.05;

const goldens = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));

function tokensOf(s) {
  return new Set((s || '').toLowerCase().match(/[a-zа-яё0-9_]+/giu) || []);
}

function caseScore(extracted, expected) {
  const ids = new Set((extracted.blocks || []).map((b) => b.id));
  const expectedIds = expected.blocks.map((b) => b.id);
  const idsHit = expectedIds.filter((id) => ids.has(id)).length;
  const idRecall = expectedIds.length ? idsHit / expectedIds.length : (ids.size === 0 ? 1 : 0);

  let layerOk = 0;
  for (const exp of expected.blocks) {
    const got = (extracted.blocks || []).find((b) => b.id === exp.id);
    if (got && got.layer === exp.layer) layerOk += 1;
  }
  const layerAcc = expected.blocks.length ? layerOk / expected.blocks.length : 1;

  let missionScoreSum = 0;
  for (const exp of expected.blocks) {
    const got = (extracted.blocks || []).find((b) => b.id === exp.id);
    if (!got) continue;
    const expTokens = tokensOf(exp.mission);
    const gotTokens = tokensOf(got.mission);
    if (!expTokens.size) { missionScoreSum += 1; continue; }
    let overlap = 0;
    for (const t of expTokens) if (gotTokens.has(t)) overlap += 1;
    missionScoreSum += overlap / expTokens.size;
  }
  const missionAcc = expected.blocks.length ? missionScoreSum / expected.blocks.length : 1;

  // For C_no_block we want 1.0 only if extractor returned no extra ids;
  // ids.size > 0 should pull idRecall down to 0 already but let's be explicit:
  // overall score is mean of three components (each 0..1).
  const score = (idRecall + layerAcc + missionAcc) / 3;
  return { idRecall, layerAcc, missionAcc, score };
}

const totals = { sum: 0, count: 0 };
const byCategory = {};
const failures = [];
const perCase = [];
const providers = [];

for (const c of goldens) {
  const cat = c.category || '_uncat_';
  if (!byCategory[cat]) byCategory[cat] = { sum: 0, count: 0, weak: [] };
  let result;
  try {
    const r = await extractBlockSchema(c.dialog);
    result = r.value;
    providers.push(r.trace?.provider || 'unknown');
  } catch (e) {
    failures.push(`${cat}/${c.name}: extractBlockSchema threw — ${e.message}`);
    continue;
  }
  const s = caseScore(result, c.expected);
  totals.sum += s.score;
  totals.count += 1;
  byCategory[cat].sum += s.score;
  byCategory[cat].count += 1;
  if (s.score < 0.7) byCategory[cat].weak.push(`${c.name}=${s.score.toFixed(2)}`);
  perCase.push({ category: cat, name: c.name, score: s.score, breakdown: s });
}

const overall = totals.count ? totals.sum / totals.count : 0;
const mockCount = providers.filter((p) => p === 'mock').length;
const mode = providers.length && mockCount === providers.length ? 'mock'
  : mockCount === 0 ? 'live' : 'mixed';
const categoryAverages = {};
for (const [cat, v] of Object.entries(byCategory)) {
  categoryAverages[cat] = v.count ? v.sum / v.count : 0;
}

// Persist history
fs.mkdirSync(HISTORY_DIR, { recursive: true });
const historyFile = path.join(HISTORY_DIR, new Date().toISOString().replace(/[:.]/g, '-') + '.json');
const snapshot = {
  at: new Date().toISOString(),
  total_cases: goldens.length,
  mode,
  providers: [...new Set(providers)],
  overall_avg: overall,
  category_averages: categoryAverages,
  cases: perCase,
};
fs.writeFileSync(historyFile, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

// Regression check against the best historical run (excluding the one we just wrote)
let bestPrior = null;
const priors = fs.readdirSync(HISTORY_DIR).filter((f) => f.endsWith('.json') && path.join(HISTORY_DIR, f) !== historyFile);
for (const f of priors) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f), 'utf8'));
    // Only live runs set the bar. Snapshots without `mode` predate R-8.10 and
    // were all mock (the golden set scored against itself).
    if (j.mode !== 'live') continue;
    if (typeof j.overall_avg === 'number' && (bestPrior === null || j.overall_avg > bestPrior)) bestPrior = j.overall_avg;
  } catch {}
}

// Print human report
if (mode === 'mock') {
  console.log(`llm_extraction.eval — PLUMBING ONLY (mock provider): the mock answers are the golden set itself, so ${overall.toFixed(2)} measures the pipeline, not extraction quality (cases=${totals.count}/${goldens.length})`);
} else if (mode === 'mixed') {
  console.log(`llm_extraction.eval — INCONCLUSIVE: ${mockCount} of ${providers.length} cases fell back to the mock provider; overall avg=${overall.toFixed(3)} is inflated by them`);
} else {
  console.log(`llm_extraction.eval — overall avg=${overall.toFixed(3)} (cases=${totals.count}/${goldens.length}, provider ${[...new Set(providers)].join(', ')})`);
}
for (const [cat, avg] of Object.entries(categoryAverages)) {
  const weak = byCategory[cat].weak;
  console.log(`  ${cat.padEnd(28)} ${avg.toFixed(2)}${weak.length ? '  weak: ' + weak.join(', ') : ''}`);
}
if (bestPrior !== null) console.log(`  best_prior=${bestPrior.toFixed(3)} (regression tolerance ${REGRESSION_TOLERANCE})`);
console.log(`  snapshot=${path.relative(ROOT, historyFile)}`);

// Verdict
const errors = [];
if (failures.length) errors.push(...failures);
if (mode === 'mock') {
  // The golden set scored against itself must be perfect; anything less is a
  // broken fixture lookup, schema lift or scorer.
  if (overall < 1 - 1e-9) errors.push(`plumbing: overall ${overall.toFixed(3)} < 1.000 on mock answers that ARE the golden set — fixture lookup, schema lift or scoring is broken`);
} else if (mode === 'live') {
  if (overall < TARGET_OVERALL) errors.push(`overall avg ${overall.toFixed(3)} < target ${TARGET_OVERALL}`);
  for (const [cat, avg] of Object.entries(categoryAverages)) {
    if (avg < TARGET_CATEGORY) errors.push(`${cat} avg ${avg.toFixed(3)} < target ${TARGET_CATEGORY}`);
  }
  if (bestPrior !== null && overall + REGRESSION_TOLERANCE < bestPrior) {
    errors.push(`regression: overall ${overall.toFixed(3)} dropped > ${REGRESSION_TOLERANCE} below previous best live run ${bestPrior.toFixed(3)}`);
  }
}

if (errors.length) {
  console.error('\nllm_extraction.eval: FAIL');
  errors.forEach((e) => console.error(' ✗', e));
  process.exit(1);
}
if (mode === 'mock') {
  console.log(`\nllm_extraction.eval: plumbing OK on ${totals.count} cases — extraction quality NOT measured (mock provider; run with a live LLM to measure it)`);
} else if (mode === 'mixed') {
  console.log(`\nllm_extraction.eval: quality INCONCLUSIVE — ${mockCount} case(s) answered by the mock; not recorded as a baseline`);
} else {
  console.log(`\nllm_extraction.eval: OK — overall ${overall.toFixed(2)} on ${totals.count} cases (target ${TARGET_OVERALL.toFixed(2)}${bestPrior !== null ? `, best live ${bestPrior.toFixed(2)}` : ', first live baseline'})`);
}

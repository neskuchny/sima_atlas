#!/usr/bin/env node
// R-8.01 (b.diff-review A2) — selftest for the diff-review arbiter.
//
// The LLM judgment itself is non-deterministic, so we test the DETERMINISTIC
// core: the aggregation rules (blocking→fail, warning→pass, empty→inconclusive,
// mock→inconclusive), the findings normalizer (file filtering, enum coercion),
// and the full reviewDiff path in mock mode (always inconclusive, never false
// pass).
//
// 7 test groups.

process.env.ATLAS_FORCE_MOCK_LLM = '1';

import assert from 'node:assert';
import { reviewDiff, aggregateVerdict, normalizeFindings } from '../scripts/review_diff.mjs';

const failures = [];
const check = (n, c, d = '') => { if (!c) failures.push(`${n}${d ? ' — ' + d : ''}`); };

// ── Group 1: aggregateVerdict — blocking → fail
{
  const findings = [{ category: 'security', severity: 'blocking', file: 'a.mjs', why: 'eval on user input' }];
  check('g1: one blocking → fail', aggregateVerdict({ findings, mock: false }) === 'fail');
}

// ── Group 2: aggregateVerdict — only warnings → pass
{
  const findings = [
    { category: 'perf_regex', severity: 'warning', file: 'a.mjs', why: 'minor' },
    { category: 'other', severity: 'warning', file: 'b.mjs', why: 'nit' },
  ];
  check('g2: only warnings → pass', aggregateVerdict({ findings, mock: false }) === 'pass');
}

// ── Group 3: aggregateVerdict — empty findings → pass (clean change)
{
  check('g3: no findings → pass', aggregateVerdict({ findings: [], mock: false }) === 'pass');
}

// ── Group 4: aggregateVerdict — mock NEVER says pass (KPI-1)
{
  // even with a blocking finding present, mock yields inconclusive (we don't
  // trust a mock either way) — but critically, a CLEAN change in mock must NOT
  // become a false pass.
  check('g4: mock + clean → inconclusive (no false pass)',
    aggregateVerdict({ findings: [], mock: true }) === 'inconclusive');
  check('g4: mock + blocking → inconclusive (we don\'t trust mock)',
    aggregateVerdict({ findings: [{ severity: 'blocking' }], mock: true }) === 'inconclusive');
  check('g4: judge says inconclusive → inconclusive',
    aggregateVerdict({ findings: [], mock: false, judgeVerdict: 'inconclusive' }) === 'inconclusive');
}

// ── Group 5: normalizeFindings — file filtering (KPI-2) + enum coercion
{
  const raw = [
    { category: 'security', severity: 'blocking', file: 'changed.mjs', why: 'real' },
    { category: 'security', severity: 'blocking', file: 'untouched.mjs', why: 'phantom' },
    { category: 'bogus_cat', severity: 'weird_sev', file: 'changed.mjs', why: 'coerced' },
    { /* malformed */ file: 'x' },
  ];
  const out = normalizeFindings(raw, ['changed.mjs']);
  check('g5: phantom-file finding dropped', !out.some((f) => f.file === 'untouched.mjs'),
    JSON.stringify(out.map((f) => f.file)));
  check('g5: changed-file finding kept', out.some((f) => f.file === 'changed.mjs'));
  check('g5: bad category coerced to other', out.some((f) => f.category === 'other'));
  check('g5: bad severity coerced to warning', out.some((f) => f.severity === 'warning'));
  check('g5: malformed finding dropped', out.length === 2, `len=${out.length}`);
}

// ── Group 6: normalizeFindings — no inventory means trust the judge
{
  const raw = [{ category: 'correctness', severity: 'blocking', file: 'whatever.mjs', why: 'x' }];
  const out = normalizeFindings(raw, []); // no changed-file list
  check('g6: with no inventory, finding is kept', out.length === 1);
}

// ── Group 7: full reviewDiff in mock mode — empty + non-empty both safe
{
  const empty = await reviewDiff({ diff_text: '', block_id: 'b.test' });
  check('g7: empty diff → inconclusive', empty.verdict === 'inconclusive', JSON.stringify(empty));
  check('g7: empty diff reason', empty.reason === 'empty_diff');

  const realDiff = `--- a/x.mjs\n+++ b/x.mjs\n@@ -1 +1 @@\n-const x = 1;\n+const x = eval(userInput);\n`;
  const r = await reviewDiff({ diff_text: realDiff, changed_files: ['x.mjs'], block_id: 'b.test' });
  // In mock mode there's no real reviewer — must NOT be a false pass.
  check('g7: real diff in mock → not pass', r.verdict !== 'pass', JSON.stringify(r.verdict));
  check('g7: real diff in mock → inconclusive + mock flag', r.verdict === 'inconclusive' && r.mock === true);
}

if (failures.length) {
  console.error('review_diff.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('review_diff.selftest: OK (7 test groups, all assertions green)');

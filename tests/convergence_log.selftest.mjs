#!/usr/bin/env node
// R-8.12 (b.acceptance-verifier-loop) — the semantic judge's gaps become
// append-only tasks (after Spec Kit's /speckit.converge): appended, numbered,
// never duplicated, never removed; nothing written when there is nothing.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { appendConvergenceTasks, CONVERGENCE_HEADING } from '../scripts/convergence_log.mjs';

const failures = [];
const check = (name, cond, detail = '') => { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-converge-'));
const tasks = path.join(tmp, 'tasks.md');
const read = () => fs.readFileSync(tasks, 'utf8');

try {
  fs.writeFileSync(tasks, '# tasks\n\n- [x] T1. Build the export.\n- [ ] T2. Add filters.\n');
  const before = read();

  // ── g1: appended under one heading, numbered ─────────────────────────────
  const r1 = appendConvergenceTasks(tmp, ['Handle an empty report.', 'Log export failures'], { date: '2026-09-22', provider: 'anthropic' });
  check('g1: two tasks added as C1, C2', JSON.stringify(r1.added) === '["C1","C2"]', JSON.stringify(r1));
  check('g1: the earlier tasks are untouched (append-only)', read().startsWith(before.trimEnd()));
  check('g1: one Convergence heading', read().split(CONVERGENCE_HEADING).length === 2);
  check('g1: each carries the date and the judge', /- \[ \] \*\*C1\.\*\* Handle an empty report\. — 2026-09-22, judge anthropic/.test(read()), read());

  // ── g2: no duplicates, numbering continues, ticked items stay ────────────
  fs.writeFileSync(tasks, read().replace('- [ ] **C1.**', '- [x] **C1.**'));
  const r2 = appendConvergenceTasks(tmp, ['handle an EMPTY report', 'Retry on timeout.'], { date: '2026-09-23' });
  check('g2: a todo already listed (even ticked, other case/spacing) is not added again', r2.skipped === 1 && JSON.stringify(r2.added) === '["C3"]', JSON.stringify(r2));
  check('g2: the ticked item is still there and still ticked', /- \[x\] \*\*C1\.\*\*/.test(read()));
  check('g2: still one heading', read().split(CONVERGENCE_HEADING).length === 2);

  // ── g3: nothing to add → nothing written ─────────────────────────────────
  const snapshot = read();
  const r3 = appendConvergenceTasks(tmp, [], {});
  const r4 = appendConvergenceTasks(tmp, ['Retry on timeout'], {});
  check('g3: an empty list writes nothing', r3.added.length === 0 && read() === snapshot);
  check('g3: only duplicates writes nothing', r4.added.length === 0 && r4.skipped === 1 && read() === snapshot);

  // ── g4: a block without tasks.md gets one ────────────────────────────────
  fs.rmSync(tasks);
  const r5 = appendConvergenceTasks(tmp, ['First gap'], { date: '2026-09-24' });
  check('g4: tasks.md is created with the heading and C1', r5.added[0] === 'C1' && read().includes(CONVERGENCE_HEADING) && read().includes('**C1.** First gap'));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error('convergence_log.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('convergence_log.selftest: OK (4 groups, all assertions green)');

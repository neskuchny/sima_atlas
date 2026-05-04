#!/usr/bin/env node
// Selftest for scripts/atlas_runs_api.mjs (read-side helpers).
//
// 4 test groups in tmp atlas:
//  1. listRunsByBlock with no run_state dir → []
//  2. listRunsByBlock filters by block_id and active_only
//  3. getRun returns a single run; null on missing id
//  4. getLatestAcceptance summarises pass/fail/skip counts

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  listRunsByBlock, getRun, getLatestAcceptance,
} from '../scripts/atlas_runs_api.mjs';

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'runs-api-'));
const atlas = path.join(tmp, 'atlas');
fs.mkdirSync(atlas, { recursive: true });

// We pass `root: atlas` to each call so the helpers read from tmp tree.
try {
  // ─── Group 1: empty
  {
    const empty = listRunsByBlock({ root: atlas });
    check('group1:empty', Array.isArray(empty) && empty.length === 0);
  }

  // Seed run_state files
  const runDir = path.join(atlas, 'run_state');
  fs.mkdirSync(runDir, { recursive: true });
  const seedRun = (block_id, run_id, current_state, started_at) => {
    fs.writeFileSync(path.join(runDir, `${run_id}.json`), JSON.stringify({
      run_id, block_id, agent: 'claude',
      current_state, started_at, last_event_at: started_at,
      transitions: [{ to: current_state, at: started_at }],
    }, null, 2));
  };
  seedRun('b.alpha', 'b.alpha__1', 'Running', '2026-05-04T10:00:00Z');
  seedRun('b.alpha', 'b.alpha__2', 'Succeeded', '2026-05-04T11:00:00Z');
  seedRun('b.beta',  'b.beta__1',  'Failed', '2026-05-04T09:00:00Z');

  // ─── Group 2: filter + active_only
  {
    const all = listRunsByBlock({ root: atlas });
    check('group2:all 3', all.length === 3);
    check('group2:newest first', all[0].run_id === 'b.alpha__2');
    const alpha = listRunsByBlock({ root: atlas, block_id: 'b.alpha' });
    check('group2:filter alpha', alpha.length === 2 && alpha.every((r) => r.block_id === 'b.alpha'));
    const active = listRunsByBlock({ root: atlas, active_only: true });
    check('group2:active only Running', active.length === 1 && active[0].current_state === 'Running');
  }

  // ─── Group 3: getRun
  {
    const r = getRun('b.alpha__2', { root: atlas });
    check('group3:got run', r && r.run_id === 'b.alpha__2');
    const miss = getRun('nope', { root: atlas });
    check('group3:miss returns null', miss === null);
    const nullId = getRun('', { root: atlas });
    check('group3:empty id null', nullId === null);
  }

  // ─── Group 4: acceptance summary
  {
    const accDir = path.join(atlas, 'acceptance_runs', 'b.alpha');
    fs.mkdirSync(accDir, { recursive: true });
    fs.writeFileSync(path.join(accDir, '_latest.json'), JSON.stringify({
      block_id: 'b.alpha',
      verdict: 'fail',
      checked_at: '2026-05-04T11:00:05Z',
      duration_ms: 5000,
      counts: { pass: 2, fail: 1, skipped: 1, inconclusive: 0 },
      assertions: [
        { id: 'A1', text: 'a', verdict: 'pass', reasoning: 'ok' },
        { id: 'A2', text: 'b', verdict: 'fail', reasoning: 'no' },
        { id: 'A3', text: 'c', verdict: 'pass' },
        { id: 'A4', text: 'd', verdict: 'skipped' },
      ],
    }));
    const r = getLatestAcceptance({ block_id: 'b.alpha', root: atlas });
    check('group4:got acceptance', r && r.assertions.length === 4);
    check('group4:summary pass=2', r.summary.pass === 2);
    check('group4:summary fail=1', r.summary.fail === 1);
    check('group4:summary skip=1', r.summary.skip === 1);
    check('group4:summary total=4', r.summary.total === 4);
    check('group4:top verdict', r.verdict === 'fail');
    check('group4:checked_at present', typeof r.checked_at === 'string');
    check('group4:counts forwarded', r.counts && r.counts.pass === 2);
    const miss = getLatestAcceptance({ block_id: 'b.unknown', root: atlas });
    check('group4:miss null', miss === null);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error('atlas_runs_api.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('atlas_runs_api.selftest: OK (4 test groups, all assertions green)');

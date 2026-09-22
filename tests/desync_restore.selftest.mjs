#!/usr/bin/env node
// R-8.10 (b.acceptance-verifier-loop) — clearing a stale `desync` goes through
// the lifecycle gate.
//
// verify_block_acceptance restores the status a block held before cascade
// marked it desync, once a green run is newer than the mark. It used to write
// graph.json and both ledgers by hand — a second status writer next to the
// gate — and could move desync → review, which the gate's own table forbade.
// This runs the real verifier on a synthetic atlas and checks that every
// restore now shows up as a gated transition, and that what the gate cannot
// restore is left to the operator with the exact command.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const failures = [];
const check = (name, cond, detail = '') => { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-desync-'));
const atlas = path.join(tmp, 'atlas');
const OLD_MARK = '2026-01-01T00:00:00.000Z';
const blocks = [
  { id: 'b.was-review', status: 'desync', status_before_desync: 'review', desync_marked_at: OLD_MARK },
  { id: 'b.was-done', status: 'desync', status_before_desync: 'done', desync_marked_at: OLD_MARK },
  { id: 'b.was-idea', status: 'desync', status_before_desync: 'idea', desync_marked_at: OLD_MARK },
  { id: 'b.legacy', status: 'desync', desync_marked_at: OLD_MARK },
];
fs.mkdirSync(atlas, { recursive: true });
fs.writeFileSync(path.join(atlas, 'graph.json'), JSON.stringify({ layers: [], blocks }, null, 2) + '\n');
fs.writeFileSync(path.join(atlas, 'transitions.log'), '# ts\tblock_id\tfrom\tto\tmeta\n');
for (const b of blocks) {
  const d = path.join(atlas, 'blocks', b.id);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'checks.log'), '');
  fs.writeFileSync(path.join(d, 'acceptance.md'), '# a\n\n- [ ] **A1.** node runs.\n```yaml\nevidence_kind: exit_code\nevidence_spec:\n  cmd: node --version\n```\n');
}
const verify = (id) => spawnSync('node', [path.join(ROOT, 'scripts', 'verify_block_acceptance.mjs'), id],
  { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ATLAS_ROOT: atlas, ATLAS_FORCE_MOCK_LLM: '1' } });
const status = (id) => JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8')).blocks.find((b) => b.id === id);
const ledger = () => fs.readFileSync(path.join(atlas, 'transitions.log'), 'utf8');

try {
  // ── Group 1: restores are gated transitions ──────────────────────────────
  const r1 = verify('b.was-review');
  check('g1: verifier passes', r1.status === 0, (r1.stdout + r1.stderr).slice(-300));
  check('g1: a block that was review goes back to review', status('b.was-review').status === 'review', status('b.was-review').status);
  check('g1: …through the gate (ledger carries the gate note)', /b\.was-review\tdesync\treview\tactor=verifier\tnote=desync cleared.*gate=pass\(desync-cleared/.test(ledger()), ledger());
  check('g1: …and the desync bookkeeping is cleared', status('b.was-review').status_before_desync === undefined && status('b.was-review').desync_marked_at === undefined);
  check('g1: the console says it went through the gate', /through the lifecycle gate/.test(r1.stdout));

  verify('b.was-done');
  check('g1: a block that was done goes back to done', status('b.was-done').status === 'done');

  // ── Group 2: what the gate cannot restore is left to the operator ────────
  const r3 = verify('b.was-idea');
  check('g2: a block that was idea stays desync (restoring would not be a restore)', status('b.was-idea').status === 'desync');
  check('g2: …with the exact command to decide', /advance_block_state\.mjs b\.was-idea wip/.test(r3.stdout), r3.stdout.slice(-300));
  const r4 = verify('b.legacy');
  check('g2: a legacy mark without the previous status stays desync', status('b.legacy').status === 'desync');
  check('g2: …and says so instead of guessing', /no status_before_desync was recorded/.test(r4.stdout));
  check('g2: nothing but the two gated restores reached the ledger', ledger().trim().split('\n').filter((l) => !l.startsWith('#')).length === 2, ledger());
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error('desync_restore.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('desync_restore.selftest: OK (2 groups, all assertions green)');

#!/usr/bin/env node
// R-8.05 — selftest for the shared lifecycle gate (scripts/lifecycle_gate.mjs).
//
// These cases would all have PASSED (wrongly) before the gate existed:
// every status-writing path applied at most an adjacency check, so a block
// could be marked `done` with a failing verifier, and a `desync` block that
// was never done could be promoted straight to done.
//
// Runs against a throwaway atlas under os.tmpdir() via the atlasRoot argument —
// never touches the repo's own atlas/.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkTransition, applyTransition, TRANSITIONS } from '../scripts/lifecycle_gate.mjs';

const failures = [];
const check = (name, cond, detail = '') => {
  if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`);
};

// ── scratch atlas ────────────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-gate-'));
const atlasRoot = path.join(tmp, 'atlas');

function seed(blocks) {
  fs.rmSync(atlasRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(atlasRoot, 'blocks'), { recursive: true });
  fs.writeFileSync(path.join(atlasRoot, 'graph.json'),
    JSON.stringify({ layers: [], blocks }, null, 2) + '\n', 'utf8');
  for (const b of blocks) {
    fs.mkdirSync(path.join(atlasRoot, 'blocks', b.id), { recursive: true });
    fs.writeFileSync(path.join(atlasRoot, 'blocks', b.id, 'checks.log'), '', 'utf8');
  }
}

function seedRun(blockId, verdict, { checkedAt = new Date().toISOString(), counts = { pass: 3, fail: 0, skipped: 0 } } = {}) {
  const dir = path.join(atlasRoot, 'acceptance_runs', blockId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '_latest.json'),
    JSON.stringify({ block_id: blockId, verdict, checked_at: checkedAt, counts, assertions: [] }, null, 2) + '\n', 'utf8');
}

const graphStatus = (id) => {
  const g = JSON.parse(fs.readFileSync(path.join(atlasRoot, 'graph.json'), 'utf8'));
  return (g.blocks || []).find((b) => b.id === id)?.status;
};
const ledger = () => {
  const p = path.join(atlasRoot, 'transitions.log');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
};

// ── Group 1: → done is gated on the acceptance verdict ───────────────────────
{
  seed([{ id: 'b.x', status: 'review' }]);
  // no run at all
  let r = applyTransition({ atlasRoot, blockId: 'b.x', to: 'done', actor: 'test' });
  check('g1: → done refused when no verifier run exists', r.ok === false, r.reason);
  check('g1: graph untouched after refusal', graphStatus('b.x') === 'review', `status=${graphStatus('b.x')}`);
  check('g1: refusal carries a fix hint', typeof r.fixHint === 'string' && r.fixHint.includes('verify_block_acceptance'));

  // failing verdict
  seedRun('b.x', 'fail', { counts: { pass: 1, fail: 2, skipped: 0 } });
  r = applyTransition({ atlasRoot, blockId: 'b.x', to: 'done', actor: 'test' });
  check('g1: → done refused on verdict=fail', r.ok === false, r.reason);
  check('g1: graph still untouched', graphStatus('b.x') === 'review');

  // inconclusive must NOT pass either — this is the «no silent green» rule
  seedRun('b.x', 'inconclusive', { counts: { pass: 0, fail: 0, skipped: 4 } });
  r = applyTransition({ atlasRoot, blockId: 'b.x', to: 'done', actor: 'test' });
  check('g1: → done refused on verdict=inconclusive', r.ok === false, r.reason);

  // passing verdict
  seedRun('b.x', 'pass', { counts: { pass: 4, fail: 0, skipped: 1 } });
  r = applyTransition({ atlasRoot, blockId: 'b.x', to: 'done', actor: 'test', note: 'ok' });
  check('g1: → done accepted on verdict=pass', r.ok === true, r.reason);
  check('g1: graph updated to done', graphStatus('b.x') === 'done');
  check('g1: ledger records gate=pass(', ledger().includes('gate=pass('), ledger());
  check('g1: checks.log records the transition',
    fs.readFileSync(path.join(atlasRoot, 'blocks', 'b.x', 'checks.log'), 'utf8').includes('review->done'));
}

// ── Group 2: the override is allowed but never silent ────────────────────────
{
  seed([{ id: 'b.y', status: 'review' }]);
  seedRun('b.y', 'fail');
  const r = applyTransition({ atlasRoot, blockId: 'b.y', to: 'done', actor: 'test', allowNoVerifier: true });
  check('g2: override applies the transition', r.ok === true, r.reason);
  check('g2: override is recorded in the ledger', ledger().includes('gate=overridden(verdict=fail)'), ledger());
}

// ── Group 3: adjacency is enforced ───────────────────────────────────────────
{
  seed([{ id: 'b.z', status: 'idea' }]);
  seedRun('b.z', 'pass');
  const r = applyTransition({ atlasRoot, blockId: 'b.z', to: 'done', actor: 'test' });
  check('g3: idea → done refused (not adjacent)', r.ok === false, r.reason);
  check('g3: reason names the allowed targets', /allowed from idea/.test(r.reason || ''), r.reason);
  check('g3: graph untouched', graphStatus('b.z') === 'idea');
  check('g3: TRANSITIONS table is exported', Array.isArray(TRANSITIONS.idea) && TRANSITIONS.idea.includes('wip'));
}

// ── Group 4: desync recovery cannot invent a `done` ──────────────────────────
{
  // a block that was `review` before cascade marked it desync must not reach done
  seed([{ id: 'b.d', status: 'desync', status_before_desync: 'review', desync_marked_at: '2026-01-01T00:00:00.000Z' }]);
  seedRun('b.d', 'pass', { checkedAt: '2026-02-01T00:00:00.000Z' });
  let r = applyTransition({ atlasRoot, blockId: 'b.d', to: 'done', actor: 'test' });
  check('g4: desync → done refused when the block was never done', r.ok === false, r.reason);
  check('g4: graph untouched', graphStatus('b.d') === 'desync');

  r = applyTransition({ atlasRoot, blockId: 'b.d', to: 'wip', actor: 'test' });
  check('g4: desync → wip allowed', r.ok === true, r.reason);
  check('g4: recovery clears the desync bookkeeping', (() => {
    const g = JSON.parse(fs.readFileSync(path.join(atlasRoot, 'graph.json'), 'utf8'));
    const b = g.blocks.find((x) => x.id === 'b.d');
    return b.status_before_desync === undefined && b.desync_marked_at === undefined;
  })());
}

// ── Group 5: desync → done requires a green run NEWER than the mark ──────────
{
  seed([{ id: 'b.p', status: 'desync', status_before_desync: 'done', desync_marked_at: '2026-06-20T08:31:02.000Z' }]);
  // green, but the run predates the desync mark — this is the stale evidence case
  seedRun('b.p', 'pass', { checkedAt: '2026-06-19T10:00:00.000Z' });
  let r = applyTransition({ atlasRoot, blockId: 'b.p', to: 'done', actor: 'test' });
  check('g5: desync → done refused when the green run predates the mark', r.ok === false, r.reason);

  seedRun('b.p', 'pass', { checkedAt: '2026-06-21T22:47:28.000Z' });
  r = applyTransition({ atlasRoot, blockId: 'b.p', to: 'done', actor: 'test' });
  check('g5: desync → done accepted with a fresher green run', r.ok === true, r.reason);
  check('g5: status restored to done', graphStatus('b.p') === 'done');
}

// ── Group 6: checkTransition is pure (no writes) ─────────────────────────────
{
  seed([{ id: 'b.q', status: 'review' }]);
  seedRun('b.q', 'pass');
  const before = fs.readFileSync(path.join(atlasRoot, 'graph.json'), 'utf8');
  const r = checkTransition({ atlasRoot, blockId: 'b.q', to: 'done' });
  check('g6: checkTransition reports ok', r.ok === true, r.reason);
  check('g6: checkTransition wrote nothing',
    fs.readFileSync(path.join(atlasRoot, 'graph.json'), 'utf8') === before);
  check('g6: no ledger written by a pure check', !fs.existsSync(path.join(atlasRoot, 'transitions.log')));
}

// ── Group 7: unknown block / same-status are refused cleanly ─────────────────
{
  seed([{ id: 'b.r', status: 'wip' }]);
  check('g7: unknown block refused',
    applyTransition({ atlasRoot, blockId: 'b.nope', to: 'wip', actor: 'test' }).ok === false);
  check('g7: same-status refused',
    applyTransition({ atlasRoot, blockId: 'b.r', to: 'wip', actor: 'test' }).ok === false);
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failures.length) {
  console.error('lifecycle_gate.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('lifecycle_gate.selftest: OK (7 groups, all assertions green)');

#!/usr/bin/env node
// PR-7 (b.agent-orchestrator): selftest for scripts/run_state.mjs FSM.
//
// 8 test groups:
//  1. startRun creates state file in PreparingWorkspace + history entry
//  2. happy-path transition: Preparing→Launching→Running→Verifying→
//     Finishing→Succeeded
//  3. invalid transition rejected (e.g. Preparing → Succeeded skipping
//     intermediate states)
//  4. cannot transition out of terminal (Succeeded → Running)
//  5. cancelRun on active flips to Canceled; on terminal returns noop
//  6. listRuns({active_only}) filters terminal states
//  7. detectStalledRuns flips idle Running → Stalled but spares fresh
//  8. unknown state name rejected
//
// Tests use ATLAS_ROOT to redirect into a tmpdir so the real repo's
// run_state/ stays clean.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

// Build a tmp atlas BEFORE importing run_state.mjs so the module picks up
// our ATLAS_ROOT.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runstate-'));
process.env.ATLAS_ROOT = path.join(tmpRoot, 'atlas');
fs.mkdirSync(process.env.ATLAS_ROOT, { recursive: true });

const { startRun, transitionRunState, getRun, listRuns, cancelRun, detectStalledRuns,
        ACTIVE_STATES, TERMINAL_STATES } = await import('../scripts/run_state.mjs');

try {
  // ─── Group 1: startRun
  {
    const r = startRun({ block_id: 'b.smoke-fsm-1', agent: 'mock' });
    check('group1:run_id contains block_id', r.run_id.startsWith('b.smoke-fsm-1__'));
    check('group1:current_state PreparingWorkspace', r.current_state === 'PreparingWorkspace');
    check('group1:history 1 entry', r.history.length === 1);
    check('group1:state file written', fs.existsSync(path.join(process.env.ATLAS_ROOT, 'run_state', `${r.run_id}.json`)));
  }

  // ─── Group 2: happy-path transitions
  {
    const r = startRun({ block_id: 'b.smoke-fsm-2', agent: 'mock' });
    transitionRunState(r.run_id, 'LaunchingAgent');
    transitionRunState(r.run_id, 'Running');
    transitionRunState(r.run_id, 'Verifying', { verifier_verdict: 'pass' });
    transitionRunState(r.run_id, 'Finishing');
    transitionRunState(r.run_id, 'Succeeded', { exit_code: 0, summary: 'ok' });
    const final = getRun(r.run_id);
    check('group2:final state Succeeded', final.current_state === 'Succeeded');
    check('group2:history 6 entries', final.history.length === 6,
      `len=${final.history.length}`);
    check('group2:exit_code stored', final.exit_code === 0);
    check('group2:verifier_verdict stored', final.verifier_verdict === 'pass');
    check('group2:terminated_at stamped', !!final.terminated_at);
  }

  // ─── Group 3: invalid transition
  {
    const r = startRun({ block_id: 'b.smoke-fsm-3', agent: 'mock' });
    let threw = false;
    try { transitionRunState(r.run_id, 'Succeeded'); } catch { threw = true; }
    check('group3:Preparing→Succeeded rejected', threw);
    const s = getRun(r.run_id);
    check('group3:state unchanged', s.current_state === 'PreparingWorkspace');
  }

  // ─── Group 4: cannot transition out of terminal
  {
    const r = startRun({ block_id: 'b.smoke-fsm-4', agent: 'mock' });
    transitionRunState(r.run_id, 'LaunchingAgent');
    transitionRunState(r.run_id, 'Failed', { error: 'spawn fail' });
    let threw = false;
    try { transitionRunState(r.run_id, 'Running'); } catch { threw = true; }
    check('group4:Failed→Running rejected', threw);
  }

  // ─── Group 5: cancelRun
  {
    const r = startRun({ block_id: 'b.smoke-fsm-5', agent: 'mock' });
    transitionRunState(r.run_id, 'LaunchingAgent');
    const c1 = cancelRun(r.run_id, 'user requested');
    check('group5:cancel sets Canceled', c1.current_state === 'Canceled');
    const c2 = cancelRun(r.run_id);
    check('group5:cancel of terminal noop', c2.status === 'noop',
      `got: ${JSON.stringify(c2)}`);
  }

  // ─── Group 6: listRuns active filter
  {
    const r1 = startRun({ block_id: 'b.smoke-fsm-list-1', agent: 'mock' });
    const r2 = startRun({ block_id: 'b.smoke-fsm-list-2', agent: 'mock' });
    transitionRunState(r2.run_id, 'LaunchingAgent');
    transitionRunState(r2.run_id, 'Running');
    transitionRunState(r2.run_id, 'Finishing');
    transitionRunState(r2.run_id, 'Succeeded');
    const all = listRuns();
    const active = listRuns({ active_only: true });
    check('group6:all >= 2 incl new', all.length >= 2);
    check('group6:active excludes Succeeded', !active.some((s) => s.run_id === r2.run_id));
    check('group6:active includes Preparing', active.some((s) => s.run_id === r1.run_id));
  }

  // ─── Group 7: detectStalledRuns
  {
    const r = startRun({ block_id: 'b.smoke-fsm-stale', agent: 'mock' });
    transitionRunState(r.run_id, 'LaunchingAgent');
    transitionRunState(r.run_id, 'Running');
    // Backdate last_event_at so it's "old"
    const sp = path.join(process.env.ATLAS_ROOT, 'run_state', `${r.run_id}.json`);
    const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
    s.last_event_at = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    fs.writeFileSync(sp, JSON.stringify(s, null, 2));
    const out = detectStalledRuns({ max_idle_ms: 5 * 60 * 1000 });
    check('group7:flipped >= 1', out.flipped.some((f) => f.run_id === r.run_id));
    check('group7:state Stalled', getRun(r.run_id).current_state === 'Stalled');

    // Fresh run untouched
    const r2 = startRun({ block_id: 'b.smoke-fsm-fresh', agent: 'mock' });
    transitionRunState(r2.run_id, 'LaunchingAgent');
    transitionRunState(r2.run_id, 'Running');
    const out2 = detectStalledRuns({ max_idle_ms: 5 * 60 * 1000 });
    check('group7:fresh not flipped', !out2.flipped.some((f) => f.run_id === r2.run_id),
      `fresh wrongly flipped: ${JSON.stringify(out2.flipped)}`);
  }

  // ─── Group 8: unknown state
  {
    const r = startRun({ block_id: 'b.smoke-fsm-bad', agent: 'mock' });
    let threw = false;
    try { transitionRunState(r.run_id, 'NonsenseState'); } catch { threw = true; }
    check('group8:unknown state rejected', threw);

    // Constants exposed
    check('group8:ACTIVE_STATES has Running', ACTIVE_STATES.has('Running'));
    check('group8:TERMINAL_STATES has Succeeded', TERMINAL_STATES.has('Succeeded'));
  }
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

if (failures.length) {
  console.error('run_state.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('run_state.selftest: OK (8 test groups, all assertions green)');

#!/usr/bin/env node
// PR-7 (b.agent-orchestrator, Symphony-inspired): run-lifecycle state machine.
//
// Replaces the historical fire-and-forget run_block_implementation flow with
// an explicit FSM: every agent run is born `PreparingWorkspace`, walks
// through `LaunchingAgent` → `Running` → (`Verifying`) → terminal, and the
// state lives in a single JSON file under atlas/run_state/<run_id>.json.
//
// State file shape:
//   {
//     run_id: '<block_id>__<UTC>',
//     block_id, agent, started_at, current_state, last_event_at,
//     workspace_path?, prompt_file?, exit_code?, summary?, error?,
//     history: [{ts, from, to, note}, ...]
//   }
//
// Active states (a run is "live" until it enters one of these): Succeeded |
// Failed | Stalled | TimedOut | Canceled. Stalled = current_state is in
// {LaunchingAgent, Running, Verifying} AND now - last_event_at >
// max_turn_idle_ms. detectStalledRuns flips the FSM to Stalled.
//
// API:
//   import { startRun, transitionRunState, getRun, listRuns, cancelRun,
//            detectStalledRuns, ACTIVE_STATES, TERMINAL_STATES } from './run_state.mjs';
//
// CLI:
//   node scripts/run_state.mjs list [--active|--all] [--json]
//   node scripts/run_state.mjs get <run_id> [--json]
//   node scripts/run_state.mjs cancel <run_id> [reason]
//   node scripts/run_state.mjs detect-stalled [--max-idle-ms 600000]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

// R-7.22: ATLAS_ROOT is resolved LAZILY (per call) instead of at module
// load time. run_block_implementation.mjs sets it AFTER parsing --client=,
// which is after this module is imported — so a top-level snapshot would
// miss the redirect and run_state files would land in the legacy ROOT.
function atlasRoot() { return process.env.ATLAS_ROOT || path.join(ROOT, 'atlas'); }
function runStateDir() { return path.join(atlasRoot(), 'run_state'); }

// State graph — the order matches the typical happy path; transitionRunState
// enforces "you can only enter state X from one of these previous states".
export const ALLOWED_TRANSITIONS = {
  // born
  PreparingWorkspace: [null],
  // happy path
  LaunchingAgent: ['PreparingWorkspace'],
  Running: ['LaunchingAgent'],
  Verifying: ['Running'],
  Finishing: ['Running', 'Verifying'],
  // terminal — many sources allowed
  Succeeded: ['Verifying', 'Finishing'],
  Failed: ['PreparingWorkspace', 'LaunchingAgent', 'Running', 'Verifying', 'Finishing'],
  Stalled: ['LaunchingAgent', 'Running', 'Verifying', 'Finishing'],
  TimedOut: ['LaunchingAgent', 'Running', 'Verifying', 'Finishing'],
  Canceled: ['PreparingWorkspace', 'LaunchingAgent', 'Running', 'Verifying', 'Finishing'],
};

export const ACTIVE_STATES = new Set([
  'PreparingWorkspace', 'LaunchingAgent', 'Running', 'Verifying', 'Finishing',
]);
export const TERMINAL_STATES = new Set([
  'Succeeded', 'Failed', 'Stalled', 'TimedOut', 'Canceled',
]);

const DEFAULT_MAX_IDLE_MS = Number(process.env.ATLAS_RUN_MAX_IDLE_MS || 10 * 60 * 1000);

function ensureDir() { fs.mkdirSync(runStateDir(), { recursive: true }); }

function pathFor(run_id) { return path.join(runStateDir(), `${run_id}.json`); }

function readState(run_id) {
  const p = pathFor(run_id);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function writeState(state) {
  ensureDir();
  fs.writeFileSync(pathFor(state.run_id), JSON.stringify(state, null, 2) + '\n', 'utf8');
}

export function startRun({ block_id, agent = 'unknown', workspace_path = null, prompt_file = null, run_id = null }) {
  if (!block_id) throw new Error('startRun: block_id required');
  ensureDir();
  const ts = new Date().toISOString();
  const id = run_id || `${block_id}__${ts.replace(/[:.]/g, '-')}`;
  if (fs.existsSync(pathFor(id))) {
    throw new Error(`startRun: run_id collision ${id}`);
  }
  const state = {
    run_id: id,
    block_id,
    agent,
    started_at: ts,
    current_state: 'PreparingWorkspace',
    last_event_at: ts,
    workspace_path,
    prompt_file,
    history: [{ ts, from: null, to: 'PreparingWorkspace', note: 'startRun' }],
  };
  writeState(state);
  return state;
}

export function transitionRunState(run_id, new_state, meta = {}) {
  const state = readState(run_id);
  if (!state) throw new Error(`transitionRunState: run not found: ${run_id}`);
  const allowed = ALLOWED_TRANSITIONS[new_state];
  if (!allowed) throw new Error(`transitionRunState: unknown state ${new_state}`);
  if (TERMINAL_STATES.has(state.current_state)) {
    throw new Error(`transitionRunState: ${run_id} already terminal (${state.current_state}); cannot transition to ${new_state}`);
  }
  if (!allowed.includes(state.current_state) && !allowed.includes(null)) {
    throw new Error(`transitionRunState: invalid transition ${state.current_state} → ${new_state} (allowed: ${allowed.join(', ')})`);
  }
  const ts = new Date().toISOString();
  state.history.push({ ts, from: state.current_state, to: new_state, note: meta.note || '' });
  state.current_state = new_state;
  state.last_event_at = ts;
  // Merge known terminal-meta fields
  for (const k of ['exit_code', 'summary', 'error', 'workspace_path', 'prompt_file', 'verifier_verdict', 'diff_proposal_id']) {
    if (k in meta) state[k] = meta[k];
  }
  if (TERMINAL_STATES.has(new_state)) state.terminated_at = ts;
  writeState(state);
  return state;
}

export function getRun(run_id) { return readState(run_id); }

export function listRuns({ active_only = false } = {}) {
  const dir = runStateDir();
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const s = readState(f.replace(/\.json$/, ''));
    if (!s) continue;
    if (active_only && !ACTIVE_STATES.has(s.current_state)) continue;
    out.push(s);
  }
  return out.sort((a, b) => (b.started_at || '').localeCompare(a.started_at || ''));
}

export function cancelRun(run_id, reason = '') {
  const s = readState(run_id);
  if (!s) throw new Error(`cancelRun: run not found: ${run_id}`);
  if (TERMINAL_STATES.has(s.current_state)) {
    return { run_id, status: 'noop', reason: `already terminal: ${s.current_state}` };
  }
  return transitionRunState(run_id, 'Canceled', { note: reason || 'cancelled' });
}

export function detectStalledRuns({ max_idle_ms = DEFAULT_MAX_IDLE_MS } = {}) {
  const now = Date.now();
  const flipped = [];
  for (const s of listRuns({ active_only: true })) {
    const idle = now - Date.parse(s.last_event_at || s.started_at);
    if (idle <= max_idle_ms) continue;
    // Don't flip PreparingWorkspace (that one shouldn't take seconds, but
    // could be a CI quirk; only flip when idle > 2x threshold).
    if (s.current_state === 'PreparingWorkspace' && idle <= max_idle_ms * 2) continue;
    try {
      transitionRunState(s.run_id, 'Stalled', { note: `idle ${Math.round(idle/1000)}s exceeds threshold ${Math.round(max_idle_ms/1000)}s` });
      flipped.push({ run_id: s.run_id, idle_ms: idle, was: s.current_state });
    } catch (e) { /* swallow */ }
  }
  return { flipped, max_idle_ms };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const json = argv.includes('--json');
  if (cmd === 'list') {
    const active = argv.includes('--active');
    const items = listRuns({ active_only: active });
    if (json) console.log(JSON.stringify(items, null, 2));
    else {
      console.log(`runs: ${items.length} ${active ? '(active only)' : ''}`);
      for (const r of items) {
        console.log(`  ${r.run_id}  [${r.current_state}]  agent=${r.agent}  block=${r.block_id}`);
      }
    }
  } else if (cmd === 'get') {
    const id = argv[1];
    const s = id ? getRun(id) : null;
    if (!s) { console.error('not found'); process.exit(2); }
    console.log(JSON.stringify(s, null, 2));
  } else if (cmd === 'cancel') {
    const id = argv[1];
    const reason = argv.slice(2).filter((a) => !a.startsWith('--')).join(' ');
    if (!id) { console.error('Usage: ... cancel <run_id> [reason]'); process.exit(1); }
    const r = cancelRun(id, reason);
    console.log(json ? JSON.stringify(r, null, 2) : `cancel: ${id} → ${r.current_state || r.status}`);
  } else if (cmd === 'detect-stalled') {
    const i = argv.indexOf('--max-idle-ms');
    const max_idle_ms = i >= 0 ? Number(argv[i + 1]) : DEFAULT_MAX_IDLE_MS;
    const r = detectStalledRuns({ max_idle_ms });
    if (json) console.log(JSON.stringify(r, null, 2));
    else console.log(`detect-stalled: flipped ${r.flipped.length} run(s); threshold=${Math.round(r.max_idle_ms / 1000)}s`);
  } else {
    console.error('Usage:');
    console.error('  node scripts/run_state.mjs list [--active|--all] [--json]');
    console.error('  node scripts/run_state.mjs get <run_id>');
    console.error('  node scripts/run_state.mjs cancel <run_id> [reason]');
    console.error('  node scripts/run_state.mjs detect-stalled [--max-idle-ms <ms>] [--json]');
    process.exit(1);
  }
}

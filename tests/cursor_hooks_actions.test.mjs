#!/usr/bin/env node
// PR4: integration tests for the three action scripts wired into .cursor/hooks.json.
//   1. observe_file_edit.mjs
//      - mapping a known file to its owner block writes a cursor_edit line in checks.log
//      - mapping an unknown file under repo writes a warn line into b.agent-orchestrator/checks.log
//      - missing path is a graceful no-op
//   2. guard_against_drift.mjs
//      - "pip install neo4j" is rejected (exit 1) and writes drift_blocked
//      - "npm install react" is approved (exit 0)
//      - empty command is approved
//   3. inject_context_pack.mjs
//      - prints a context pack containing the block's mission + rules + tech_stack
//      - respects SIMA_BLOCK_ID
//      - falls back to last observation owner / first block when env empty
//
// All tests are idempotent: snapshot affected logs, run, assert, restore.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');
const BLOCKS = path.join(ATLAS, 'blocks');
const OBS_DIR = path.join(ATLAS, 'process_runs', 'cursor_observations');

const failures = [];
function eq(name, cond, hint = '') { if (!cond) failures.push(`${name}${hint ? ' :: ' + hint : ''}`); }

function runNode(script, argv = [], env = {}) {
  return spawnSync('node', [script, ...argv], {
    cwd: ROOT,
    env: { ...process.env, ...env },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

// ─── Snapshots ────────────────────────────────────────────────────────────
const SNAP_FILES = [
  path.join(BLOCKS, 'b.ui-control', 'checks.log'),
  path.join(BLOCKS, 'b.agent-orchestrator', 'checks.log'),
  path.join(BLOCKS, 'b.docs', 'checks.log'),
  path.join(ATLAS, 'transitions.log'),
];
const snap = new Map();
for (const p of SNAP_FILES) snap.set(p, fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null);
const obsBefore = fs.existsSync(OBS_DIR) ? new Set(fs.readdirSync(OBS_DIR)) : new Set();

try {
  // ─── Test 1: observe_file_edit on a known b.ui-control file ───────────
  // R-7.89 (Phase II) — fixture was frontend/app_v2.jsx, one of the 27 stale
  // [alive] entries cleaned from b.ui-control/files.md in PR #43. Repointed
  // to a file b.ui-control genuinely owns now (frontend/atlas_sync.js).
  {
    const r = runNode('scripts/observe_file_edit.mjs', ['frontend/atlas_sync.js']);
    eq('observe.known: exit 0', r.status === 0, `stderr=${r.stderr}`);
    const log = fs.readFileSync(path.join(BLOCKS, 'b.ui-control', 'checks.log'), 'utf8');
    eq('observe.known: cursor_edit line appended to b.ui-control', /cursor_edit\tpass\t.*atlas_sync\.js/.test(log));
    eq('observe.known: observation file written',
       fs.existsSync(OBS_DIR) && fs.readdirSync(OBS_DIR).length > obsBefore.size);
  }

  // ─── Test 2: observe_file_edit on an unowned path ─────────────────────
  {
    const r = runNode('scripts/observe_file_edit.mjs', ['random/path/that_no_block_owns.tmp']);
    eq('observe.unowned: exit 0', r.status === 0);
    const log = fs.readFileSync(path.join(BLOCKS, 'b.agent-orchestrator', 'checks.log'), 'utf8');
    eq('observe.unowned: warn line added to b.agent-orchestrator',
       /cursor_edit\twarn\tunowned file: random\/path/.test(log));
  }

  // ─── Test 3: observe_file_edit with no path ───────────────────────────
  {
    const r = runNode('scripts/observe_file_edit.mjs', []);
    eq('observe.empty: exit 0', r.status === 0);
  }

  // ─── Test 4: guard_against_drift rejects pip install ──────────────────
  {
    const r = runNode('scripts/guard_against_drift.mjs', ['pip', 'install', 'neo4j']);
    eq('guard.pip: exit 1', r.status === 1);
    eq('guard.pip: stderr mentions drift_blocked', /drift_blocked/.test(r.stderr));
    const orchLog = fs.readFileSync(path.join(BLOCKS, 'b.agent-orchestrator', 'checks.log'), 'utf8');
    eq('guard.pip: drift_guard fail logged in orchestrator', /drift_guard\tfail/.test(orchLog));
    const transitions = fs.readFileSync(path.join(ATLAS, 'transitions.log'), 'utf8');
    eq('guard.pip: drift_guard fail logged in transitions', /drift_guard\tfail/.test(transitions));
  }

  // ─── Test 5: guard_against_drift approves npm install react ───────────
  {
    const r = runNode('scripts/guard_against_drift.mjs', ['npm', 'install', 'react']);
    eq('guard.npm: exit 0', r.status === 0, `stderr=${r.stderr}`);
  }

  // ─── Test 6: guard rejects yarn add vue (substring rule) ──────────────
  {
    const r = runNode('scripts/guard_against_drift.mjs', ['yarn', 'add', 'vue']);
    eq('guard.vue: exit 1', r.status === 1);
  }

  // ─── Test 7: guard with empty command ─────────────────────────────────
  {
    const r = runNode('scripts/guard_against_drift.mjs', []);
    eq('guard.empty: exit 0', r.status === 0);
  }

  // ─── Test 8: inject_context_pack via SIMA_BLOCK_ID ────────────────────
  {
    const r = runNode('scripts/inject_context_pack.mjs', [], { SIMA_BLOCK_ID: 'b.docs', CURSOR_BLOCK_ID: '' });
    eq('inject.docs: exit 0', r.status === 0, `stderr=${r.stderr}`);
    eq('inject.docs: contains ATLAS CONTEXT PACK header', /ATLAS CONTEXT PACK/.test(r.stdout));
    eq('inject.docs: contains b.docs marker', /<!-- block: b\.docs -->/.test(r.stdout));
    eq('inject.docs: contains mission section', /## Block: b\.docs[\s\S]+### mission/.test(r.stdout));
    eq('inject.docs: contains tech stack', /## Tech stack/.test(r.stdout));
  }

  // ─── Test 9: inject_context_pack detects block from prompt ────────────
  {
    const r = runNode('scripts/inject_context_pack.mjs', ['продолжи', 'b.core-sync', 'добавь', 'тест'], { SIMA_BLOCK_ID: '', CURSOR_BLOCK_ID: '' });
    eq('inject.detect: exit 0', r.status === 0, `stderr=${r.stderr}`);
    eq('inject.detect: detected b.core-sync from prompt', /<!-- block: b\.core-sync -->/.test(r.stdout));
  }
} finally {
  // ─── Restore: revert any state we mutated ──────────────────────────────
  for (const [p, content] of snap) {
    if (content === null) {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } else {
      fs.writeFileSync(p, content);
    }
  }
  if (fs.existsSync(OBS_DIR)) {
    for (const f of fs.readdirSync(OBS_DIR)) {
      if (!obsBefore.has(f)) fs.unlinkSync(path.join(OBS_DIR, f));
    }
  }
}

if (failures.length) {
  console.error('cursor_hooks_actions.test: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('cursor_hooks_actions.test: OK (9 cases)');

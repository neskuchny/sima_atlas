#!/usr/bin/env node
// Headless Cursor live test — invokes the same hook scripts that Cursor
// would invoke when the operator types into chat / runs a shell command /
// edits a JSX file. We can't run Cursor itself in CI, but we CAN exercise
// the action scripts with the same env shape Cursor sets, and verify they
// produce the documented side effects.
//
// 5 phases mirroring atlas/ops/cursor_live_test.md:
//   1. validate_cursor_hooks.mjs OK
//   2. beforeShellExecution: blocks `pip install neo4j`, allows `npm install react`
//   3. afterFileEdit: simulating an edit to a Sima Remix JSX writes a
//      cursor_edit pass line into the owner block's checks.log
//   4. beforeSubmitPrompt: SIMA_BLOCK_ID=b.docs inject_context_pack emits
//      a pack with `## Block: b.docs` + mission excerpt
//   5. tests/cursor_hooks_actions.test.mjs (the 9-case detailed suite)
//      stays green
//
// Backups + restores the few files the simulation mutates so the real repo
// state is preserved.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
}

// Snapshot files we may mutate so we can restore at the end
const filesToBackup = [
  'atlas/transitions.log',
  'atlas/blocks/b.agent-orchestrator/checks.log',
  'atlas/blocks/b.ui-control/checks.log',
  'atlas/blocks/b.docs/checks.log',
];
const backup = new Map();
for (const f of filesToBackup) {
  const abs = path.join(ROOT, f);
  if (fs.existsSync(abs)) backup.set(abs, fs.readFileSync(abs, 'utf8'));
}

try {
  // ─── Phase 1: hooks.json validation
  {
    const r = run('node', ['scripts/validate_cursor_hooks.mjs']);
    check('phase1:validate_cursor_hooks OK', r.status === 0, `stderr=${r.stderr}`);
    check('phase1:reports OK', /OK/.test(r.stdout || ''));
  }

  // ─── Phase 2: beforeShellExecution
  {
    const blocked = run('node', ['scripts/guard_against_drift.mjs', 'pip install neo4j']);
    check('phase2:pip blocked', blocked.status === 1,
      `expected exit 1, got ${blocked.status}`);
    check('phase2:transitions.log got drift_guard line',
      /drift_guard\s+fail/.test(fs.readFileSync(path.join(ROOT, 'atlas', 'transitions.log'), 'utf8')));

    const allowed = run('node', ['scripts/guard_against_drift.mjs', 'npm install react']);
    check('phase2:npm install react allowed', allowed.status === 0);
  }

  // ─── Phase 3: afterFileEdit — simulate Cursor's env vars
  {
    const r = run('node', ['scripts/observe_file_edit.mjs'], {
      env: {
        ...process.env,
        CURSOR_FILE_PATH: 'Sima (Remix)/app_v2.jsx',
      },
    });
    // observe_file_edit may exit 0 with a line written, or skip if it can't
    // resolve the owner. We tolerate both but check log contents.
    const checks = fs.readFileSync(path.join(ROOT, 'atlas', 'blocks', 'b.ui-control', 'checks.log'), 'utf8');
    check('phase3:b.ui-control got cursor_edit line OR observe exited 0',
      r.status === 0 && /cursor_edit/.test(checks),
      `status=${r.status}, last line: ${checks.trim().split(/\r?\n/).slice(-1)[0]}`);
  }

  // ─── Phase 4: beforeSubmitPrompt → inject_context_pack
  {
    const r = run('node', ['scripts/inject_context_pack.mjs'], {
      env: { ...process.env, SIMA_BLOCK_ID: 'b.docs' },
    });
    check('phase4:inject_context_pack exit 0', r.status === 0);
    check('phase4:emits ATLAS CONTEXT PACK marker',
      /ATLAS CONTEXT PACK/.test(r.stdout || ''));
    check('phase4:emits Block: b.docs section', /## Block: b\.docs/.test(r.stdout));
    check('phase4:carries mission', /mission/i.test(r.stdout));
  }

  // ─── Phase 5: detailed 9-case action test
  {
    const r = run('node', ['tests/cursor_hooks_actions.test.mjs']);
    check('phase5:detailed action test OK', r.status === 0,
      `stderr=${r.stderr}`);
  }
} finally {
  // Restore snapshots — the headless smoke must not leak state.
  for (const [abs, content] of backup) fs.writeFileSync(abs, content);
}

if (failures.length) {
  console.error('cursor_live.headless.smoke: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('cursor_live.headless.smoke: OK (5 phases — hooks valid, drift guard fires, file-edit logged, context pack emitted, detailed suite green)');

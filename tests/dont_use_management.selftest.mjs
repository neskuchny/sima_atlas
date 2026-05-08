#!/usr/bin/env node
// PR-3 (b.operator-profile-learner): selftest for scripts/manage_dont_use.mjs
// + scripts/guard_against_drift.mjs personal-ban path.
//
// 7 test groups:
//  1. setDontUse adds an entry; listDontUse returns it
//  2. setDontUse with same value updates reason (no duplicate)
//  3. clearDontUse removes; second clear → not_found
//  4. setAlwaysUse + clearAlwaysUse round-trip
//  5. effectiveDontUseValues merges dont_use.json + profile.dont_use
//  6. guard_against_drift exits 1 + cites operator_profile/dont_use.json
//     when a personal ban is hit
//  7. validate_dont_use_compliance writes a dont_use_warning proposal when
//     a banned tech_stack value is present in graph.json

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  setDontUse, clearDontUse, listDontUse,
  setAlwaysUse, clearAlwaysUse, listAlwaysUse,
  effectiveDontUseValues,
} from '../scripts/manage_dont_use.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

function mkAtlas(extra = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'dontuse-'));
  const atlas = path.join(tmp, 'atlas');
  fs.mkdirSync(path.join(atlas, 'operator_profile'), { recursive: true });
  fs.mkdirSync(path.join(atlas, 'blocks', 'b.agent-orchestrator'), { recursive: true });
  fs.writeFileSync(path.join(atlas, 'tech_stack.md'), '```forbidden\n```\n```forbidden_substrings\n```\n');
  fs.writeFileSync(path.join(atlas, 'transitions.log'), '');
  fs.writeFileSync(path.join(atlas, 'blocks', 'b.agent-orchestrator', 'checks.log'), '');
  if (extra.profile) fs.writeFileSync(path.join(atlas, 'operator_profile', 'profile.json'), JSON.stringify(extra.profile, null, 2));
  if (extra.graph) fs.writeFileSync(path.join(atlas, 'graph.json'), JSON.stringify(extra.graph, null, 2));
  return atlas;
}

try {
  // ─── Group 1: setDontUse + list
  {
    const atlas = mkAtlas();
    const r = setDontUse({ atlas_root: atlas, value: 'mongo', reason: 'too heavy' });
    check('group1:added', r.status === 'added' && r.value === 'mongo');
    const items = listDontUse({ atlas_root: atlas });
    check('group1:list 1', items.length === 1 && items[0].value === 'mongo' && items[0].reason === 'too heavy');
    fs.rmSync(path.dirname(atlas), { recursive: true, force: true });
  }

  // ─── Group 2: setDontUse same value → updated, no duplicate
  {
    const atlas = mkAtlas();
    setDontUse({ atlas_root: atlas, value: 'mongo', reason: 'too heavy' });
    const r2 = setDontUse({ atlas_root: atlas, value: 'mongo', reason: 'gives up at scale' });
    check('group2:updated', r2.status === 'updated' && r2.reason === 'gives up at scale');
    const items = listDontUse({ atlas_root: atlas });
    check('group2:still 1 entry', items.length === 1, `got ${items.length}`);
    fs.rmSync(path.dirname(atlas), { recursive: true, force: true });
  }

  // ─── Group 3: clearDontUse + missing
  {
    const atlas = mkAtlas();
    setDontUse({ atlas_root: atlas, value: 'mongo' });
    const r1 = clearDontUse({ atlas_root: atlas, value: 'mongo' });
    check('group3:cleared', r1.cleared === true);
    check('group3:list empty', listDontUse({ atlas_root: atlas }).length === 0);
    const r2 = clearDontUse({ atlas_root: atlas, value: 'mongo' });
    check('group3:second clear not_found', r2.cleared === false && r2.reason === 'not_found');
    fs.rmSync(path.dirname(atlas), { recursive: true, force: true });
  }

  // ─── Group 4: alwaysUse round-trip
  {
    const atlas = mkAtlas();
    setAlwaysUse({ atlas_root: atlas, category: 'language', value: 'typescript', reason: 'team standard' });
    setAlwaysUse({ atlas_root: atlas, category: 'language', value: 'typescript' }); // duplicate → updated
    const items = listAlwaysUse({ atlas_root: atlas });
    check('group4:1 entry', items.length === 1);
    check('group4:reason kept on duplicate-no-reason update',
      items[0].reason === 'team standard',
      `reason=${items[0].reason}`);
    const r = clearAlwaysUse({ atlas_root: atlas, category: 'language', value: 'typescript' });
    check('group4:cleared', r.cleared === true);
    fs.rmSync(path.dirname(atlas), { recursive: true, force: true });
  }

  // ─── Group 5: effectiveDontUseValues merges sources
  {
    const atlas = mkAtlas({ profile: { _status: 'live', dont_use: ['vue'] } });
    setDontUse({ atlas_root: atlas, value: 'mongo' });
    const eff = effectiveDontUseValues({ atlas_root: atlas });
    check('group5:has mongo', eff.includes('mongo'));
    check('group5:has vue (from profile.json)', eff.includes('vue'));
    fs.rmSync(path.dirname(atlas), { recursive: true, force: true });
  }

  // ─── Group 6: guard_against_drift cites personal source
  {
    const atlas = mkAtlas();
    setDontUse({ atlas_root: atlas, value: 'mongo' });
    const r = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'guard_against_drift.mjs'), 'npm install mongo'], {
      cwd: path.dirname(atlas), encoding: 'utf8',
      env: { ...process.env, ATLAS_ROOT: atlas },
    });
    // guard_against_drift uses script-relative ATLAS, so ATLAS_ROOT alone
    // isn't enough — but we can run it from a cwd whose atlas/ is our tmp
    // by creating a symlink / running via our cwd. For this selftest we
    // just verify the EXIT CODE of guard with the real repo + a temp ban
    // attached, then immediately remove the ban.
    fs.rmSync(path.dirname(atlas), { recursive: true, force: true });

    // Direct repo test: temporarily add ban, run guard, remove ban.
    // guard_against_drift writes to atlas/transitions.log + atlas/blocks/
    // b.agent-orchestrator/checks.log when blocking, so we snapshot+restore
    // those files too to avoid polluting the real repo state.
    const realDontUse = path.join(REPO_ROOT, 'atlas', 'operator_profile', 'dont_use.json');
    const realTransitions = path.join(REPO_ROOT, 'atlas', 'transitions.log');
    const realOrchChecks = path.join(REPO_ROOT, 'atlas', 'blocks', 'b.agent-orchestrator', 'checks.log');
    const hadFile = fs.existsSync(realDontUse);
    const backup = hadFile ? fs.readFileSync(realDontUse, 'utf8') : null;
    const transBackup = fs.existsSync(realTransitions) ? fs.readFileSync(realTransitions, 'utf8') : null;
    const checksBackup = fs.existsSync(realOrchChecks) ? fs.readFileSync(realOrchChecks, 'utf8') : null;
    try {
      fs.writeFileSync(realDontUse, JSON.stringify([{ value: 'qzqz_smoke_only', reason: 'selftest' }]));
      const blocked = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'guard_against_drift.mjs'), 'npm install qzqz_smoke_only'], {
        cwd: REPO_ROOT, encoding: 'utf8',
      });
      check('group6:blocked exit 1', blocked.status === 1, `exit=${blocked.status}`);
      check('group6:cites operator_profile', /operator_profile\/dont_use\.json/.test(blocked.stderr), `stderr=${blocked.stderr}`);
      check('group6:hint to clear', /manage_dont_use\.mjs clear/.test(blocked.stderr));

      // Approve when banned token absent
      const approved = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'guard_against_drift.mjs'), 'npm install react'], {
        cwd: REPO_ROOT, encoding: 'utf8',
      });
      check('group6:approve exit 0', approved.status === 0);
    } finally {
      if (hadFile) fs.writeFileSync(realDontUse, backup);
      else if (fs.existsSync(realDontUse)) fs.unlinkSync(realDontUse);
      if (transBackup !== null) fs.writeFileSync(realTransitions, transBackup);
      if (checksBackup !== null) fs.writeFileSync(realOrchChecks, checksBackup);
    }
  }

  // ─── Group 7: validate_dont_use_compliance writes proposal
  {
    const realDontUse = path.join(REPO_ROOT, 'atlas', 'operator_profile', 'dont_use.json');
    const hadFile = fs.existsSync(realDontUse);
    const backup = hadFile ? fs.readFileSync(realDontUse, 'utf8') : null;
    const proposalsDir = path.join(REPO_ROOT, 'atlas', 'proposals');
    const before = new Set(fs.existsSync(proposalsDir) ? fs.readdirSync(proposalsDir) : []);
    try {
      // Use a token that actually appears in graph.json tech_stack — `nodejs`.
      // To avoid noise we pick something that DOES appear in the real graph
      // so the validator finds at least 1 hit.
      fs.writeFileSync(realDontUse, JSON.stringify([{ value: 'nodejs', reason: 'selftest token' }]));
      const r = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'validate_dont_use_compliance.mjs'), '--json'], {
        cwd: REPO_ROOT, encoding: 'utf8',
      });
      check('group7:exit 0', r.status === 0);
      const summary = JSON.parse(r.stdout);
      check('group7:has warnings', Array.isArray(summary.warnings) && summary.warnings.length >= 1,
        `summary=${r.stdout.slice(0, 300)}`);
      check('group7:banned includes nodejs', summary.banned.includes('nodejs'));
      // Proposal file written
      const after = fs.readdirSync(proposalsDir);
      const newOnes = after.filter((f) => !before.has(f) && f.endsWith('__dont_use_warning.json'));
      check('group7:proposal written', newOnes.length >= 1, `new proposals: ${newOnes.join(', ')}`);
      // Cleanup the proposals we created
      for (const f of newOnes) {
        try { fs.unlinkSync(path.join(proposalsDir, f)); } catch {}
      }
    } finally {
      if (hadFile) fs.writeFileSync(realDontUse, backup);
      else fs.unlinkSync(realDontUse);
    }
  }
} catch (e) {
  failures.push('test runner threw: ' + e.message);
}

if (failures.length) {
  console.error('dont_use_management.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('dont_use_management.selftest: OK (7 test groups, all assertions green)');

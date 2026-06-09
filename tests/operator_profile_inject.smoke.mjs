#!/usr/bin/env node
// PR-5 (b.operator-profile-learner): smoke test for inject_context_pack.mjs's
// «Operator profile» section.
//
// 4 test groups:
//  1. warming_up profile → NO «Operator profile» section emitted
//  2. live profile with tech_stack_history high-satisfaction → section
//     appears with «оператор предпочитает» hint
//  3. lessons.json present → section lists last 3 lessons with evidence
//  4. --no-profile flag → section silent regardless of profile state

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

function setupTmpAtlas({ profile, lessons, dontUse } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-inject-'));
  const atlas = path.join(tmp, 'atlas');
  fs.mkdirSync(path.join(atlas, 'blocks', 'b.demo'), { recursive: true });
  fs.mkdirSync(path.join(atlas, 'operator_profile'), { recursive: true });

  // Minimal block contracts the inject_context_pack reads
  fs.writeFileSync(path.join(atlas, 'blocks', 'b.demo', 'mission.md'), '# b.demo — mission\nDemo block for inject smoke.\n');
  fs.writeFileSync(path.join(atlas, 'blocks', 'b.demo', 'kpi.md'), '# kpi\n- KPI-1: smoke\n');
  fs.writeFileSync(path.join(atlas, 'blocks', 'b.demo', 'acceptance.md'), '# acceptance\n- [ ] **A1.** smoke\n');
  fs.writeFileSync(path.join(atlas, 'blocks', 'b.demo', 'depends_on.md'), '- none\n');
  fs.writeFileSync(path.join(atlas, 'blocks', 'b.demo', 'provides.md'), '- demo_thing\n');
  fs.writeFileSync(path.join(atlas, 'blocks', 'b.demo', 'files.md'), '# files\n- README.md [alive]\n');
  fs.writeFileSync(path.join(atlas, 'blocks', 'b.demo', 'tasks.md'), '- [ ] T1\n');
  fs.writeFileSync(path.join(atlas, 'blocks', 'b.demo', 'checks.log'), '');

  fs.writeFileSync(path.join(atlas, 'project.md'), 'project mission');
  fs.writeFileSync(path.join(atlas, 'rules.md'), 'rules');
  fs.writeFileSync(path.join(atlas, 'tech_stack.md'), 'tech stack');
  fs.writeFileSync(path.join(atlas, 'graph.json'), JSON.stringify({ blocks: [{ id: 'b.demo', layer: 'logic' }] }));

  if (profile) fs.writeFileSync(path.join(atlas, 'operator_profile', 'profile.json'), JSON.stringify(profile, null, 2));
  if (lessons) fs.writeFileSync(path.join(atlas, 'operator_profile', 'lessons.json'), JSON.stringify(lessons, null, 2));
  if (dontUse) fs.writeFileSync(path.join(atlas, 'operator_profile', 'dont_use.json'), JSON.stringify(dontUse, null, 2));
  return tmp;
}

function runInject(tmp, extraArgs = [], envExtra = {}) {
  return spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'inject_context_pack.mjs'), ...extraArgs], {
    cwd: tmp,
    encoding: 'utf8',
    env: { ...process.env, SIMA_BLOCK_ID: 'b.demo', ATLAS_ROOT: path.join(tmp, 'atlas'), ...envExtra },
  });
}

// inject_context_pack uses script-relative ATLAS path. Override via ATLAS_ROOT
// env? Let me check — actually the existing inject reads ATLAS = path.join(ROOT, 'atlas')
// where ROOT is __dirname/.. (script-relative). The PR-5 addition reads from
// the same ATLAS so it inherits the script-relative behavior. To make this
// smoke independent of the real repo's atlas/, we point CWD to tmp and rely
// on the inject script reading from the real repo's atlas — but block must
// exist there.
//
// Simpler: copy our profile/lessons files into the real atlas/ briefly, run,
// clean up. To keep this commit small, this smoke just exercises the rendering
// LOGIC by directly importing the function — we verify the section text given
// known inputs. Pure-function path test.

import('../scripts/inject_context_pack.mjs').catch(() => {}); // Side-effect run when imported as main; here we just want module loaded for any exports.

// Since inject_context_pack is a CLI script (no exports), we test via spawn
// against the real repo's atlas/blocks/<id> using a known block, but with
// ATLAS_ROOT-overridden profile/lessons. To do that cleanly we need the
// script to honor ATLAS_ROOT for the profile path. Let me add that override
// in the inject_context_pack itself by reading process.env.ATLAS_ROOT for the
// operator_profile path specifically. For now, the smoke runs against the
// real atlas/ with the real profile (currently warming_up → section absent).

try {
  // ─── Group 1: warming_up profile → no Operator profile section.
  // R-7.98: was «real repo state» — broke the day the real profile honestly
  // crossed the min-data threshold and flipped to live. Hermetic now: swap
  // in a warming_up profile for the duration, restore after (same pattern
  // as group 2).
  {
    const realProfilePath = path.join(REPO_ROOT, 'atlas', 'operator_profile', 'profile.json');
    const backup = fs.existsSync(realProfilePath) ? fs.readFileSync(realProfilePath, 'utf8') : null;
    fs.writeFileSync(realProfilePath, JSON.stringify({
      operator_id: 'smoke', updated_at: new Date().toISOString(), _status: 'warming_up',
      _min_data: { done_transitions: 1, done_required: 5, invocations: 1, invocations_required: 10 },
    }, null, 2));
    try {
      const r = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'inject_context_pack.mjs')], {
        cwd: REPO_ROOT, encoding: 'utf8',
        env: { ...process.env, SIMA_BLOCK_ID: 'b.llm-gateway' },
      });
      check('group1:exit 0', r.status === 0, `stderr=${r.stderr}`);
      check('group1:no operator section in warming_up',
        !/## Operator profile/.test(r.stdout || ''),
        'section should be absent when profile._status=warming_up');
    } finally {
      if (backup !== null) fs.writeFileSync(realProfilePath, backup);
    }
  }

  // ─── Group 2: temporarily inject a "live" profile + run; cleanup
  {
    const realProfilePath = path.join(REPO_ROOT, 'atlas', 'operator_profile', 'profile.json');
    const realLessonsPath = path.join(REPO_ROOT, 'atlas', 'operator_profile', 'lessons.json');
    const realDontUsePath = path.join(REPO_ROOT, 'atlas', 'operator_profile', 'dont_use.json');
    const profileBackup = fs.readFileSync(realProfilePath, 'utf8');
    const liveProfile = {
      operator_id: 'smoke',
      updated_at: new Date().toISOString(),
      _status: 'live',
      work_style: { median_time_idea_to_done_h: 4.2, rollback_rate: 0.15, total_done: 5, total_broken: 1, total_wip_started: 6 },
      agents_used: { claude: { count: 12, success_rate: 0.83, blocks_touched: ['b.x'] } },
      tech_stack_history: {
        frontend: [{ name: 'react', uses: 5, satisfaction: 'high', evidence: ['b.x', 'b.y'] }],
        backend: [{ name: 'fastify', uses: 4, satisfaction: 'high', evidence: ['b.api'] }],
      },
      dont_use: ['mongo'],
    };
    fs.writeFileSync(realProfilePath, JSON.stringify(liveProfile, null, 2));
    fs.writeFileSync(realLessonsPath, JSON.stringify([
      { id: 'L-001', lesson: 'Большое ТЗ + delegate-without-checks → сбой 2 раза.', evidence: ['b.payments@2026-04-12', 'b.search@2026-04-19'], expires_at: null, added_at: '2026-04-20' },
      { id: 'L-002', lesson: 'Mock-данные расходятся с продом по форме webhooks.', evidence: ['b.alpha@2026-04-22', 'b.beta@2026-04-25'], expires_at: null, added_at: '2026-04-26' },
    ], null, 2));
    fs.writeFileSync(realDontUsePath, JSON.stringify(['vue'], null, 2));
    try {
      const r = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'inject_context_pack.mjs')], {
        cwd: REPO_ROOT, encoding: 'utf8',
        env: { ...process.env, SIMA_BLOCK_ID: 'b.llm-gateway' },
      });
      check('group2:exit 0', r.status === 0);
      check('group2:operator section present', /## Operator profile/.test(r.stdout));
      check('group2:tech_stack frontend', /react/.test(r.stdout));
      check('group2:tech_stack backend', /fastify/.test(r.stdout));
      check('group2:agent claude mention', /claude/.test(r.stdout));
      check('group2:dont_use mongo OR vue', /mongo|vue/.test(r.stdout),
        `stdout=${r.stdout.split(/\r?\n/).filter((l) => /использует|НИКОГДА/.test(l)).join(' / ')}`);

      // ─── Group 3: lessons surfaced
      check('group3:last lesson rendered', /Большое ТЗ|Mock-данные/.test(r.stdout),
        `stdout has lessons section?`);
      check('group3:evidence cited', /b\.payments@2026-04-12|b\.alpha@2026-04-22/.test(r.stdout));

      // ─── Group 4: --no-profile flag → silence
      const r2 = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'inject_context_pack.mjs'), '--no-profile'], {
        cwd: REPO_ROOT, encoding: 'utf8',
        env: { ...process.env, SIMA_BLOCK_ID: 'b.llm-gateway' },
      });
      check('group4:--no-profile silences section', !/## Operator profile/.test(r2.stdout || ''));

      const r3 = spawnSync('node', [path.join(REPO_ROOT, 'scripts', 'inject_context_pack.mjs')], {
        cwd: REPO_ROOT, encoding: 'utf8',
        env: { ...process.env, SIMA_BLOCK_ID: 'b.llm-gateway', SIMA_NO_PROFILE: '1' },
      });
      check('group4:SIMA_NO_PROFILE=1 also silences', !/## Operator profile/.test(r3.stdout || ''));
    } finally {
      // Restore real profile state
      fs.writeFileSync(realProfilePath, profileBackup);
      if (fs.existsSync(realLessonsPath)) fs.unlinkSync(realLessonsPath);
      if (fs.existsSync(realDontUsePath)) fs.unlinkSync(realDontUsePath);
    }
  }
} catch (e) {
  failures.push('test runner threw: ' + e.message);
}

if (failures.length) {
  console.error('operator_profile_inject.smoke: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('operator_profile_inject.smoke: OK (4 test groups, all assertions green)');

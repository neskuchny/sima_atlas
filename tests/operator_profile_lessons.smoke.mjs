#!/usr/bin/env node
// PR-4 (b.operator-profile-learner): smoke test for
// scripts/analyze_lessons_from_history.mjs.
//
// 6 test groups:
//  1. min-data → warming_up + 0 lessons
//  2. seeded LLM mock returns 2 lessons → lessons.json written
//  3. dedupe: re-running with same fixture does NOT double-add
//  4. addLesson + listLessons round-trip
//  5. revokeLesson removes by id
//  6. < 2 evidence in returned lesson → filtered out

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeLessons, addLesson, revokeLesson, listLessons } from '../scripts/analyze_lessons_from_history.mjs';
import { mockHashForPrompt } from '../scripts/llm_gateway.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const MOCK_DIR = path.join(ROOT, 'tests', 'llm_mocks');

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

function buildPrompt({ fails, decisions, windowDays }) {
  // Mirror analyze_lessons_from_history.buildPrompt exactly.
  return [
    `You are an Atlas pattern-spotter. Look at a single operator's last ${windowDays} days of FAILED checks and architectural decisions, and surface RECURRING problems (≥ 2 evidence pieces).`,
    '',
    '## Failed checks',
    ...fails.slice(0, 80).map((f) => `- ${f.ts}\t[${f.block_id}]\t${f.kind}\t${f.note}`),
    '',
    '## Decisions',
    ...decisions.slice(0, 60).map((d) => `- ${d.ts}\t[${d.block_id}]\t${d.kind}\t${d.note}`),
    '',
    'Return strictly JSON: {"lessons": [{"lesson": "<sentence>", "evidence": ["<block_id>@<date>", ...], "expires_at": null|"<ISO>"}]}.',
    'Rules:',
    '- Only lessons backed by ≥ 2 distinct evidence items.',
    '- "lesson" is a single sentence in the operator\'s working language (Russian if log notes are mostly Russian, English otherwise).',
    '- evidence array must reference real block_id@date pairs from the input.',
    '- If nothing recurring → return {"lessons": []}.',
    '- expires_at: null unless the lesson is clearly tied to a deprecated tool (then ~3 months out).',
  ].join('\n');
}

function buildSyntheticAtlas({ fails = [], decisions = [] } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-'));
  const atlas = path.join(tmp, 'atlas');
  fs.mkdirSync(atlas);
  const blocks = new Set([...fails.map((x) => x.block_id), ...decisions.map((x) => x.block_id)]);
  for (const b of blocks) {
    const dir = path.join(atlas, 'blocks', b);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'checks.log'),
      fails.filter((x) => x.block_id === b)
        .map((x) => `${x.ts}\t${x.kind}\tfail\t${x.note}`).join('\n') + '\n', 'utf8');
    fs.writeFileSync(path.join(dir, 'decisions.log'),
      decisions.filter((x) => x.block_id === b)
        .map((x) => `${x.ts}\t${x.kind || 'misc'}\t${x.note}`).join('\n') + '\n', 'utf8');
  }
  return atlas;
}

function seedFixture(prompt, payload) {
  fs.mkdirSync(MOCK_DIR, { recursive: true });
  const hash = mockHashForPrompt(prompt);
  const file = path.join(MOCK_DIR, `${hash}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
  return file;
}

function cleanupFixture(prompt) {
  try {
    const hash = mockHashForPrompt(prompt);
    const file = path.join(MOCK_DIR, `${hash}.json`);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {}
}

const seededPrompts = [];

try {
  // ─── Group 1: min-data warming_up
  {
    const atlas = buildSyntheticAtlas({ fails: [], decisions: [] });
    const r = await analyzeLessons({ atlas_root: atlas, window_days: 30 });
    check('group1:warming_up', r.warming_up === true, JSON.stringify(r));
    check('group1:lessons_total=0', r.lessons_total === 0);
    check('group1:lessons_added=0', r.lessons_added === 0);
    fs.rmSync(path.dirname(atlas), { recursive: true, force: true });
  }

  // ─── Group 2: seeded fixture → 2 lessons
  {
    // Use future-dated entries so window_days never filters them out
    const futureTs = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const fails = [
      { ts: futureTs, block_id: 'b.payments', kind: 'integration', note: 'stripe webhook missed; expected on prod, mock differs' },
      { ts: futureTs, block_id: 'b.search', kind: 'integration', note: 'similar webhook issue with elastic; mock differs' },
    ];
    const decisions = [
      { ts: futureTs, block_id: 'b.payments', kind: 'architecture', note: 'big spec then split — failed twice' },
    ];
    const atlas = buildSyntheticAtlas({ fails, decisions });
    const prompt = buildPrompt({ fails, decisions, windowDays: 30 });
    seedFixture(prompt, {
      lessons: [
        {
          lesson: 'Webhook integrations need real provider testing — mock differs from prod consistently.',
          evidence: ['b.payments@' + futureTs.slice(0, 10), 'b.search@' + futureTs.slice(0, 10)],
          expires_at: null,
        },
        {
          lesson: 'Solo-only — only 1 evidence',
          evidence: ['b.payments@' + futureTs.slice(0, 10)],
          expires_at: null,
        },
      ],
    });
    seededPrompts.push(prompt);
    const r = await analyzeLessons({ atlas_root: atlas, window_days: 30 });
    check('group2:warming_up false', !r.warming_up);
    check('group2:added=1 (filtered <2)', r.lessons_added === 1, `added=${r.lessons_added}`);
    check('group2:total=1', r.lessons_total === 1);
    check('group2:cost=0 mock', r.cost_usd === 0);
    const lessonsPath = path.join(atlas, 'operator_profile', 'lessons.json');
    check('group2:lessons.json written', fs.existsSync(lessonsPath));
    if (fs.existsSync(lessonsPath)) {
      const arr = JSON.parse(fs.readFileSync(lessonsPath, 'utf8'));
      check('group2:lesson has L-001 id', arr[0]?.id === 'L-001');
      check('group2:lesson text match', /webhook/i.test(arr[0]?.lesson || ''));
      check('group2:evidence ≥ 2', (arr[0]?.evidence || []).length >= 2);
    }

    // ─── Group 3: dedupe — second run does not double-add
    const r2 = await analyzeLessons({ atlas_root: atlas, window_days: 30 });
    check('group3:added=0 second run', r2.lessons_added === 0, `added=${r2.lessons_added}`);
    check('group3:total still 1', r2.lessons_total === 1);

    fs.rmSync(path.dirname(atlas), { recursive: true, force: true });
  }

  // ─── Group 4: addLesson + listLessons
  {
    const atlas = buildSyntheticAtlas();
    const e1 = addLesson({ atlas_root: atlas, lesson: 'manual lesson 1', evidence: ['b.x@2026-04-01', 'b.y@2026-04-02'] });
    const e2 = addLesson({ atlas_root: atlas, lesson: 'manual lesson 2', evidence: ['b.x@2026-04-03', 'b.z@2026-04-04'] });
    check('group4:e1 id', e1.id === 'L-001');
    check('group4:e2 id', e2.id === 'L-002');
    const all = listLessons({ atlas_root: atlas });
    check('group4:list 2', all.length === 2);
    check('group4:added_by manual', all.every((l) => l.added_by === 'manual'));
    fs.rmSync(path.dirname(atlas), { recursive: true, force: true });
  }

  // ─── Group 5: revokeLesson
  {
    const atlas = buildSyntheticAtlas();
    addLesson({ atlas_root: atlas, lesson: 'A', evidence: ['b.x@1', 'b.y@2'] });
    addLesson({ atlas_root: atlas, lesson: 'B', evidence: ['b.x@3', 'b.z@4'] });
    const r = revokeLesson({ atlas_root: atlas, lesson_id: 'L-001' });
    check('group5:revoked true', r.revoked === true);
    const after = listLessons({ atlas_root: atlas });
    check('group5:1 remaining', after.length === 1);
    check('group5:remaining is L-002', after[0].id === 'L-002');
    const miss = revokeLesson({ atlas_root: atlas, lesson_id: 'L-XYZ' });
    check('group5:missing returns false', miss.revoked === false);
    fs.rmSync(path.dirname(atlas), { recursive: true, force: true });
  }

  // ─── Group 6: < 2 evidence filtered out (covered partially in Group 2,
  //              this verifies the filter path explicitly)
  {
    const futureTs = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    const fails = [{ ts: futureTs, block_id: 'b.alpha', kind: 'check', note: 'one-off failure' }];
    const decisions = [{ ts: futureTs, block_id: 'b.alpha', kind: 'arch', note: 'choice' }];
    const atlas = buildSyntheticAtlas({ fails, decisions });
    const prompt = buildPrompt({ fails, decisions, windowDays: 30 });
    seedFixture(prompt, { lessons: [{ lesson: 'single point', evidence: ['only-one'], expires_at: null }] });
    seededPrompts.push(prompt);
    const r = await analyzeLessons({ atlas_root: atlas, window_days: 30 });
    check('group6:filtered to 0', r.lessons_added === 0, `added=${r.lessons_added}`);
    fs.rmSync(path.dirname(atlas), { recursive: true, force: true });
  }
} finally {
  for (const p of seededPrompts) cleanupFixture(p);
}

if (failures.length) {
  console.error('operator_profile_lessons.smoke: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('operator_profile_lessons.smoke: OK (6 test groups, all assertions green)');

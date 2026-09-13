#!/usr/bin/env node
// R-8.06 (b.clarify) — selftest for the upstream clarification arbiter.
//
// The properties that matter here are mostly NEGATIVE: what the thing must
// refuse to do. A clarifier that returns «clear» when it did not actually read
// anything is worse than no clarifier, because it manufactures confidence at
// the exact point the system exists to remove it.
//
// Runs against a throwaway atlas under os.tmpdir(); never touches the repo's
// own atlas/. Deterministic — forces the mock provider, no network.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.ATLAS_FORCE_MOCK_LLM = '1';

const {
  clarifyBlock, normalizeQuestions, findMarkers, blockMarkers,
  appendAnswers, resolveMarker, VERDICT_ENUM, IMPACT_ENUM,
} = await import('../scripts/clarify_block.mjs');

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const failures = [];
const check = (name, cond, detail = '') => {
  if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`);
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-clarify-'));
const atlas = path.join(tmp, 'atlas');

function seedBlock(id, files, status = 'idea') {
  const dir = path.join(atlas, 'blocks', id);
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), body, 'utf8');
  }
  const gpath = path.join(atlas, 'graph.json');
  const g = fs.existsSync(gpath) ? JSON.parse(fs.readFileSync(gpath, 'utf8')) : { layers: [], blocks: [] };
  const existing = g.blocks.findIndex((b) => b.id === id);
  const entry = { id, title: id, status, layer: 'logic', depends_on: [] };
  if (existing >= 0) g.blocks[existing] = entry; else g.blocks.push(entry);
  fs.writeFileSync(gpath, JSON.stringify(g, null, 2) + '\n', 'utf8');
  return dir;
}

// ── Group 1: the safe-verdict ordering ──────────────────────────────────────
// deterministicEmptyForSchema returns enum[0]; if «clear» were first, every
// keyless run would silently declare the contract understood.
{
  check('g1: VERDICT_ENUM starts with inconclusive', VERDICT_ENUM[0] === 'inconclusive', VERDICT_ENUM.join(','));
  check('g1: clear is not the fallback', VERDICT_ENUM.indexOf('clear') > 0);
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'clarify_block.mjs'), 'utf8');
  check('g1: enum declared inconclusive-first in source',
    /VERDICT_ENUM\s*=\s*\['inconclusive', 'clear', 'questions'\]/.test(src));
}

// ── Group 2: mock never yields «clear» ──────────────────────────────────────
{
  seedBlock('b.mockcase', {
    'mission.md': '# b.mockcase — mission\n\nA real mission with enough substance to be judged against an intent.\n',
    'acceptance.md': '# b.mockcase — acceptance\n\n- [ ] A1. Something verifiable happens.\n',
  });
  const r = await clarifyBlock({ block_id: 'b.mockcase', atlas_root: atlas });
  check('g2: mock run is inconclusive', r.verdict === 'inconclusive', `verdict=${r.verdict}`);
  check('g2: mock flag set', r.mock === true);
  check('g2: never reports clear under mock', r.verdict !== 'clear');
  check('g2: summary names the reason', /mock|no live/i.test(r.summary || ''), r.summary);
}

// ── Group 3: missing / empty contract is inconclusive, not clear ────────────
{
  const r = await clarifyBlock({ block_id: 'b.nonexistent', atlas_root: atlas });
  check('g3: missing block → inconclusive', r.verdict === 'inconclusive', `verdict=${r.verdict}`);

  seedBlock('b.empty', { 'mission.md': '   \n', 'acceptance.md': '' });
  const e = await clarifyBlock({ block_id: 'b.empty', atlas_root: atlas });
  check('g3: empty contract → inconclusive', e.verdict === 'inconclusive', `verdict=${e.verdict}`);
  check('g3: empty contract says so', /empty/i.test(e.summary || ''), e.summary);
}

// ── Group 4: a label is not a question ──────────────────────────────────────
// The single most common failure mode of generated questions: emitting a topic
// heading and calling it a question. The operator cannot answer a heading.
{
  const kept = normalizeQuestions([
    { id: 'Q1', question: 'Should an expired session log the user out immediately?', impact: 'behaviour',
      options: [{ label: 'A', description: 'Immediately', implications: 'Interrupts work in progress' },
        { label: 'B', description: 'On next request', implications: 'Stale session survives briefly' }] },
    { id: 'Q2', question: 'Acceptance matrix (A3)', impact: 'scope',
      options: [{ label: 'A', description: 'x', implications: '' }, { label: 'B', description: 'y', implications: '' }] },
  ]);
  check('g4: real question kept', kept.some((q) => q.id === 'Q1'));
  check('g4: label-as-question dropped', !kept.some((q) => q.id === 'Q2'), JSON.stringify(kept.map((q) => q.id)));
}

// ── Group 5: a question with fewer than two options is not a choice ─────────
{
  const kept = normalizeQuestions([
    { id: 'Q1', question: 'Which storage backend should this use?', impact: 'scope',
      options: [{ label: 'A', description: 'only one', implications: '' }] },
  ]);
  check('g5: single-option question dropped', kept.length === 0, JSON.stringify(kept));
}

// ── Group 6: ordering puts the expensive-to-discover-late first ─────────────
{
  const ordered = normalizeQuestions([
    { id: 'Qa', question: 'Which log level should this use?', impact: 'acceptance',
      options: [{ label: 'A', description: 'a', implications: '' }, { label: 'B', description: 'b', implications: '' }] },
    { id: 'Qb', question: 'Does this feature include the admin surface?', impact: 'scope',
      options: [{ label: 'A', description: 'a', implications: '' }, { label: 'B', description: 'b', implications: '' }] },
  ]);
  check('g6: scope sorts before acceptance', ordered[0]?.id === 'Qb', ordered.map((q) => `${q.id}:${q.impact}`).join(','));
  check('g6: impact order is scope-first', IMPACT_ENUM[0] === 'scope', IMPACT_ENUM.join(','));
}

// ── Group 7: uncertainty markers are found where they live ─────────────────
{
  const found = findMarkers(
    'line one\nSystem MUST retain data for [NEEDS CLARIFICATION: retention period not specified]\nlast\n',
    'mission.md',
  );
  check('g7: marker found', found.length === 1, JSON.stringify(found));
  check('g7: question extracted', found[0]?.question === 'retention period not specified', found[0]?.question);
  check('g7: line number reported', found[0]?.line === 2, String(found[0]?.line));
  check('g7: no false positive on plain text', findMarkers('nothing here at all', 'x.md').length === 0);

  seedBlock('b.marked', {
    'mission.md': '# m\n\nAuth via [NEEDS CLARIFICATION: which method — SSO or password?]\n',
    'acceptance.md': '# a\n\n- [ ] A1 retained for [NEEDS CLARIFICATION: how long?]\n',
  });
  const bm = blockMarkers('b.marked', atlas);
  check('g7: markers collected across files', bm.length === 2, JSON.stringify(bm.map((m) => m.file)));
}

// ── Group 8: the Q→A log is append-only and dated ──────────────────────────
{
  seedBlock('b.logged', { 'mission.md': '# m\n\nSomething.\n' });
  appendAnswers({
    block_id: 'b.logged', atlas_root: atlas, now: '2026-09-13T10:00:00.000Z',
    answers: [{ question: 'Which auth method?', answer: 'OAuth2' }],
  });
  appendAnswers({
    block_id: 'b.logged', atlas_root: atlas, now: '2026-09-13T11:00:00.000Z',
    answers: [{ question: 'How long to retain?', answer: '30 days' }],
  });
  const body = fs.readFileSync(path.join(atlas, 'blocks', 'b.logged', 'clarifications.md'), 'utf8');
  check('g8: first answer preserved', body.includes('Q: Which auth method? → A: OAuth2'));
  check('g8: second answer appended', body.includes('Q: How long to retain? → A: 30 days'));
  check('g8: session dated once', (body.match(/## Session 2026-09-13/g) || []).length === 1, body);
}

// ── Group 9: resolving a marker leaves no contradictory text behind ────────
{
  const dir = seedBlock('b.resolve', {
    'mission.md': '# m\n\nRetention is [NEEDS CLARIFICATION: how long?] by default.\n',
  });
  const r = resolveMarker({
    block_id: 'b.resolve', file: 'mission.md', question: 'how long?',
    resolution: '30 days', atlas_root: atlas,
  });
  const after = fs.readFileSync(path.join(dir, 'mission.md'), 'utf8');
  check('g9: marker replaced', r.replaced === 1, JSON.stringify(r));
  check('g9: resolution written in place', after.includes('Retention is 30 days by default.'), after);
  check('g9: no marker residue', !after.includes('NEEDS CLARIFICATION'), after);
  check('g9: block now reports zero markers', blockMarkers('b.resolve', atlas).length === 0);
}

// ── Group 10: the done-gate actually bites ─────────────────────────────────
// A done block carrying an open question is a dishonest status. The validator
// must exit non-zero on exactly that, and stay quiet while drafting.
{
  const { spawnSync } = await import('node:child_process');
  const run = () => spawnSync('node', [path.join(ROOT, 'scripts', 'validate_clarifications.mjs'), '--json'],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ATLAS_ROOT: atlas } });

  // b.marked is `idea` → drafting stays soft.
  let out = run();
  check('g10: open marker on an idea block does not fail', out.status === 0, out.stdout.slice(0, 300));

  // flip it to done → must fail
  const gpath = path.join(atlas, 'graph.json');
  const g = JSON.parse(fs.readFileSync(gpath, 'utf8'));
  g.blocks.find((b) => b.id === 'b.marked').status = 'done';
  fs.writeFileSync(gpath, JSON.stringify(g, null, 2) + '\n', 'utf8');

  out = run();
  check('g10: open marker on a done block fails', out.status === 1, `status=${out.status}`);
  let parsed = null; try { parsed = JSON.parse(out.stdout); } catch {}
  check('g10: json report marks not-ok', parsed?.ok === false, out.stdout.slice(0, 300));
  check('g10: offending block named', JSON.stringify(parsed?.blocks || []).includes('b.marked'));

  // resolve both markers → green again
  resolveMarker({ block_id: 'b.marked', file: 'mission.md', question: 'which method — SSO or password?', resolution: 'OAuth2', atlas_root: atlas });
  resolveMarker({ block_id: 'b.marked', file: 'acceptance.md', question: 'how long?', resolution: '30 days', atlas_root: atlas });
  out = run();
  check('g10: resolving the markers clears the gate', out.status === 0, out.stdout.slice(0, 300));
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failures.length) {
  console.error('clarify_block.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('clarify_block.selftest: OK (10 groups, all assertions green)');

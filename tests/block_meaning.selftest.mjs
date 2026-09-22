#!/usr/bin/env node
// R-8.08 (b.clarify) — selftest for trajectory + declared understanding.
//
// Group 1 is the bug found on the first real contract: the trajectory heading
// regex used `\b`, which JavaScript defines over [A-Za-z0-9_] only, so every
// Russian heading («## Во что это вырастет») was silently invisible while the
// English ones worked. A test written only in English would have passed.
//
// This file tests the library b.clarify owns. How the orchestrator USES the
// frame gate — the real two-phase run, the HTTP routes, the autonomous loop —
// is tested in tests/frame_gate_flow.selftest.mjs, owned by
// b.agent-orchestrator. Those tests used to live here and imported the
// orchestrator's code: a dependency b.clarify → b.agent-orchestrator, the wrong
// way round, which the code-graph check caught as a would-be cycle.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.env.ATLAS_FORCE_MOCK_LLM = '1';

const {
  readTrajectory, trajectoryPromptLines, understandingPromptLines,
  parseUnderstanding, readUnderstanding, understandingStaleness,
  UNDERSTANDING_SECTIONS, TRAJECTORY_HEADINGS,
} = await import('../scripts/block_meaning.mjs');
const { clarifyBlock, normalizeFrame } = await import('../scripts/clarify_block.mjs');

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const failures = [];
const check = (name, cond, detail = '') => { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); };

const MISSION_RU = [
  '# b.x — mission', '',
  'Блок делает X для Y.', '',
  '## Во что это вырастет', '',
  'Через полгода это станет общим сервисом для трёх продуктов.',
  'Поэтому формат ответа должен быть версионирован уже сейчас.', '',
  '## Layer', 'logic', '',
].join('\n');

// ── Group 1: Cyrillic headings are found (the `\b` regression) ─────────────
{
  const t = readTrajectory(MISSION_RU);
  check('g1: russian heading found', t.text !== null, JSON.stringify(t.heading));
  check('g1: body captured', (t.text || '').includes('общим сервисом'), t.text);
  for (const h of TRAJECTORY_HEADINGS) {
    const cap = h[0].toUpperCase() + h.slice(1);
    const r = readTrajectory(`# m\n\n## ${cap}\n\nнаправление\n`);
    check(`g1: heading «${cap}» recognised`, r.text === 'направление', JSON.stringify(r));
  }
  // A heading that merely STARTS with an accepted word is not a match.
  const near = readTrajectory('# m\n\n## Траекторианство как философия\n\nтекст\n');
  check('g1: word-prefix is not a heading match', near.text === null, JSON.stringify(near));
}

// ── Group 2: section boundaries ─────────────────────────────────────────────
{
  const t = readTrajectory(MISSION_RU);
  check('g2: trajectory removed from the mission body', !t.missionWithout.includes('Во что это вырастет'));
  check('g2: trajectory text removed from the mission body', !t.missionWithout.includes('общим сервисом'));
  check('g2: following section survives', t.missionWithout.includes('## Layer'));
  check('g2: preceding text survives', t.missionWithout.includes('Блок делает X для Y.'));

  const nested = readTrajectory('# m\n\n## Trajectory\n\ntop\n\n### detail\n\ninner\n\n## Next\n\nafter\n');
  check('g2: a deeper subheading stays inside the section', (nested.text || '').includes('inner'), nested.text);
  check('g2: the next same-level heading ends it', !(nested.text || '').includes('after'), nested.text);

  const suffixed = readTrajectory('# m\n\n## Trajectory (куда растёт)\n\ngrows\n');
  check('g2: heading with a parenthetical suffix', suffixed.text === 'grows', JSON.stringify(suffixed));
}

// ── Group 3: absence and emptiness are different states ────────────────────
{
  const none = readTrajectory('# m\n\nno trajectory here\n\n## Layer\nx\n');
  check('g3: no heading → text null', none.text === null && none.empty === false, JSON.stringify(none));
  check('g3: no heading → mission untouched', none.missionWithout === '# m\n\nno trajectory here\n\n## Layer\nx\n');

  const empty = readTrajectory('# m\n\n## Во что это вырастет\n\n## Layer\nx\n');
  check('g3: empty heading → empty true', empty.empty === true && empty.text === null, JSON.stringify(empty));
}

// ── Group 4: the prompt lines say how to use it, in all three states ───────
{
  const present = trajectoryPromptLines(readTrajectory(MISSION_RU)).join('\n');
  check('g4: present — carries the text', present.includes('общим сервисом'));
  check('g4: present — says it is not built now', /NOT something to build now/.test(present));
  check('g4: present — says it chooses between green variants', /choose BETWEEN/.test(present));

  const absent = trajectoryPromptLines(readTrajectory('# m\n\nx\n')).join('\n');
  check('g4: absent — says so', /No trajectory is declared/.test(absent));
  check('g4: absent — the choice must be recorded as an assumption', /Assumed without asking/.test(absent));

  const emptyL = trajectoryPromptLines(readTrajectory('# m\n\n## Trajectory\n\n## L\n')).join('\n');
  check('g4: empty heading — named as nothing under it', /nothing under it/.test(emptyL));

  const step0 = understandingPromptLines('atlas/blocks/b.x').join('\n');
  check('g4: step 0 names the target path', step0.includes('atlas/blocks/b.x/understanding.md'));
  check('g4: step 0 demands it before code', /BEFORE writing any code/.test(step0));
  for (const s of UNDERSTANDING_SECTIONS) check(`g4: step 0 lists «${s.heading}»`, step0.includes(`## ${s.heading}`));
}

// ── Group 5: parsing a declaration ─────────────────────────────────────────
{
  const full = UNDERSTANDING_SECTIONS.map((s) => `## ${s.heading}\n\ncontent for ${s.key}\n`).join('\n');
  const ok = parseUnderstanding(`# b.x — understanding\n\n${full}`);
  check('g5: complete declaration', ok.complete === true, JSON.stringify({ m: ok.missing, e: ok.empty }));
  check('g5: treating_as extracted', ok.sections.treating_as === 'content for treating_as', ok.sections.treating_as);

  const missing = parseUnderstanding('## Treating this as\n\nA CRUD resource\n\n## In scope\n\nx\n');
  check('g5: missing sections reported', missing.missing.includes('Variant chosen') && !missing.complete, JSON.stringify(missing.missing));

  const hollow = parseUnderstanding(UNDERSTANDING_SECTIONS.map((s) => `## ${s.heading}\n`).join('\n'));
  check('g5: headings without content are empty, not complete', hollow.empty.length === UNDERSTANDING_SECTIONS.length && !hollow.complete,
    JSON.stringify(hollow.empty));
}

// ── Group 6: staleness — contract changed after the declaration ────────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-meaning-'));
  const dir = path.join(tmp, 'blocks', 'b.s');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'mission.md'), '# m\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'understanding.md'), '## Treating this as\n\nx\n', 'utf8');
  const old = Date.now() / 1000 - 3600;
  fs.utimesSync(path.join(dir, 'mission.md'), old, old);
  check('g6: contract older than declaration → fresh', understandingStaleness('b.s', tmp).stale === false);

  const later = Date.now() / 1000 + 5;
  fs.utimesSync(path.join(dir, 'mission.md'), later, later);
  const st = understandingStaleness('b.s', tmp);
  check('g6: contract newer than declaration → stale', st.stale === true && st.newer.includes('mission.md'), JSON.stringify(st));

  check('g6: no declaration → not stale, just absent', understandingStaleness('b.none', tmp).stale === false);
  check('g6: readUnderstanding reports absence', readUnderstanding('b.none', tmp).exists === false);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// Group 7 (the real two-phase run) moved to tests/frame_gate_flow.selftest.mjs.

// ── Group 8: the clarifier never fabricates a frame ────────────────────────
{
  check('g8: empty frame normalises to null', normalizeFrame({ treating_as: '  ' }) === null);
  check('g8: missing frame normalises to null', normalizeFrame(undefined) === null);
  const f = normalizeFrame({ treating_as: 'a CRUD resource', reasoning: 'A1 lists create/read' });
  check('g8: real frame kept', f?.treating_as === 'a CRUD resource' && f?.reasoning === 'A1 lists create/read');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-frame-'));
  const d = path.join(tmp, 'blocks', 'b.f');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'mission.md'), MISSION_RU, 'utf8');
  fs.writeFileSync(path.join(d, 'acceptance.md'), '# a\n\n- [ ] A1 thing\n', 'utf8');
  fs.writeFileSync(path.join(tmp, 'graph.json'), JSON.stringify({ blocks: [{ id: 'b.f', depends_on: [] }] }), 'utf8');
  const r = await clarifyBlock({ block_id: 'b.f', atlas_root: tmp });
  check('g8: under mock there is no frame, not a plausible one', r.operative_frame === null, JSON.stringify(r.operative_frame));
  check('g8: …and the verdict stays inconclusive', r.verdict === 'inconclusive', r.verdict);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── Group 9: one reader for every consumer ─────────────────────────────────
// T24 puts the agent's frame on the canvas. The canvas must not parse these
// files itself: two parsers of one meaning drift apart (the R-8.06 lesson with
// the two graph copies). So the nightly report is built from
// blockMeaningSummary (checked here), and the canvas API returns it verbatim
// (checked in tests/frame_gate_flow.selftest.mjs, next to the server it
// belongs to).
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-meaning-api-'));
  const atlas = path.join(tmp, 'atlas');
  const mk = (id, files) => {
    const d = path.join(atlas, 'blocks', id);
    fs.mkdirSync(d, { recursive: true });
    for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(d, name), body, 'utf8');
    return d;
  };
  const full = UNDERSTANDING_SECTIONS.map((s) => `## ${s.heading}\n\n- ${s.key} text\n`).join('\n');
  mk('b.full', { 'mission.md': MISSION_RU, 'understanding.md': `# u\n\n${full}` });
  const staleDir = mk('b.stale', { 'mission.md': '# m\n\n## Trajectory\n\n', 'understanding.md': '## Treating this as\n\na cache\n' });
  mk('b.bare', { 'mission.md': '# m\n\nПросто блок.\n' });
  const old = Date.now() / 1000 - 3600;
  fs.utimesSync(path.join(staleDir, 'understanding.md'), old, old);
  fs.writeFileSync(path.join(atlas, 'graph.json'), JSON.stringify({ blocks: [
    { id: 'b.full', status: 'wip' }, { id: 'b.stale', status: 'wip' }, { id: 'b.bare', status: 'wip' },
  ] }), 'utf8');

  const { blockMeaningSummary } = await import('../scripts/block_meaning.mjs');
  const sf = blockMeaningSummary('b.full', atlas);
  check('g9: summary — trajectory declared', sf.trajectory.declared === true && sf.trajectory.text.includes('общим сервисом'));
  check('g9: summary — frame extracted', sf.understanding.exists && sf.understanding.complete && sf.understanding.sections.treating_as === '- treating_as text',
    JSON.stringify(sf.understanding.sections?.treating_as));
  check('g9: summary — no warnings on a clean block', sf.warnings.length === 0, JSON.stringify(sf.warnings));
  const ss = blockMeaningSummary('b.stale', atlas);
  check('g9: summary — empty trajectory heading is not «declared»', ss.trajectory.declared === false && ss.trajectory.empty === true);
  check('g9: summary — stale + incomplete + empty-heading all warned', ss.stale.stale && ss.warnings.length === 3, JSON.stringify(ss.warnings));
  const sb = blockMeaningSummary('b.bare', atlas);
  check('g9: summary — absent declaration, absent trajectory, no warning', !sb.understanding.exists && !sb.trajectory.declared && sb.warnings.length === 0);

  // The report reads the same summary.
  const rep = spawnSync('node', [path.join(ROOT, 'scripts', 'validate_meaning.mjs'), '--json'],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ATLAS_ROOT: atlas } });
  let rows = [];
  try { rows = JSON.parse(rep.stdout).rows; } catch { /* checked below */ }
  const row = (id) => rows.find((r) => r.block_id === id) || {};
  check('g9: report exits 0 even with warnings (a report, not a gate)', rep.status === 0, `status=${rep.status} ${rep.stderr.slice(0, 200)}`);
  check('g9: report agrees with the summary on warnings', JSON.stringify(row('b.stale').warnings) === JSON.stringify(ss.warnings));
  check('g9: report agrees on the frame', row('b.full').treating_as === '- treating_as text', row('b.full').treating_as);

  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── Group 10: the gate as a state machine (library level) ──────────────────
{
  const { frameGate, recordDeclared, recordFrameReview, contractFingerprint, normalizeContractText, FRAME_REVIEWS_FILE } =
    await import('../scripts/block_meaning.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-gate-'));
  const d = path.join(tmp, 'blocks', 'b.g');
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'mission.md'), '# m\n\nA block.\n', 'utf8');
  fs.writeFileSync(path.join(d, 'acceptance.md'), '# a\n\n- [ ] **A1.** x\n', 'utf8');
  const decl = (frame) => UNDERSTANDING_SECTIONS.map((s) => `## ${s.heading}\n\n${s.key === 'treating_as' ? frame : '- x'}\n`).join('\n');
  const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(String(e.message)); } };

  check('g10: nothing declared → none/declare', frameGate('b.g', tmp).state === 'none' && frameGate('b.g', tmp).next === 'declare');
  check('g10: cannot review a declaration that does not exist', throws(() => recordFrameReview({ block_id: 'b.g', atlas_root: tmp, verdict: 'confirmed' }), /not declared/));

  const old = Date.now() / 1000 - 3600;
  fs.utimesSync(path.join(d, 'mission.md'), old, old);
  fs.utimesSync(path.join(d, 'acceptance.md'), old, old);
  fs.writeFileSync(path.join(d, 'understanding.md'), decl('a queue'), 'utf8');
  let g = frameGate('b.g', tmp);
  check('g10: declared, no record yet → awaiting/wait (mtime basis)', g.state === 'awaiting' && g.next === 'wait' && g.stale_basis === 'mtime', JSON.stringify(g));

  g = recordDeclared({ block_id: 'b.g', atlas_root: tmp, run_id: 'r1', agent: 'codex' });
  check('g10: declared by a run → still awaiting, now fingerprint-based', g.state === 'awaiting' && g.stale_basis === 'fingerprint');
  check('g10: the declaring agent is remembered', g.last_declared_agent === 'codex');

  check('g10: unknown verdict refused', throws(() => recordFrameReview({ block_id: 'b.g', atlas_root: tmp, verdict: 'ok' }), /verdict must be/));
  check('g10: a correction without text refused', throws(() => recordFrameReview({ block_id: 'b.g', atlas_root: tmp, verdict: 'corrected', correction: '  ' }), /needs text/));

  g = recordFrameReview({ block_id: 'b.g', atlas_root: tmp, verdict: 'confirmed' });
  check('g10: confirmed → implement', g.state === 'confirmed' && g.next === 'implement' && g.confirmations === 1);

  fs.writeFileSync(path.join(d, 'acceptance.md'), '# a\n\n- [x] **A1.** x  \n', 'utf8');
  check('g10: checkbox + trailing spaces are not a contract change', frameGate('b.g', tmp).state === 'confirmed');
  check('g10: normalizeContractText unticks and trims', normalizeContractText('- [X] a  \r\n') === '- [ ] a');

  fs.writeFileSync(path.join(d, 'mission.md'), '# m\n\nA different block.\n', 'utf8');
  g = frameGate('b.g', tmp);
  check('g10: mission edited after confirmation → stale/declare, names the file', g.state === 'stale' && g.next === 'declare' && g.changed.includes('mission.md') && /confirmation/.test(g.reason), JSON.stringify(g));
  check('g10: a stale frame cannot be confirmed', throws(() => recordFrameReview({ block_id: 'b.g', atlas_root: tmp, verdict: 'confirmed' }), /older contract/));

  fs.writeFileSync(path.join(d, 'understanding.md'), decl('a job queue with retries'), 'utf8');
  recordDeclared({ block_id: 'b.g', atlas_root: tmp, agent: 'claude' });
  g = recordFrameReview({ block_id: 'b.g', atlas_root: tmp, verdict: 'corrected', correction: 'No — the UI only reads it.' });
  check('g10: corrected → declare, with the correction and the frame it corrects', g.state === 'corrected' && g.next === 'declare'
    && g.correction === 'No — the UI only reads it.' && g.previous_frame === 'a job queue with retries' && g.corrections === 1, JSON.stringify(g));

  fs.writeFileSync(path.join(d, 'understanding.md'), decl('a read model over the queue'), 'utf8');
  recordDeclared({ block_id: 'b.g', atlas_root: tmp, agent: 'claude' });
  check('g10: re-declared after the correction → awaiting again', frameGate('b.g', tmp).state === 'awaiting');

  fs.appendFileSync(path.join(d, FRAME_REVIEWS_FILE), '{"event":"confirmed", torn\n', 'utf8');
  check('g10: a torn journal line never counts as a confirmation', frameGate('b.g', tmp).state === 'awaiting');

  fs.writeFileSync(path.join(d, 'understanding.md'), UNDERSTANDING_SECTIONS.map((s) => `## ${s.heading}\n`).join('\n'), 'utf8');
  check('g10: an empty «Treating this as» cannot be confirmed', throws(() => recordFrameReview({ block_id: 'b.g', atlas_root: tmp, verdict: 'confirmed' }), /no frame to agree to/));

  const f1 = contractFingerprint('b.g', tmp);
  check('g10: fingerprint lists each contract file', Object.keys(f1.files).join(',') === 'mission.md,acceptance.md,kpi.md,user_story.md' && f1.files['kpi.md'] === null);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── Group 11: language of the declaration + the phase prompt lines ─────────
{
  const { operatorLanguage, declarePhasePromptLines, implementPhasePromptLines } = await import('../scripts/block_meaning.mjs');
  check('g11: a Russian mission → Russian', operatorLanguage(MISSION_RU, {}) === 'Russian');
  check('g11: an English mission → English', operatorLanguage('# m\n\nThis block exports reports as CSV files for the finance team.', {}) === 'English');
  check('g11: too little text → no guess', operatorLanguage('# m\n\nok', {}) === null);
  check('g11: ATLAS_OPERATOR_LANG overrides detection', operatorLanguage(MISSION_RU, { ATLAS_OPERATOR_LANG: 'Kazakh' }) === 'Kazakh');

  const plain = declarePhasePromptLines('atlas/blocks/b.x', { language: 'Russian' }).join('\n');
  check('g11: declare lines — no code in this run', /Do NOT write or change any code/.test(plain));
  check('g11: declare lines — language named', plain.includes('in Russian'));
  check('g11: declare lines — no correction section when none', !plain.includes('corrected your previous declaration'));
  const corr = declarePhasePromptLines('atlas/blocks/b.x', { correction: 'line one\nline two', previousFrame: 'a CRUD\n resource' }).join('\n');
  check('g11: correction quoted line by line', corr.includes('> line one\n> line two'));
  check('g11: previous frame flattened to one line', corr.includes('You previously treated this block as: a CRUD resource'));

  const impl = implementPhasePromptLines('atlas/blocks/b.x', { understandingText: '# b.x — understanding\n\n## Treating this as\n\na queue\n', confirmedAt: '2026-09-22T10:00:00Z' }).join('\n');
  check('g11: implement lines — confirmation date, frame without its H1', impl.includes('on 2026-09-22') && impl.includes('## Treating this as') && !impl.includes('# b.x — understanding'));
}

// ── Group 12: writing the trajectory (the canvas «Set the trajectory») ─────
{
  const { setTrajectory } = await import('../scripts/block_meaning.mjs');
  const base = '# b.x — mission\n\nБлок.\n\n## Layer\nlogic\n';
  const a = setTrajectory(base, 'Станет общим сервисом.');
  const ta = readTrajectory(a);
  check('g12: inserted section reads back exactly', ta.text === 'Станет общим сервисом.' && ta.heading === 'Во что это вырастет', JSON.stringify(ta));
  check('g12: inserted before «## Layer», Layer kept', a.indexOf('## Во что это вырастет') < a.indexOf('## Layer') && ta.missionWithout.includes('## Layer\nlogic'));
  const b = setTrajectory(a, 'Другое направление.');
  check('g12: an existing section is replaced, not duplicated', readTrajectory(b).text === 'Другое направление.' && (b.match(/Во что это вырастет/g) || []).length === 1);
  const eng = setTrajectory('# m\n\nx\n\n## Trajectory\n\nold\n\n## Layer\nai\n', 'new');
  check('g12: an English heading keeps its own heading', eng.includes('## Trajectory\n\nnew') && !eng.includes('Во что'));
  const h = setTrajectory(base, 'Первое.\n## Вложенный заголовок\nВторое.');
  check('g12: a heading inside the body cannot cut the section short', readTrajectory(h).text === 'Первое.\n**Вложенный заголовок**\nВторое.', JSON.stringify(readTrajectory(h).text));
  const c = setTrajectory(b, '   ');
  check('g12: empty text removes the section', readTrajectory(c).text === null && !c.includes('Во что это вырастет') && c.includes('## Layer'));
  check('g12: empty text on a mission without a section changes nothing', setTrajectory(base, '') === base);
  check('g12: a mission without «## Layer» gets it appended', readTrajectory(setTrajectory('# m\n\nx\n', 'y')).text === 'y');
}

if (failures.length) {
  console.error('block_meaning.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('block_meaning.selftest: OK (11 groups, all assertions green)');

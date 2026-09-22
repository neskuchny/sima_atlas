#!/usr/bin/env node
// R-8.08 (b.clarify) — selftest for trajectory + declared understanding.
//
// Group 1 is the bug found on the first real contract: the trajectory heading
// regex used `\b`, which JavaScript defines over [A-Za-z0-9_] only, so every
// Russian heading («## Во что это вырастет») was silently invisible while the
// English ones worked. A test written only in English would have passed.
//
// Group 7 runs the real run_block_implementation.mjs in print-only mode on a
// disposable client atlas (the multi-tenant test convention) and inspects the
// prompt the agent would actually receive.

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

// ── Group 7: the real agent prompt, end to end ─────────────────────────────
{
  const client = `selftest-meaning-${process.pid}`;
  const cdir = path.join(ROOT, 'atlas', 'clients', client);
  const seed = (id, mission) => {
    const d = path.join(cdir, 'blocks', id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'mission.md'), mission, 'utf8');
    fs.writeFileSync(path.join(d, 'acceptance.md'), '# a\n\n- [ ] **A1.** thing\n', 'utf8');
    fs.writeFileSync(path.join(d, 'tasks.md'), '# t\n\n- [ ] T1. do\n', 'utf8');
    fs.writeFileSync(path.join(d, 'kpi.md'), '# k\n', 'utf8');
    fs.writeFileSync(path.join(d, 'files.md'), '# f\n', 'utf8');
    fs.writeFileSync(path.join(d, 'checks.log'), '', 'utf8');
  };
  try {
    fs.mkdirSync(cdir, { recursive: true });
    fs.writeFileSync(path.join(cdir, 'graph.json'), JSON.stringify({
      layers: [], blocks: [
        { id: 'b.with', title: 'with', status: 'wip', layer: 'logic', depends_on: [] },
        { id: 'b.without', title: 'without', status: 'wip', layer: 'logic', depends_on: [] },
      ],
    }, null, 2), 'utf8');
    seed('b.with', MISSION_RU);
    seed('b.without', '# b.without — mission\n\nПросто блок.\n');

    const promptFor = (id) => {
      const r = spawnSync('node', [path.join(ROOT, 'scripts', 'run_block_implementation.mjs'), `--client=${client}`, id],
        { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ATLAS_AGENT: 'print-only' } });
      const inv = path.join(cdir, 'agent_invocations');
      const f = fs.existsSync(inv) ? fs.readdirSync(inv).filter((x) => x.includes(id)).sort().pop() : null;
      return { status: r.status, text: f ? fs.readFileSync(path.join(inv, f), 'utf8') : '', stderr: r.stderr };
    };

    const w = promptFor('b.with');
    check('g7: print-only run succeeds', w.status === 0, `status=${w.status} ${w.stderr.slice(0, 300)}`);
    check('g7: prompt has the trajectory section', w.text.includes('## Where this is heading (trajectory)'));
    check('g7: prompt carries the trajectory text', w.text.includes('общим сервисом'));
    const occurrences = (w.text.match(/общим сервисом/g) || []).length;
    check('g7: trajectory text sent exactly once, not also inside Mission', occurrences === 1, `occurrences=${occurrences}`);
    check('g7: prompt has Step 0', w.text.includes('## Step 0 — declare how you understand this block'));
    check('g7: Step 0 points at this block', w.text.includes(`atlas/clients/${client}/blocks/b.with/understanding.md`));
    const iStep0 = w.text.indexOf('## Step 0');
    const iRight = w.text.indexOf('## How much to build');
    check('g7: Step 0 comes before the build instructions', iStep0 > 0 && iRight > iStep0, `step0=${iStep0} right=${iRight}`);

    const wo = promptFor('b.without');
    check('g7: block without trajectory still gets the section', wo.text.includes('## Where this is heading (trajectory)'));
    check('g7: …telling the agent none is declared', wo.text.includes('No trajectory is declared'));
  } finally {
    fs.rmSync(cdir, { recursive: true, force: true });
  }
}

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

// ── Group 9: one reader, three consumers (library, report, canvas API) ─────
// T24 puts the agent's frame on the canvas. The canvas must not parse these
// files itself: two parsers of one meaning drift apart (the R-8.06 lesson with
// the two graph copies). So the API returns blockMeaningSummary verbatim, the
// nightly report is built from it too, and this group holds all three to the
// same answer on one synthetic atlas.
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

  // The canvas reads the same summary through the API.
  const { spawn } = await import('node:child_process');
  const http = await import('node:http');
  const port = 55000 + Math.floor(Math.random() * 4000);
  const server = spawn('node', ['scripts/atlas_api_server.mjs'], {
    cwd: ROOT, stdio: 'pipe',
    env: { ...process.env, ATLAS_ROOT: atlas, ATLAS_API_PORT: String(port), PORT: String(port) },
  });
  let serverErr = '';
  server.stderr.on('data', (d) => { serverErr += String(d); });
  const get = (url) => new Promise((resolve, reject) => {
    const r = http.request({ host: '127.0.0.1', port, path: url, method: 'GET', timeout: 3000 }, (res) => {
      let buf = ''; res.setEncoding('utf8');
      res.on('data', (c) => { buf += c; });
      res.on('end', () => { try { resolve(JSON.parse(buf)); } catch { resolve({ raw: buf }); } });
    });
    r.on('error', reject);
    r.end();
  });
  const waitUp = async () => {
    const t0 = Date.now();
    for (;;) {
      try { await get('/atlas/state'); return; } catch {
        if (Date.now() - t0 > 8000) throw new Error(`server did not start: ${serverErr.slice(0, 300)}`);
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  };
  try {
    await waitUp();
    const a = await get('/atlas/blocks/b.full/meaning');
    check('g9: API ok', a.ok === true, JSON.stringify(a).slice(0, 200));
    const { ok: _ok, ...apiBody } = a;
    check('g9: API returns the summary verbatim — no second parser', JSON.stringify(apiBody) === JSON.stringify(sf));
    const st = await get('/atlas/blocks/b.stale/meaning');
    check('g9: API carries the staleness the canvas warns about', st.stale?.stale === true && (st.stale.newer || []).includes('mission.md'));
    const nf = await get('/atlas/blocks/b.nope/meaning');
    check('g9: unknown block → not_found, not an empty «all clear»', nf.ok === false && nf.error === 'not_found', JSON.stringify(nf));
    const bad = await get('/atlas/blocks/b.full/meaning?client=..');
    check('g9: client path traversal refused', bad.ok === false && bad.error === 'invalid client', JSON.stringify(bad));
  } catch (e) {
    check('g9: API reachable', false, String(e.message || e));
  } finally {
    server.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (failures.length) {
  console.error('block_meaning.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('block_meaning.selftest: OK (9 groups, all assertions green)');

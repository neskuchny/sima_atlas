#!/usr/bin/env node
// R-8.09 (b.agent-orchestrator) — how the orchestrator uses b.clarify's frame
// gate: an agent declares its understanding and stops; code is written only
// after the operator confirms that frame.
//
// F1 runs the real run_block_implementation.mjs (print-only) on a disposable
//    client and walks one block through every gate state, inspecting the
//    prompt the agent would actually receive in each; plus startRunAsync,
//    which must not spawn anything while a frame waits.
// F2 holds the canvas routes to the library: GET meaning = blockMeaningSummary
//    verbatim; POST frame-review refuses empty corrections, stale confirmations
//    and unknown blocks; POST trajectory writes mission.md through the block
//    writer with an etag; /atlas/state?client= hashes the client's atlas.
// F3 runs the real autonomous loop: a declare-only run must be reported as
//    awaiting-frame — never verified, promoted, or counted as a failure. (With
//    that parse removed, the loop promoted a block wip → review after a run
//    that wrote no code — found by a mutation test.)
//
// The gate itself (states, fingerprints, prompts) is b.clarify's and is tested
// in tests/block_meaning.selftest.mjs.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  UNDERSTANDING_SECTIONS, blockMeaningSummary, recordFrameReview, frameGate,
} from '../scripts/block_meaning.mjs';
import { startRunAsync } from '../scripts/atlas_runs_api.mjs';

process.env.ATLAS_FORCE_MOCK_LLM = '1';

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

// ── Group F1: the real two-phase run, end to end ───────────────────────────
// Runs the real run_block_implementation.mjs (print-only) on a disposable
// client and walks one block through every gate state: declare → awaiting →
// refused implement → confirmed → implement → contract change → re-declare →
// corrected → re-declare with the correction. Plus the explicit skip.
{
  const client = `selftest-meaning-${process.pid}`;
  const cdir = path.join(ROOT, 'atlas', 'clients', client);
  const bdir = (id) => path.join(cdir, 'blocks', id);
  const seed = (id, mission) => {
    const d = bdir(id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'mission.md'), mission, 'utf8');
    fs.writeFileSync(path.join(d, 'acceptance.md'), '# a\n\n- [ ] **A1.** thing\n', 'utf8');
    fs.writeFileSync(path.join(d, 'tasks.md'), '# t\n\n- [ ] T1. do\n', 'utf8');
    fs.writeFileSync(path.join(d, 'kpi.md'), '# k\n', 'utf8');
    fs.writeFileSync(path.join(d, 'files.md'), '# f\n', 'utf8');
    fs.writeFileSync(path.join(d, 'checks.log'), '', 'utf8');
  };
  const DECL = (frame) => UNDERSTANDING_SECTIONS.map((s) => `## ${s.heading}\n\n${s.key === 'treating_as' ? frame : `- ${s.key}`}\n`).join('\n');
  const invDir = path.join(cdir, 'agent_invocations');
  const invCount = () => (fs.existsSync(invDir) ? fs.readdirSync(invDir).length : 0);
  const run = (id, extra = []) => {
    const before = new Set(fs.existsSync(invDir) ? fs.readdirSync(invDir) : []);
    const r = spawnSync('node', [path.join(ROOT, 'scripts', 'run_block_implementation.mjs'), `--client=${client}`, ...extra, id],
      { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ATLAS_AGENT: 'print-only', ATLAS_RUN_PHASE: '', ATLAS_FRAME_REVIEW: '', ATLAS_OPERATOR_LANG: '' } });
    const fresh = (fs.existsSync(invDir) ? fs.readdirSync(invDir) : []).filter((f) => !before.has(f) && f.includes(id));
    const file = fresh.sort().pop() || null;
    const phase = ((r.stdout || '').match(/^frame_gate: phase=(\w+) state=(\w+)/m) || []);
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', file, text: file ? fs.readFileSync(path.join(invDir, file), 'utf8') : '', phase: phase[1], state: phase[2] };
  };
  const checksOf = (id) => fs.readFileSync(path.join(bdir(id), 'checks.log'), 'utf8');
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

    // 1. no declaration → declare phase
    const d1 = run('b.with');
    check('f1: fresh block → declare phase', d1.status === 0 && d1.phase === 'declare' && d1.state === 'none', `${d1.status} ${d1.phase}/${d1.state} ${d1.stderr.slice(0, 200)}`);
    check('f1: declare prompt saved under a __declare name', /__b\.with__declare\.txt$/.test(d1.file || ''), d1.file);
    check('f1: declare prompt says «declare, then STOP»', d1.text.includes('## Your task in this run — declare how you understand this block, then STOP'));
    check('f1: declare prompt allows exactly one file', d1.text.includes(`The ONLY file you may write is \`atlas/clients/${client}/blocks/b.with/understanding.md\``));
    check('f1: declare prompt asks for the mission language (Russian here)', d1.text.includes('in Russian'));
    check('f1: declare prompt has no progress/memory-writing instructions', !d1.text.includes('## How to report progress') && !d1.text.includes('## How to update memory'));
    check('f1: declare prompt has no single-run Step 0', !d1.text.includes('## Step 0'));
    const occurrences = (d1.text.match(/общим сервисом/g) || []).length;
    check('f1: trajectory text sent exactly once, not also inside Mission', occurrences === 1, `occurrences=${occurrences}`);

    // 2. declared, unanswered → the agent is not started
    fs.writeFileSync(path.join(bdir('b.with'), 'understanding.md'), `# u\n\n${DECL('Стандартный CRUD-ресурс')}`, 'utf8');
    const n2 = invCount();
    const a2 = run('b.with');
    check('f1: waiting declaration → agent not started (awaiting, exit 0)', a2.status === 0 && a2.phase === 'awaiting', `${a2.status} ${a2.phase}`);
    check('f1: …and no prompt was even written', invCount() === n2);
    check('f1: …and checks.log says why', /frame_gate\tskipped\tagent not started/.test(checksOf('b.with')));

    // 3. explicit implement without a confirmation is refused
    const r3 = run('b.with', ['--phase=implement']);
    check('f1: --phase=implement without confirmation → refused, exit 3', r3.status === 3 && r3.phase === 'refused', `${r3.status} ${r3.phase}`);

    // 4. the operator confirms → implement phase with the frame as data
    recordFrameReview({ block_id: 'b.with', atlas_root: cdir, verdict: 'confirmed' });
    const i4 = run('b.with');
    check('f1: confirmed → implement phase', i4.status === 0 && i4.phase === 'implement' && i4.state === 'confirmed', `${i4.status} ${i4.phase}/${i4.state}`);
    check('f1: implement prompt carries the confirmed frame', i4.text.includes('## Confirmed understanding') && i4.text.includes('Стандартный CRUD-ресурс'));
    check('f1: implement prompt forbids rewriting it', i4.text.includes('Do NOT rewrite `atlas/clients/'));
    check('f1: implement prompt keeps the build + report instructions', i4.text.includes('## How much to build') && i4.text.includes('## How to report progress'));
    check('f1: implement prompt does not ask to declare again', !i4.text.includes('## Your task in this run') && !i4.text.includes('## Step 0'));
    check('f1: implement-phase trajectory records choices in narrative.md', i4.text.includes('explain it in narrative.md'));

    // 5. ticking a checkbox is not a contract change; editing the text is
    const accP = path.join(bdir('b.with'), 'acceptance.md');
    fs.writeFileSync(accP, '# a\n\n- [x] **A1.** thing   \n', 'utf8');
    check('f1: a ticked checkbox keeps the confirmation', frameGate('b.with', cdir).state === 'confirmed', frameGate('b.with', cdir).state);
    fs.writeFileSync(accP, '# a\n\n- [ ] **A1.** another thing\n', 'utf8');
    const s5 = run('b.with');
    check('f1: contract changed after confirmation → re-declare', s5.phase === 'declare' && s5.state === 'stale', `${s5.phase}/${s5.state}`);
    check('f1: …and the re-declare prompt says what changed, unit by unit (R-8.12)',
      s5.text.includes('What changed in the contract since your previous declaration was confirmed by the operator')
      && /acceptance\.md MODIFIED «A1»/.test(s5.text) && s5.text.includes('another thing'), s5.text.slice(0, 200));

    // 6. a fresh declaration, corrected by the operator → re-declare with it
    fs.writeFileSync(path.join(bdir('b.with'), 'understanding.md'), `# u\n\n${DECL('Фоновая задача с повторами')}`, 'utf8');
    recordFrameReview({ block_id: 'b.with', atlas_root: cdir, verdict: 'corrected', correction: 'Нет: это очередь, интерфейс только читает из неё.' });
    const c6 = run('b.with');
    check('f1: corrected → re-declare', c6.phase === 'declare' && c6.state === 'corrected', `${c6.phase}/${c6.state}`);
    check('f1: the correction reaches the agent verbatim', c6.text.includes('> Нет: это очередь, интерфейс только читает из неё.'));
    check('f1: …with the frame it corrects', c6.text.includes('You previously treated this block as: Фоновая задача с повторами'));

    // 7. explicit skip: the pre-R-8.09 single run, logged
    const k7 = run('b.without', ['--frame-review=skip']);
    check('f1: --frame-review=skip → full single run', k7.status === 0 && k7.phase === 'full', `${k7.status} ${k7.phase}`);
    check('f1: …Step 0 comes before the build instructions', (() => { const a = k7.text.indexOf('## Step 0'); const b = k7.text.indexOf('## How much to build'); return a > 0 && b > a; })());
    check('f1: …no trajectory → says so', k7.text.includes('No trajectory is declared'));
    check('f1: …the skip is written to checks.log', /frame_gate\tskipped\tframe review skipped/.test(checksOf('b.without')));

    // 8. the UI's /runs/start does not even spawn a child while a frame waits
    fs.writeFileSync(path.join(bdir('b.without'), 'understanding.md'), `# u\n\n${DECL('Чистая функция')}`, 'utf8');
    const st = startRunAsync({ block_id: 'b.without', client_id: client, agent: 'print-only' });
    check('f1: startRunAsync on an awaiting frame → started:false, no child', st.ok === true && st.started === false && st.frame_gate?.state === 'awaiting', JSON.stringify(st));
  } finally {
    fs.rmSync(cdir, { recursive: true, force: true });
  }
}

// ── Group F2: the canvas routes serve the library's answer ─────────────────
// GET /atlas/blocks/<id>/meaning must return blockMeaningSummary verbatim (no
// second parser), and POST /atlas/frame-review must refuse what would make a
// confirmation meaningless.
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
  const old = Date.now() / 1000 - 3600;
  fs.utimesSync(path.join(staleDir, 'understanding.md'), old, old);
  fs.writeFileSync(path.join(atlas, 'graph.json'), JSON.stringify({ blocks: [
    { id: 'b.full', status: 'wip' }, { id: 'b.stale', status: 'wip' },
  ] }), 'utf8');
  const sf = blockMeaningSummary('b.full', atlas);

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
    check('f2: API ok', a.ok === true, JSON.stringify(a).slice(0, 200));
    const { ok: _ok, ...apiBody } = a;
    check('f2: API returns the summary verbatim — no second parser', JSON.stringify(apiBody) === JSON.stringify(sf));
    const st = await get('/atlas/blocks/b.stale/meaning');
    check('f2: API carries the staleness the canvas warns about', st.stale?.stale === true && (st.stale.newer || []).includes('mission.md'));
    const nf = await get('/atlas/blocks/b.nope/meaning');
    check('f2: unknown block → not_found, not an empty «all clear»', nf.ok === false && nf.error === 'not_found', JSON.stringify(nf));
    const bad = await get('/atlas/blocks/b.full/meaning?client=..');
    check('f2: client path traversal refused', bad.ok === false && bad.error === 'invalid client', JSON.stringify(bad));

    // R-8.09 — the operator's answer over HTTP (the canvas buttons).
    const post = (url, body) => new Promise((resolve, reject) => {
      const raw = JSON.stringify(body);
      const r = http.request({ host: '127.0.0.1', port, path: url, method: 'POST', timeout: 3000,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw) } }, (res) => {
        let buf = ''; res.setEncoding('utf8');
        res.on('data', (c) => { buf += c; });
        res.on('end', () => { try { resolve({ status: res.statusCode, ...JSON.parse(buf) }); } catch { resolve({ status: res.statusCode, raw: buf }); } });
      });
      r.on('error', reject); r.write(raw); r.end();
    });
    const emptyCorr = await post('/atlas/frame-review', { block_id: 'b.full', verdict: 'corrected', correction: '' });
    check('f2: POST correction without text → refused, nothing recorded', emptyCorr.ok === false && /needs text/.test(emptyCorr.error || ''), JSON.stringify(emptyCorr));
    const staleConf = await post('/atlas/frame-review', { block_id: 'b.stale', verdict: 'confirmed' });
    check('f2: POST confirm on a stale frame → refused', staleConf.ok === false && /older contract/.test(staleConf.error || ''), JSON.stringify(staleConf));
    const conf = await post('/atlas/frame-review', { block_id: 'b.full', verdict: 'confirmed' });
    check('f2: POST confirm → ok, returns the fresh summary with the new gate', conf.ok === true && conf.gate?.state === 'confirmed' && conf.run === null, JSON.stringify(conf).slice(0, 300));
    const after = await get('/atlas/blocks/b.full/meaning');
    check('f2: …and GET agrees afterwards', after.gate?.state === 'confirmed' && after.gate?.confirmations === 1);
    const nf2 = await post('/atlas/frame-review', { block_id: 'b.nope', verdict: 'confirmed' });
    check('f2: POST on an unknown block → 404', nf2.status === 404 && nf2.error === 'not_found', JSON.stringify(nf2));

    // R-8.10 — writing the trajectory from the canvas.
    const before = await get('/atlas/blocks/b.stale/meaning');
    const tr = await post('/atlas/blocks/trajectory', { block_id: 'b.stale', text: 'Станет общим сервисом.', if_match_mtime: before.trajectory?.mission_mtime });
    check('f2: POST trajectory → ok, the summary now carries it', tr.ok === true && tr.trajectory?.declared === true && tr.trajectory?.text === 'Станет общим сервисом.', JSON.stringify(tr).slice(0, 300));
    const onDisk = fs.readFileSync(path.join(atlas, 'blocks', 'b.stale', 'mission.md'), 'utf8');
    check('f2: …written into mission.md through the block writer (history snapshot kept)',
      onDisk.includes('## Trajectory\n\nСтанет общим сервисом.') && fs.readdirSync(path.join(atlas, 'blocks', 'b.stale', 'history')).some((f) => f.startsWith('mission.md.')));
    const conflict = await post('/atlas/blocks/trajectory', { block_id: 'b.stale', text: 'x', if_match_mtime: before.trajectory?.mission_mtime });
    check('f2: a stale etag is refused as a conflict, not silently overwritten', conflict.ok === false && conflict.conflict === true, JSON.stringify(conflict));
    const tooLong = await post('/atlas/blocks/trajectory', { block_id: 'b.stale', text: 'x'.repeat(4001) });
    check('f2: an oversized trajectory is refused', tooLong.ok === false && /4000/.test(tooLong.error || ''));

    // R-8.10 — the live-refresh hash follows the client the canvas shows.
    const client = `selftest-state-${process.pid}`;
    const cdir = path.join(ROOT, 'atlas', 'clients', client);
    try {
      fs.mkdirSync(path.join(cdir, 'blocks', 'b.c'), { recursive: true });
      fs.writeFileSync(path.join(cdir, 'graph.json'), '{"blocks":[]}');
      fs.writeFileSync(path.join(cdir, 'blocks', 'b.c', 'mission.md'), '# m\n');
      const rootH1 = (await get('/atlas/state')).hash;
      const h1 = (await get(`/atlas/state?client=${client}`)).hash;
      fs.writeFileSync(path.join(cdir, 'blocks', 'b.c', 'understanding.md'), '## Treating this as\n\nx\n');
      const h2 = (await get(`/atlas/state?client=${client}`)).hash;
      check('f2: a change in the client atlas changes the client hash', h1 && h2 && h1 !== h2, `${h1} ${h2}`);
      check('f2: …and not the root hash', (await get('/atlas/state')).hash === rootH1);
      const badC = await get('/atlas/state?client=..');
      check('f2: /atlas/state refuses a traversal client', badC.ok === false);
    } finally {
      fs.rmSync(cdir, { recursive: true, force: true });
    }
  } catch (e) {
    check('f2: API reachable', false, String(e.message || e));
  } finally {
    server.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ── Group F3: the autonomous loop waits for the operator, never «fails» ─────
{
  const client = `selftest-meaning-daemon-${process.pid}`;
  const cdir = path.join(ROOT, 'atlas', 'clients', client);
  const d = path.join(cdir, 'blocks', 'b.loop');
  try {
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(cdir, 'graph.json'), JSON.stringify({ blocks: [{ id: 'b.loop', title: 'loop', status: 'wip', layer: 'logic', depends_on: [] }] }), 'utf8');
    fs.writeFileSync(path.join(d, 'mission.md'), '# b.loop — mission\n\nExport the monthly report as a CSV file for the finance team.\n', 'utf8');
    fs.writeFileSync(path.join(d, 'acceptance.md'), '# a\n\n- [ ] **A1.** node runs.\n```yaml\nevidence_kind: exit_code\nevidence_spec:\n  cmd: node --version\n```\n', 'utf8');
    fs.writeFileSync(path.join(d, 'files.md'), '# f\n', 'utf8');
    fs.writeFileSync(path.join(d, 'checks.log'), '', 'utf8');
    // The budget is not what this test checks (agent_loop_budget.selftest
    // does); a print-only agent spends nothing, so the cap is lifted to keep
    // this test independent of any budget logic.
    const daemon = () => spawnSync('node', ['scripts/agent_loop_daemon.mjs', '--client', client, '--agent', 'print-only', '--only', 'b.loop', '--max-iterations', '1', '--max-cost-usd', '1000000', '--json'],
      { cwd: ROOT, encoding: 'utf8', timeout: 120000, env: { ...process.env, ATLAS_FRAME_REVIEW: '', ATLAS_RUN_PHASE: '' } });
    const parse = (r) => { try { return JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch { return null; } };

    const first = parse(daemon());
    const e1 = first?.iterations?.[0] || {};
    check('f3: the loop actually picked the block (not stopped by a guard)', (first?.iterations || []).length === 1, `stop_reason=${first?.stop_reason}`);
    check('f3: no frame yet → the loop runs the declare phase and reports awaiting-frame', e1.action === 'awaiting-frame' && e1.frame_gate === 'declare', JSON.stringify(e1));
    check('f3: …not counted as a failure', first?.summary?.failed === 0 && first?.summary?.awaiting_frame === 1, JSON.stringify(first?.summary));

    fs.writeFileSync(path.join(d, 'understanding.md'), UNDERSTANDING_SECTIONS.map((s) => `## ${s.heading}\n\nx\n`).join('\n'), 'utf8');
    const second = parse(daemon());
    const e2 = second?.iterations?.[0] || {};
    check('f3: declaration waiting → agent not started, still awaiting-frame', e2.action === 'awaiting-frame' && e2.frame_gate === 'awaiting', JSON.stringify(e2));
    const graph = JSON.parse(fs.readFileSync(path.join(cdir, 'graph.json'), 'utf8'));
    check('f3: the block was not promoted by a run that wrote no code', graph.blocks[0].status === 'wip', graph.blocks[0].status);
  } finally {
    fs.rmSync(cdir, { recursive: true, force: true });
  }
}

if (failures.length) {
  console.error('frame_gate_flow.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('frame_gate_flow.selftest: OK (3 groups, all assertions green)');

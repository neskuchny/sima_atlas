#!/usr/bin/env node
// R-8.14 (b.code-graph) — the code map has to tell the truth about the code,
// or the building the operator walks through is a picture of something else:
//   g1  a file is cut into parts that cover every line exactly once; small
//       private constants fold in; routes, sections, an IIFE wrapper
//   g2  stack: runtime, packages, what a file touches
//   g3  what starts a file: npm scripts, nightly steps, the canvas page, MCP
//   g4  connections that are not imports: HTTP calls and started scripts —
//       comments and module specifiers do not count, line numbers stay true
//   g5  why a file exists: library / test / command / conductor / generated /
//       orphan, and a purpose written in files.md wins over the derived one
//   g6  block links: in code and contract / contract only / code only /
//       tests only; a conductor's starts are not dependencies; runtime calls
//       declared in calls.md (R-8.15), test runs are checks
//   g7  a whole map on a disposable repo, and the file route serves only
//       files on the map
//   g8  the real atlas: every file of a live block is on the map, has a role,
//       a purpose and parts that add up

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  segmentsOf, fileStack, entryPoints, httpCalls, spawnedScripts, generatedBy,
  fileRole, filePurpose, blockLinks, buildCodeMap, readMapFile, wantLine, missionLine,
} from '../scripts/atlas_map.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const check = (name, cond, detail = '') => { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); };
const covers = (segs, n) => segs.length && segs[0].start === 1 && segs[segs.length - 1].end === n && segs.every((s, i) => i === 0 || s.start === segs[i - 1].end + 1);

// ── g1: parts of a file ────────────────────────────────────────────────────
{
  const src = [
    '#!/usr/bin/env node', '// What this file is for.', "import fs from 'node:fs';", '',
    "const A = 1;", "const B = 2;", '',
    '// ── reading ──────────', '// Reads one thing.', 'export function readOne(p) {', '  return fs.readFileSync(p);', '}', '',
    'function helper() {', '  return 1;', '}', '',
    'export const BIG = {', '  a: 1,', '  b: 2,', '  c: 3,', '};', '',
  ].join('\n');
  const r = segmentsOf(src, 'scripts/x.mjs', new Set(['readOne', 'BIG']));
  check('g1: parts cover every line once', covers(r.segments, r.lines), JSON.stringify(r.segments.map((s) => [s.name, s.start, s.end])));
  check('g1: small private constants fold into the header', r.segments[0].kind === 'head' && !r.segments.some((s) => s.name === 'A' || s.name === 'B'), JSON.stringify(r.segments.map((s) => s.name)));
  const one = r.segments.find((s) => s.name === 'readOne');
  check('g1: an exported function with the comment above it', one && one.kind === 'fn' && one.exported && one.doc === 'Reads one thing.', JSON.stringify(one));
  check('g1: a section comment becomes a divider', r.sections.length === 1 && r.sections[0].title === 'reading', JSON.stringify(r.sections));
  check('g1: the header comment is the file\'s description', r.header === 'What this file is for.', r.header);
  check('g1: a private function is a part, not exported', r.segments.find((s) => s.name === 'helper')?.exported === false);

  const server = [
    "import http from 'node:http';", 'const srv = http.createServer((req, res) => {',
    "  if (req.method === 'GET' && req.url === '/health') { return res.end('ok'); }",
    '  // The map.', "  if (req.url.startsWith('/atlas/map')) { return res.end('{}'); }",
    "  if (req.url === '/atlas/blocks/patch-file') { return res.end('{}'); }", '});',
  ].join('\n');
  const routes = segmentsOf(server, 'scripts/s.mjs').segments.filter((s) => s.kind === 'route');
  check('g1: routes inside one handler are parts, with method and prefix', routes.length === 3
    && routes[0].name === 'GET /health' && routes[0].route.prefix === false
    && routes[1].route.prefix === true && routes[1].doc === 'The map.' && routes[2].name === 'POST /atlas/blocks/patch-file', JSON.stringify(routes));

  const iife = ['(function () {', ...Array.from({ length: 160 }, (_, i) => (i % 40 === 0 ? `  function f${i}() {` : i % 40 === 39 ? '  }' : '    x();')), '})();'].join('\n');
  const inner = segmentsOf(iife, 'frontend/y.js').segments;
  check('g1: a script wrapped in one IIFE is read one level in', inner.filter((s) => s.kind === 'fn').length === 4, JSON.stringify(inner.map((s) => s.name)));

  const jsx = 'function Panel() {\n  return null;\n}\nfunction helper() {}\n';
  check('g1: a capitalised function in .jsx is a component', segmentsOf(jsx, 'frontend/a.jsx').segments[0].kind === 'component');
}

// ── g2: stack ──────────────────────────────────────────────────────────────
{
  const imp = (from) => ({ external: true, from });
  const node = fileStack('scripts/a.mjs', { imports: [imp('node:fs'), imp('node:child_process'), imp('node:path')] });
  check('g2: a Node script: runtime and what it touches', node.runtime === 'Node.js · ES-модуль' && node.abilities.join() === 'файлы,запуск процессов' && !node.packages.length, JSON.stringify(node));
  const el = fileStack('extensions/desktop/main.mjs', { imports: [imp('electron'), imp('electron-updater'), imp('node:http')] });
  check('g2: Electron main with its packages', el.runtime === 'Electron · главный процесс' && el.packages.join() === 'electron,electron-updater' && el.abilities.includes('сеть'), JSON.stringify(el));
  check('g2: a .jsx file is React built in the browser', fileStack('frontend/atlas_design/x.jsx').runtime.startsWith('React'));
  check('g2: a .js file of the frontend runs in the browser', fileStack('frontend/atlas_design/x.js').runtime === 'JavaScript в браузере');
  check('g2: scoped packages keep their scope', fileStack('tests/x.mjs', { imports: [imp('@playwright/test')] }).packages[0] === '@playwright/test');
}

// ── g3: what starts a file ─────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-map-'));
try {
  const w = (p, t) => { fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true }); fs.writeFileSync(path.join(tmp, p), t); };
  w('package.json', JSON.stringify({ scripts: { dev: 'node scripts/dev.mjs --x', 'test:ui': 'playwright test tests/playwright/a.spec.ts' } }));
  w('scripts/nightly_consolidation.mjs', "const STEPS = [\n  ['lib_selftest', 'node tests/lib.selftest.mjs'],\n  ['report', 'node scripts/report.mjs --json'],\n];\n");
  w('frontend/atlas_design/index.html', '<script src="panel.jsx?v=1"></script><script src="https://unpkg.com/react@18.3.1/umd/react.js"></script>');
  w('.mcp.json', JSON.stringify({ mcpServers: { atlas: { command: 'node', args: ['scripts/mcp.mjs'] } } }));
  const runs = entryPoints(tmp);
  const k = (p) => (runs.get(p) || []).map((r) => `${r.kind}:${r.name}`).join();
  check('g3: npm scripts', k('scripts/dev.mjs') === 'npm:dev' && k('tests/playwright/a.spec.ts') === 'npm:test:ui', JSON.stringify([...runs]));
  check('g3: nightly steps', k('tests/lib.selftest.mjs') === 'nightly:lib_selftest' && k('scripts/report.mjs') === 'nightly:report');
  check('g3: the canvas page, not the CDN', k('frontend/atlas_design/panel.jsx') === 'page:index.html' && ![...runs.keys()].some((p) => p.includes('react')));
  check('g3: the MCP config', k('scripts/mcp.mjs') === 'mcp:atlas');

  // ── g4: links that are not imports ──────────────────────────────────────
  const rts = segmentsOf("const s = (req) => {\n  if (req.url === '/atlas/state') {}\n  if (req.url.startsWith('/atlas/blocks/')) {}\n  if (req.url === '/runs/start') {}\n};\n", 'scripts/srv.mjs').segments.filter((s) => s.kind === 'route');
  const calls = httpCalls([
    '/*', ' * a long comment that mentions', " * '/runs/start' must not count", ' */',
    "fetch('/atlas/state');", "getJson('/atlas/blocks/' + id + '/meaning');", "// postJson('/runs/start')", "post('/nowhere');",
  ].join('\n'), rts);
  check('g4: API calls found, a commented one ignored, an unknown path ignored', JSON.stringify(calls.map((c) => c.route)) === '["POST /atlas/state","POST /atlas/blocks/"]', JSON.stringify(calls));
  check('g4: line numbers survive a multi-line comment', calls[0]?.line === 5 && calls[1]?.line === 6, JSON.stringify(calls));
  const sp = spawnedScripts([
    "import { a } from '../scripts/lib.mjs';",
    "spawnSync('node', ['scripts/one.mjs']);",
    "run('node scripts/two.mjs --flag');",
    "spawnSync('node', [path.join(ROOT, 'scripts', 'three.mjs')]);",
    "// spawnSync('node', ['scripts/four.mjs'])",
  ].join('\n'));
  check('g4: started scripts — not a module specifier, not a comment', JSON.stringify(sp.map((x) => x.file)) === '["scripts/one.mjs","scripts/two.mjs","scripts/three.mjs"]', JSON.stringify(sp));
  // R-8.15 — a command shown to a person, or a script read as a file, is not a start
  const shown = spawnedScripts([
    "console.error(`  fix:    node scripts/verify.mjs ${id}`);",
    "return { fixHint: `node scripts/verify.mjs ${id}` };",
    "const txt = fs.readFileSync(path.join(root, 'scripts', 'mcp.mjs'), 'utf8');",
    "const RUN = { 'verify-all': { rel: 'scripts/all.mjs', args: [] } };",
    "runScriptInBackground('scripts/wiki.mjs', [], {});",
    "const cascadeArgs = ['scripts/cascade.mjs', block.id];",
  ].join('\n'));
  check('g4: hints and file reads are not starts; launch tables and helpers are', JSON.stringify(shown.map((x) => x.file)) === '["scripts/all.mjs","scripts/wiki.mjs","scripts/cascade.mjs"]', JSON.stringify(shown));
  check('g4: «AUTO-GENERATED by» names the generator', generatedBy('// AUTO-GENERATED by scripts/gen.mjs — do not edit by hand\nwindow.X = 1;') === 'scripts/gen.mjs' && generatedBy('// a file that writes "AUTO-GENERATED" into others\n') === null);

  // ── g5: why a file exists ───────────────────────────────────────────────
  const base = { segments: [], imports: [], importedBy: [], calls: [], calledBy: [], starts: [], startedBy: [], runs: [], shebang: false, generated: null, runner: false };
  const mk = (o) => { const f = { ...base, ...o }; f.role = fileRole(f); f.purpose = filePurpose(f, (p) => (p.startsWith('scripts/') ? 'b.a' : 'b.b')); return f; };
  const lib = mk({ path: 'scripts/lib.mjs', importedBy: [{ file: 'scripts/x.mjs' }, { file: 'tests/y.mjs' }, { file: 'scripts/x.mjs' }] });
  check('g5: a library says who would break without it', lib.role.kind === 'library' && /не работают 2 файла в 2 блоках: x\.mjs, y\.mjs/.test(lib.purpose.text) && lib.purpose.from === 'derived', lib.purpose.text);
  const test = mk({ path: 'tests/lib.selftest.mjs', imports: [{ file: 'scripts/lib.mjs' }], runs: [{ kind: 'nightly', name: 'lib_selftest' }] });
  check('g5: a test names what it guards and what runs it', test.role.kind === 'test' && /lib\.mjs — каждую ночь \(шаг «lib_selftest»\)/.test(test.purpose.text), test.purpose.text);
  const lone = mk({ path: 'tests/lone.selftest.mjs' });
  check('g5: a test nothing runs says so', /не запускает ни nightly, ни команда/.test(lone.purpose.text), lone.purpose.text);
  const started = mk({ path: 'scripts/step.mjs', startedBy: [{ file: 'scripts/loop.mjs' }] });
  check('g5: a script another one starts is a command, with its starter', started.role.kind === 'command' && /её запускает loop\.mjs отдельным процессом/.test(started.purpose.text), started.purpose.text);
  const cond = mk({ path: 'scripts/nightly.mjs', runner: true, starts: Array.from({ length: 20 }, (_, i) => ({ file: `scripts/s${i}.mjs` })), runs: [{ kind: 'npm', name: 'test:nightly' }] });
  check('g5: a conductor is named as one', /Дирижёр: запускает 20 скриптов/.test(cond.purpose.text), cond.purpose.text);
  const gen = mk({ path: 'frontend/bootstrap.js', generated: 'scripts/gen.mjs' });
  check('g5: a generated file is not to be edited by hand', gen.role.kind === 'generated' && /скриптом gen\.mjs/.test(gen.purpose.text), gen.purpose.text);
  const orphan = mk({ path: 'scripts/old.mjs' });
  check('g5: nothing uses it — said plainly', orphan.role.kind === 'orphan' && /никто не импортирует и ничто не запускает/.test(orphan.purpose.text));
  const written = mk({ path: 'scripts/lib2.mjs', importedBy: [{ file: 'scripts/x.mjs' }], purposeWritten: 'Чтобы канвас не парсил код сам.' });
  check('g5: a purpose written in files.md wins', written.purpose.from === 'files.md' && written.purpose.text === 'Чтобы канвас не парсил код сам.');

  // ── g6: block links ─────────────────────────────────────────────────────
  const files = [
    { path: 'scripts/a.mjs', block: 'b.a', imports: [{ file: 'scripts/b.mjs', line: 3, names: ['x'] }], calls: [], starts: [] },
    { path: 'scripts/b.mjs', block: 'b.b', imports: [], calls: [], starts: [{ file: 'scripts/c.mjs', line: 9, names: [] }] },
    { path: 'scripts/c.mjs', block: 'b.c', imports: [], calls: [], starts: [] },
    { path: 'tests/t.mjs', block: 'b.c', imports: [], calls: [{ file: 'scripts/a.mjs', line: 2, names: ['GET /x'] }], starts: [] },
    { path: 'scripts/n.mjs', block: 'b.n', runner: true, imports: [], calls: [], starts: [{ file: 'scripts/a.mjs', line: 1, names: [] }] },
  ];
  const blocks = [{ id: 'b.a', depends_on: ['b.b', 'b.d'] }, { id: 'b.b', depends_on: [] }, { id: 'b.c', depends_on: [] }, { id: 'b.d', depends_on: [] }, { id: 'b.n', depends_on: [] }];
  const links = blockLinks(files, blocks);
  const L = (a, b) => links.find((l) => l.from === a && l.to === b);
  check('g6: an import backed by the contract, with file, line and names', L('b.a', 'b.b')?.contract === true && L('b.a', 'b.b').code[0].names[0] === 'x' && L('b.a', 'b.b').code[0].line === 3);
  check('g6: a declared dependency with no code', L('b.a', 'b.d')?.contract === true && L('b.a', 'b.d').code.length === 0);
  check('g6: a started script nobody declared', L('b.b', 'b.c')?.contract === false && L('b.b', 'b.c').code[0].kind === 'start');
  check('g6: a link only tests use is marked', L('b.c', 'b.a')?.tests_only === true && L('b.c', 'b.a').code[0].kind === 'http');
  check('g6: a conductor\'s starts are not block links', !L('b.n', 'b.a'), JSON.stringify(links));
  // R-8.15 — runtime calls are declared in calls.md; starting a test is a check;
  // a test-target block's links are test links
  const files2 = [
    { path: 'scripts/gate.mjs', block: 'b.db', imports: [], calls: [], starts: [{ file: 'scripts/verify.mjs', line: 5, names: [] }, { file: 'tests/t.selftest.mjs', line: 6, names: [] }] },
    { path: 'scripts/verify.mjs', block: 'b.avl', imports: [{ file: 'scripts/gate.mjs', line: 2, names: ['gate'] }], calls: [], starts: [] },
    { path: 'tests/t.selftest.mjs', block: 'b.sbx', imports: [], calls: [], starts: [] },
    { path: 'scripts/smoke.mjs', block: 'b.sbx', imports: [], calls: [], starts: [{ file: 'scripts/verify.mjs', line: 1, names: [] }] },
  ];
  const blocks2 = [
    { id: 'b.db', depends_on: [], calls: [{ to: 'b.avl', text: 'запускает проверку' }] },
    { id: 'b.avl', depends_on: ['b.db'] },
    { id: 'b.sbx', type: 'test', depends_on: [] },
  ];
  const l2 = blockLinks(files2, blocks2);
  const M = (a, b) => l2.find((l) => l.from === a && l.to === b);
  check('g6: an upward runtime call declared in calls.md is in the contract', M('b.db', 'b.avl')?.contract === true && M('b.db', 'b.avl').declared_in.join() === 'calls' && M('b.db', 'b.avl').code[0].kind === 'start', JSON.stringify(M('b.db', 'b.avl')));
  check('g6: …while the import the other way stays a dependency', M('b.avl', 'b.db')?.declared_in.join() === 'depends_on');
  check('g6: starting a test is running a check, not a link', !M('b.db', 'b.sbx'), JSON.stringify(l2.map((l) => `${l.from}->${l.to}`)));
  check('g6: a test-target block\'s links are test links', M('b.sbx', 'b.avl')?.tests_only === true);

  // ── g7: a whole map on a disposable repo ────────────────────────────────
  const atlas = path.join(tmp, 'atlas');
  w('scripts/lib.mjs', '// Does one thing.\nexport function one() { return 1; }\n');
  w('scripts/use.mjs', "#!/usr/bin/env node\nimport { one } from './lib.mjs';\none();\n");
  w('atlas/graph.json', JSON.stringify({ layers: [{ id: 'logic', name: 'Логика', order: 0 }], blocks: [
    { id: 'b.lib', title: 'Lib', layer: 'logic', status: 'done', depends_on: [], tech_stack: ['nodejs'] },
    { id: 'b.use', title: 'Use', layer: 'logic', status: 'wip', depends_on: ['b.lib'] },
    { id: 'b.old', title: 'Old', layer: 'logic', status: 'archived', depends_on: [] },
  ] }));
  w('atlas/blocks/b.lib/files.md', '# f\n\n- scripts/lib.mjs [alive] (R-1.0: даёт one() всем)\n');
  w('atlas/blocks/b.lib/user_story.md', '# s\n\n**Как** оператор, **я хочу** видеть одно, **чтобы** понимать всё.\n');
  w('atlas/blocks/b.lib/mission.md', '# b.lib — mission\n\nБиблиотека, которая отдаёт единицу всем, кому она нужна.\n');
  w('atlas/blocks/b.use/files.md', '# f\n\n- scripts/use.mjs [alive] (вызывает one. Зачем: чтобы проверить, что one живая.)\n');
  w('atlas/code_graph.json', JSON.stringify({ files: {
    'scripts/lib.mjs': { owning_block: 'b.lib', exports: [{ name: 'one', line: 2 }], imports: [] },
    'scripts/use.mjs': { owning_block: 'b.use', exports: [], imports: [{ external: false, from: './lib.mjs', resolved_to: 'scripts/lib.mjs', line: 2, kind: 'static', specifiers: [{ kind: 'named', name: 'one' }] }] },
  } }));
  const map = buildCodeMap({ repoRoot: tmp, atlasRoot: atlas, history: false });
  const lf = map.files.find((f) => f.path === 'scripts/lib.mjs'), uf = map.files.find((f) => f.path === 'scripts/use.mjs');
  check('g7: archived blocks stay off the map', map.blocks.length === 2 && map.archived.join() === 'b.old');
  check('g7: meaning from files.md without the release tag', lf.meaning === 'даёт one() всем' && lf.meaningFrom === 'files.md', lf.meaning);
  check('g7: who uses an exported function', lf.segments.find((s) => s.name === 'one')?.users.join() === 'scripts/use.mjs');
  check('g7: «Зачем:» in files.md is the purpose', uf.purpose.from === 'files.md' && uf.purpose.text === 'чтобы проверить, что one живая' && uf.meaning === 'вызывает one', JSON.stringify([uf.meaning, uf.purpose]));
  const blib = map.blocks.find((b) => b.id === 'b.lib');
  check('g7: the block speaks in its user story and its stack', blib.want === 'видеть одно' && blib.soThat === 'понимать всё' && blib.stack.join() === 'Node.js' && blib.meaning.startsWith('Библиотека'), JSON.stringify(blib));
  check('g7: the link is in the code and in the contract', map.links.length === 1 && map.links[0].contract && map.links[0].code[0].names[0] === 'one');
  check('g7: no git → says so, the change lens is empty', map.source.git === false && map.history.length === 0);
  check('g7: a file on the map is served', readMapFile({ repoRoot: tmp, atlasRoot: atlas, file: 'scripts/lib.mjs' }).text.includes('export function one'));
  for (const bad of ['package.json', '../etc/passwd', 'atlas/graph.json', '/etc/hosts', '']) {
    check(`g7: «${bad}» is not served`, readMapFile({ repoRoot: tmp, atlasRoot: atlas, file: bad }).ok === false);
  }
  check('g7: user story helpers', wantLine('Как X / Когда Y / Я хочу [действие] / Чтобы [цель]').want === '' && missionLine('# m\n\nВводная фраза:\n\n| a |\n\nНастоящее предложение про блок, длиннее тридцати знаков.\n') === 'Настоящее предложение про блок, длиннее тридцати знаков.');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── g8: the real atlas ─────────────────────────────────────────────────────
{
  const map = buildCodeMap({ history: false });
  const cg = JSON.parse(fs.readFileSync(path.join(ROOT, 'atlas', 'code_graph.json'), 'utf8'));
  const live = new Set(map.blocks.map((b) => b.id));
  const expected = Object.entries(cg.files).filter(([, i]) => live.has(i.owning_block)).map(([p]) => p).sort();
  check('g8: every code file of a live block is on the map', JSON.stringify(map.files.map((f) => f.path).sort()) === JSON.stringify(expected), `${map.files.length} vs ${expected.length}`);
  const bad = map.files.filter((f) => !covers(f.segments, f.lines) || !f.role?.label || !f.purpose?.text);
  check('g8: every file: parts add up, a role, a purpose', !bad.length, bad.slice(0, 3).map((f) => f.path).join(', '));
  check('g8: every file says what it does', map.files.every((f) => f.meaning), map.files.filter((f) => !f.meaning).map((f) => f.path).join(', '));
  check('g8: links are classified', map.links.every((l) => l.contract || l.code.length));
}

if (failures.length) {
  console.error('atlas_map.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('atlas_map.selftest: OK (8 groups)');

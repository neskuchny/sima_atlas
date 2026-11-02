#!/usr/bin/env node
// R-8.14 (b.code-graph) — the code map: the product as a building the operator
// can walk through. Floors are layers, rooms are blocks, tiles are files, and
// every file opens into its parts (functions, components, routes) and code.
//
// The contract graph says what SHOULD be connected; code_graph.json says what
// the code actually imports. The map joins them and adds what a person needs
// to read either without opening the code:
//   - per block: meaning (user story «я хочу», mission), state (status,
//     acceptance, the agent's frame), stack;
//   - per file: what it does (files.md / header comment), WHY it exists (who
//     imports it, which nightly step or command runs it — or that nothing
//     does), its stack (runtime, packages, what it touches);
//   - per connection: the exact imports behind it — file, line, names — or
//     «only in the contract» when no code backs a declared dependency;
//   - history: which files and contracts each recent change touched.
//
// Nothing here is typed by hand: every field is derived from the atlas, the
// code and git. Derived purposes are marked as derived; a purpose written by
// a person goes in files.md after «Зачем:» and wins.
//
// Library:
//   import { buildCodeMap, readMapFile } from './atlas_map.mjs';
// CLI:
//   node scripts/atlas_map.mjs [--client <id>] [--summary]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { blockMeaningSummary } from './block_meaning.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');

const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };

// ── text helpers ────────────────────────────────────────────────────────────
export const stripMd = (s) => String(s || '')
  .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
  .replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*\s][^*]*)\*/g, '$1')
  .replace(/`([^`]+)`/g, '$1').replace(/\s+/g, ' ').trim();
export const cut = (s, n) => {
  s = String(s || '').trim();
  if (s.length <= n) return s;
  const c = s.slice(0, n);
  const sp = c.lastIndexOf(' ');
  return `${(sp > n * 0.6 ? c.slice(0, sp) : c).replace(/[,;:—–-]\s*$/, '')}…`;
};
const sentences = (s) => (String(s).match(/[^.!?…]+(?:[.!?…]+|$)/g) || []).map((x) => x.trim()).filter(Boolean);
// «R-8.13: …», «R-8.08/R-8.12: …», «PR4.1: …», «Phase R-6 — …» are release
// tags, not meaning.
export const dropTag = (s) => String(s || '')
  .replace(/^\s*(?:(?:(?:R|PR|P)-?[\w.]+(?:\s*\([^)]*\))?)(?:\s*[/,]\s*(?:R|PR|P)-?[\w.]+)*|Phase\s+[\w.\-]+(?:\s*\([^)]*\))?)\s*[:—–-]\s*/, '')
  .trim();
const pluralRu = (n, [one, few, many]) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return `${n} ${a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many}`;
};
const FILES_W = ['файл', 'файла', 'файлов'];
const BLOCKS_W = ['блоке', 'блоках', 'блоках'];

function proseParagraphs(md) {
  const out = [];
  let inCode = false;
  const buf = [];
  const flush = () => { const p = buf.join(' ').trim(); if (p) out.push(p); buf.length = 0; };
  for (const l of String(md || '').replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(l)) { inCode = !inCode; flush(); continue; }
    if (inCode) continue;
    if (/^\s*$/.test(l) || /^#/.test(l) || /^\s*\|/.test(l) || /^\s*---+\s*$/.test(l) || /^\s*>/.test(l)) { flush(); continue; }
    buf.push(l.trim());
  }
  flush();
  return out;
}
/** The first plain sentence of a mission that is not an intro to a list. */
export function missionLine(md) {
  for (const p of proseParagraphs(md)) {
    if (/^[-*]\s/.test(p)) continue;
    for (const s of sentences(stripMd(p))) if (s.length > 30 && !/:$/.test(s)) return cut(s, 240);
  }
  return '';
}
/** «я хочу X, чтобы Y» from a user story — what the block is FOR, in the operator's words. */
export function wantLine(md) {
  const t = stripMd(String(md || '').replace(/^#.*$/gm, ' '));
  const m = t.match(/я хочу\s+(.+?)(?:,?\s+чтобы\s+(.+?))?(?:\.\s|$)/i) || t.match(/I want\s+(.+?)(?:,?\s+so that\s+(.+?))?(?:\.\s|$)/i);
  if (!m) return { want: '', soThat: '' };
  // Stories written as «Как X / Когда Y / Я хочу Z / Чтобы W», or several in a row.
  const clip = (x) => String(x || '').split(/\s\/\s|\s\/$|\s+я хочу\s|\s+как\s+[а-яё]+\s*,|\s+когда\s/i)[0].trim().replace(/[/,;.]\s*$/, '');
  const want = clip(m[1]);
  if (!want || /\[[^\]]*\]/.test(want)) return { want: '', soThat: '' }; // template placeholder
  return { want: cut(want, 220), soThat: m[2] && !/\[[^\]]*\]/.test(m[2]) ? cut(clip(m[2]), 200) : '' };
}

// ── a file's parts ──────────────────────────────────────────────────────────
// A file is cut into consecutive parts at top-level declarations (and at HTTP
// routes inside one big handler), so every line belongs to exactly one part
// and the part sizes add up to the file. Section comments («// ── x ──»)
// become dividers. No parser: the code is formatted, top-level declarations
// start at column 0.
const DECL = [
  [/^export\s+default\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)?/, 'fn', true],
  [/^export\s+(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, 'fn', true],
  [/^export\s+class\s+([A-Za-z_$][\w$]*)/, 'class', true],
  [/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/, 'const', true],
  [/^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/, 'fn', false],
  [/^class\s+([A-Za-z_$][\w$]*)/, 'class', false],
  [/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/, 'const', false],
];
const TEST = /^(?:test|it|describe)(?:\.(?:describe|only|skip|serial))?\(\s*(['"`])(.+?)\1/;
const HOOK = /^test\.(beforeAll|afterAll|beforeEach|afterEach)\(/;
const SECTION = /^\s*\/\/\s*[─━—–=-]{2,}\s*(.+?)\s*[─━—–=-]*\s*$/;
const ROUTE = /^\s*if\s*\(\s*(?:req\.method\s*===\s*'(\w+)'\s*&&\s*)?req\.url(?:\s*===\s*'([^']+)'|\.startsWith\('([^']+)'\)|\.match\(|\s*&&)/;
const isComment = (l) => /^\s*(\/\/|\/\*|\*|\*\/)/.test(l);
const uncomment = (l) => l.replace(/^\s*(\/\/+|\/\*+|\*\/|\*)\s?/, '').replace(/\*\/\s*$/, '');

function docAbove(lines, i) {
  const out = [];
  let j = i - 1;
  while (j >= 0 && isComment(lines[j]) && !SECTION.test(lines[j])) { out.unshift(lines[j]); j--; }
  const text = out.map(uncomment).join(' ').split(/(?:^|\s)@(?:param|returns?|typedef|type)\b/)[0];
  return cut(stripMd(dropTag(text.replace(/^[=\s]+|[=\s]+$/g, ''))), 300);
}
function headerComment(lines) {
  const out = [];
  let i = /^#!/.test(lines[0] || '') ? 1 : 0;
  for (; i < lines.length; i++) {
    const l = lines[i];
    if (/^\s*$/.test(l)) { if (out.length) out.push(''); continue; }
    if (!isComment(l)) break;
    out.push(uncomment(l));
  }
  const paras = out.join('\n').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
  return paras.length ? cut(stripMd(dropTag(paras.slice(0, 2).join(' '))), 320) : '';
}

export function segmentsOf(src, file, exportedNames = new Set()) {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const isJsx = /\.jsx$/.test(file);
  const sections = [];
  const scan = (indent) => {
    const found = [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (indent === '' && SECTION.test(l) && !/^\s/.test(l)) { sections.push({ line: i + 1, title: cut(stripMd(l.match(SECTION)[1]), 80) }); continue; }
      if (!l.startsWith(indent) || (indent && /^\s/.test(l.slice(indent.length)))) continue;
      const body = l.slice(indent.length);
      let hit = null;
      const t = body.match(TEST);
      if (t) hit = { name: cut(t[2], 70), kind: 'test', exported: false };
      else if (HOOK.test(body)) hit = { name: body.match(HOOK)[1], kind: 'test', exported: false };
      else {
        for (const [re, kind, exp] of DECL) {
          const m = body.match(re);
          if (m) {
            const name = m[1] || 'default';
            hit = { name, kind: isJsx && kind === 'fn' && /^[A-Z]/.test(name) ? 'component' : kind, exported: exp || exportedNames.has(name) };
            break;
          }
        }
      }
      if (hit) found.push({ line: i + 1, ...hit, doc: docAbove(lines, i) });
    }
    return found;
  };
  const marks = scan('');
  const total = lines.length;
  // Browser scripts wrapped in one IIFE have no top-level declarations: look
  // one level in.
  const biggestShare = () => {
    const pts = [...marks.map((m) => m.line), total + 1].sort((a, b) => a - b);
    let best = pts[0] - 1;
    for (let k = 0; k + 1 < pts.length; k++) best = Math.max(best, pts[k + 1] - pts[k]);
    return best / Math.max(1, total);
  };
  if (total > 150 && marks.length <= 2 && biggestShare() > 0.7) {
    for (const ind of ['  ', '    ']) {
      const inner = scan(ind).filter((m) => m.kind !== 'test');
      if (inner.length >= 3) { marks.push(...inner); break; }
    }
  }
  // HTTP routes inside one big handler.
  for (let i = 0; i < lines.length; i++) {
    const r = lines[i].match(ROUTE);
    if (!r) continue;
    const route = r[2] || r[3];
    if (!route) continue;
    const method = r[1] || 'POST';
    marks.push({ line: i + 1, name: `${method} ${route}`, kind: 'route', exported: false, doc: docAbove(lines, i), route: { method, path: route, prefix: !r[2] } });
  }
  marks.sort((a, b) => a.line - b.line);
  const uniq = marks.filter((m, k) => k === 0 || m.line !== marks[k - 1].line);
  const segs = [];
  const first = uniq.length ? uniq[0].line : total + 1;
  if (first > 1) segs.push({ name: 'head', kind: 'head', start: 1, end: first - 1, exported: false, doc: headerComment(lines) });
  uniq.forEach((m, k) => {
    const end = (k + 1 < uniq.length ? uniq[k + 1].line : total + 1) - 1;
    const seg = { name: m.name, kind: m.kind, start: m.line, end: Math.max(m.line, end), exported: m.exported, doc: m.doc, ...(m.route ? { route: m.route } : {}) };
    // Small private constants are setup, not parts of their own: they join
    // the header or a run of constants, so the anatomy shows what matters.
    const prev = segs[segs.length - 1];
    if (seg.kind === 'const' && !seg.exported && seg.end - seg.start < 4 && !seg.doc) {
      if (prev && (prev.kind === 'head' || prev.kind === 'consts')) { prev.end = seg.end; return; }
      segs.push({ name: 'consts', kind: 'consts', start: seg.start, end: seg.end, exported: false, doc: '' });
      return;
    }
    segs.push(seg);
  });
  if (!segs.length && total) segs.push({ name: 'head', kind: 'head', start: 1, end: total, exported: false, doc: headerComment(lines) });
  return { lines: total, segments: segs, sections, header: headerComment(lines) };
}

// ── stack: what a file runs on and what it touches ──────────────────────────
const ABILITY = {
  fs: 'файлы', child_process: 'запуск процессов', http: 'сеть', https: 'сеть', net: 'сеть', dgram: 'сеть',
  crypto: 'хэши и шифрование', worker_threads: 'потоки', readline: 'терминал', zlib: 'сжатие', os: 'система',
};
export function fileStack(file, info = {}) {
  const ext = path.extname(file);
  const ext_ = (info.imports || []).filter((i) => i.external).map((i) => i.from);
  const builtin = ext_.filter((m) => m.startsWith('node:') || Object.prototype.hasOwnProperty.call(ABILITY, m.split('/')[0]));
  const packages = [...new Set(ext_.filter((m) => !builtin.includes(m)).map((m) => (m.startsWith('@') ? m.split('/').slice(0, 2).join('/') : m.split('/')[0])))].sort();
  let runtime;
  if (file.startsWith('extensions/desktop/')) runtime = packages.includes('electron') ? (/preload/.test(file) ? 'Electron · preload' : 'Electron · главный процесс') : 'Node.js · ES-модуль';
  else if (ext === '.jsx') runtime = 'React (JSX) · собирается в браузере';
  else if (file.startsWith('frontend/')) runtime = 'JavaScript в браузере';
  else if (ext === '.ts') runtime = 'TypeScript';
  else runtime = 'Node.js · ES-модуль';
  const abilities = [...new Set(builtin.map((m) => ABILITY[m.replace(/^node:/, '').split('/')[0]]).filter(Boolean))];
  return { runtime, packages, abilities };
}

// Names people use, for the tech_stack tokens of graph.json.
const TECH = {
  nodejs: 'Node.js', esm: 'ES-модули', react: 'React', 'babel-standalone': 'Babel в браузере', electron: 'Electron',
  'electron-builder': 'electron-builder (сборка)', playwright: 'Playwright', mcp: 'MCP (инструменты для агентов)',
  'anthropic-api': 'Anthropic API', 'google-genai-api': 'Google Gemini API', markdown: 'Markdown', json: 'JSON',
  'json-schema': 'JSON Schema', filesystem: 'файлы на диске', 'vanilla-js': 'чистый JavaScript',
};
export const techName = (t) => TECH[t] || t;

// ── how files are started ───────────────────────────────────────────────────
/** Which files a command, a nightly step, the canvas page or the MCP config starts. */
export function entryPoints(repoRoot = ROOT, known = new Set()) {
  const runs = new Map(); // path -> [{ kind, name }]
  const add = (p, r) => { if (!known.size || known.has(p)) (runs.get(p) || runs.set(p, []).get(p)).push(r); };
  try {
    const pkg = JSON.parse(read(path.join(repoRoot, 'package.json')));
    for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
      for (const m of String(cmd).matchAll(/(?:^|\s)((?:scripts|tests|frontend|extensions)\/[\w./-]+\.(?:mjs|js|jsx|ts))/g)) add(m[1], { kind: 'npm', name });
    }
  } catch { /* no package.json */ }
  for (const m of read(path.join(repoRoot, 'scripts', 'nightly_consolidation.mjs')).matchAll(/\[\s*'([\w-]+)'\s*,\s*'node\s+([\w./-]+\.mjs)/g)) add(m[2], { kind: 'nightly', name: m[1] });
  const page = 'frontend/atlas_design/index.html';
  for (const m of read(path.join(repoRoot, page)).matchAll(/<script[^>]*\ssrc="([\w./-]+\.(?:js|jsx))(?:\?[^"]*)?"/g)) {
    if (!/^https?:/.test(m[1])) add(path.posix.normalize(path.posix.join('frontend/atlas_design', m[1])), { kind: 'page', name: 'index.html' });
  }
  try {
    const mcp = JSON.parse(read(path.join(repoRoot, '.mcp.json')));
    for (const [name, srv] of Object.entries(mcp.mcpServers || {})) for (const a of srv.args || []) if (/\.mjs$/.test(a)) add(a, { kind: 'mcp', name });
  } catch { /* no MCP config */ }
  return runs;
}

// ── connections that are not imports ───────────────────────────────────────
// The canvas talks to the server over HTTP, and the server, the nightly and
// the agent loop start other scripts as processes. Neither is an import, so
// the import graph alone calls these links «contract only» although the code
// does use them. Both are found from string literals in the code; comments
// are dropped first so a script named in prose is not counted.
// Block comments keep their line breaks, so line numbers stay true.
const stripComments = (src) => String(src || '').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const lineAt = (src, idx) => src.slice(0, idx).split('\n').length;
/** Routes a file calls on the HTTP server: [{ line, route }] where route is a server route segment. */
export function httpCalls(src, routes) {
  if (!routes.length) return [];
  const code = stripComments(src);
  const out = [];
  for (const m of code.matchAll(/['"`](\/[a-z][\w\-/.]*)/g)) {
    const lit = m[1];
    const hit = routes.find((r) => r.route.path === lit) || routes.find((r) => r.route.prefix && lit.startsWith(r.route.path));
    if (hit) out.push({ line: lineAt(code, m.index), route: hit.name });
  }
  return out;
}
/** Scripts a file starts as a separate process: [{ line, file }]. */
export function spawnedScripts(src) {
  const code = stripComments(src);
  const out = [];
  // The path opens the string or follows a space («node scripts/x.mjs»); a
  // module specifier («../scripts/x.mjs») is an import, not a process.
  for (const m of code.matchAll(/['"`](?:[^'"`\n]*?\s)?((?:scripts|tests)\/[\w./-]+\.mjs)/g)) out.push({ line: lineAt(code, m.index), file: m[1] });
  for (const m of code.matchAll(/['"`]scripts['"`]\s*,\s*['"`]([\w.-]+\.mjs)['"`]/g)) out.push({ line: lineAt(code, m.index), file: `scripts/${m[1]}` });
  return out;
}

/** A first comment that opens with «AUTO-GENERATED by scripts/x.mjs»: the generator, or null. */
export function generatedBy(src) {
  const first = String(src || '').split('\n').slice(0, 3).find((l) => l.trim()) || '';
  if (!/^\s*(?:\/\/|\/\*|<!--)\s*(?:AUTO-?GENERATED|DO NOT EDIT|GENERATED BY)/i.test(first)) return null;
  return (first.match(/by\s+((?:scripts|tests)\/[\w./-]+\.mjs)/) || [])[1] || 'generator';
}

const ROLE_LABEL = {
  generated: 'сгенерирован',
  'ui-test': 'тест в браузере', test: 'самотест', app: 'приложение', server: 'сервер API', page: 'интерфейс',
  validator: 'проверка', library: 'библиотека', command: 'команда', config: 'настройки', orphan: 'никем не используется',
};
export function fileRole(f) {
  const routes = f.segments.filter((s) => s.kind === 'route').length;
  let kind;
  if (f.generated) kind = 'generated';
  else if (/^tests\/playwright\//.test(f.path)) kind = 'ui-test';
  else if (/^tests\//.test(f.path)) kind = 'test';
  else if (/\.config\.(?:m?js|cjs|ts)$/.test(f.path)) kind = 'config';
  else if (/^extensions\//.test(f.path)) kind = 'app';
  else if (routes >= 3) kind = 'server';
  else if (/^frontend\//.test(f.path)) kind = 'page';
  else if (/^scripts\/validate_/.test(f.path)) kind = 'validator';
  else if (f.importedBy.length) kind = 'library';
  else if (f.runs.length || f.shebang || (f.startedBy || []).length) kind = 'command';
  else kind = 'orphan';
  return { kind, label: ROLE_LABEL[kind] };
}

const base = (p) => p.split('/').pop();
const uniqFiles = (arr) => [...new Set(arr.map((x) => x.file))];
/**
 * Why a file exists, in the operator's words: who needs it and what starts
 * it. Derived from the code and the runners — labelled as such — unless a
 * person wrote it in files.md after «Зачем:».
 */
export function filePurpose(f, blockOf = () => null) {
  if (f.purposeWritten) return { text: f.purposeWritten, from: 'files.md' };
  const users = uniqFiles(f.importedBy);
  const userBlocks = new Set(users.map(blockOf).filter(Boolean));
  const nightly = f.runs.filter((r) => r.kind === 'nightly').map((r) => r.name);
  const npm = f.runs.filter((r) => r.kind === 'npm').map((r) => r.name);
  const routes = f.segments.filter((s) => s.kind === 'route').length;
  const targets = [...new Set(f.imports.map((i) => base(i.file)))].slice(0, 3);
  const list = (arr, n = 3) => `${arr.slice(0, n).map(base).join(', ')}${arr.length > n ? ` и ещё ${arr.length - n}` : ''}`;
  let text;
  switch (f.role.kind) {
    case 'test':
      text = `Ловит поломки в ${targets.length ? targets.join(', ') : 'коде блока'}${nightly.length ? ` — каждую ночь (шаг «${nightly[0]}»)` : npm.length ? ` — командой npm run ${npm[0]}` : ' — но его не запускает ни nightly, ни команда'}.`;
      break;
    case 'ui-test':
      text = `Проверяет экран в настоящем браузере${npm.length ? ` — npm run ${npm[0]}` : ''}.`;
      break;
    case 'validator':
      text = nightly.length ? `Каждую ночь сверяет атлас (шаг «${nightly[0]}»): найденное расхождение попадает в ночной отчёт.` : 'Проверка атласа, которую запускают вручную: в nightly её нет.';
      break;
    case 'server':
      text = `Точка входа: HTTP-сервер (${pluralRu(routes, ['маршрут', 'маршрута', 'маршрутов'])}), через который канвас и агенты читают и меняют атлас${npm.length ? ` — npm run ${npm.join(', ')}` : ''}.`;
      break;
    case 'page':
      text = f.runs.some((r) => r.kind === 'page') ? 'Загружается страницей канваса — это часть того, что вы видите на экране.' : 'Часть интерфейса; страница канваса его не подключает напрямую.';
      break;
    case 'library':
      text = `Без него не работают ${pluralRu(users.length, FILES_W)}${userBlocks.size > 1 ? ` в ${pluralRu(userBlocks.size, BLOCKS_W)}` : ''}: ${list(users)}.`;
      break;
    case 'command': {
      const starters = uniqFiles((f.startedBy || []).filter((x) => !x.runner));
      const how = npm.length ? `: npm run ${npm[0]}` : f.runs.some((r) => r.kind === 'mcp') ? ': сервер инструментов для агентов (MCP)' : starters.length ? '' : `, которую запускают вручную: node ${f.path}`;
      text = `Команда${how}${nightly.length ? `${how ? ';' : ':'} шаг ночной проверки «${nightly[0]}»` : ''}${starters.length ? `${how || nightly.length ? '; ' : ': '}её запускает ${list(starters)} отдельным процессом` : ''}.`;
      if (f.runner) text += ` Дирижёр: запускает ${pluralRu(f.starts.length, ['скрипт', 'скрипта', 'скриптов'])} разных блоков.`;
      break;
    }
    case 'generated':
      text = `Собирается автоматически${f.generated !== 'generator' ? ` скриптом ${base(f.generated)}` : ''} из атласа: его не правят руками, а пересобирают.`;
      break;
    case 'config':
      text = `Настройки инструмента${npm.length ? ` для npm run ${npm.join(', ')}` : ''}: их читает сам инструмент, а не код проекта.`;
      break;
    case 'app':
      text = 'Часть настольного приложения (Electron): окно, меню, запуск сервера.';
      break;
    default:
      text = 'Его никто не импортирует и ничто не запускает — возможно, это лишний файл.';
  }
  return { text, from: 'derived' };
}

// ── atlas pieces ────────────────────────────────────────────────────────────
function filesMd(atlasRoot, id) {
  const out = {};
  for (const l of read(path.join(atlasRoot, 'blocks', id, 'files.md')).split('\n')) {
    const m = l.match(/^- (\S+) \[(alive|dead|archived)\](?:\s*\((.*)\))?\s*$/);
    if (!m) continue;
    // «(what it does. Зачем: why it exists)» — the purpose is optional.
    const raw = m[3] || '';
    const [what, why] = raw.split(/\s*Зачем:\s*/);
    const tidy = (x) => String(x || '').replace(/[\s.;,]+$/, '');
    out[m[1]] = { state: m[2], desc: what ? cut(stripMd(dropTag(tidy(what))), 360) : '', why: why ? cut(stripMd(tidy(why)), 240) : '' };
  }
  return out;
}
function tasksOf(atlasRoot, id) {
  const t = read(path.join(atlasRoot, 'blocks', id, 'tasks.md'));
  return { open: (t.match(/^\s*- \[ \]/gm) || []).length, done: (t.match(/^\s*- \[[xX]\]/gm) || []).length };
}
function kpisOf(atlasRoot, id) {
  const out = [];
  for (const l of read(path.join(atlasRoot, 'blocks', id, 'kpi.md')).split('\n')) {
    const m = l.match(/^- \*\*(KPI-\d+)\s*(?:\(([^)]*)\))?[^*]*\*\*:?\s*(.*)$/);
    if (m) out.push({ key: m[1], name: stripMd(m[2] || '') });
  }
  return out;
}
function acceptanceOf(atlasRoot, id) {
  const p = path.join(atlasRoot, 'acceptance_runs', id, '_latest.json');
  if (!fs.existsSync(p)) return null;
  try {
    const d = JSON.parse(read(p));
    return {
      verdict: d.verdict, checked_at: d.checked_at, counts: d.counts,
      items: (d.assertions || []).map((a) => ({ id: a.id, verdict: a.verdict, text: cut(stripMd(a.text), 150) })),
    };
  } catch { return null; }
}
const CONTRACT_FILES = /^atlas\/blocks\/([^/]+)\/(mission|acceptance|kpi|tasks|user_story|depends_on|provides|files|narrative|understanding)\.md$/;
function gitHistory(repoRoot) {
  try {
    const log = execFileSync('git', ['log', '--name-only', '--format=@@%h%x09%ad%x09%s', '--date=short'], { cwd: repoRoot, maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const commits = [];
    for (const chunk of log.split('@@').slice(1)) {
      const [head, ...rest] = chunk.split('\n');
      const [hash, date, ...subj] = head.split('\t');
      commits.push({ hash, date, subject: subj.join('\t'), files: rest.map((x) => x.trim()).filter(Boolean) });
    }
    return commits;
  } catch { return null; } // an installed app has no git: the map says so
}

/**
 * Block-to-block links: what actually crosses block borders in code — an
 * import (file, line, names), an HTTP call (the routes), a started script —
 * and the dependencies the contracts declare. A declared link with nothing
 * in code behind it is «contract only»; code with no declared link is «code
 * only» (the drift b.core-sync reports for imports).
 */
export function blockLinks(files, blocks) {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const links = new Map();
  const get = (from, to) => { const k = `${from}→${to}`; if (!links.has(k)) links.set(k, { from, to, contract: false, code: [] }); return links.get(k); };
  for (const f of files) {
    for (const [kind, list] of [['import', f.imports], ['http', f.calls || []], ['start', f.runner ? [] : f.starts || []]]) {
      for (const x of list) {
        const g = byPath.get(x.file);
        if (g && g.block !== f.block) get(f.block, g.block).code.push({ kind, from_file: f.path, line: x.line, to_file: g.path, names: x.names });
      }
    }
  }
  const ids = new Set(blocks.map((b) => b.id));
  for (const b of blocks) for (const d of b.depends_on || []) if (ids.has(d)) get(b.id, d).contract = true;
  for (const l of links.values()) l.tests_only = l.code.length > 0 && l.code.every((c) => c.from_file.startsWith('tests/'));
  return [...links.values()].sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

// ── the map ─────────────────────────────────────────────────────────────────
export function buildCodeMap({ repoRoot = ROOT, atlasRoot = ATLAS, history = true } = {}) {
  const graph = JSON.parse(read(path.join(atlasRoot, 'graph.json')) || '{"blocks":[]}');
  const cgPath = path.join(atlasRoot, 'code_graph.json');
  const cg = fs.existsSync(cgPath) ? JSON.parse(read(cgPath)) : null;
  const blocksAll = graph.blocks || [];
  const blocks = blocksAll.filter((b) => b.status !== 'archived');
  const blockIds = new Set(blocks.map((b) => b.id));
  const commits = history ? gitHistory(repoRoot) : null;

  // imports, both ways, with the names that cross
  const cgFiles = cg?.files || {};
  const known = new Set(Object.keys(cgFiles));
  const importsOf = new Map();
  const importedBy = new Map();
  const usersOfName = new Map(); // target -> name -> [file]
  for (const [f, info] of Object.entries(cgFiles)) {
    const list = [];
    for (const imp of info.imports || []) {
      if (imp.external || !imp.resolved_to) continue;
      const names = (imp.specifiers || []).map((s) => (s.kind === 'default' ? 'default' : s.kind === 'namespace' ? '*' : s.name));
      list.push({ file: imp.resolved_to, line: imp.line, names });
      (importedBy.get(imp.resolved_to) || importedBy.set(imp.resolved_to, []).get(imp.resolved_to)).push({ file: f, line: imp.line, names });
      const byName = usersOfName.get(imp.resolved_to) || usersOfName.set(imp.resolved_to, new Map()).get(imp.resolved_to);
      for (const n of names) (byName.get(n) || byName.set(n, []).get(n)).push(f);
    }
    importsOf.set(f, list);
  }
  const runs = entryPoints(repoRoot, known);
  const desc = {};
  for (const b of blocks) Object.assign(desc, filesMd(atlasRoot, b.id));

  // HTTP calls and started scripts, both ways.
  const serverRoutes = new Map(); // server file -> route segments
  const sources = new Map();
  for (const p of known) sources.set(p, read(path.join(repoRoot, p)));
  for (const p of known) {
    const segs = segmentsOf(sources.get(p), p).segments.filter((x) => x.kind === 'route');
    if (segs.length >= 3) serverRoutes.set(p, segs);
  }
  const callsOf = new Map(), calledBy = new Map(), startsOf = new Map(), startedBy = new Map();
  const push = (m, k, v) => (m.get(k) || m.set(k, []).get(k)).push(v);
  const generated = new Map([...known].map((p) => [p, generatedBy(sources.get(p))]));
  for (const p of known) {
    const src = sources.get(p);
    // A generated data file names scripts and routes as data, not as calls.
    if (generated.get(p)) continue;
    for (const [server, routes] of serverRoutes) {
      if (server === p) continue;
      const calls = httpCalls(src, routes);
      if (!calls.length) continue;
      const names = [...new Set(calls.map((c) => c.route))].sort();
      push(callsOf, p, { file: server, line: calls[0].line, names });
      push(calledBy, server, { file: p, line: calls[0].line, names });
    }
    // Only Node code can start a process; a browser file naming a script is
    // showing a command to the operator.
    if (p.startsWith('frontend/')) continue;
    const seen = new Set();
    for (const sp of spawnedScripts(src)) {
      if (sp.file === p || !known.has(sp.file) || seen.has(sp.file)) continue;
      seen.add(sp.file);
      push(startsOf, p, { file: sp.file, line: sp.line, names: [] });
      push(startedBy, sp.file, { file: p, line: sp.line, names: [] });
    }
  }

  // A conductor (the nightly) starts scripts of every block: that is running
  // their checks, not depending on them. Its starts stay on its own card and
  // do not become block links.
  const RUNNER_MIN = 15;
  const runners = new Set([...startsOf].filter(([, l]) => l.length >= RUNNER_MIN).map(([p]) => p));

  const lastIdx = {};
  const touches = {};
  (commits || []).forEach((c, i) => { for (const f of c.files) { if (!(f in lastIdx)) lastIdx[f] = i; touches[f] = (touches[f] || 0) + 1; } });

  const files = [];
  for (const [p, info] of Object.entries(cgFiles).sort(([a], [b]) => a.localeCompare(b))) {
    if (!blockIds.has(info.owning_block)) continue;
    const src = sources.get(p) ?? read(path.join(repoRoot, p));
    const anat = segmentsOf(src, p, new Set((info.exports || []).map((e) => e.name)));
    const byName = usersOfName.get(p) || new Map();
    for (const s of anat.segments) s.users = [...new Set(byName.get(s.name) || [])];
    const d = desc[p];
    const f = {
      path: p, block: info.owning_block, lines: anat.lines,
      kind: p.startsWith('tests/') ? 'test' : p.startsWith('frontend/') ? 'ui' : p.startsWith('extensions/') ? 'app' : 'code',
      meaning: (d && d.desc) || anat.header || '', meaningFrom: d && d.desc ? 'files.md' : anat.header ? 'comment' : '',
      purposeWritten: d && d.why ? d.why : '',
      stack: fileStack(p, info),
      shebang: /^#!/.test(src),
      generated: generated.get(p) || null,
      runs: runs.get(p) || [],
      segments: anat.segments, sections: anat.sections,
      imports: importsOf.get(p) || [], importedBy: importedBy.get(p) || [],
      calls: callsOf.get(p) || [], calledBy: calledBy.get(p) || [],
      starts: startsOf.get(p) || [], startedBy: (startedBy.get(p) || []).map((x) => (runners.has(x.file) ? { ...x, runner: true } : x)),
      runner: runners.has(p),
      last: p in lastIdx ? lastIdx[p] : null, touches: touches[p] || 0,
    };
    f.role = fileRole(f);
    files.push(f);
  }
  const blockOfFile = new Map(files.map((f) => [f.path, f.block]));
  for (const f of files) { f.purpose = filePurpose(f, (x) => blockOfFile.get(x)); delete f.purposeWritten; }

  const outBlocks = blocks.map((b) => {
    const dir = path.join(atlasRoot, 'blocks', b.id);
    const story = wantLine(read(path.join(dir, 'user_story.md')));
    let s = null;
    try { s = blockMeaningSummary(b.id, atlasRoot); } catch { /* a block without contract files */ }
    const bf = files.filter((f) => f.block === b.id);
    return {
      id: b.id, title: b.title || b.id, layer: b.layer, status: b.status, type: b.type || 'module',
      meaning: missionLine(read(path.join(dir, 'mission.md'))), want: story.want, soThat: story.soThat,
      trajectory: s?.trajectory?.declared ? cut(stripMd(s.trajectory.text), 420) : '',
      frame: s ? { state: s.gate.state, treating: s.understanding?.exists ? cut(stripMd(s.understanding.sections?.treating_as || ''), 360) : '' } : null,
      wording: s?.quality ? { warn: s.quality.counts.warn, info: s.quality.counts.info } : null,
      acceptance: acceptanceOf(atlasRoot, b.id),
      kpis: kpisOf(atlasRoot, b.id),
      tasks: tasksOf(atlasRoot, b.id),
      depends_on: (b.depends_on || []).filter((x) => blockIds.has(x)),
      stack: (b.tech_stack || []).map(techName),
      lines: bf.reduce((n, f) => n + f.lines, 0),
      files: bf.length,
    };
  });

  const fileSet = new Set(files.map((f) => f.path));
  const typeOf = new Map(blocksAll.map((b) => [b.id, b.type]));
  const recent = (commits || []).slice(0, 16).map((c, i) => {
    const code = c.files.filter((f) => fileSet.has(f));
    // A test-target block (b.smoke-sandbox) has its contract rewritten by
    // every smoke run: that is test noise, not a change of meaning.
    const contracts = [...new Set(c.files.map((f) => (f.match(CONTRACT_FILES) || [])[1]).filter((id) => id && blockIds.has(id) && typeOf.get(id) !== 'test'))];
    const byBlock = {};
    for (const f of code) { const bl = blockOfFile.get(f); byBlock[bl] = (byBlock[bl] || 0) + 1; }
    return { i, hash: c.hash, date: c.date, subject: c.subject, files: code, contracts, blocks: byBlock };
  });

  const projectMd = read(path.join(atlasRoot, 'project.md'));
  const goal = (projectMd.match(/^Цель:\s*(.+)$/m) || [])[1] || missionLine(projectMd);
  return {
    ok: true,
    generated_at: new Date().toISOString(),
    source: { commit: commits?.[0]?.hash || null, date: commits?.[0]?.date || null, code_graph: Boolean(cg), git: Boolean(commits) },
    product: { name: (projectMd.match(/^#\s+(.+)$/m) || [])[1] || 'Product', goal: cut(stripMd(goal), 260) },
    layers: (graph.layers || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((l) => ({ id: l.id, name: l.name })),
    blocks: outBlocks,
    archived: blocksAll.filter((b) => b.status === 'archived').map((b) => b.id),
    files,
    links: blockLinks(files, outBlocks),
    history: recent,
  };
}

/**
 * The text of one file on the map. Only files the atlas's code graph knows
 * are served, so the route cannot be used to read anything else.
 */
export function readMapFile({ repoRoot = ROOT, atlasRoot = ATLAS, file } = {}) {
  const p = String(file || '');
  const cg = JSON.parse(read(path.join(atlasRoot, 'code_graph.json')) || '{"files":{}}');
  if (!p || !Object.prototype.hasOwnProperty.call(cg.files || {}, p)) return { ok: false, error: 'not on the map' };
  const abs = path.resolve(repoRoot, p);
  if (!abs.startsWith(path.resolve(repoRoot) + path.sep)) return { ok: false, error: 'not on the map' };
  if (!fs.existsSync(abs)) return { ok: false, error: 'file is gone' };
  const text = fs.readFileSync(abs, 'utf8');
  return { ok: true, path: p, text, lines: text.split('\n').length - (text.endsWith('\n') ? 1 : 0) };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const ci = process.argv.indexOf('--client');
  const atlasRoot = ci > 0 ? path.join(ATLAS, 'clients', process.argv[ci + 1]) : ATLAS;
  const map = buildCodeMap({ atlasRoot });
  if (process.argv.includes('--summary')) {
    const roles = {};
    for (const f of map.files) roles[f.role.kind] = (roles[f.role.kind] || 0) + 1;
    console.log(JSON.stringify({
      blocks: map.blocks.length, files: map.files.length, lines: map.files.reduce((n, f) => n + f.lines, 0),
      parts: map.files.reduce((n, f) => n + f.segments.length, 0), links: map.links.length,
      code_links: map.links.filter((l) => l.code.length).length, contract_only: map.links.filter((l) => !l.code.length).length,
      code_only: map.links.filter((l) => l.code.length && !l.contract && !l.tests_only).length,
      tests_only: map.links.filter((l) => l.tests_only).length, roles, source: map.source,
    }, null, 2));
  } else {
    process.stdout.write(JSON.stringify(map));
  }
}

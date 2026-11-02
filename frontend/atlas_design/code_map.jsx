/* R-8.14 (b.ui-control) — the code map: the product as a building.
   Floors are layers, rooms are blocks, tiles are files; a file opens into its
   parts (functions, components, API routes) and its code. Every connection
   can be pinned and followed while scrolling: arrows run to the rooms it
   reaches, rooms say how they are connected, and a chip at the edge of the
   view names any end that is scrolled away. The data comes from
   GET /atlas/map (scripts/atlas_map.mjs, b.code-graph): the canvas draws, it
   does not parse code.

   Wrapped in a function so its names cannot collide with the other babel
   scripts on the page (they share one global scope). */
(() => {
const { useState, useEffect, useRef, useMemo, useLayoutEffect } = React;
const tr = (k, fb) => (window.__SIMA_T || ((_, x) => x))(k, fb);

// ── state that survives a live refresh ──────────────────────────────────────
// index.html re-mounts the whole App whenever a file changes on disk; the
// place on the map and the pinned connection must not reset with it.
const STORE = (window.__SIMA_STICKY = window.__SIMA_STICKY || {});
const subs = new Set();
function useMapState(key, initial) {
  const k = `map:${key}`;
  const [v, setV] = useState(() => (k in STORE ? STORE[k] : initial));
  useEffect(() => {
    const on = (x) => { if (x === k) setV(STORE[k]); };
    subs.add(on);
    return () => { subs.delete(on); };
  }, [k]);
  const set = (next) => {
    const prev = k in STORE ? STORE[k] : initial;
    STORE[k] = typeof next === 'function' ? next(prev) : next;
    subs.forEach((fn) => fn(k));
  };
  return [v, set];
}
// Other parts of the canvas («🗺 На карте» on a block) open the map at a place.
window.__SIMA_MAP_OPEN = (blockId) => {
  STORE['map:loc'] = blockId ? { level: 'block', block: blockId } : { level: 'product' };
  STORE['map:sel'] = null;
  subs.forEach((fn) => { fn('map:loc'); fn('map:sel'); });
};

// ── words ───────────────────────────────────────────────────────────────────
const plural = (n, [one, few, many]) => {
  const a = Math.abs(n) % 100, b = a % 10;
  return `${Number(n).toLocaleString('ru-RU')} ${a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many}`;
};
const W = {
  block: ['блок', 'блока', 'блоков'], file: ['файл', 'файла', 'файлов'], line: ['строка', 'строки', 'строк'],
  part: ['часть', 'части', 'частей'], imp: ['импорт', 'импорта', 'импортов'], route: ['маршрут', 'маршрута', 'маршрутов'],
  start: ['запуск', 'запуска', 'запусков'],
};
// R-8.16 — an atlas file as the code names it: «atlas/blocks/…/mission.md»
// is that file in every block's folder.
const dataPath = (key) => `atlas/${String(key).replace('/*/', '/…/')}`;
const dataName = (key) => (key === 'blocks/' ? 'atlas/blocks/' : base(String(key).replace(/\/$/, '')));
const modeText = (m) => tr(`map.dm_${m}`, { read: 'reads', write: 'writes', both: 'reads and writes' }[m] || m);
// «Somewhere in the block folders» says nothing more when the file names which ones.
const shownData = (f) => {
  const all = f.data || [];
  return all.some((d) => d.key.startsWith('blocks/*/')) ? all.filter((d) => d.key !== 'blocks/') : all;
};
const fmtLines = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} ${tr('map.thousand_lines', 'k lines')}` : plural(n, W.line));
const STATUS = {
  done: { icon: '✓', key: 'map.st_done', fb: 'done', color: 'var(--st-done)' },
  review: { icon: '◎', key: 'map.st_review', fb: 'in review', color: 'var(--st-review)' },
  wip: { icon: '◐', key: 'map.st_wip', fb: 'in progress', color: 'var(--st-progress)' },
  idea: { icon: '○', key: 'map.st_idea', fb: 'idea', color: 'var(--st-todo)' },
  broken: { icon: '✗', key: 'map.st_broken', fb: 'broken', color: 'var(--st-fail)' },
};
const st = (s) => STATUS[s] || STATUS.idea;
const stLabel = (s) => tr(st(s).key, st(s).fb);
const KIND = {
  fn: ['map.k_fn', 'function'], component: ['map.k_component', 'component'], route: ['map.k_route', 'API route'],
  test: ['map.k_test', 'test'], const: ['map.k_const', 'constant'], consts: ['map.k_consts', 'constants'],
  class: ['map.k_class', 'class'], head: ['map.k_head', 'header and imports'],
};
const kindLabel = (k) => tr(...(KIND[k] || [k, k]));
const segName = (s) => (s.kind === 'head' || s.kind === 'consts' ? kindLabel(s.kind) : s.name);
const GROUP = { code: ['map.g_code', 'Code'], ui: ['map.g_ui', 'Interface'], app: ['map.g_app', 'App'], test: ['map.g_test', 'Tests'] };
const LINK_KIND = {
  import: { icon: '⇢', key: 'map.lk_import', fb: 'import' },
  http: { icon: '⌁', key: 'map.lk_http', fb: 'API call' },
  start: { icon: '▶', key: 'map.lk_start', fb: 'starts a process' },
  file: { icon: '▤', key: 'map.lk_file', fb: 'its data: an atlas file' },
  via: { icon: '⇉', key: 'map.lk_via', fb: 'through the server' },
};
const LINK_KINDS = ['import', 'http', 'start', 'file', 'via'];
const dateRu = (d) => {
  const [, m, dd] = String(d || '').split('-');
  return m ? `${+dd} ${['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][+m - 1]}` : '';
};
const shortSubject = (s) => {
  const m = String(s).match(/^([A-Z]+-[\d.]+(?:\s*\([^)]*\))?)\s*[:—–-]\s*(.*)$/);
  return m ? { tag: m[1], text: m[2] } : { tag: String(s).split(/[:(]/)[0].slice(0, 18), text: s };
};
const base = (p) => String(p).split('/').pop();

// A short «why» for a tile, from the role the server derived.
function roleShort(f) {
  const users = new Set((f.importedBy || []).map((x) => x.file)).size;
  const nightly = (f.runs || []).find((r) => r.kind === 'nightly');
  const npm = (f.runs || []).find((r) => r.kind === 'npm');
  switch (f.role.kind) {
    case 'library': return `${tr('map.r_library', 'library')} · ${tr('map.r_needed_by', 'needed by')} ${plural(users, W.file)}`;
    case 'test': return `${tr('map.r_test', 'self-test')}${nightly ? ' · nightly' : ''}`;
    case 'validator': return `${tr('map.r_validator', 'check')}${nightly ? ' · nightly' : ''}`;
    case 'command': return `${tr('map.r_command', 'command')}${npm ? ` · npm run ${npm.name}` : ''}`;
    default: return f.role.label;
  }
}

// What needs the operator, per block.
function attention(b) {
  const out = [];
  if (b.frame && b.frame.state === 'awaiting') out.push({ k: 'ask', icon: '⏸', text: tr('map.att_ask', 'waiting for your answer') });
  if (b.acceptance && b.acceptance.counts.fail > 0) out.push({ k: 'fail', icon: '✗', text: `${tr('map.att_fail', 'acceptance failing')}: ${b.acceptance.counts.fail}` });
  else if (b.acceptance && b.acceptance.verdict === 'inconclusive') out.push({ k: 'unk', icon: '?', text: tr('map.att_unk', 'nothing can check acceptance') });
  if (b.wording && b.wording.warn > 0) out.push({ k: 'word', icon: '✎', text: `${tr('map.att_word', 'wording notes')}: ${b.wording.warn}` });
  return out;
}

// ── data ────────────────────────────────────────────────────────────────────
function useCodeMap() {
  const [state, setState] = useState(() => ({ map: STORE['map:data'] || null, error: null }));
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await window.SIMA_API?.meta?.codeMap?.();
      if (!alive) return;
      if (r?.ok) { STORE['map:data'] = r; setState({ map: r, error: null }); }
      else setState((s) => ({ map: s.map, error: r?.error || tr('map.unavailable', 'the map server did not answer') }));
    })();
    return () => { alive = false; };
  }, []);
  return state;
}
function indexMap(map) {
  const files = map.files.map((f, i) => ({ ...f, i, base: base(f.path) }));
  const fileByPath = new Map(files.map((f) => [f.path, f]));
  const blockById = new Map(map.blocks.map((b) => [b.id, b]));
  const filesOf = new Map();
  for (const f of files) (filesOf.get(f.block) || filesOf.set(f.block, []).get(f.block)).push(f);
  const linksOf = new Map();
  for (const l of map.links) for (const id of [l.from, l.to]) (linksOf.get(id) || linksOf.set(id, []).get(id)).push(l);
  const layerName = new Map(map.layers.map((l) => [l.id, l.name]));
  return { map, files, fileByPath, blockById, filesOf, linksOf, layerName };
}
// Every connection of one file, both ways, with its kind.
function fileLinks(f) {
  const tag = (kind) => (x) => ({ ...x, kind });
  return {
    out: [...f.imports.map(tag('import')), ...(f.calls || []).map(tag('http')), ...(f.starts || []).map(tag('start'))],
    in: [...f.importedBy.map(tag('import')), ...(f.calledBy || []).map(tag('http')), ...(f.startedBy || []).map(tag('start'))],
  };
}
const linkState = (l) => (l.code.length && l.contract ? 'ok' : l.code.length ? 'code-only' : 'contract-only');
const linkStateText = (l) => ({
  ok: tr('map.ls_ok', 'in the code and in the contract'),
  'code-only': tr('map.ls_code_only', 'in the code, but not written in the contract'),
  'contract-only': tr('map.ls_contract_only', 'only in the contract — no code uses it'),
}[linkState(l)]);
function linkSummary(l) {
  const n = { import: 0, http: 0, start: 0, file: 0, via: 0 };
  for (const c of l.code) n[c.kind] = (n[c.kind] || 0) + 1;
  const distinct = (kind) => new Set(l.code.filter((c) => c.kind === kind).flatMap((c) => c.names)).size;
  const parts = [];
  if (n.import) parts.push(plural(n.import, W.imp));
  if (n.http) parts.push(`${tr('map.calls', 'calls')} ${plural(distinct('http'), W.route)}`);
  if (n.start) parts.push(plural(n.start, W.start));
  if (n.file) {
    const fc = l.code.filter((c) => c.kind === 'file');
    const r = fc.some((c) => c.mode !== 'write'), w = fc.some((c) => c.mode !== 'read');
    parts.push(`${r && w ? tr('map.data_rw', 'reads and writes its data') : w ? tr('map.data_w', 'writes into its data') : tr('map.data_r', 'reads its data')}: ${plural(distinct('file'), W.file)}`);
  }
  if (n.via) parts.push(`${tr('map.via_short', 'through the server')}: ${plural(new Set(l.code.filter((c) => c.kind === 'via').map((c) => c.route)).size, W.route)}`);
  return parts.length ? parts.join(' · ') : tr('map.contract_only_short', 'only in the contract');
}

// ── squarified treemap (Bruls et al.) ──────────────────────────────────────
function squarify(items, x, y, w, h) {
  const total = items.reduce((n, it) => n + it.value, 0);
  if (!items.length || w <= 0 || h <= 0 || total <= 0) return [];
  const scale = (w * h) / total;
  const rest = items.map((it) => ({ it, a: it.value * scale })).sort((p, q) => q.a - p.a);
  const out = [];
  let row = [];
  const worst = (r, len) => {
    const s = r.reduce((n, z) => n + z.a, 0);
    let mx = 0, mn = Infinity;
    for (const z of r) { mx = Math.max(mx, z.a); mn = Math.min(mn, z.a); }
    return Math.max((len * len * mx) / (s * s), (s * s) / (len * len * mn));
  };
  const place = (r) => {
    const s = r.reduce((n, z) => n + z.a, 0);
    if (w >= h) {
      const cw = s / h; let yy = y;
      for (const z of r) { const zh = z.a / cw; out.push({ it: z.it, x, y: yy, w: cw, h: zh }); yy += zh; }
      x += cw; w -= cw;
    } else {
      const rh = s / w; let xx = x;
      for (const z of r) { const zw = z.a / rh; out.push({ it: z.it, x: xx, y, w: zw, h: rh }); xx += zw; }
      y += rh; h -= rh;
    }
  };
  let i = 0;
  while (i < rest.length) {
    const len = Math.min(w, h);
    if (!row.length || worst([...row, rest[i]], len) <= worst(row, len)) { row.push(rest[i]); i++; }
    else { place(row); row = []; }
  }
  if (row.length) place(row);
  return out;
}
// Files grouped by kind (code / interface / app / tests), each group a block
// of the treemap with a header strip.
function layoutFiles(files, w, h, { gap = 2, header = 0, pad = 0 } = {}) {
  const groups = ['code', 'ui', 'app', 'test'].map((k) => ({ kind: k, files: files.filter((f) => f.kind === k) })).filter((g) => g.files.length);
  const gRects = squarify(groups.map((g) => ({ g, value: g.files.reduce((n, f) => n + Math.max(1, f.lines), 0) })), pad, pad, w - 2 * pad, h - 2 * pad);
  const tiles = [], labels = [];
  for (const r of gRects) {
    const g = r.it.g;
    const head = header && r.h > header * 2.5 ? header : 0;
    if (head) labels.push({ kind: g.kind, n: g.files.length, x: r.x, y: r.y });
    for (const t of squarify(g.files.map((f) => ({ f, value: Math.max(1, f.lines) })), r.x + gap / 2, r.y + head + gap / 2, r.w - gap, r.h - head - gap)) {
      tiles.push({ f: t.it.f, x: Math.round(t.x + gap / 2), y: Math.round(t.y + gap / 2), w: Math.max(1, Math.round(t.w - gap)), h: Math.max(1, Math.round(t.h - gap)) });
    }
  }
  return { tiles, labels };
}

// ── small pieces ────────────────────────────────────────────────────────────
function StatusChip({ s }) {
  return <span className="cm-chip" style={{ '--sc': st(s).color }}><i aria-hidden="true">{st(s).icon}</i>{stLabel(s)}</span>;
}
function Flags({ b, short }) {
  return attention(b).filter((a) => !short || a.k !== 'word').map((a) => (
    <span key={a.k} className={`cm-flag ${a.k === 'ask' ? 'ask' : ''}`} title={a.text}>{a.icon}{short ? (a.k === 'ask' ? ` ${tr('map.att_ask_short', 'waiting')}` : '') : ` ${a.text}`}</span>
  ));
}
function AccDots({ b }) {
  if (!b.acceptance) return <span>{tr('map.no_acceptance', 'no acceptance')}</span>;
  return (
    <>
      <span className="cm-dots" aria-hidden="true">{b.acceptance.items.map((a) => <b key={a.id} className={a.verdict} />)}</span>
      <span>{b.acceptance.counts.pass}/{b.acceptance.items.length}</span>
    </>
  );
}
function heatOf(f, lens, commit) {
  if (lens !== 'change') return '';
  if (commit) return commit.files.includes(f.path) ? 'h3' : 'faded';
  if (f.last == null) return '';
  return f.last === 0 ? 'h3' : f.last <= 2 ? 'h2' : f.last <= 9 ? 'h1' : '';
}

// ── the building (level 1) ──────────────────────────────────────────────────
// Selection: { type: 'block', id } | { type: 'file', id: path } | { type: 'link', from, to }.
function relatedForSelection(ix, sel) {
  // rooms (and tiles) the pinned thing reaches, with how
  const rooms = new Map(); // blockId -> { dir: 'out'|'in'|'both', n, text }
  const tiles = new Map(); // path -> 'out'|'in'|'both'
  const lines = []; // { from: {type,id}, to: {type,id}, state }
  const add = (m, k, dir) => m.set(k, m.has(k) && m.get(k) !== dir ? 'both' : dir);
  if (!sel) return { rooms, tiles, lines };
  if (sel.type === 'block' || sel.type === 'link') {
    const ls = sel.type === 'link'
      ? (ix.linksOf.get(sel.from) || []).filter((l) => l.from === sel.from && l.to === sel.to)
      : ix.linksOf.get(sel.id) || [];
    for (const l of ls) {
      const center = sel.type === 'link' ? l.from : sel.id;
      const other = l.from === center ? l.to : l.from;
      const dir = l.from === center ? 'out' : 'in';
      const r = rooms.get(other) || { dir, n: 0, links: [] };
      r.dir = r.dir !== dir ? 'both' : dir;
      r.links.push(l);
      rooms.set(other, r);
      lines.push({ from: { type: 'room', id: l.from }, to: { type: 'room', id: l.to }, state: linkState(l) });
      if (sel.type === 'link') for (const c of l.code) { add(tiles, c.from_file, 'src'); add(tiles, c.to_file, 'dst'); }
    }
    if (sel.type === 'link') rooms.set(sel.from, { ...(rooms.get(sel.from) || {}), self: true });
  } else if (sel.type === 'file') {
    const f = ix.fileByPath.get(sel.id);
    if (f) {
      const fl = fileLinks(f);
      for (const [dir, list] of [['out', fl.out], ['in', fl.in]]) {
        for (const x of list) {
          const g = ix.fileByPath.get(x.file);
          if (!g) continue;
          add(tiles, g.path, dir);
          if (g.block !== f.block) {
            const r = rooms.get(g.block) || { dir, n: 0, links: [] };
            r.dir = r.dir !== dir ? 'both' : dir;
            r.n += 1;
            rooms.set(g.block, r);
          }
          lines.push({ from: { type: 'tile', id: dir === 'out' ? f.path : g.path }, to: { type: 'tile', id: dir === 'out' ? g.path : f.path }, state: x.kind });
        }
      }
      // R-8.16 — the blocks whose atlas files it reads or writes
      for (const d of shownData(f)) {
        if (!d.owner || d.owner === f.block) continue;
        const r = rooms.get(d.owner) || { dir: 'out', n: 0, links: [] };
        r.dir = r.dir !== 'out' ? 'both' : 'out';
        r.n += 1;
        rooms.set(d.owner, r);
        lines.push({ from: { type: 'tile', id: f.path }, to: { type: 'room', id: d.owner }, state: 'file' });
      }
    }
  }
  return { rooms, tiles, lines };
}

function Building({ ix, lens, commit, sel, setSel, go, onHover }) {
  const scrollRef = useRef(null);
  const contentRef = useRef(null);
  const [sizes, setSizes] = useState({});
  const [wires, setWires] = useState([]);
  const [edges, setEdges] = useState({ top: [], bottom: [] });
  const [flash, setFlash] = useState(null);
  const rel = useMemo(() => relatedForSelection(ix, sel), [ix, sel]);
  const selBlock = sel?.type === 'block' ? sel.id : sel?.type === 'link' ? sel.from : sel?.type === 'file' ? ix.fileByPath.get(sel.id)?.block : null;

  // 1. measure every room's tile box, then lay the tiles out
  useLayoutEffect(() => {
    const measure = () => {
      const next = {};
      for (const el of contentRef.current?.querySelectorAll('[data-tiles]') || []) next[el.dataset.tiles] = { w: el.clientWidth, h: el.clientHeight };
      setSizes((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (contentRef.current) {
      ro.observe(contentRef.current);
      for (const el of contentRef.current.querySelectorAll('[data-tiles]')) ro.observe(el);
    }
    return () => ro.disconnect();
  }, [ix]);

  // 2. arrows for the pinned connection, in content coordinates
  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    const box = root.getBoundingClientRect();
    const rectOf = (end) => {
      const el = end.type === 'room' ? root.querySelector(`[data-room="${CSS.escape(end.id)}"]`) : root.querySelector(`[data-tile="${CSS.escape(end.id)}"]`);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height };
    };
    const path = (a, z) => {
      const A = { x: a.x + a.w / 2, y: a.y + a.h / 2 }, Z = { x: z.x + z.w / 2, y: z.y + z.h / 2 };
      const edge = (r, p, q) => {
        const dx = q.x - p.x, dy = q.y - p.y;
        const tt = Math.min(Math.abs((r.w / 2 - 3) / (dx || 1e-6)), Math.abs((r.h / 2 - 3) / (dy || 1e-6)), 1);
        return { x: p.x + dx * tt, y: p.y + dy * tt };
      };
      const p = edge(a, A, Z), q = edge(z, Z, A);
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2, nx = -(q.y - p.y) * 0.14, ny = (q.x - p.x) * 0.14;
      return `M${p.x.toFixed(1)},${p.y.toFixed(1)} Q${(mx + nx).toFixed(1)},${(my + ny).toFixed(1)} ${q.x.toFixed(1)},${q.y.toFixed(1)}`;
    };
    const out = [];
    const seen = new Set();
    for (const ln of rel.lines) {
      const key = `${ln.from.id}→${ln.to.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const a = rectOf(ln.from), z = rectOf(ln.to);
      if (a && z) out.push({ key, d: path(a, z), state: ln.state });
    }
    setWires(out);
  }, [rel, sizes]);

  // 3. ends of the pinned connection that are scrolled out of view
  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return undefined;
    let raf = 0;
    const update = () => {
      raf = 0;
      const view = sc.getBoundingClientRect();
      const top = [], bottom = [];
      for (const [id, r] of rel.rooms) {
        if (r.self) continue;
        const el = contentRef.current?.querySelector(`[data-room="${CSS.escape(id)}"]`);
        if (!el) continue;
        const e = el.getBoundingClientRect();
        const item = { id, dir: r.dir, n: r.n || (r.links || []).length };
        if (e.bottom < view.top + 30) top.push(item);
        else if (e.top > view.bottom - 30) bottom.push(item);
      }
      setEdges((prev) => (JSON.stringify(prev) === JSON.stringify({ top, bottom }) ? prev : { top, bottom }));
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    sc.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { sc.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [rel, sizes]);

  const scrollToRoom = (id) => {
    const el = contentRef.current?.querySelector(`[data-room="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    setFlash(id);
    setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
  };

  const onRoomClick = (b, e) => {
    e.stopPropagation();
    if (sel?.type === 'block' && sel.id === b.id) go({ level: 'block', block: b.id });
    else setSel({ type: 'block', id: b.id });
  };
  const onTileClick = (f, e) => {
    e.stopPropagation();
    if (sel?.type === 'file' && sel.id === f.path) go({ level: 'file', file: f.path });
    else setSel({ type: 'file', id: f.path });
  };
  const relText = (r) => {
    if (r.self) return null;
    const arrow = r.dir === 'out' ? '↗' : r.dir === 'in' ? '↙' : '⇄';
    const what = sel?.type === 'file'
      ? `${plural(r.n, W.file)}`
      : r.links.map(linkSummary).join('; ');
    const who = r.dir === 'out' ? tr('map.rel_out', 'the selection uses it') : r.dir === 'in' ? tr('map.rel_in', 'it uses the selection') : tr('map.rel_both', 'both ways');
    return `${arrow} ${who} · ${what}`;
  };

  const floors = ix.map.layers.map((L) => {
    const bs = ix.map.blocks.filter((b) => b.layer === L.id).sort((a, b) => b.lines - a.lines || a.id.localeCompare(b.id));
    if (!bs.length) {
      return (
        <div key={L.id} className="cm-floor empty" data-layer={L.id}>
          <div className="cm-floor-label"><b>{L.name}</b><span>{tr('map.floor_empty', 'empty')}</span></div>
          <div className="cm-floor-note">{tr('map.floor_empty_note', 'No block on this floor.')}</div>
        </div>
      );
    }
    const lines = bs.reduce((n, b) => n + b.lines, 0), nfiles = bs.reduce((n, b) => n + b.files, 0);
    return (
      <div key={L.id} className="cm-floor" data-layer={L.id}>
        <div className="cm-floor-label"><b>{L.name}</b><span>{plural(bs.length, W.block)} · {plural(nfiles, W.file)} · {fmtLines(lines)}</span></div>
        <div className="cm-rooms">
          {bs.map((b) => {
            const r = rel.rooms.get(b.id);
            const touched = lens === 'change' && commit && (commit.blocks[b.id] || commit.contracts.includes(b.id));
            const dim = (sel && !r && selBlock !== b.id) || (lens === 'change' && commit && !touched);
            const files = ix.filesOf.get(b.id) || [];
            const size = sizes[b.id];
            const laid = size && files.length ? layoutFiles(files, size.w, size.h, { gap: 2 }).tiles : [];
            return (
              <div key={b.id} data-room={b.id}
                className={`cm-room ${b.lines ? '' : 'no-code'} ${selBlock === b.id ? 'sel' : ''} ${r ? `rel rel-${r.dir}` : ''} ${dim ? 'dim' : ''} ${touched ? 'touched' : ''} ${flash === b.id ? 'flash' : ''}`}
                style={{ flexGrow: Math.max(b.lines, 500), '--sc': st(b.status).color }}
                role="button" tabIndex={0}
                aria-label={`${b.title}: ${stLabel(b.status)}, ${plural(b.files, W.file)}`}
                onClick={(e) => onRoomClick(b, e)}
                onDoubleClick={(e) => { e.stopPropagation(); go({ level: 'block', block: b.id }); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); go({ level: 'block', block: b.id }); } if (e.key === ' ') { e.preventDefault(); setSel({ type: 'block', id: b.id }); } }}
                onMouseEnter={() => onHover({ type: 'block', b })} onMouseLeave={() => onHover(null)}>
                <div className="cm-room-head">
                  <StatusChip s={b.status} /><Flags b={b} short />
                  <span className="cm-room-size">{b.lines ? fmtLines(b.lines) : tr('map.no_code', 'no code')}</span>
                </div>
                <div className="cm-room-title">{b.title}</div>
                <div className="cm-room-id">{b.id}</div>
                {r && !r.self ? <div className="cm-rel">{relText(r)}</div> : <div className="cm-room-want">{b.want ? `${tr('map.want', 'I want')} ${b.want}` : b.meaning}</div>}
                <div className="cm-tiles" data-tiles={b.id}>
                  {!files.length && tr('map.contract_only_block', 'contract only')}
                  {laid.map((tl) => {
                    const relDir = rel.tiles.get(tl.f.path);
                    const isSel = sel?.type === 'file' && sel.id === tl.f.path;
                    return (
                      <div key={tl.f.path} data-tile={tl.f.path}
                        className={`cm-tile k-${tl.f.kind} ${heatOf(tl.f, lens, commit)} ${relDir ? `t-${relDir}` : ''} ${isSel ? 'sel' : ''}`}
                        style={{ left: tl.x, top: tl.y, width: tl.w, height: tl.h }}
                        onClick={(e) => onTileClick(tl.f, e)}
                        onDoubleClick={(e) => { e.stopPropagation(); go({ level: 'file', file: tl.f.path }); }}
                        onMouseEnter={(e) => { e.stopPropagation(); onHover({ type: 'file', f: tl.f }); }}
                        onMouseLeave={(e) => { e.stopPropagation(); onHover({ type: 'block', b }); }}>
                        {tl.w > 74 && tl.h > 20 && <span className="cm-tile-name">{tl.f.base}</span>}
                      </div>
                    );
                  })}
                </div>
                <div className="cm-room-foot"><AccDots b={b} />{b.tasks.open + b.tasks.done ? <span>· {tr('map.tasks', 'tasks')} {b.tasks.done}/{b.tasks.open + b.tasks.done}</span> : null}</div>
                {selBlock === b.id && sel?.type === 'block' && (
                  <button type="button" className="cm-enter" onClick={(e) => { e.stopPropagation(); go({ level: 'block', block: b.id }); }}>{tr('map.enter', 'Go inside')} ↘</button>
                )}
                {touched && <span className="cm-touch">{commit.blocks[b.id] ? `+${commit.blocks[b.id]}` : ''}{commit.contracts.includes(b.id) ? ' ✎' : ''}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  });

  return (
    <div className="cm-building">
      <div className="cm-scroll" ref={scrollRef} onClick={() => sel && setSel(null)}>
        <div className="cm-floors" ref={contentRef}>
          {floors}
          <svg className="cm-wires" aria-hidden="true">
            <defs>
              <marker id="cm-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" /></marker>
            </defs>
            {wires.map((w) => <path key={w.key} className={`w-${w.state}`} d={w.d} markerEnd="url(#cm-arr)" />)}
          </svg>
        </div>
        <Legend level="product" lens={lens} commit={commit} />
      </div>
      {['top', 'bottom'].map((side) => edges[side].length > 0 && (
        <div key={side} className={`cm-edge cm-edge-${side}`}>
          {edges[side].map((e) => {
            const b = ix.blockById.get(e.id);
            return (
              <button key={e.id} type="button" className={`cm-edge-chip rel-${e.dir}`} onClick={() => scrollToRoom(e.id)} title={tr('map.edge_title', 'Scroll to this end of the connection')}>
                {side === 'top' ? '↑' : '↓'} {b?.title || e.id}
                <span>{e.dir === 'out' ? tr('map.rel_out', 'the selection uses it') : e.dir === 'in' ? tr('map.rel_in', 'it uses the selection') : tr('map.rel_both', 'both ways')}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ── inside a block (level 2) ────────────────────────────────────────────────
function BlockView({ ix, b, lens, commit, sel, setSel, go, onHover }) {
  const boxRef = useRef(null);
  const [box, setBox] = useState(null);
  const [wires, setWires] = useState([]);
  const files = ix.filesOf.get(b.id) || [];
  const selFile = sel?.type === 'file' ? ix.fileByPath.get(sel.id) : null;
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return undefined;
    const measure = () => {
      const w = el.clientWidth;
      const h = Math.round(Math.max(360, Math.min(760, w * 0.6 + Math.max(0, files.length - 24) * 6)));
      setBox((p) => (p && p.w === w && p.h === h ? p : { w, h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [b.id, files.length]);
  const laid = box && files.length ? layoutFiles(files, box.w, box.h, { gap: 4, header: 22, pad: 6 }) : { tiles: [], labels: [] };
  const fl = selFile ? fileLinks(selFile) : null;
  const outSet = new Set(fl ? fl.out.map((x) => x.file) : []), inSet = new Set(fl ? fl.in.map((x) => x.file) : []);
  useLayoutEffect(() => {
    if (!selFile) { setWires([]); return; }
    const pos = new Map(laid.tiles.map((t) => [t.f.path, t]));
    const a = pos.get(selFile.path);
    const out = [];
    for (const [dir, set] of [['out', outSet], ['in', inSet]]) {
      for (const p of set) {
        const z = pos.get(p);
        if (!a || !z || p === selFile.path) continue;
        const [s, e] = dir === 'out' ? [a, z] : [z, a];
        const S = { x: s.x + s.w / 2, y: s.y + s.h / 2 }, E = { x: e.x + e.w / 2, y: e.y + e.h / 2 };
        out.push({ key: `${dir}:${p}`, d: `M${S.x},${S.y} Q${(S.x + E.x) / 2 - (E.y - S.y) * 0.15},${(S.y + E.y) / 2 + (E.x - S.x) * 0.15} ${E.x},${E.y}`, dir });
      }
    }
    setWires(out);
  }, [selFile, box]);
  const peers = (dir) => (ix.linksOf.get(b.id) || []).filter((l) => (dir === 'in' ? l.to === b.id : l.from === b.id));
  const PeerList = ({ dir }) => {
    const ls = peers(dir);
    if (!ls.length) return <p className="cm-muted">{dir === 'in' ? tr('map.nobody', 'nobody') : tr('map.nothing', 'nothing')}</p>;
    return ls.map((l) => {
      const other = ix.blockById.get(dir === 'in' ? l.from : l.to);
      const touchesSel = selFile && l.code.some((c) => c.from_file === selFile.path || c.to_file === selFile.path);
      return (
        <div key={`${l.from}→${l.to}`} className={`cm-peer ls-${linkState(l)} ${touchesSel ? 'hit' : ''}`} style={{ '--sc': st(other?.status).color }}>
          <button type="button" className="cm-peer-main" onClick={() => go({ level: 'block', block: other.id })}><b>{other?.title || '?'}</b><span>{linkSummary(l)}</span></button>
          <button type="button" className="cm-peer-why" onClick={() => setSel({ type: 'link', from: l.from, to: l.to })} title={tr('map.show_link', 'Show exactly what crosses this connection')}>{tr('map.what_exactly', 'what exactly?')}</button>
        </div>
      );
    });
  };
  const tests = files.filter((f) => f.kind === 'test').length;
  return (
    <div className="cm-block fade-in" style={{ '--sc': st(b.status).color }}>
      <header className="cm-bhead">
        <div className="cm-row"><StatusChip s={b.status} /><Flags b={b} /><span className="cm-flag">{ix.layerName.get(b.layer) || b.layer}</span></div>
        <h2 className="cm-btitle">{b.title}</h2>
        <div className="cm-bid">{b.id}</div>
        {b.want && <p className="cm-bwant"><b>{tr('map.why', 'Why')}:</b> {tr('map.want_lc', 'I want')} {b.want}{b.soThat ? `, ${tr('map.so_that', 'so that')} ${b.soThat}` : ''}.</p>}
        {b.meaning && <p className="cm-bmeaning">{b.meaning}</p>}
        <div className="cm-stats">
          <span>{plural(files.length, W.file)}</span><span>{fmtLines(b.lines)}</span>
          <span>{tr('map.tests', 'tests')}: {tests}</span>
          {b.stack.length > 0 && <span>{tr('map.stack', 'stack')}: {b.stack.join(' · ')}</span>}
        </div>
      </header>
      <div className="cm-bbody">
        <div className="cm-side"><h3 className="cm-label">{tr('map.used_by', 'Who uses it')}</h3><PeerList dir="in" /></div>
        <div className="cm-bmap" ref={boxRef} style={{ height: box?.h || 360 }} onClick={() => sel && setSel(null)}>
          {!files.length && <div className="cm-empty">{tr('map.block_no_code', 'No code in this block yet — only its contract: mission, acceptance, KPI.')}</div>}
          {laid.labels.map((g) => <div key={g.kind} className="cm-glabel" style={{ left: g.x, top: g.y }}>{tr(...GROUP[g.kind])} · {plural(g.n, W.file)}</div>)}
          {laid.tiles.map((tl) => {
            const f = tl.f;
            const showName = tl.w > 54 && tl.h > 22, showRole = tl.w > 90 && tl.h > 40, showMeaning = tl.w > 130 && tl.h > 78;
            const clamp = Math.max(1, Math.floor((tl.h - 62) / 15));
            const relCls = selFile && selFile.path === f.path ? 'sel' : outSet.has(f.path) ? 't-out' : inSet.has(f.path) ? 't-in' : '';
            return (
              <button key={f.path} type="button" data-tile={f.path}
                className={`cm-ftile k-${f.kind} ${heatOf(f, lens, commit)} ${relCls} ${selFile && !relCls ? 'dim' : ''}`}
                style={{ left: tl.x, top: tl.y, width: tl.w, height: tl.h }}
                aria-label={`${f.base}: ${f.role.label}, ${plural(f.lines, W.line)}`}
                onClick={(e) => { e.stopPropagation(); if (selFile && selFile.path === f.path) go({ level: 'file', file: f.path }); else setSel({ type: 'file', id: f.path }); }}
                onDoubleClick={(e) => { e.stopPropagation(); go({ level: 'file', file: f.path }); }}
                onMouseEnter={() => onHover({ type: 'file', f })} onMouseLeave={() => onHover(null)}>
                {showName && <span className="fn">{f.base}</span>}
                {showRole && <span className="fr">{roleShort(f)}</span>}
                {showMeaning && f.meaning && <span className="fm" style={{ WebkitLineClamp: clamp }}>{f.meaning}</span>}
                {tl.w > 46 && tl.h > 40 && <span className="cm-spine-mini" aria-hidden="true">{f.segments.map((s, i) => <i key={i} style={{ flex: s.end - s.start + 1 }} />)}</span>}
              </button>
            );
          })}
          <svg className="cm-wires" aria-hidden="true">
            <defs><marker id="cm-arr2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" /></marker></defs>
            {wires.map((w) => <path key={w.key} className={`w-${w.dir}`} d={w.d} markerEnd="url(#cm-arr2)" />)}
          </svg>
        </div>
        <div className="cm-side"><h3 className="cm-label">{tr('map.uses', 'What it uses')}</h3><PeerList dir="out" /></div>
      </div>
      <div>
        <h3 className="cm-label">{tr('map.contract', 'The block\'s meaning — its contract')}</h3>
        <div className="cm-cards">
          <button type="button" className="cm-card" onClick={() => go({ level: 'doc', block: b.id, doc: 'acceptance.md' })}>
            <span className="cm-label">{tr('map.acceptance', 'Acceptance')}</span>
            <span className="big">{b.acceptance ? `${b.acceptance.counts.pass}/${b.acceptance.items.length}` : '—'}</span>
            {b.acceptance && <span className="cm-dots">{b.acceptance.items.map((a) => <b key={a.id} className={a.verdict} />)}</span>}
          </button>
          <button type="button" className="cm-card" onClick={() => go({ level: 'doc', block: b.id, doc: 'kpi.md' })}>
            <span className="cm-label">KPI</span><span className="big">{b.kpis.length}</span>
            <p>{b.kpis.slice(0, 3).map((k) => k.name || k.key).join(' · ')}</p>
          </button>
          <button type="button" className="cm-card" onClick={() => go({ level: 'doc', block: b.id, doc: 'tasks.md' })}>
            <span className="cm-label">{tr('map.tasks_cap', 'Tasks')}</span><span className="big">{b.tasks.done}/{b.tasks.open + b.tasks.done}</span>
          </button>
          {b.frame && b.frame.state !== 'none' && (
            <button type="button" className="cm-card" onClick={() => go({ level: 'doc', block: b.id, doc: 'understanding.md' })}>
              <span className="cm-label">{tr('map.frame', 'How the agent understood it')}</span>
              <p><b>{b.frame.state === 'awaiting' ? `⏸ ${tr('map.att_ask', 'waiting for your answer')}` : b.frame.state}</b></p>
              <p className="clamp">{b.frame.treating}</p>
            </button>
          )}
          <button type="button" className="cm-card" onClick={() => go({ level: 'doc', block: b.id, doc: 'mission.md' })}>
            <span className="cm-label">{tr('map.mission', 'Mission')}</span><p className="clamp">{b.meaning}</p>
          </button>
          {b.trajectory && (
            <button type="button" className="cm-card" onClick={() => go({ level: 'doc', block: b.id, doc: 'mission.md' })}>
              <span className="cm-label">{tr('map.trajectory', 'Where it is heading')}</span><p className="clamp">{b.trajectory}</p>
            </button>
          )}
        </div>
      </div>
      <Legend level="block" lens={lens} commit={commit} />
    </div>
  );
}

// ── a file: its parts and its code (level 3) ───────────────────────────────
const codeCache = (STORE['map:code'] = STORE['map:code'] || {});
function splitLines(html) {
  // highlight.js can open a span on one line and close it on another; every
  // row re-opens the spans still open so it renders on its own.
  const out = []; let cur = ''; const open = [];
  const re = /(<span[^>]*>)|(<\/span>)|(\n)|([^<\n]+|<)/g; let m;
  while ((m = re.exec(html))) {
    if (m[1]) { open.push(m[1]); cur += m[1]; }
    else if (m[2]) { open.pop(); cur += m[2]; }
    else if (m[3]) { out.push(cur + '</span>'.repeat(open.length)); cur = open.join(''); }
    else cur += m[4];
  }
  out.push(cur + '</span>'.repeat(open.length));
  return out;
}
const escHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
function highlight(src, p) {
  const lang = /\.(m?js|jsx|cjs)$/.test(p) ? 'javascript' : /\.tsx?$/.test(p) ? 'typescript' : /\.md$/.test(p) ? 'markdown' : /\.json$/.test(p) ? 'json' : null;
  try { if (window.hljs && lang) return splitLines(window.hljs.highlight(src, { language: lang, ignoreIllegals: true }).value); } catch { /* plain text below */ }
  return escHtml(src).split('\n');
}
function useText(kind, key, loader) {
  const [state, setState] = useState(() => codeCache[`${kind}:${key}`] || null);
  useEffect(() => {
    let alive = true;
    const k = `${kind}:${key}`;
    if (codeCache[k]) { setState(codeCache[k]); return undefined; }
    setState(null);
    loader().then((r) => {
      if (!alive) return;
      const v = r?.ok ? { text: r.text ?? r.content ?? '' } : { error: r?.error || 'not loaded' };
      if (r?.ok) codeCache[k] = v;
      setState(v);
    });
    return () => { alive = false; };
  }, [kind, key]);
  return state;
}
function CodePane({ text, path, segs = [], sel, jumps = new Map(), onJump, scrollRef }) {
  const rows = useMemo(() => {
    const r = text != null ? highlight(text, path) : [];
    if (r.length && r[r.length - 1] === '') r.pop();
    return r;
  }, [text, path]);
  const startAt = new Map(segs.map((s, i) => [s.start, i]));
  const range = sel != null && segs[sel] ? segs[sel] : null;
  useEffect(() => {
    if (!range || !scrollRef.current) return;
    const el = scrollRef.current.querySelector(`[data-n="${range.start}"]`);
    if (el) scrollRef.current.scrollTo({ top: Math.max(0, el.offsetTop - 40), behavior: 'smooth' });
  }, [range?.start, rows.length]);
  return (
    <pre className="cm-pre">
      {rows.map((html, i) => {
        const n = i + 1;
        const s = startAt.has(n) && n > 1 ? segs[startAt.get(n)] : null;
        const j = jumps.get(n);
        return (
          <React.Fragment key={n}>
            {s && <div className="cm-segmark">{kindLabel(s.kind)} · {segName(s)} · {plural(s.end - s.start + 1, W.line)}</div>}
            <div className={`cm-ln ${range && n >= range.start && n <= range.end ? 'sel' : ''}`} data-n={n}>
              <span className="no">{n}</span>
              <span dangerouslySetInnerHTML={{ __html: html || ' ' }} />
              {j && <button type="button" className="cm-jump" onClick={() => onJump(j)} title={j.title || tr('map.jump_title', 'Open the file this line connects to')}>{LINK_KIND[j.kind].icon} {j.label || base(j.file)}</button>}
            </div>
          </React.Fragment>
        );
      })}
    </pre>
  );
}
function FileView({ ix, f, seg, setSeg, go }) {
  const b = ix.blockById.get(f.block);
  const code = useText('file', f.path, () => window.SIMA_API.meta.codeMapFile(f.path));
  const scrollRef = useRef(null);
  const fl = fileLinks(f);
  const jumps = new Map();
  for (const x of fl.out) if (x.line && ix.fileByPath.has(x.file) && !jumps.has(x.line)) jumps.set(x.line, x);
  // R-8.16 — a line naming another block's atlas file leads to that block
  for (const d of shownData(f)) {
    if (!d.owner || d.owner === f.block) continue;
    const owner = ix.blockById.get(d.owner)?.title || d.owner;
    for (const n of d.lines) if (!jumps.has(n)) jumps.set(n, { kind: 'file', block: d.owner, label: `${dataName(d.key)} · ${owner}`, title: tr('map.jump_data_title', 'This file belongs to another block — open it') });
  }
  const dataLine = shownData(f).filter((d) => d.owner && d.owner !== f.block);
  const secBefore = new Map();
  for (const sec of f.sections) {
    const i = f.segments.findIndex((x) => x.start >= sec.line);
    if (i >= 0) (secBefore.get(i) || secBefore.set(i, []).get(i)).push(sec.title);
  }
  const maxL = Math.max(1, ...f.segments.map((s) => s.end - s.start + 1));
  const k = Math.min(1.2, 150 / maxL);
  return (
    <div className="cm-file fade-in">
      <header className="cm-bhead" style={{ '--sc': st(b?.status).color }}>
        <div className="cm-row">
          <span className="cm-flag">{f.role.label}</span>
          <StatusChip s={b?.status} />
          <button type="button" className="cm-link" onClick={() => go({ level: 'block', block: f.block })}>{b?.title}</button>
        </div>
        <p className="cm-fpath">{f.path}</p>
        <dl className="cm-what">
          <dt>{tr('map.does', 'What it does')}</dt><dd>{f.meaning || <span className="cm-muted">{tr('map.no_meaning', 'not described — neither in files.md nor in the file header')}</span>}</dd>
          <dt>{tr('map.why_exists', 'Why it exists')}</dt><dd>{f.purpose.text}{f.purpose.from === 'derived' && <span className="cm-muted"> · {tr('map.derived', 'derived from its connections')}</span>}</dd>
          <dt>{tr('map.stack', 'stack')}</dt><dd>{f.stack.runtime}{f.stack.packages.length ? ` · ${f.stack.packages.join(', ')}` : ''}{f.stack.abilities.length ? ` · ${tr('map.touches', 'touches')}: ${f.stack.abilities.join(', ')}` : ''}</dd>
          {dataLine.length > 0 && <><dt>{tr('map.others_data', 'others\' data')}</dt><dd>{dataLine.slice(0, 6).map((d, i) => <React.Fragment key={d.key}>{i > 0 && ', '}{modeText(d.mode)} <button type="button" className="cm-link mono" onClick={() => go({ level: 'block', block: d.owner })}>{dataName(d.key)}</button> <span className="cm-muted">({ix.blockById.get(d.owner)?.title || d.owner})</span></React.Fragment>)}{dataLine.length > 6 ? ` +${dataLine.length - 6}` : ''}</dd></>}
        </dl>
      </header>
      <div className="cm-fbody">
        <div>
          <h3 className="cm-label">{tr('map.anatomy', 'Anatomy: what the file is made of')}</h3>
          <div className="cm-spine">
            {f.segments.map((s, i) => {
              const n = s.end - s.start + 1;
              return (
                <React.Fragment key={i}>
                  {(secBefore.get(i) || []).map((t) => <div key={t} className="cm-sec">{t}</div>)}
                  <button type="button" className={`cm-seg k-${s.kind}`} aria-current={seg === i} style={{ minHeight: Math.round(Math.max(30, Math.min(150, n * k))) }} onClick={() => setSeg(i)}>
                    <span className="bar" />
                    <span>
                      <span className="nm">{segName(s)}</span>{' '}
                      {s.kind !== 'head' && s.kind !== 'consts' && <span className="kd">{kindLabel(s.kind)}{s.exported ? ` · ${tr('map.exported', 'exported')}` : ''}</span>}
                      {s.doc && <span className="dc">{s.doc}</span>}
                    </span>
                    <span className="mt">{plural(n, W.line)}{s.users.length ? <><br />{tr('map.used_n', 'used by')} {s.users.length}</> : null}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>
        <div className="cm-code">
          <div className="cm-code-head"><span>{f.base}</span><span>{code?.error ? `${tr('map.code_failed', 'code did not load')}: ${code.error}` : !code ? tr('map.loading', 'loading…') : seg != null && f.segments[seg] ? `${tr('map.lines', 'lines')} ${f.segments[seg].start}–${f.segments[seg].end}` : plural(f.lines, W.line)}</span></div>
          <div className="cm-code-scroll" ref={scrollRef}>
            {code?.text != null && <CodePane text={code.text} path={f.path} segs={f.segments} sel={seg} jumps={jumps} scrollRef={scrollRef} onJump={(j) => (j.kind === 'file' ? go({ level: 'block', block: j.block }) : go({ level: 'file', file: j.file }))} />}
          </div>
        </div>
      </div>
    </div>
  );
}
function DocView({ ix, b, doc, go }) {
  const r = useText('doc', `${b.id}/${doc}`, () => window.SIMA_API.meta.blockFile(b.id, doc));
  const scrollRef = useRef(null);
  return (
    <div className="cm-file fade-in">
      <header className="cm-bhead" style={{ '--sc': st(b.status).color }}>
        <div className="cm-row"><span className="cm-flag">{tr('map.contract_file', 'Contract')}</span><StatusChip s={b.status} /><button type="button" className="cm-link" onClick={() => go({ level: 'block', block: b.id })}>{b.title}</button></div>
        <p className="cm-fpath">atlas/blocks/{b.id}/{doc}</p>
      </header>
      <div className="cm-code">
        <div className="cm-code-head"><span>{doc}</span><span>{r?.error ? r.error : !r ? tr('map.loading', 'loading…') : ''}</span></div>
        <div className="cm-code-scroll" ref={scrollRef}>{r?.text != null && <CodePane text={r.text} path={doc} scrollRef={scrollRef} />}</div>
      </div>
    </div>
  );
}

// ── legend ──────────────────────────────────────────────────────────────────
function Legend({ level, lens, commit }) {
  return (
    <div className="cm-legend">
      {lens === 'state' && ['done', 'review', 'wip', 'idea'].map((s) => <StatusChip key={s} s={s} />)}
      {lens === 'state' && <span><span className="cm-flag ask">⏸ {tr('map.att_ask_short', 'waiting')}</span> {tr('map.leg_ask', 'the agent waits for your answer on its frame')}</span>}
      {lens === 'change' && !commit && <>
        <span><i className="cm-sw" style={{ background: 'var(--cm-heat-3)' }} />{tr('map.leg_last', 'last change')}</span>
        <span><i className="cm-sw" style={{ background: 'var(--cm-heat-2)' }} />{tr('map.leg_3', 'last 3')}</span>
        <span><i className="cm-sw" style={{ background: 'var(--cm-heat-1)' }} />{tr('map.leg_10', 'last 10')}</span>
      </>}
      {lens === 'change' && commit && <span><i className="cm-sw" style={{ background: 'var(--cm-heat-3)' }} />{tr('map.leg_touched', 'changed by this change')}; <b>+n</b> {tr('map.leg_n', 'files of the block')}, <b>✎</b> {tr('map.leg_meaning', 'its meaning (contract) changed')}</span>}
      <span><i className="cm-sw" style={{ background: 'var(--cm-tile)' }} />{tr('map.leg_tile', 'tile = file, area ≈ lines of code')}</span>
      <span><i className="cm-sw cm-hatch" />{tr('map.leg_tests', 'tests')}</span>
      {level === 'product' && <span className="cm-legend-wide">{tr('map.leg_pin', 'Click a block or a file to pin its connections and scroll the building: arrows lead to the other ends, rooms say how they are connected, and the edges of the view name the ends scrolled away. Click again (or double-click) to go inside.')}</span>}
      {level === 'product' && <span><i className="cm-ln-sw ok" />{tr('map.ls_ok', 'in the code and in the contract')}</span>}
      {level === 'product' && <span><i className="cm-ln-sw code-only" />{tr('map.ls_code_only', 'in the code, but not written in the contract')}</span>}
      {level === 'product' && <span><i className="cm-ln-sw contract-only" />{tr('map.ls_contract_only', 'only in the contract — no code uses it')}</span>}
      {level === 'block' && <span className="cm-legend-wide">{tr('map.leg_block', 'Click a file: arrows show what it takes (amber) and who takes from it (blue); «what exactly?» on a neighbour lists every import, API call and started script between the blocks.')}</span>}
    </div>
  );
}

// ── inspector ───────────────────────────────────────────────────────────────
function CodeRow({ c, ix, go, dir }) {
  const from = ix.fileByPath.get(c.from_file), to = ix.fileByPath.get(c.to_file);
  const names = c.names?.length ? <span className="nm">{c.names.slice(0, 6).join(', ')}{c.names.length > 6 ? ` +${c.names.length - 6}` : ''}</span> : null;
  // R-8.16 — an atlas file: what the line does with it; through the server:
  // the route, then what the route's code uses.
  const target = c.kind === 'file'
    ? <><span className={`cm-dm m-${c.mode}`}>{modeText(c.mode)}</span> <span className="mono">{dataPath(c.names[0])}</span></>
    : c.kind === 'via'
      ? <><span className="mono">{c.route}</span> → <span className="mono">{c.to_file.startsWith('atlas/') ? dataPath(c.to_file.slice(6)) : to?.base || base(c.to_file)}</span>{c.to_file.startsWith('atlas/') ? null : names}</>
      : <><span className="mono">{to?.base || base(c.to_file)}</span>{names}</>;
  return (
    <li>
      <button type="button" onClick={() => go({ level: 'file', file: c.from_file })} title={tr('map.open_file', 'Open the file')}>
        <span className="lk">{LINK_KIND[c.kind].icon}</span>
        <span className="t"><b className="mono">{from?.base || base(c.from_file)}{c.line ? `:${c.line}` : ''}</b> → {target}</span>
      </button>
    </li>
  );
}
function LinkCard({ ix, l, go, setSel, jump }) {
  const a = ix.blockById.get(l.from), z = ix.blockById.get(l.to);
  const byKind = Object.fromEntries(LINK_KINDS.map((k) => [k, []]));
  for (const c of l.code) (byKind[c.kind] || (byKind[c.kind] = [])).push(c);
  return (
    <div className="cm-isec">
      <span className="cm-label">{tr('map.link', 'Connection')}</span>
      <h3 className="cm-ititle">{a?.title} → {z?.title}</h3>
      <p className={`cm-lstate ls-${linkState(l)}`}>{linkStateText(l)}{l.tests_only ? ` · ${tr('map.tests_only', 'only tests use it')}` : ''}</p>
      {(l.declared_in || []).length > 0 && (
        <p className="cm-itext cm-muted">{tr('map.declared_in', 'Written in')}: {(l.declared_in || []).map((d) => (d === 'calls' ? tr('map.declared_calls', 'calls.md — a call while it works (not the build order)') : tr('map.declared_deps', 'depends_on.md — a dependency (it orders building)'))).join('; ')}.</p>
      )}
      <p className="cm-itext">{tr('map.link_read', 'Reads as')}: «{a?.title} {tr('map.link_uses', 'uses')} {z?.title}». {linkSummary(l)}.</p>
      {LINK_KINDS.map((k) => byKind[k].length > 0 && (
        <div key={k}>
          <span className="cm-label">{LINK_KIND[k].icon} {tr(LINK_KIND[k].key, LINK_KIND[k].fb)}</span>
          {k === 'file' && <p className="cm-itext cm-muted">{tr('map.file_note', 'The file belongs to the block the connection leads to: it is listed in that block\'s files.md, lies in a block folder (the block store), or only that block\'s code writes it.')}</p>}
          {k === 'via' && <p className="cm-itext cm-muted">{tr('map.via_note', 'A call to a server route whose code uses this block — the server carries the connection, the contract names it.')}</p>}
          <ul className="cm-list">{byKind[k].map((c, i) => <CodeRow key={i} c={c} ix={ix} go={go} />)}</ul>
        </div>
      ))}
      {!l.code.length && <p className="cm-itext cm-muted">{tr('map.link_no_code', 'No import, API call, started script or shared atlas file backs this dependency. Either the code does not need it yet, or the connection goes a way the map does not see (a shared format, a person) — worth checking the contract.')}</p>}
      <div className="cm-row" style={{ marginTop: 8 }}>
        <button type="button" className="cm-btn" onClick={() => jump(l.from)}>{a?.title}</button>
        <button type="button" className="cm-btn" onClick={() => jump(l.to)}>{z?.title}</button>
        <button type="button" className="cm-btn" onClick={() => setSel(null)}>{tr('map.unpin', 'Unpin')}</button>
      </div>
    </div>
  );
}
function BlockConnections({ ix, b, sel, setSel }) {
  const ls = ix.linksOf.get(b.id) || [];
  const group = (dir) => ls.filter((l) => (dir === 'out' ? l.from === b.id : l.to === b.id));
  return ['out', 'in'].map((dir) => (
    <div key={dir} className="cm-isec">
      <span className="cm-label">{dir === 'out' ? tr('map.uses', 'What it uses') : tr('map.used_by', 'Who uses it')} · {group(dir).length}</span>
      <ul className="cm-list">
        {group(dir).map((l) => {
          const other = ix.blockById.get(dir === 'out' ? l.to : l.from);
          const on = sel?.type === 'link' && sel.from === l.from && sel.to === l.to;
          return (
            <li key={`${l.from}→${l.to}`}>
              <button type="button" className={on ? 'on' : ''} onClick={() => setSel(on ? { type: 'block', id: b.id } : { type: 'link', from: l.from, to: l.to })}>
                <i className={`cm-ln-sw ${linkState(l)}`} />
                <span className="t">{other?.title}</span>
                <span className="s">{linkSummary(l)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  ));
}
function FileCard({ ix, f, go, setSel, compact }) {
  const fl = fileLinks(f);
  const uniq = (arr) => { const s = new Set(); return arr.filter((x) => (s.has(`${x.kind}:${x.file}`) ? false : s.add(`${x.kind}:${x.file}`))); };
  const row = (x) => {
    const g = ix.fileByPath.get(x.file);
    if (!g) return null;
    return (
      <li key={`${x.kind}:${x.file}`}>
        <button type="button" onClick={() => (compact ? setSel({ type: 'file', id: g.path }) : go({ level: 'file', file: g.path }))}>
          <span className="lk" title={tr(LINK_KIND[x.kind].key, LINK_KIND[x.kind].fb)}>{LINK_KIND[x.kind].icon}</span>
          <span className="t"><span className="mono">{g.base}</span>{x.names?.length ? <span className="nm">{x.names.slice(0, 5).join(', ')}{x.names.length > 5 ? ` +${x.names.length - 5}` : ''}</span> : null}</span>
          <span className="s">{g.block === f.block ? tr('map.this_block', 'this block') : ix.blockById.get(g.block)?.title}{x.line ? ` · ${tr('map.line_short', 'l.')} ${x.line}` : ''}</span>
        </button>
      </li>
    );
  };
  const last = f.last != null ? ix.map.history[f.last] : null;
  return (
    <>
      <div className="cm-isec">
        <span className="cm-label">{f.role.label} · {ix.blockById.get(f.block)?.title}</span>
        <h3 className="cm-ititle mono">{f.base}</h3>
        <dl className="cm-what">
          <dt>{tr('map.does', 'What it does')}</dt><dd>{f.meaning || <span className="cm-muted">{tr('map.no_meaning', 'not described — neither in files.md nor in the file header')}</span>}</dd>
          <dt>{tr('map.why_exists', 'Why it exists')}</dt><dd>{f.purpose.text}</dd>
          <dt>{tr('map.stack', 'stack')}</dt><dd>{f.stack.runtime}{f.stack.packages.length ? ` · ${f.stack.packages.join(', ')}` : ''}</dd>
          {f.stack.abilities.length > 0 && <><dt>{tr('map.touches', 'touches')}</dt><dd>{f.stack.abilities.join(', ')}</dd></>}
          {f.runs.length > 0 && <><dt>{tr('map.started_by', 'started by')}</dt><dd>{f.runs.map((r) => (r.kind === 'npm' ? `npm run ${r.name}` : r.kind === 'nightly' ? `nightly «${r.name}»` : r.kind === 'page' ? tr('map.the_page', 'the canvas page') : `MCP «${r.name}»`)).join(', ')}</dd></>}
          <dt>{tr('map.size', 'size')}</dt><dd>{plural(f.lines, W.line)} · {plural(f.segments.length, W.part)}</dd>
          {last && <><dt>{tr('map.changed', 'changed')}</dt><dd>{shortSubject(last.subject).tag}, {dateRu(last.date)}</dd></>}
        </dl>
        {compact && <div className="cm-row" style={{ marginTop: 8 }}><button type="button" className="cm-btn primary" onClick={() => go({ level: 'file', file: f.path })}>{tr('map.open_file', 'Open the file')} ↘</button><button type="button" className="cm-btn" onClick={() => setSel(null)}>{tr('map.unpin', 'Unpin')}</button></div>}
      </div>
      <div className="cm-isec">
        <span className="cm-label">{tr('map.takes', 'It takes from')} · {uniq(fl.out).length}</span>
        {fl.out.length ? <ul className="cm-list">{uniq(fl.out).map(row)}</ul> : <p className="cm-itext cm-muted">{tr('map.takes_none', 'Nothing from the project.')}</p>}
      </div>
      <div className="cm-isec">
        <span className="cm-label">{tr('map.taken_by', 'Who takes from it')} · {uniq(fl.in).length}</span>
        {fl.in.length ? <ul className="cm-list">{uniq(fl.in).map(row)}</ul> : <p className="cm-itext cm-muted">{f.runs.length ? tr('map.taken_by_runner', 'No file — it is started directly (see «started by»).') : tr('map.taken_by_none', 'Nobody.')}</p>}
      </div>
      {shownData(f).length > 0 && <DataSection ix={ix} f={f} setSel={setSel} />}
    </>
  );
}
// R-8.16 — the atlas files a file reads and writes, each with its owner: a
// file another block owns is a connection to that block.
function DataSection({ ix, f, setSel }) {
  const owned = (d) => d.owner && d.owner !== f.block;
  const rows = [...shownData(f)].sort((x, y) => Number(owned(y)) - Number(owned(x)) || x.key.localeCompare(y.key));
  return (
    <div className="cm-isec">
      <span className="cm-label">{tr('map.data_title', 'Atlas files it reads and writes')} · {rows.length}</span>
      <ul className="cm-list">
        {rows.map((d) => (
          <li key={d.key}>
            <button type="button" disabled={!owned(d)} onClick={() => owned(d) && setSel({ type: 'link', from: f.block, to: d.owner })} title={owned(d) ? tr('map.data_link_title', 'Show the connection to the block that owns this file') : ''}>
              <span className="lk">▤</span>
              <span className="t"><span className={`cm-dm m-${d.mode}`}>{modeText(d.mode)}</span> <span className="mono">{dataPath(d.key)}</span>
                <span className="nm">{!d.owner ? tr('map.no_owner', 'no owner') : d.owner === f.block ? tr('map.this_block', 'this block') : ix.blockById.get(d.owner)?.title || d.owner} · {tr('map.line_short', 'l.')} {d.line}</span></span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
// R-8.16 — the atlas files a block owns and who else uses them.
function BlockData({ ix, b }) {
  const others = (d) => [...new Set([...d.writers, ...d.readers])].filter((x) => x !== b.id);
  const mine = (ix.map.data || []).filter((d) => d.owner === b.id && others(d).length > 0);
  if (!mine.length) return null;
  return (
    <div className="cm-isec">
      <span className="cm-label">▤ {tr('map.block_data', 'Its data other blocks use')} · {mine.length}</span>
      <ul className="cm-list">
        {mine.map((d) => (
          <li key={d.key}>
            <div className="row">
              <span className="t mono">{dataPath(d.key)}</span>
              <span className="s">{others(d).map((x) => ix.blockById.get(x)?.title || x).slice(0, 3).join(', ')}{others(d).length > 3 ? ` +${others(d).length - 3}` : ''}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
function BlockCard({ ix, b, sel, setSel, go, full }) {
  const acc = b.acceptance;
  const hist = ix.map.history.filter((c) => c.blocks[b.id] || c.contracts.includes(b.id)).slice(0, 5);
  return (
    <>
      <div className="cm-isec">
        <span className="cm-label">{tr('map.block', 'Block')} · {ix.layerName.get(b.layer)}</span>
        <h3 className="cm-ititle">{b.title}</h3>
        <div className="cm-row"><StatusChip s={b.status} /><Flags b={b} /></div>
        {!full && b.want && <p className="cm-itext"><b>{tr('map.why', 'Why')}:</b> {tr('map.want_lc', 'I want')} {b.want}{b.soThat ? `, ${tr('map.so_that', 'so that')} ${b.soThat}` : ''}.</p>}
        {!full && b.meaning && <p className="cm-itext">{b.meaning}</p>}
        <div className="cm-row" style={{ marginTop: 8 }}>
          {!full && <button type="button" className="cm-btn primary" onClick={() => go({ level: 'block', block: b.id })}>{tr('map.enter', 'Go inside')} ↘</button>}
          <button type="button" className="cm-btn" onClick={() => window.dispatchEvent(new CustomEvent('sima-map-show-on-graph', { detail: { id: b.id } }))}>{tr('map.on_graph', 'On the graph')}</button>
        </div>
      </div>
      <BlockConnections ix={ix} b={b} sel={sel} setSel={setSel} />
      <BlockData ix={ix} b={b} />
      {b.frame && b.frame.state === 'awaiting' && (
        <div className="cm-isec"><span className="cm-label">⏸ {tr('map.att_ask', 'waiting for your answer')}</span><p className="cm-itext">{tr('map.ask_text', 'The agent declared how it understood the block and writes no code until you answer «right» or «not quite» on the block\'s Overview.')}</p>{b.frame.treating && <p className="cm-itext"><i>«{b.frame.treating}»</i></p>}</div>
      )}
      {full && (
        <div className="cm-isec"><span className="cm-label">{tr('map.acceptance', 'Acceptance')}</span>
          {acc ? <div className="cm-acc">{acc.items.map((a) => <div key={a.id} className="a"><code>{a.id}</code><i className={a.verdict} title={a.verdict} /><span>{a.text}</span></div>)}</div> : <p className="cm-itext">{tr('map.no_acceptance', 'no acceptance')}</p>}
        </div>
      )}
      {hist.length > 0 && (
        <div className="cm-isec"><span className="cm-label">{tr('map.changed_in', 'Changed in')}</span>
          <ul className="cm-list">{hist.map((c) => { const s = shortSubject(c.subject); return <li key={c.hash}><div className="row"><span className="t"><b className="mono">{s.tag}</b> {s.text}</span><span className="s">{dateRu(c.date)}</span></div></li>; })}</ul>
        </div>
      )}
    </>
  );
}
function ProductCard({ ix, setLens, setCommit, go }) {
  const m = ix.map;
  const lines = ix.files.reduce((n, f) => n + f.lines, 0);
  const counts = {};
  for (const b of m.blocks) counts[b.status] = (counts[b.status] || 0) + 1;
  const order = ['done', 'review', 'wip', 'idea', 'broken'].filter((s) => counts[s]);
  const need = m.blocks.flatMap((b) => attention(b).filter((a) => a.k === 'ask' || a.k === 'fail').map((a) => ({ b, a })));
  const unk = m.blocks.filter((b) => attention(b).some((a) => a.k === 'unk'));
  const ls = { ok: 0, 'code-only': 0, 'contract-only': 0 };
  for (const l of m.links) ls[linkState(l)] += 1;
  return (
    <>
      <div className="cm-isec">
        <span className="cm-label">{tr('map.product', 'Product')}</span>
        <h3 className="cm-ititle">{m.product.name}</h3>
        <p className="cm-itext">{m.product.goal}</p>
        <dl className="cm-kv"><dt>{tr('map.blocks', 'Blocks')}</dt><dd>{m.blocks.length}</dd><dt>{tr('map.files', 'Code files')}</dt><dd>{ix.files.length}</dd><dt>{tr('map.lines_cap', 'Lines of code')}</dt><dd>{lines.toLocaleString('ru-RU')}</dd></dl>
        <div className="cm-bar" role="img" aria-label={order.map((s) => `${stLabel(s)}: ${counts[s]}`).join(', ')}>{order.map((s) => <span key={s} style={{ flex: counts[s], background: st(s).color }} />)}</div>
        <div className="cm-row" style={{ marginTop: 8 }}>{order.map((s) => <React.Fragment key={s}><StatusChip s={s} /><span className="mono cm-muted">{counts[s]}</span></React.Fragment>)}</div>
      </div>
      <div className="cm-isec">
        <span className="cm-label">{tr('map.need_you', 'Needs you')}</span>
        {need.length ? <ul className="cm-list">{need.map(({ b, a }) => <li key={b.id + a.k}><button type="button" onClick={() => go({ level: 'block', block: b.id })}><span className={`cm-flag ${a.k === 'ask' ? 'ask' : ''}`}>{a.icon}</span><span className="t">{b.title} — {a.text}</span></button></li>)}</ul> : <p className="cm-itext">{tr('map.need_none', 'Nothing waits for your answer.')}</p>}
        {unk.length > 0 && <p className="cm-itext"><span className="cm-flag">?</span> {tr('map.unk_text', 'Nothing can check acceptance of')} {unk.map((b) => b.title).join(', ')}.</p>}
      </div>
      <div className="cm-isec">
        <span className="cm-label">{tr('map.connections', 'Connections between blocks')}</span>
        <ul className="cm-list">
          <li><div className="row"><i className="cm-ln-sw ok" /><span className="t">{tr('map.ls_ok', 'in the code and in the contract')}</span><span className="s">{ls.ok}</span></div></li>
          <li><div className="row"><i className="cm-ln-sw code-only" /><span className="t">{tr('map.ls_code_only', 'in the code, but not written in the contract')}</span><span className="s">{ls['code-only']}</span></div></li>
          <li><div className="row"><i className="cm-ln-sw contract-only" /><span className="t">{tr('map.ls_contract_only', 'only in the contract — no code uses it')}</span><span className="s">{ls['contract-only']}</span></div></li>
          <li><div className="row"><span className="lk">▤</span><span className="t">{tr('map.ls_data', 'of the ones in code — through atlas files')}</span><span className="s">{m.links.filter((l) => l.code.some((c) => c.kind === 'file')).length}</span></div></li>
        </ul>
        {(m.data || []).some((d) => !d.owner) && <p className="cm-itext cm-muted">▤ {tr('map.unowned', 'Atlas files nobody owns — no files.md lists them, and several blocks or none write them')}: <span className="mono">{m.data.filter((d) => !d.owner).map((d) => dataPath(d.key)).join(', ')}</span>.</p>}
      </div>
      {m.history.length > 0 && (
        <div className="cm-isec">
          <span className="cm-label">{tr('map.recent', 'Recent changes')}</span>
          <ul className="cm-list">{m.history.slice(0, 5).map((c) => { const s = shortSubject(c.subject); return <li key={c.hash}><button type="button" onClick={() => { setLens('change'); setCommit(c.i); }}><span className="t"><b className="mono">{s.tag}</b> {s.text}</span><span className="s">{dateRu(c.date)}</span></button></li>; })}</ul>
        </div>
      )}
      {!m.source.code_graph && <div className="cm-isec"><p className="cm-itext">{tr('map.no_code_graph', 'The code graph of this project is not built yet: the map shows blocks and contracts only. Run node scripts/build_code_graph.mjs.')}</p></div>}
      {!m.source.git && <div className="cm-isec"><p className="cm-itext cm-muted">{tr('map.no_git', 'No git history here: the «Changes» lens is empty.')}</p></div>}
    </>
  );
}
function CommitCard({ ix, c, go }) {
  const s = shortSubject(c.subject);
  const by = Object.entries(c.blocks).sort((a, b) => b[1] - a[1]);
  return (
    <>
      <div className="cm-isec">
        <span className="cm-label">{tr('map.change', 'Change')} · {dateRu(c.date)}</span>
        <h3 className="cm-ititle">{s.tag}</h3>
        <p className="cm-itext">{s.text}</p>
        <dl className="cm-kv"><dt>{tr('map.files', 'Code files')}</dt><dd>{c.files.length}</dd><dt>{tr('map.blocks_code', 'Blocks with code')}</dt><dd>{by.length}</dd><dt>{tr('map.blocks_meaning', 'Blocks whose meaning changed')}</dt><dd>{c.contracts.length}</dd></dl>
      </div>
      <div className="cm-isec">
        <span className="cm-label">{tr('map.footprint', 'Footprint by block')}</span>
        <ul className="cm-list">{by.map(([id, n]) => <li key={id}><button type="button" onClick={() => go({ level: 'block', block: id })}><span className="t">{ix.blockById.get(id)?.title}</span><span className="s">+{n}{c.contracts.includes(id) ? ' ✎' : ''}</span></button></li>)}</ul>
      </div>
      <div className="cm-isec">
        <span className="cm-label">{tr('map.files', 'Code files')}</span>
        <ul className="cm-list">{c.files.map((p) => { const f = ix.fileByPath.get(p); return f && <li key={p}><button type="button" onClick={() => go({ level: 'file', file: p })}><span className="t mono">{f.base}</span><span className="s">{ix.blockById.get(f.block)?.title}</span></button></li>; })}</ul>
      </div>
    </>
  );
}

// ── tooltip ─────────────────────────────────────────────────────────────────
// Hover goes through a small bus and the tooltip moves itself, so pointing at
// tiles never re-renders the building.
const hoverBus = { h: null, subs: new Set(), set(h) { this.h = h; this.subs.forEach((fn) => fn(h)); } };
const mouse = { x: 0, y: 0 };
function tipContent(h) {
  if (h.type === 'block') {
    const b = h.b;
    return <><b>{b.title}</b><code>{b.id} · {stLabel(b.status)} · {b.lines ? fmtLines(b.lines) : tr('map.no_code', 'no code')}</code>{(b.want || b.meaning) && <p>{b.want ? `${tr('map.want', 'I want')} ${b.want}` : b.meaning}</p>}{b.stack.length > 0 && <p className="dim">{b.stack.join(' · ')}</p>}</>;
  }
  const f = h.f;
  return <><b>{f.base}</b><code>{f.role.label} · {plural(f.lines, W.line)} · {f.stack.runtime}</code>{f.meaning && <p><span className="dim">{tr('map.does', 'What it does')}:</span> {f.meaning.length > 200 ? `${f.meaning.slice(0, 200)}…` : f.meaning}</p>}<p><span className="dim">{tr('map.why_exists', 'Why it exists')}:</span> {f.purpose.text}</p></>;
}
function Tip() {
  const [h, setH] = useState(null);
  const ref = useRef(null);
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const place = () => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth, hh = el.offsetHeight;
    let x = mouse.x + 14, y = mouse.y + 14;
    if (x + w > window.innerWidth - 8) x = mouse.x - w - 14;
    if (y + hh > window.innerHeight - 8) y = mouse.y - hh - 14;
    el.style.left = `${Math.max(8, x)}px`;
    el.style.top = `${Math.max(8, y)}px`;
  };
  useEffect(() => {
    const on = (x) => setH(x);
    hoverBus.subs.add(on);
    const move = (e) => { mouse.x = e.clientX; mouse.y = e.clientY; place(); };
    window.addEventListener('mousemove', move, { passive: true });
    return () => { hoverBus.subs.delete(on); window.removeEventListener('mousemove', move); };
  }, []);
  useLayoutEffect(place, [h]);
  if (!h || !fine) return null;
  return <div className="cm-tip" ref={ref}>{tipContent(h)}</div>;
}

// ── the map ─────────────────────────────────────────────────────────────────
function CodeMap() {
  const { map, error } = useCodeMap();
  const ix = useMemo(() => (map ? indexMap(map) : null), [map]);
  const [loc, setLoc] = useMapState('loc', { level: 'product' });
  const [sel, setSel] = useMapState('sel', null);
  const [lens, setLens] = useMapState('lens', 'state');
  const [commitI, setCommit] = useMapState('commit', null);
  const [seg, setSeg] = useMapState('seg', null);
  const [q, setQ] = useState('');
  const [hit, setHit] = useState(0);
  const qRef = useRef(null);
  const commit = ix && lens === 'change' && commitI != null ? ix.map.history[commitI] || null : null;

  const go = (next) => {
    setSel(null);
    setSeg(next.seg ?? null);
    setLoc(next);
  };
  useEffect(() => {
    const onKey = (e) => {
      if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'Escape') {
        if (sel) setSel(null);
        else if (loc.level === 'file' || loc.level === 'doc') go({ level: 'block', block: loc.block || ix?.fileByPath.get(loc.file)?.block });
        else if (loc.level === 'block') go({ level: 'product' });
      }
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); qRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // search (hooks stay above the early return below)
  const INDEX = useMemo(() => (!ix ? [] : [
    ...ix.map.blocks.map((b) => ({ k: tr('map.s_block', 'block'), n: b.title, s: `${b.id} · ${b.want || b.meaning}`, hay: `${b.title} ${b.id} ${b.want} ${b.meaning}`.toLowerCase(), to: { level: 'block', block: b.id }, w: 0 })),
    ...ix.files.map((f) => ({ k: tr('map.s_file', 'file'), n: f.path, s: `${ix.blockById.get(f.block)?.title} · ${f.meaning || f.purpose.text}`, hay: `${f.path} ${f.meaning} ${f.purpose.text}`.toLowerCase(), to: { level: 'file', file: f.path }, w: 1 })),
    ...ix.files.flatMap((f) => f.segments.map((s, i) => ({ s0: s, k: kindLabel(s.kind), n: s.name, s: `${f.path}:${s.start}${s.doc ? ` · ${s.doc}` : ''}`, hay: `${s.name} ${s.doc}`.toLowerCase(), to: { level: 'file', file: f.path, seg: i }, w: 2 }))).filter((x) => x.s0.kind !== 'head' && x.s0.kind !== 'consts'),
  ]), [ix]);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return INDEX.map((x) => { const nm = x.n.toLowerCase(); return { x, score: nm === s ? 0 : nm.startsWith(s) ? 1 : nm.includes(s) ? 2 : x.hay.includes(s) ? 3 : 9 }; })
      .filter((h) => h.score < 9).sort((a, b) => a.score - b.score || a.x.w - b.x.w || a.x.n.length - b.x.n.length).slice(0, 14).map((h) => h.x);
  }, [q, INDEX]);

  if (!ix) {
    return <div className="code-map cm-loading">{error ? `${tr('map.unavailable', 'the map server did not answer')}: ${error}` : tr('map.loading_map', 'Building the map…')}</div>;
  }
  // A place that no longer exists (another project, a removed block) falls back to the top.
  const block = loc.block ? ix.blockById.get(loc.block) : null;
  const file = loc.file ? ix.fileByPath.get(loc.file) : null;
  const level = (loc.level === 'block' && block) ? 'block' : (loc.level === 'file' && file) ? 'file' : (loc.level === 'doc' && block) ? 'doc' : 'product';
  const curBlock = level === 'file' ? ix.blockById.get(file.block) : block;

  const pick = (h) => { setQ(''); go(h.to); };

  const crumbs = [<button key="p" type="button" onClick={() => go({ level: 'product' })}>{ix.map.product.name}</button>];
  if (curBlock) {
    crumbs.push(<span key="s1" className="sep">›</span>, <span key="l" className="cm-muted">{ix.layerName.get(curBlock.layer)}</span>);
    crumbs.push(<span key="s2" className="sep">›</span>, level === 'block' ? <span key="b" className="here">{curBlock.title}</span> : <button key="b" type="button" onClick={() => go({ level: 'block', block: curBlock.id })}>{curBlock.title}</button>);
  }
  if (level === 'file') {
    crumbs.push(<span key="s3" className="sep">›</span>, seg == null ? <span key="f" className="here mono">{file.base}</span> : <button key="f" type="button" className="mono" onClick={() => setSeg(null)}>{file.base}</button>);
    if (seg != null && file.segments[seg]) crumbs.push(<span key="s4" className="sep">›</span>, <span key="g" className="here mono">{segName(file.segments[seg])}</span>);
  }
  if (level === 'doc') crumbs.push(<span key="s5" className="sep">›</span>, <span key="d" className="here mono">{loc.doc}</span>);
  if (level === 'product') crumbs[0] = <span key="p" className="here">{ix.map.product.name}: {tr('map.whole', 'the whole product')}</span>;

  const scrollToRoom = (id) => {
    const el = document.querySelector(`.code-map [data-room="${CSS.escape(id)}"]`);
    if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  let inspector;
  if (level === 'product') {
    if (sel?.type === 'link') { const l = ix.map.links.find((x) => x.from === sel.from && x.to === sel.to); inspector = l ? <LinkCard ix={ix} l={l} go={go} setSel={setSel} jump={scrollToRoom} /> : null; }
    else if (sel?.type === 'block') inspector = <BlockCard ix={ix} b={ix.blockById.get(sel.id)} sel={sel} setSel={setSel} go={go} />;
    else if (sel?.type === 'file' && ix.fileByPath.get(sel.id)) inspector = <FileCard ix={ix} f={ix.fileByPath.get(sel.id)} go={go} setSel={setSel} compact />;
    else if (commit) inspector = <CommitCard ix={ix} c={commit} go={go} />;
    else inspector = <ProductCard ix={ix} setLens={setLens} setCommit={setCommit} go={go} />;
  } else if (level === 'block') {
    if (sel?.type === 'link') { const l = ix.map.links.find((x) => x.from === sel.from && x.to === sel.to); inspector = l ? <LinkCard ix={ix} l={l} go={go} setSel={setSel} jump={(id) => go({ level: 'block', block: id })} /> : null; }
    else if (sel?.type === 'file' && ix.fileByPath.get(sel.id)) inspector = <FileCard ix={ix} f={ix.fileByPath.get(sel.id)} go={go} setSel={setSel} compact />;
    else inspector = <BlockCard ix={ix} b={block} sel={sel} setSel={setSel} go={go} full />;
  } else if (level === 'file') {
    const s = seg != null ? file.segments[seg] : null;
    inspector = (
      <>
        {s && (
          <div className="cm-isec">
            <span className="cm-label">{kindLabel(s.kind)}{s.exported ? ` · ${tr('map.exported', 'exported')}` : ''}</span>
            <h3 className="cm-ititle mono">{segName(s)}</h3>
            {s.doc ? <p className="cm-itext">{s.doc}</p> : <p className="cm-itext cm-muted">{tr('map.no_doc', 'No comment above this part.')}</p>}
            <dl className="cm-kv"><dt>{tr('map.lines', 'lines')}</dt><dd>{s.start}–{s.end}</dd></dl>
            {s.users.length > 0 && <><span className="cm-label">{tr('map.used_by_files', 'Used by')}</span><ul className="cm-list">{s.users.map((p) => { const g = ix.fileByPath.get(p); return g && <li key={p}><button type="button" onClick={() => go({ level: 'file', file: p })}><span className="t mono">{g.base}</span><span className="s">{g.block === file.block ? tr('map.this_block', 'this block') : ix.blockById.get(g.block)?.title}</span></button></li>; })}</ul></>}
          </div>
        )}
        <FileCard ix={ix} f={file} go={go} setSel={setSel} />
      </>
    );
  } else {
    inspector = <BlockCard ix={ix} b={block} sel={sel} setSel={setSel} go={go} full />;
  }

  const onHover = (h) => hoverBus.set(h);

  return (
    <div className="code-map" onMouseLeave={() => hoverBus.set(null)}>
      <div className="cm-top">
        <div className="cm-row cm-toprow">
          <div className="cm-lens" role="group" aria-label={tr('map.lens_label', 'What colour shows')}>
            <button type="button" aria-pressed={lens === 'state'} onClick={() => { setLens('state'); setCommit(null); }}>{tr('map.lens_state', 'State')}</button>
            <button type="button" aria-pressed={lens === 'change'} onClick={() => setLens('change')}>{tr('map.lens_change', 'Changes')}</button>
          </div>
          <div className="cm-search">
            <input ref={qRef} type="search" value={q} placeholder={tr('map.search', 'Find a block, file or function…')} aria-label={tr('map.search', 'Find a block, file or function…')}
              onChange={(e) => { setQ(e.target.value); setHit(0); }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setHit((h) => Math.min(h + 1, hits.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setHit((h) => Math.max(h - 1, 0)); }
                if (e.key === 'Enter' && hits[hit]) { e.preventDefault(); pick(hits[hit]); }
                if (e.key === 'Escape') { setQ(''); e.currentTarget.blur(); }
              }} />
            {q.trim() && (
              <div className="cm-results" role="listbox">
                {hits.length ? hits.map((h, i) => (
                  <button key={i} type="button" role="option" aria-selected={i === hit} onMouseEnter={() => setHit(i)} onClick={() => pick(h)}>
                    <span className="rk">{h.k}</span><span className={`rn ${h.w ? 'mono' : ''}`}>{h.n}</span><span className="rs">{h.s.length > 120 ? `${h.s.slice(0, 120)}…` : h.s}</span>
                  </button>
                )) : <div className="cm-muted" style={{ padding: 10 }}>{tr('map.nothing_found', 'Nothing found.')}</div>}
              </div>
            )}
          </div>
        </div>
        <nav className="cm-crumbs" aria-label={tr('map.where', 'Where you are on the map')}>{crumbs}</nav>
        {lens === 'change' && ix.map.history.length > 0 && (
          <div className="cm-commits">
            <button type="button" aria-pressed={commitI == null} onClick={() => setCommit(null)}>{tr('map.freshness', 'Freshness: all recent')}</button>
            {ix.map.history.slice(0, 12).map((c) => { const s = shortSubject(c.subject); return <button key={c.hash} type="button" aria-pressed={commitI === c.i} title={c.subject} onClick={() => setCommit(c.i)}><b>{s.tag}</b> · {dateRu(c.date)} · {plural(c.files.length, W.file)}</button>; })}
          </div>
        )}
      </div>
      <div className="cm-work">
        <section className="cm-stage" aria-live="polite">
          {level === 'product' && <Building ix={ix} lens={lens} commit={commit} sel={sel} setSel={setSel} go={go} onHover={onHover} />}
          {level === 'block' && <div className="cm-scroll"><BlockView ix={ix} b={block} lens={lens} commit={commit} sel={sel} setSel={setSel} go={go} onHover={onHover} /></div>}
          {level === 'file' && <div className="cm-scroll"><FileView ix={ix} f={file} seg={seg} setSeg={setSeg} go={go} /></div>}
          {level === 'doc' && <div className="cm-scroll"><DocView ix={ix} b={block} doc={loc.doc} go={go} /></div>}
        </section>
        <aside className="cm-insp" aria-label={tr('map.inspector', 'What this is')}>{inspector}</aside>
      </div>
      <Tip />
    </div>
  );
}

window.CodeMap = CodeMap;
})();

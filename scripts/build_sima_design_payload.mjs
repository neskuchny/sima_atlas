#!/usr/bin/env node
// Adapter: atlas/graph.json + projects + per-block markdown → SIMA Atlas
// design data shape (window.SIMA_DATA).
//
// Multi-tenant: pass `--client <id>` to read from atlas/clients/<id>/ if
// that directory exists; otherwise falls back to the main atlas/ tree.
// Production deploys can ship one repo + per-client data namespaces.
//
// Output:
//   - default: writes atlas/design_payload.json (or
//     atlas/clients/<id>/design_payload.json)
//   - --stdout: prints JSON to stdout (no write); useful for piping into
//     atlas_api_server response
//
// Mapping rules (graph.blocks[i] → modules[i]):
//   id            ← block.id
//   title         ← block.title
//   tag           ← block.id without "b." prefix
//   layer         ← layerToVisualLayer(block.layer): mapping below
//   status        ← statusToVisualStatus(block.status): below
//   priority      ← block.mvp ? 1 : (status==='wip'?2 : 3)
//   size          ← block.depends_on.length ≥ 4 ? 'lg' : ≥ 2 ? 'md' : 'sm'
//   x,y           ← auto-layout grid by layer (overridable later)
//   warn          ← block.status_reason if status maps to fail/desync
//
// Edges: graph.blocks[i].depends_on → edge {from: depender, to: dep, kind}.
// Tasks: parsed from atlas/blocks/<id>/tasks.md (`- [ ] T1: ...`).
// History: tail of atlas/transitions.log + recent agent_invocation lines.
// Lessons: atlas/operator_profile/lessons.json.
// Agents: hardcoded reference list (Claude Code / Cursor / Codex / SIMA Core).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

// ─────────────────────────────────────────── status / layer mapping
const STATUS_MAP = {
  done: 'done',
  wip: 'progress',
  review: 'progress',
  idea: 'todo',
  broken: 'fail',
};
const LAYER_MAP = {
  user: 'frontend',
  front: 'frontend',
  logic: 'logic',
  ai: 'logic',
  data: 'backend',
  ext: 'backend',
  testing: 'tests',
  content: 'backend',
};

// Visual layer order on the canvas (top → bottom)
const LAYER_LANES = [
  { id: 'frontend', name: 'Frontend', y: 540 },
  { id: 'logic',    name: 'Logic',    y: 320 },
  { id: 'backend',  name: 'Backend',  y: 100 },
  { id: 'tests',    name: 'Tests',    y: 760 },
];

function tagFromId(blockId) {
  return String(blockId || '').replace(/^b\./, '');
}

function autoSize(block) {
  const deps = (block.depends_on || []).length;
  const files = (block.files || []).length;
  if (deps >= 4 || files >= 10) return 'lg';
  if (deps >= 2 || files >= 4) return 'md';
  return 'sm';
}

function autoPriority(block) {
  if (block.mvp) return 1;
  if (block.status === 'wip' || block.status === 'review') return 2;
  if (block.status === 'broken') return 1;
  return 3;
}

// ─────────────────────────────────────────── per-block markdown helpers
function readBlockFile(atlasRoot, blockId, name) {
  const p = path.join(atlasRoot, 'blocks', blockId, name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

function shortMissionExcerpt(text) {
  const lines = String(text || '').split(/\r?\n/);
  // Skip headers, take first non-empty paragraph
  let buf = [];
  for (const l of lines) {
    if (l.startsWith('#')) { if (buf.length) break; continue; }
    if (!l.trim() && buf.length) break;
    if (l.trim()) buf.push(l.trim());
  }
  return buf.join(' ').slice(0, 240);
}

function parseTasks(tasksMd) {
  // Lines `- [ ] T1: text` or `- [x] T1: text` → {id, title, status, priority}
  const out = [];
  for (const raw of String(tasksMd || '').split(/\r?\n/)) {
    const m = raw.match(/^- \[([ xX])\]\s*(?:\*\*)?(T\d+(?:\.\d+)?)(?:\*\*)?:?\s*(.+)$/);
    if (!m) continue;
    const status = m[1].toLowerCase() === 'x' ? 'done' : 'todo';
    out.push({
      id: m[2],
      title: m[3].replace(/\*\*/g, '').slice(0, 200),
      status,
      priority: 'P2',
      agent: null,
      why: '',
      accept: '',
    });
  }
  return out;
}

// ─────────────────────────────────────────── auto-layout
function autoLayout(modules) {
  // Group by visual layer; lay out left-to-right within each lane.
  const byLayer = {};
  for (const m of modules) {
    const lane = m.layer;
    byLayer[lane] = byLayer[lane] || [];
    byLayer[lane].push(m);
  }
  // Sort within layer: mvp first, then status priority (broken/wip/review/idea/done)
  const STATUS_RANK = { broken: 0, wip: 1, review: 2, idea: 3, done: 4 };
  for (const lane of Object.keys(byLayer)) {
    byLayer[lane].sort((a, b) => {
      const sa = STATUS_RANK[a._raw_status] ?? 5;
      const sb = STATUS_RANK[b._raw_status] ?? 5;
      return sa - sb || a.title.localeCompare(b.title);
    });
  }
  const COL_WIDTH = 320;
  const X_START = 80;
  for (const { id: laneId, y } of LAYER_LANES) {
    const list = byLayer[laneId] || [];
    list.forEach((m, i) => {
      m.x = X_START + i * COL_WIDTH;
      m.y = y;
    });
  }
}

// ─────────────────────────────────────────── transitions / history
function readHistory(atlasRoot) {
  const out = [];
  const tp = path.join(atlasRoot, 'transitions.log');
  if (fs.existsSync(tp)) {
    const lines = fs.readFileSync(tp, 'utf8').split(/\r?\n/).filter(Boolean).slice(-12);
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      const [ts, blockId, from, to] = line.split('\t');
      if (!ts || !blockId) continue;
      out.push({
        ts: ts.slice(11, 16),
        module: tagFromId(blockId),
        agent: 'sima-core',
        kind: to === 'broken' ? 'fail' : to === 'done' ? 'ok' : 'info',
        msg: `${blockId}: ${from || '∅'} → ${to}`,
      });
    }
  }
  return out;
}

function readLessons(atlasRoot) {
  const lp = path.join(atlasRoot, 'operator_profile', 'lessons.json');
  if (!fs.existsSync(lp)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(lp, 'utf8'));
    const arr = Array.isArray(raw) ? raw : (Array.isArray(raw.lessons) ? raw.lessons : []);
    return arr.slice(0, 10).map((l) => ({
      module: l.evidence?.[0]?.split('@')[0]?.replace(/^b\./, '') || 'general',
      verdict: 'good',
      note: l.lesson || '',
    }));
  } catch { return []; }
}

// ─────────────────────────────────────────── productMeta from project.md
function readProductMeta(atlasRoot) {
  const p = path.join(atlasRoot, 'project.md');
  let text = '';
  try { text = fs.readFileSync(p, 'utf8'); } catch {}
  const titleM = text.match(/^# (.+)$/m);
  const goalM = text.match(/(?:цель|Goal|North Star)[:\s]*(.+?)(?:\n\n|\n#|$)/is);
  const missionM = text.match(/(?:mission|миссия)[:\s]*(.+?)(?:\n\n|\n#|$)/is);
  // Tech stack split: try to read tech_stack.md
  const tsPath = path.join(atlasRoot, 'tech_stack.md');
  const ts = fs.existsSync(tsPath) ? fs.readFileSync(tsPath, 'utf8') : '';
  return {
    codename: 'sima-atlas',
    title: titleM ? titleM[1].trim() : 'Sima Atlas',
    subtitle: 'Визуальная система разработки на основе схем',
    goal: goalM ? goalM[1].trim().slice(0, 200) : 'Замкнуть рассинхрон между человеком и AI-агентами через явный спецификационный слой.',
    mission: missionM ? missionM[1].trim().slice(0, 200) : 'Каждый блок продукта — отдельная папка с миссией / KPI / acceptance, которую агент видит без всей кодовой базы.',
    quality: [
      { code: 'verify_all OK', label: 'Все 5 фаз verify_all зелёные' },
      { code: 'acceptance 10/10', label: 'Все блоки acceptance pass' },
      { code: 'nightly 55+', label: 'Nightly consolidation pass' },
    ],
    conditions: {
      backend:  splitTechStackSection(ts, /backend|сервер|api/i),
      frontend: splitTechStackSection(ts, /front|ui|клиент/i),
      logic:    splitTechStackSection(ts, /logic|orchestr/i),
      checks:   splitTechStackSection(ts, /test|check|verif/i),
    },
  };
}

function splitTechStackSection(text, sectionRe) {
  if (!text) return [];
  const m = text.match(new RegExp(`(?:^|\\n)#{1,3}\\s+[^\\n]*${sectionRe.source}[^\\n]*\\n([\\s\\S]+?)(?:\\n#|$)`, 'i'));
  if (!m || !m[1]) return [];
  return m[1]
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*]\s*/, '').trim())
    .filter((l) => l && !l.startsWith('#'))
    .slice(0, 6);
}

// ─────────────────────────────────────────── adapter entry
export function buildSimaDesignPayload({ atlas_root, client_id } = {}) {
  let root = atlas_root;
  if (!root) {
    if (client_id) {
      const clientPath = path.join(ROOT, 'atlas', 'clients', client_id);
      if (fs.existsSync(path.join(clientPath, 'graph.json'))) root = clientPath;
    }
    if (!root) root = path.join(ROOT, 'atlas');
  }

  const graphPath = path.join(root, 'graph.json');
  // Phase R-5 fix: a client directory may exist without graph.json (e.g.
  // half-bootstrapped projects, or a leftover from a crashed `clients/create`).
  // Returning a real 500 to the UI for that case meant the canvas couldn't
  // even render the empty state — and the React tree died on undefined
  // `data.submodules`. Treat missing graph as «empty atlas» instead.
  let graph;
  if (!fs.existsSync(graphPath)) {
    graph = { blocks: [], edges: [] };
  } else {
    try {
      graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
    } catch (e) {
      // Malformed graph.json: degrade to empty rather than crash. The
      // operator will still see the empty-canvas banner from the UI.
      console.error(`build_sima_design_payload: graph.json parse failed at ${graphPath}: ${e.message}; using empty.`);
      graph = { blocks: [], edges: [] };
    }
  }

  // Phase E-4: per-block contract score so graph cards can show a `!`
  // when mission/kpi/acceptance/depends_on/provides are empty or weak.
  // 0 = empty, 1 = all five filled. Cheap: read each block's 5 contract
  // files once during payload build. Skipped when blocks dir missing.
  const blocksDir = path.join(root, 'blocks');
  function contractScore(block_id) {
    const dir = path.join(blocksDir, block_id);
    if (!fs.existsSync(dir)) return null;
    const FILES = ['mission.md', 'kpi.md', 'acceptance.md', 'depends_on.md', 'provides.md'];
    let filled = 0;
    const missing = [];
    for (const f of FILES) {
      const p = path.join(dir, f);
      if (!fs.existsSync(p)) { missing.push(f); continue; }
      const body = fs.readFileSync(p, 'utf8').replace(/^#[^\n]*\n+/, '').trim();
      const isPlaceholder =
        /Заполни через детальную панель|добавь конкретную метрику/i.test(body) ||
        /^- none\s*$/im.test(body);
      if (!body || isPlaceholder || body.length < 80) missing.push(f);
      else filled++;
    }
    return { score: filled / FILES.length, filled, total: FILES.length, missing };
  }

  // Phase P-1.1: per-block progress counters for the graph card
  // {tasks: {done, total}, kpi: {checked, total}}. KPI parsed from
  // kpi.md as `- ...` lines; checked when checks.log has `kpi/...`
  // matching the line text fragment.
  function progressCounts(block_id) {
    const dir = path.join(blocksDir, block_id);
    if (!fs.existsSync(dir)) return null;
    const tasksMd  = (() => { try { return fs.readFileSync(path.join(dir, 'tasks.md'),  'utf8'); } catch { return ''; } })();
    const kpiMd    = (() => { try { return fs.readFileSync(path.join(dir, 'kpi.md'),    'utf8'); } catch { return ''; } })();
    const checksLog= (() => { try { return fs.readFileSync(path.join(dir, 'checks.log'),'utf8'); } catch { return ''; } })();
    const tasksParsed = parseTasks(tasksMd);
    const tasksDone  = tasksParsed.filter((t) => t.status === 'done').length;
    const kpiLines = String(kpiMd || '')
      .split(/\n/)
      .map((l) => l.replace(/^[-*]\s*/, '').trim())
      .filter((l) => l && !l.startsWith('#') && l.length > 5);
    const checked = kpiLines.filter((line) => {
      const head = line.split(/[—–:-]/)[0].trim().slice(0, 30).toLowerCase();
      return head && checksLog.toLowerCase().includes(head);
    }).length;
    return {
      tasks: { done: tasksDone, total: tasksParsed.length },
      kpi:   { checked, total: kpiLines.length },
    };
  }

  const modules = (graph.blocks || [])
    .filter((b) => b.status !== 'archived')
    .map((b) => {
      const visualStatus = STATUS_MAP[b.status] || 'todo';
      const visualLayer = LAYER_MAP[b.layer] || 'logic';
      const contract = contractScore(b.id);
      const progress = progressCounts(b.id);
      return {
        id: b.id,
        _raw_status: b.status,
        _raw_updated_at: b.updated_at || null,
        title: b.title || b.id,
        tag: tagFromId(b.id),
        layer: visualLayer,
        status: visualStatus,
        priority: autoPriority(b),
        checked: b.status === 'done',
        size: b.canvas_size || autoSize(b),
        warn: (visualStatus === 'fail' || visualStatus === 'desync') ? (b.status_reason || '').slice(0, 140) : undefined,
        contract: contract || undefined,
        progress: progress || undefined,
        // Phase P-1.5: expose tech_stack for DetailPanel chips
        tech_stack: Array.isArray(b.tech_stack) ? b.tech_stack : [],
        // Canvas coordinates: persisted (canvas_x/canvas_y) win over
        // auto-layout. Adapter writes both modes side-by-side so a fresh
        // graph.json gets useful default placement, AND user-dragged
        // positions survive nightly regen.
        x: Number.isFinite(b.canvas_x) ? b.canvas_x : 0,
        y: Number.isFinite(b.canvas_y) ? b.canvas_y : 0,
        _has_canvas_xy: Number.isFinite(b.canvas_x) && Number.isFinite(b.canvas_y),
      };
    });
  // Auto-layout only blocks WITHOUT persisted canvas coords
  const needsLayout = modules.filter((m) => !m._has_canvas_xy);
  if (needsLayout.length) autoLayout(needsLayout);
  modules.forEach((m) => { delete m._raw_status; delete m._has_canvas_xy; });

  const edges = [];
  for (const b of (graph.blocks || [])) {
    for (const dep of (b.depends_on || [])) {
      const target = typeof dep === 'string' ? dep.split(':')[0].trim() : dep.block_id;
      if (!target) continue;
      const cap = typeof dep === 'string' && dep.includes(':') ? dep.split(':')[1].trim() : null;
      edges.push({
        from: b.id,
        to: target,
        kind: 'data',
        label: cap || 'depends_on',
        biz: cap ? `Зависит от capability \`${cap}\` блока ${target}.` : `Зависит от ${target}.`,
      });
    }
  }

  const tasks = {};
  const moduleDocs = {};
  for (const b of (graph.blocks || [])) {
    const tasksMd = readBlockFile(root, b.id, 'tasks.md');
    const parsed = parseTasks(tasksMd);
    if (parsed.length) tasks[b.id] = parsed;
    const mission = readBlockFile(root, b.id, 'mission.md');
    const short = shortMissionExcerpt(mission);
    if (short) moduleDocs[b.id] = { short };
  }

  const product = readProductMeta(root);
  const history = readHistory(root);
  const lessons = readLessons(root);

  // Phase F-2: merge persisted subsystems from atlas/subsystems/<id>.json.
  // Each file describes a parent block's internal graph (modules, edges,
  // lanes, KPI). The UI's drill-into-block uses this when a parent's
  // subsystem exists; saving back via /atlas/subsystems/save round-trips.
  const subsystems = {};
  const subsDir = path.join(root, 'subsystems');
  if (fs.existsSync(subsDir)) {
    for (const f of fs.readdirSync(subsDir).sort()) {
      if (!f.endsWith('.json')) continue;
      try {
        const sub = JSON.parse(fs.readFileSync(path.join(subsDir, f), 'utf8'));
        const pid = sub.parent_id || f.replace(/\.json$/, '');
        subsystems[pid] = {
          codename: sub.codename || pid.replace(/^b\./, ''),
          title:    sub.title    || pid,
          subtitle: sub.subtitle || '',
          kpi:      Array.isArray(sub.kpi) ? sub.kpi : [],
          modules:  Array.isArray(sub.modules) ? sub.modules : [],
          edges:    Array.isArray(sub.edges)   ? sub.edges   : [],
          lanes:    Array.isArray(sub.lanes)   ? sub.lanes   : [],
          notes:    Array.isArray(sub.notes)   ? sub.notes   : [],
          updated_at: sub.updated_at || null,
          _persisted: true,
        };
      } catch {}
    }
  }
  // Mark modules whose subsystem exists, so the design UI can show the
  // "open subsystem →" affordance even for newly-persisted ones.
  for (const m of modules) {
    if (subsystems[m.id]) m.has_subsystem = true;
  }

  return {
    product,
    modules,
    edges,
    tasks,
    moduleDocs,
    // Phase R-5 — UI graph.jsx:303 / panels.jsx:89 read data.submodules[id].
    // The payload didn't include the field, so an empty client crashed
    // the React tree on first block create. Always return at least {}.
    submodules: {},
    // Phase R-7.20 — UI App reads data.lanes для horizontal-bands layout
    // (App строки 782 / 841: activeLanes = activeSub ? activeSub.lanes :
    // data.lanes). Скрипт раньше молча валился на Windows (R-7.18 fix
    // открыл это поле), так что UI получал fallback с lanes:[]. Теперь
    // скрипт реально выполняется и должен возвращать lanes — пустой
    // массив минимум, чтобы App не крэшился на activeLanes[0].
    // (lanes per-subsystem уже идут через subsystems сверху.)
    lanes: [],
    history,
    lessons,
    subsystems,
    agents: [
      { id: 'claude', title: 'Claude Code', tag: 'claude-code', color: 'warm' },
      { id: 'cursor', title: 'Cursor',       tag: 'cursor',      color: 'blue' },
      { id: 'codex',  title: 'Codex',        tag: 'codex',       color: 'violet' },
      { id: 'sima',   title: 'SIMA Core',    tag: 'sima-core',   color: 'ink' },
    ],
    _meta: {
      generated_at: new Date().toISOString(),
      atlas_root: path.relative(ROOT, root),
      client_id: client_id || null,
      block_count: (graph.blocks || []).length,
      edge_count: edges.length,
    },
  };
}

// Phase R-7.18 — Windows-safe «is this script the entry point?» check.
// Раньше: `import.meta.url === \`file://${process.argv[1]}\``. На Linux/macOS
// работает (forward slashes). На Windows import.meta.url выглядит как
// `file:///E:/path/foo.mjs`, а argv[1] — `E:\path\foo.mjs` — никогда не
// совпадают. CLI-entry молча НЕ запускался, скрипт давал empty stdout,
// API server получал JSON.parse('') = «Unexpected end of JSON input»,
// весь multi-tenant flow ломался невидимо на Windows. Через
// fileURLToPath обе стороны нормализуются.
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const stdoutOnly = argv.includes('--stdout');
  const clientIdx = argv.indexOf('--client');
  const client = clientIdx >= 0 ? argv[clientIdx + 1] : null;
  const data = buildSimaDesignPayload({ client_id: client });
  if (stdoutOnly) {
    process.stdout.write(JSON.stringify(data, null, 2));
  } else {
    const outDir = client
      ? path.join(ROOT, 'atlas', 'clients', client)
      : path.join(ROOT, 'atlas');
    fs.mkdirSync(outDir, { recursive: true });
    const out = path.join(outDir, 'design_payload.json');
    fs.writeFileSync(out, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`Built ${out}`);
    console.log(`  modules: ${data.modules.length}`);
    console.log(`  edges:   ${data.edges.length}`);
    console.log(`  tasks:   ${Object.keys(data.tasks).length} blocks`);
    console.log(`  history: ${data.history.length}`);
  }
}

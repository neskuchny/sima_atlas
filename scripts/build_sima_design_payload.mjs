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
  if (!fs.existsSync(graphPath)) throw new Error(`graph.json not found: ${graphPath}`);
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

  const modules = (graph.blocks || []).map((b) => {
    const visualStatus = STATUS_MAP[b.status] || 'todo';
    const visualLayer = LAYER_MAP[b.layer] || 'logic';
    return {
      id: b.id,
      _raw_status: b.status,
      title: b.title || b.id,
      tag: tagFromId(b.id),
      layer: visualLayer,
      status: visualStatus,
      priority: autoPriority(b),
      checked: b.status === 'done',
      size: autoSize(b),
      warn: (visualStatus === 'fail' || visualStatus === 'desync') ? (b.status_reason || '').slice(0, 140) : undefined,
      x: 0, y: 0, // filled by autoLayout
    };
  });
  autoLayout(modules);
  // Strip internal field before serialization
  modules.forEach((m) => { delete m._raw_status; });

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

  return {
    product,
    modules,
    edges,
    tasks,
    moduleDocs,
    history,
    lessons,
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

if (import.meta.url === `file://${process.argv[1]}`) {
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

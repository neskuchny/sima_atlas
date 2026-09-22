#!/usr/bin/env node
// R-8.11 (b.docs) — acceptance A3 and A5 as deterministic checks.
//
// Both used to be judged by an LLM («does roadmap.md put dependencies first?»,
// «does the wiki show blocks without a layer in their own section?»). Both are
// facts about generated files, so they are checked as facts:
//   g1 (A3) — the REAL atlas/roadmap.md: every dependency is listed before the
//             block that depends on it, except inside a dependency cycle,
//             where no order can satisfy both (the declared exemption).
//   g2 (A3) — a synthetic atlas where status priority and dependency order
//             disagree: the dependency still comes first («regardless of
//             status»).
//   g3 (A5) — a synthetic atlas with a block without `layer`: the wiki lists
//             it under «Без слоя», not inside the first layer's section.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const failures = [];
const check = (name, cond, detail = '') => { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); };

// The order of blocks in the «Порядок реализации» section of a roadmap.
function roadmapOrder(md) {
  const start = md.indexOf('## Порядок реализации');
  const end = start >= 0 ? md.indexOf('\n## ', start + 5) : -1;
  const section = start >= 0 ? md.slice(start, end > 0 ? end : undefined) : '';
  return [...section.matchAll(/^- \S+ \*\*(b\.[A-Za-z0-9._-]+)\*\*/gm)].map((m) => m[1]);
}
// A → dep is exempt when dep also reaches A (they sit in one cycle).
function reaches(graph, from, to, seen = new Set()) {
  if (from === to) return true;
  if (seen.has(from)) return false;
  seen.add(from);
  const b = graph.blocks.find((x) => x.id === from);
  return (b?.depends_on || []).some((d) => reaches(graph, d, to, seen));
}
function violations(graph, order) {
  const pos = new Map(order.map((id, i) => [id, i]));
  const out = [];
  for (const b of graph.blocks) {
    for (const dep of b.depends_on || []) {
      if (!pos.has(b.id) || !pos.has(dep)) continue;
      if (reaches(graph, dep, b.id)) continue; // cycle — no order satisfies both
      if (pos.get(dep) > pos.get(b.id)) out.push(`${dep} listed after ${b.id}`);
    }
  }
  return out;
}
const FILLER = 'This block exists only inside a disposable test atlas and describes what it would do in a real product in enough words.';
function synthAtlas(blocks, layers) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-docs-'));
  const atlas = path.join(tmp, 'atlas');
  fs.mkdirSync(path.join(atlas, 'blocks'), { recursive: true });
  fs.writeFileSync(path.join(atlas, 'graph.json'), JSON.stringify({ version: 2, layers, blocks }, null, 2));
  for (const b of blocks) {
    const d = path.join(atlas, 'blocks', b.id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'mission.md'), `# ${b.id} — mission\n\n${FILLER} ${FILLER}\n`);
    fs.writeFileSync(path.join(d, 'kpi.md'), `# kpi\n\n- KPI-1: ${FILLER}\n`);
    fs.writeFileSync(path.join(d, 'acceptance.md'), `# acceptance\n\n- [ ] **A1.** ${FILLER}\n`);
  }
  return tmp;
}
const runIn = (cwd, script) => spawnSync('node', [path.join(ROOT, 'scripts', script)], { cwd, encoding: 'utf8' });

// ── g1: the real roadmap respects dependencies ──────────────────────────────
{
  const graph = JSON.parse(fs.readFileSync(path.join(ROOT, 'atlas', 'graph.json'), 'utf8'));
  const order = roadmapOrder(fs.readFileSync(path.join(ROOT, 'atlas', 'roadmap.md'), 'utf8'));
  check('g1: roadmap.md lists every block of graph.json', graph.blocks.every((b) => order.includes(b.id)),
    graph.blocks.filter((b) => !order.includes(b.id)).map((b) => b.id).join(', '));
  const v = violations(graph, order);
  check('g1: every dependency comes before its dependent (cycles excepted)', v.length === 0, v.join('; '));
}

// ── g2: dependency order wins over status priority ─────────────────────────
{
  // Status priority puts broken first and done last; the dependency is done.
  const tmp = synthAtlas([
    { id: 'b.dependent', title: 'Dependent', status: 'broken', layer: 'logic', depends_on: ['b.base'] },
    { id: 'b.base', title: 'Base', status: 'done', layer: 'logic', depends_on: [] },
    { id: 'b.loop-a', title: 'Loop A', status: 'wip', layer: 'logic', depends_on: ['b.loop-b'] },
    { id: 'b.loop-b', title: 'Loop B', status: 'wip', layer: 'logic', depends_on: ['b.loop-a'] },
    // Depends on a cycle member but is not in the cycle. The generator used
    // to dump it together with the cycle in arbitrary order (b.ui-control
    // before b.agent-orchestrator in the real roadmap).
    { id: 'b.after-loop', title: 'After loop', status: 'broken', layer: 'logic', depends_on: ['b.loop-a'] },
  ], [{ id: 'logic', name: 'Logic', order: 1 }]);
  const r = runIn(tmp, 'rebuild_atlas_roadmap.mjs');
  check('g2: generator ran', r.status === 0, (r.stderr || '').slice(0, 200));
  const md = fs.readFileSync(path.join(tmp, 'atlas', 'roadmap.md'), 'utf8');
  const order = roadmapOrder(md);
  check('g2: the done dependency is listed before the broken block that needs it',
    order.indexOf('b.base') >= 0 && order.indexOf('b.base') < order.indexOf('b.dependent'), order.join(' '));
  check('g2: a dependency cycle does not drop its blocks', order.includes('b.loop-a') && order.includes('b.loop-b'), order.join(' '));
  check('g2: a block downstream of a cycle comes after the whole cycle',
    order.indexOf('b.after-loop') > order.indexOf('b.loop-a') && order.indexOf('b.after-loop') > order.indexOf('b.loop-b'), order.join(' '));
  check('g2: the cycle level is labelled as a cycle', /цикл зависимостей/.test(md));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── g3: blocks without a layer get their own section ──────────────────────
{
  const tmp = synthAtlas([
    { id: 'b.layered', title: 'Layered', status: 'idea', layer: 'logic', depends_on: [] },
    { id: 'b.legacy', title: 'Legacy without layer', status: 'idea', depends_on: [] },
  ], [{ id: 'logic', name: 'Logic', order: 1 }, { id: 'data', name: 'Data', order: 2 }]);
  const r = runIn(tmp, 'generate_wiki.mjs');
  check('g3: wiki generator ran (its template gate included)', r.status === 0, ((r.stderr || '') + (r.stdout || '')).slice(0, 300));
  const md = fs.existsSync(path.join(tmp, 'atlas', 'WIKI.md')) ? fs.readFileSync(path.join(tmp, 'atlas', 'WIKI.md'), 'utf8') : '';
  const layers = md.slice(md.indexOf('## Слои'), md.indexOf('## Блоки'));
  const noLayerAt = layers.indexOf('### Без слоя');
  check('g3: a «Без слоя» section exists', noLayerAt >= 0);
  check('g3: the block without a layer is listed in it', noLayerAt >= 0 && layers.slice(noLayerAt).includes('**b.legacy**'));
  const firstLayer = layers.slice(layers.indexOf('### Logic'), noLayerAt >= 0 ? noLayerAt : undefined);
  check('g3: …and not pushed into the first layer', !firstLayer.includes('**b.legacy**'), firstLayer);
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error('docs_generators.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('docs_generators.selftest: OK (3 groups, all assertions green)');

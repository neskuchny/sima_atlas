// PR2: roadmap with topological sort by depends_on
// — dependencies always come before their dependents, regardless of status.
// — within the same topo level, sort by status priority (broken > drift > wip > review > idea > done).
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const graphPath = path.join(root, 'atlas', 'graph.json');
const outPath = path.join(root, 'atlas', 'roadmap.md');

const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const blocks = graph.blocks || [];

const STATUS_RANK = { broken: 0, drift: 1, wip: 2, review: 3, idea: 4, done: 5 };
const STATUS_ICON = { idea: '🟡', wip: '🟠', review: '🔵', done: '🟢', broken: '🔴', drift: '🟣' };

const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
const depsOf = (b) => (b.depends_on || []).map((d) => (typeof d === 'string' ? d : d.block_id)).filter((id) => byId[id]);

// ─── Topological levels (Kahn-like, but by levels) ────────────────────────
const inDegree = new Map();
for (const b of blocks) inDegree.set(b.id, depsOf(b).length);

// Strongly connected components of the still-unplaced blocks (Tarjan).
function sccsOf(ids) {
  let index = 0;
  const idx = new Map(), low = new Map(), onStack = new Set(), stack = [], out = [];
  const visit = (v) => {
    idx.set(v, index); low.set(v, index); index += 1;
    stack.push(v); onStack.add(v);
    for (const w of depsOf(byId[v]).filter((d) => ids.has(d))) {
      if (!idx.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); }
      else if (onStack.has(w)) low.set(v, Math.min(low.get(v), idx.get(w)));
    }
    if (low.get(v) === idx.get(v)) {
      const comp = [];
      let w;
      do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
      out.push(comp);
    }
  };
  for (const v of ids) if (!idx.has(v)) visit(v);
  return out;
}

const bySortRank = (a, b) => {
  const ra = STATUS_RANK[byId[a].status] ?? 99;
  const rb = STATUS_RANK[byId[b].status] ?? 99;
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
};

const levels = [];
const cycleLevels = new Set();
const remaining = new Set(blocks.map((b) => b.id));
let safety = blocks.length + 5;
while (remaining.size && safety-- > 0) {
  const level = [];
  for (const id of remaining) {
    const b = byId[id];
    const stillBlocked = depsOf(b).some((dep) => remaining.has(dep));
    if (!stillBlocked) level.push(id);
  }
  if (!level.length) {
    // R-8.11 — a dependency cycle. This used to dump EVERY remaining block
    // into one last level in arbitrary order, so blocks that merely depend on
    // a cycle member could be listed before it (b.ui-control before
    // b.agent-orchestrator). Now only the cycle itself is placed — the
    // components waiting on nothing outside themselves — and the topological
    // order resumes for everything downstream of it.
    const comps = sccsOf(remaining).filter((comp) => {
      const inside = new Set(comp);
      return comp.every((id) => depsOf(byId[id]).every((d) => !remaining.has(d) || inside.has(d)));
    });
    if (!comps.length) { levels.push([...remaining].sort(bySortRank)); break; }
    const cyc = comps.flat().sort(bySortRank);
    for (const id of cyc) remaining.delete(id);
    cycleLevels.add(levels.length);
    levels.push(cyc);
    continue;
  }
  level.sort(bySortRank);
  for (const id of level) remaining.delete(id);
  levels.push(level);
}

// Layer grouping for an at-a-glance view
const blocksByLayer = {};
for (const b of blocks) (blocksByLayer[b.layer || '__no_layer__'] = blocksByLayer[b.layer || '__no_layer__'] || []).push(b);
const layerOrder = (graph.layers || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));

const lines = [];
lines.push('# Roadmap (auto-generated, PR2 topo-sort)');
lines.push('');
lines.push(`_Generated: ${new Date().toISOString()}_`);
lines.push('');
lines.push('Приоритет внутри уровня: 🔴 broken → 🟣 drift → 🟠 wip → 🔵 review → 🟡 idea → 🟢 done.');
lines.push('Каждый следующий уровень зависит от предыдущих — реализовывать сверху вниз.');
lines.push('');

// ─── Topo levels ──────────────────────────────────────────────────────────
lines.push('## Порядок реализации (топосорт)');
lines.push('');
levels.forEach((level, i) => {
  lines.push(`### Level ${i} — ${i === 0 ? 'без зависимостей' : 'требует Level ' + (i - 1)}${cycleLevels.has(i) ? ' · цикл зависимостей: эти блоки зависят друг от друга, порядок внутри не определён' : ''}`);
  lines.push('');
  for (const id of level) {
    const b = byId[id];
    const icon = STATUS_ICON[b.status] || '⚪';
    const deps = depsOf(b);
    const depTxt = deps.length ? ` · deps: ${deps.map((d) => '`' + d + '`').join(', ')}` : '';
    const layerTxt = b.layer ? ` · _${b.layer}_` : '';
    lines.push(`- ${icon} **${b.id}** (${b.status}) — ${b.title}${layerTxt}${depTxt}`);
    if (b.status_reason) lines.push(`  - ${b.status_reason}`);
  }
  lines.push('');
});

// ─── By layer ─────────────────────────────────────────────────────────────
lines.push('## Сводка по слоям');
lines.push('');
for (const layer of layerOrder) {
  const list = blocksByLayer[layer.id] || [];
  if (!list.length) continue;
  lines.push(`### ${layer.name} (\`${layer.id}\`)`);
  lines.push('');
  for (const b of list) {
    const icon = STATUS_ICON[b.status] || '⚪';
    lines.push(`- ${icon} **${b.id}** — ${b.title} _(${b.status})_`);
  }
  lines.push('');
}
const orphans = blocksByLayer['__no_layer__'] || [];
if (orphans.length) {
  lines.push('### Без слоя');
  lines.push('');
  for (const b of orphans) lines.push(`- ⚪ **${b.id}** — ${b.title}`);
  lines.push('');
}

fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`Rebuilt ${outPath}`);

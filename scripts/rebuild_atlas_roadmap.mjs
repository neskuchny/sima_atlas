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

const levels = [];
const remaining = new Set(blocks.map((b) => b.id));
let safety = blocks.length + 5;
while (remaining.size && safety-- > 0) {
  const level = [];
  for (const id of remaining) {
    const b = byId[id];
    const stillBlocked = depsOf(b).some((dep) => remaining.has(dep));
    if (!stillBlocked) level.push(id);
  }
  if (!level.length) break; // cycle protection
  level.sort((a, b) => {
    const ra = STATUS_RANK[byId[a].status] ?? 99;
    const rb = STATUS_RANK[byId[b].status] ?? 99;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
  for (const id of level) remaining.delete(id);
  levels.push(level);
}
if (remaining.size) levels.push([...remaining]); // cycle stragglers

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
  lines.push(`### Level ${i} — ${i === 0 ? 'без зависимостей' : 'требует Level ' + (i - 1)}`);
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

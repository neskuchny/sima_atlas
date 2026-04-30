import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const graphPath = path.join(root, 'atlas', 'graph.json');
const outPath = path.join(root, 'atlas', 'roadmap.md');

const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const blocks = graph.blocks || [];

const rank = { broken: 0, drift: 1, wip: 2, idea: 3, done: 4 };

const ordered = [...blocks].sort((a, b) => {
  const ra = rank[a.status] ?? 99;
  const rb = rank[b.status] ?? 99;
  if (ra !== rb) return ra - rb;
  const da = (a.depends_on || []).length;
  const db = (b.depends_on || []).length;
  if (da !== db) return da - db;
  return String(a.id).localeCompare(String(b.id));
});

const lines = [];
lines.push('# Roadmap (auto-generated)');
lines.push('');
lines.push(`_Generated: ${new Date().toISOString()}_`);
lines.push('');
lines.push('Приоритет: broken → drift → wip → idea → done.');
lines.push('');
ordered.forEach((b, i) => {
  const deps = (b.depends_on || []).length ? ` · deps: ${(b.depends_on || []).join(', ')}` : '';
  lines.push(`${i + 1}. **${b.id}** (${b.status}) — ${b.title}${deps}`);
});
lines.push('');

fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
console.log(`Rebuilt ${outPath}`);

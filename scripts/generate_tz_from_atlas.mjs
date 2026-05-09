// Auto-generates a project spec (ТЗ / requirements doc) from the canonical
// per-block contracts. Reads atlas/blocks/<id>/mission.md + tasks.md and
// stitches them under per-block headings.
//
// Output: atlas/auto_tz.md. The legacy `ТЗ/` directory was retired in PR #28
// (R-7.75 — opensource cleanup of Russian-only legacy dirs); the file now
// lives inside the canonical atlas tree like every other generated artefact.
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const atlas = path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));
const out = path.join(atlas, 'auto_tz.md');

let md = '# AUTO ТЗ (auto-generated from atlas)\n\n';
md += '_Each section is built from `atlas/blocks/<id>/mission.md` + `tasks.md`. Regenerate via `node scripts/generate_tz_from_atlas.mjs`._\n\n';
for (const b of graph.blocks || []) {
  const dir = path.join(atlas, 'blocks', b.id);
  const mission = fs.existsSync(path.join(dir, 'mission.md')) ? fs.readFileSync(path.join(dir, 'mission.md'), 'utf8') : '';
  const tasks = fs.existsSync(path.join(dir, 'tasks.md')) ? fs.readFileSync(path.join(dir, 'tasks.md'), 'utf8') : '';
  md += `## ${b.id} (${b.status})\n\n`;
  md += mission + '\n\n';
  md += tasks + '\n\n';
}
fs.writeFileSync(out, md, 'utf8');
console.log(`Generated ${out}`);

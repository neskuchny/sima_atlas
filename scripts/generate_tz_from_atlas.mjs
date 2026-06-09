// Auto-generates a project spec (ТЗ / requirements doc) from the canonical
// per-block contracts. Reads atlas/blocks/<id>/mission.md + tasks.md and
// stitches them under per-block headings.
//
// Output: atlas/auto_tz.md. The legacy `ТЗ/` directory was retired in PR #28
// (R-7.75 — opensource cleanup of Russian-only legacy dirs); the file now
// lives inside the canonical atlas tree like every other generated artefact.
//
// R-7.98 (b.docs A4 + KPI-5):
//   - template gate (same as generate_wiki): refuses to render template
//     phrases into the spec — exit 1 with the validator's report;
//   - blocks in `idea` status with an empty/missing mission are SKIPPED
//     (listed at the bottom as «not yet specified», not given empty
//     sections) — the spec contains only real content;
//   - every section links to its source blocks/<id>/*.md files so the
//     reader can always reach the canonical contract.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
const root = process.cwd();
const atlas = path.join(root, 'atlas');

{
  const gate = spawnSync('node', ['scripts/validate_no_template_placeholders.mjs'], { cwd: root, encoding: 'utf8' });
  if (gate.status !== 0) {
    console.error('generate_tz_from_atlas: ABORTED — template placeholders found (A1/KPI-1 gate):');
    console.error((gate.stdout || '') + (gate.stderr || ''));
    process.exit(1);
  }
}

const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));
const out = path.join(atlas, 'auto_tz.md');

const readSafe = (p) => fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : '';

let md = '# AUTO ТЗ (auto-generated from atlas)\n\n';
md += '_Each section is built from `atlas/blocks/<id>/mission.md` + `tasks.md`. Regenerate via `node scripts/generate_tz_from_atlas.mjs`._\n\n';
const skipped = [];
for (const b of graph.blocks || []) {
  const dir = path.join(atlas, 'blocks', b.id);
  const mission = readSafe(path.join(dir, 'mission.md'));
  const kpi = readSafe(path.join(dir, 'kpi.md'));
  const tasks = readSafe(path.join(dir, 'tasks.md'));
  // KPI-5: an idea block with no real mission has nothing to specify yet.
  const missionBody = mission.replace(/^#.*$/m, '').trim();
  if (b.status === 'idea' && missionBody.length < 80) {
    skipped.push(b);
    continue;
  }
  md += `## ${b.id} (${b.status})\n\n`;
  md += mission + '\n\n';
  // User Story 2: the spec is generated from mission.md AND kpi.md — the
  // measurable targets belong in a ТЗ as much as the goal statement does.
  if (kpi) md += kpi + '\n\n';
  if (tasks) md += tasks + '\n\n';
  // A4: explicit links back to the canonical contract files.
  md += `_Sources: [mission](blocks/${b.id}/mission.md) · [kpi](blocks/${b.id}/kpi.md) · [acceptance](blocks/${b.id}/acceptance.md) · [tasks](blocks/${b.id}/tasks.md)_\n\n`;
}
if (skipped.length) {
  md += '## Not yet specified\n\n';
  md += '_Blocks in `idea` status without a filled mission — intentionally excluded from the spec (KPI-5):_\n\n';
  for (const b of skipped) md += `- \`${b.id}\` — ${b.title || ''}\n`;
  md += '\n';
}
fs.writeFileSync(out, md, 'utf8');
console.log(`Generated ${out} (${(graph.blocks || []).length - skipped.length} specified, ${skipped.length} skipped as unspecified ideas)`);

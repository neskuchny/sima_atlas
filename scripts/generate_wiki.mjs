// PR2: layered + mermaid wiki
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));
const out = path.join(atlas, 'WIKI.md');

function read(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').trim() : ''; }

const STATUS_ICON = { idea: '🟡', wip: '🟠', review: '🔵', done: '🟢', broken: '🔴', drift: '🟣' };

// Group blocks by layer in declared order
const layers = (graph.layers || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
const blocksByLayer = {};
for (const b of graph.blocks || []) {
  (blocksByLayer[b.layer || '__no_layer__'] = blocksByLayer[b.layer || '__no_layer__'] || []).push(b);
}

let md = '# Sima Atlas Wiki\n\n';
md += `_Auto-generated: ${new Date().toISOString()}_\n\n`;

// ─── Mermaid graph ────────────────────────────────────────────────────────
md += '## Граф продукта\n\n';
md += '```mermaid\nflowchart TB\n';
md += '  classDef done    fill:#dcfce7,stroke:#16a34a,color:#15803d;\n';
md += '  classDef wip     fill:#fef3c7,stroke:#ca8a04,color:#a16207;\n';
md += '  classDef review  fill:#dbeafe,stroke:#2563eb,color:#1d4ed8;\n';
md += '  classDef idea    fill:#f3f4f6,stroke:#6b7280,color:#374151;\n';
md += '  classDef broken  fill:#fee2e2,stroke:#dc2626,color:#b91c1c;\n';
md += '  classDef drift   fill:#fae8ff,stroke:#a21caf,color:#86198f;\n';

for (const layer of layers) {
  const list = blocksByLayer[layer.id] || [];
  if (!list.length) continue;
  md += `  subgraph ${layer.id}["${layer.name}"]\n`;
  for (const b of list) {
    const safeId = b.id.replace(/\W+/g, '_');
    const label = `${b.title}<br/><small>${b.status}</small>`;
    md += `    ${safeId}["${label}"]:::${b.status}\n`;
  }
  md += '  end\n';
}
for (const b of graph.blocks || []) {
  const a = b.id.replace(/\W+/g, '_');
  for (const d of b.depends_on || []) {
    const depId = (typeof d === 'string' ? d : d.block_id).replace(/\W+/g, '_');
    md += `  ${a} --> ${depId}\n`;
  }
}
md += '```\n\n';

// ─── Sections per layer ───────────────────────────────────────────────────
md += '## Слои\n\n';
for (const layer of layers) {
  const list = blocksByLayer[layer.id] || [];
  if (!list.length) continue;
  md += `### ${layer.name} (\`${layer.id}\`)\n\n`;
  for (const b of list) {
    const icon = STATUS_ICON[b.status] || '⚪';
    md += `- ${icon} **${b.id}** — ${b.title} _(${b.status})_\n`;
    if (b.status_reason) md += `  - reason: ${b.status_reason}\n`;
  }
  md += '\n';
}

// Blocks without a layer
const orphans = blocksByLayer['__no_layer__'] || [];
if (orphans.length) {
  md += '### Без слоя (нужно поправить)\n\n';
  for (const b of orphans) md += `- ⚪ **${b.id}** — ${b.title}\n`;
  md += '\n';
}

// ─── Detailed blocks ──────────────────────────────────────────────────────
md += '## Блоки\n\n';
for (const b of graph.blocks || []) {
  const dir = path.join(atlas, 'blocks', b.id);
  const icon = STATUS_ICON[b.status] || '⚪';
  md += `### ${icon} ${b.id} — ${b.title}\n\n`;
  md += `- **layer**: \`${b.layer || '—'}\`\n`;
  md += `- **type**: ${b.type || '—'}\n`;
  md += `- **status**: \`${b.status}\`${b.status_reason ? ` — ${b.status_reason}` : ''}\n`;
  md += `- **mvp**: ${b.mvp ? 'yes' : 'no'}\n`;
  if ((b.depends_on || []).length) {
    md += `- **depends_on**: ${b.depends_on.map((d) => '`' + (typeof d === 'string' ? d : d.block_id) + '`').join(', ')}\n`;
  }
  if ((b.tech_stack || []).length) {
    md += `- **tech_stack**: ${b.tech_stack.map((s) => '`' + s + '`').join(', ')}\n`;
  }
  if ((b.files || []).length) {
    md += `- **files**: ${b.files.length} (\`atlas/blocks/${b.id}/files.md\`)\n`;
  }
  md += '\n';

  const mission = read(path.join(dir, 'mission.md'));
  if (mission) md += mission + '\n\n';

  const kpi = read(path.join(dir, 'kpi.md'));
  if (kpi) md += '#### KPI\n\n' + kpi + '\n\n';

  const acc = read(path.join(dir, 'acceptance.md'));
  if (acc) md += '#### Acceptance\n\n' + acc + '\n\n';

  md += '---\n\n';
}

fs.writeFileSync(out, md, 'utf8');
console.log(`Generated ${out}`);

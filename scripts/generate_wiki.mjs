import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const atlas = path.join(root,'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlas,'graph.json'),'utf8'));
const out = path.join(atlas,'WIKI.md');

function read(p){ return fs.existsSync(p)?fs.readFileSync(p,'utf8').trim():''; }
let md = '# Sima Atlas Wiki\n\n';
for (const b of graph.blocks || []) {
  const dir = path.join(atlas,'blocks',b.id);
  md += `## ${b.id} — ${b.title}\n`;
  md += `- status: **${b.status}**\n`;
  md += `- depends_on: ${(b.depends_on||[]).join(', ') || 'none'}\n\n`;
  md += read(path.join(dir,'mission.md')) + '\n\n';
  md += '### KPI\n\n' + read(path.join(dir,'kpi.md')) + '\n\n';
  md += '### Acceptance\n\n' + read(path.join(dir,'acceptance.md')) + '\n\n';
}
fs.writeFileSync(out, md, 'utf8');
console.log(`Generated ${out}`);

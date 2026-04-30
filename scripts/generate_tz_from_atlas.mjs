import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const atlas = path.join(root,'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlas,'graph.json'),'utf8'));
const out = path.join(root,'ТЗ','auto_tz.md');

let md = '# AUTO ТЗ (из Atlas)\n\n';
md += '_Сгенерировано автоматически из /atlas_\n\n';
for (const b of graph.blocks || []) {
  const dir = path.join(atlas,'blocks',b.id);
  const mission = fs.existsSync(path.join(dir,'mission.md')) ? fs.readFileSync(path.join(dir,'mission.md'),'utf8') : '';
  const tasks = fs.existsSync(path.join(dir,'tasks.md')) ? fs.readFileSync(path.join(dir,'tasks.md'),'utf8') : '';
  md += `## ${b.id} (${b.status})\n\n`;
  md += mission + '\n\n';
  md += tasks + '\n\n';
}
fs.writeFileSync(out, md, 'utf8');
console.log(`Generated ${out}`);

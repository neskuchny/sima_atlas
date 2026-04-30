#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));

function read(p){ return fs.existsSync(p) ? fs.readFileSync(p,'utf8') : ''; }
function listFrom(md){ return md.split(/\r?\n/).map(s=>s.trim()).filter(s=>s.startsWith('- ')).map(s=>s.slice(2)); }

const issues = [];
let synchronized = 0;
for (const b of graph.blocks || []) {
  const dir = path.join(atlas, 'blocks', b.id);
  const required = ['mission.md','kpi.md','acceptance.md','tasks.md','checks.log'];
  const missing = required.filter(f => !read(path.join(dir,f)).trim());
  const blockIssues = [];
  if (missing.length) blockIssues.push(`missing: ${missing.join(',')}`);

  const deps = listFrom(read(path.join(dir,'depends_on.md'))).filter(x=>x!=='none');
  for (const d of deps) {
    const [dep,cap] = d.split(':').map(x=>x.trim());
    if (!dep || !cap) continue;
    const prov = new Set(listFrom(read(path.join(atlas,'blocks',dep,'provides.md'))).filter(x=>x!=='none'));
    if (!prov.has(cap)) blockIssues.push(`depends/provides mismatch: ${dep}:${cap}`);
  }

  const checks = read(path.join(dir,'checks.log')).toLowerCase();
  if (['review','done'].includes(b.status) && !checks.includes('acceptance')) blockIssues.push('no acceptance check');
  if (b.status==='done' && (!checks.includes('kpi') || !checks.includes('pass'))) blockIssues.push('no kpi pass');

  if (!blockIssues.length) synchronized += 1;
  else issues.push({ block_id:b.id, status:b.status, issues:blockIssues });
}

const total = (graph.blocks||[]).length;
const ratio = total ? synchronized/total : 1;
const payload = {
  generated_at: new Date().toISOString(),
  total_blocks: total,
  synchronized_blocks: synchronized,
  intelligence_health: Number(ratio.toFixed(4)),
  unsynchronized: issues,
};

fs.writeFileSync(path.join(atlas,'intelligence_health.json'), JSON.stringify(payload,null,2)+'\n','utf8');
let md = '# Intelligence Health\n\n';
md += `_Generated: ${payload.generated_at}_\n\n`;
md += `- total_blocks: ${total}\n`;
md += `- synchronized_blocks: ${synchronized}\n`;
md += `- intelligence_health: ${payload.intelligence_health}\n\n`;
if (issues.length){
  md += '## Unsynchronized blocks\n\n';
  for (const u of issues){ md += `- **${u.block_id}** (${u.status}): ${u.issues.join('; ')}\n`; }
}
fs.writeFileSync(path.join(atlas,'intelligence_health.md'), md, 'utf8');
console.log(`Intelligence health: ${payload.intelligence_health} (${synchronized}/${total})`);

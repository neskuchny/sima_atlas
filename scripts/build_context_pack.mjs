#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [,, blockId] = process.argv;
if (!blockId) {
  console.error('Usage: node scripts/build_context_pack.mjs <blockId>');
  process.exit(1);
}

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));

function read(p){ return fs.existsSync(p) ? fs.readFileSync(p,'utf8') : ''; }
function listFrom(md){ return md.split(/\r?\n/).map(s=>s.trim()).filter(s=>s.startsWith('- ')).map(s=>s.slice(2)); }

const block = (graph.blocks||[]).find(b => b.id===blockId);
if (!block) {
  console.error(`Block not found: ${blockId}`);
  process.exit(2);
}

const dir = path.join(atlas, 'blocks', blockId);
const dependsRaw = listFrom(read(path.join(dir,'depends_on.md'))).filter(x=>x!=='none');
const depends = dependsRaw.map(x => x.split(':')[0].trim()).filter(Boolean);

const pack = {
  generated_at: new Date().toISOString(),
  block_id: blockId,
  project: {
    project: read(path.join(atlas,'project.md')),
    rules: read(path.join(atlas,'rules.md')),
    tech_stack: read(path.join(atlas,'tech_stack.md')),
  },
  block: {
    meta: block,
    mission: read(path.join(dir,'mission.md')),
    kpi: read(path.join(dir,'kpi.md')),
    acceptance: read(path.join(dir,'acceptance.md')),
    tasks: read(path.join(dir,'tasks.md')),
    patterns: read(path.join(dir,'patterns.md')),
    files: read(path.join(dir,'files.md')),
  },
  dependencies: depends.map(id => ({
    id,
    mission: read(path.join(atlas,'blocks',id,'mission.md')),
    provides: read(path.join(atlas,'blocks',id,'provides.md')),
  }))
};

const outDir = path.join(atlas,'context_packs');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive:true });
const out = path.join(outDir, `${blockId}.json`);
fs.writeFileSync(out, JSON.stringify(pack,null,2)+'\n','utf8');
console.log(`Context-pack written: ${out}`);

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlas,'graph.json'),'utf8'));

const errors = [];
const must = ['build_context_pack','sync_check','update_block','ingest_chat_distillate','enqueue_ingestion'];
const agents = fs.readFileSync(path.join(root,'AGENTS.md'),'utf8');
const claude = fs.readFileSync(path.join(root,'CLAUDE.md'),'utf8');
for (const t of must){
  if (!agents.includes(t)) errors.push(`AGENTS.md missing ${t}`);
  if (!claude.includes(t)) errors.push(`CLAUDE.md missing ${t}`);
}
for (const b of graph.blocks || []){
  const cp = path.join(atlas,'context_packs',`${b.id}.json`);
  if (!fs.existsSync(cp)) errors.push(`context_pack missing: ${b.id}`);
}
if (errors.length){
  console.error('Parity matrix validation failed:');
  errors.forEach(e=>console.error(' -',e));
  process.exit(1);
}
console.log('Parity matrix validation: OK');

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  { name:'AGENTS.md', required:['/atlas/project.md','/atlas/rules.md','build_context_pack','sync_check'] },
  { name:'CLAUDE.md', required:['/atlas/project.md','/atlas/rules.md','build_context_pack','sync_check'] },
];

const errors = [];
for (const f of files){
  const p = path.join(root, f.name);
  if (!fs.existsSync(p)) { errors.push(`${f.name}: missing`); continue; }
  const txt = fs.readFileSync(p,'utf8');
  for (const token of f.required){
    if (!txt.includes(token)) errors.push(`${f.name}: missing token ${token}`);
  }
}

const mcp = path.join(root,'scripts','mcp_atlas_server.mjs');
if (!fs.existsSync(mcp)) errors.push('scripts/mcp_atlas_server.mjs: missing');
else {
  const txt = fs.readFileSync(mcp,'utf8');
  const tools = ['read_block','update_block','sync_check','build_context_pack','ingest_chat_distillate'];
  for (const t of tools){ if (!txt.includes(`name:'${t}'`)) errors.push(`mcp tool missing: ${t}`); }
}

if (errors.length){
  console.error('Agent parity validation failed:');
  errors.forEach(e=>console.error(' -',e));
  process.exit(1);
}
console.log('Agent parity validation: OK');

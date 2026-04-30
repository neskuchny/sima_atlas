#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlas,'graph.json'),'utf8'));
const errors = [];

for (const b of graph.blocks || []) {
  const dir = path.join(atlas,'blocks',b.id);
  const decisions = path.join(dir,'decisions.log');
  const patterns = path.join(dir,'patterns.md');
  const checks = path.join(dir,'checks.log');
  if (!fs.existsSync(decisions) && !fs.existsSync(patterns)) continue;
  const d = fs.existsSync(decisions) ? fs.readFileSync(decisions,'utf8').split(/\r?\n/).filter(l=>l.includes('chat-distillate')) : [];
  const p = fs.existsSync(patterns) ? fs.readFileSync(patterns,'utf8').split(/\r?\n/).filter(l=>l.trim().startsWith('- ')) : [];
  if (d.length !== p.length) errors.push(`${b.id}: decisions(${d.length}) != patterns(${p.length})`);
  const c = fs.existsSync(checks) ? fs.readFileSync(checks,'utf8') : '';
  if ((d.length > 0 || p.length > 0) && !c.toLowerCase().includes('ingestion')) {
    errors.push(`${b.id}: missing ingestion trace in checks.log`);
  }
}

if (errors.length) {
  console.error('Ingestion quality validation failed:');
  errors.forEach(e=>console.error(' -',e));
  process.exit(1);
}
console.log('Ingestion quality validation: OK');

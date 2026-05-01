#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlas,'graph.json'),'utf8'));
let touched = 0;

for (const b of graph.blocks || []) {
  const dir = path.join(atlas,'blocks',b.id);
  const decisions = path.join(dir,'decisions.log');
  const patterns = path.join(dir,'patterns.md');

  if (fs.existsSync(decisions)) {
    const lines = fs.readFileSync(decisions,'utf8').split(/\r?\n/).filter(Boolean);
    const head = lines.filter(l=>l.startsWith('#'));
    const body = lines.filter(l=>!l.startsWith('#'));
    const seen = new Set();
    const uniq = body.filter(l => {
      const key = l.split('\t').slice(1).join('\t').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    });
    const out = [...head, ...uniq].join('\n')+'\n';
    fs.writeFileSync(decisions, out, 'utf8');
    touched += 1;
  }

  if (fs.existsSync(patterns)) {
    const lines = fs.readFileSync(patterns,'utf8').split(/\r?\n/);
    const head = lines.filter(l=>l.startsWith('#') || l.trim()==='');
    const body = lines.filter(l=>l.trim().startsWith('- '));
    const seen = new Set();
    const uniq = body.filter(l=>{
      const key = l.replace(/^\-\s+\d{4}-\d{2}-\d{2}T[^:]+:\s*/,'').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    });
    fs.writeFileSync(patterns, [...head, ...uniq].join('\n').replace(/\n{3,}/g,'\n\n')+'\n','utf8');
    touched += 1;
  }
}

console.log(`dedup_block_memory: touched ${touched} files`);

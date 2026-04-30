#!/usr/bin/env node
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));

let count = 0;
for (const b of graph.blocks || []) {
  execSync(`node scripts/build_context_pack.mjs ${b.id}`, { cwd: root, stdio: 'pipe' });
  count += 1;
}

console.log(`Context packs synced: ${count}`);

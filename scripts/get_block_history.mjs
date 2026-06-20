#!/usr/bin/env node
// CLI: list history snapshots for a block.
// Each update_block call saves a snapshot to blocks/<id>/history/<ts>.md.
// Usage: node scripts/get_block_history.mjs <block_id>

import fs from 'node:fs';
import path from 'node:path';

const [,, blockId] = process.argv;
if (!blockId) {
  console.error('Usage: node scripts/get_block_history.mjs <block_id>');
  process.exit(1);
}

const root = process.cwd();
const histDir = path.join(root, 'atlas', 'blocks', blockId, 'history');

if (!fs.existsSync(histDir)) {
  console.log(`No history found for block "${blockId}" (history/ directory does not exist yet)`);
  console.log('Run update_block twice to generate history entries.');
  process.exit(0);
}

const entries = fs.readdirSync(histDir).filter(f => f.endsWith('.md')).sort();

if (entries.length === 0) {
  console.log(`No history entries found for block "${blockId}"`);
  process.exit(0);
}

console.log(`History for "${blockId}" — ${entries.length} snapshot(s):\n`);
for (const fname of entries) {
  const content = fs.readFileSync(path.join(histDir, fname), 'utf8');
  console.log(`=== ${fname} ===`);
  console.log(content);
}

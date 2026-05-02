#!/usr/bin/env node
// PR3.5: list pending LLM proposals.
//
// Usage:
//   node scripts/list_proposals.mjs                  → human-readable
//   node scripts/list_proposals.mjs --json           → array of {id, block_id, ...}
//   node scripts/list_proposals.mjs --block b.docs   → filter by block
//
// Reads atlas/proposals/*.json. Each file represents one suggestion the LLM
// made for an existing block; verdict starts as "pending" and the user
// flips it via accept_proposal.mjs / reject_proposal.mjs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const DIR = path.join(ROOT, 'atlas', 'proposals');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const writeIndex = argv.includes('--write-index');
const blockIdx = argv.indexOf('--block');
const blockFilter = blockIdx >= 0 ? argv[blockIdx + 1] : null;

if (!fs.existsSync(DIR)) {
  if (asJson) console.log('[]');
  else console.log('list_proposals: no proposals directory yet');
  process.exit(0);
}

const items = [];
for (const f of fs.readdirSync(DIR).sort()) {
  if (!f.endsWith('.json')) continue;
  let p;
  try { p = JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')); }
  catch { continue; }
  if (p.verdict !== 'pending') continue;
  if (blockFilter && p.block_id !== blockFilter) continue;
  items.push(p);
}

if (writeIndex) {
  fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify(items, null, 2) + '\n', 'utf8');
}

if (asJson) {
  process.stdout.write(JSON.stringify(items, null, 2) + '\n');
} else {
  if (!items.length) {
    console.log('list_proposals: no pending proposals' + (blockFilter ? ` for ${blockFilter}` : ''));
    process.exit(0);
  }
  console.log(`list_proposals: ${items.length} pending`);
  for (const p of items) {
    const conf = p.source?.confidence != null ? `c=${p.source.confidence.toFixed(2)}` : 'c=?';
    const provider = p.source?.provider || '?';
    const fields = Object.keys(p.changes || {}).join(', ');
    console.log(`  • ${p.id}  [${p.block_id}]  ${provider}/${conf}  fields=${fields || '(none)'}`);
  }
}

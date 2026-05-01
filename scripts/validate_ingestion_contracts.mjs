#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const q = path.join(atlas, 'ingestion_queue.jsonl');
if (!fs.existsSync(q)) {
  console.log('Ingestion contracts validation: OK (no queue file)');
  process.exit(0);
}

const lines = fs.readFileSync(q,'utf8').split(/\r?\n/).filter(Boolean);
const errors = [];
lines.forEach((raw, i) => {
  let e;
  try { e = JSON.parse(raw); } catch { errors.push(`line ${i+1}: invalid json`); return; }
  if (!e.block_id || typeof e.block_id !== 'string') errors.push(`line ${i+1}: block_id required`);
  if (!e.note || typeof e.note !== 'string') errors.push(`line ${i+1}: note required`);
  if (e.apply_to_rules != null && typeof e.apply_to_rules !== 'boolean') errors.push(`line ${i+1}: apply_to_rules must be boolean`);
  const bdir = path.join(atlas, 'blocks', String(e.block_id || ''));
  if (e.block_id && !fs.existsSync(bdir)) errors.push(`line ${i+1}: block not found ${e.block_id}`);
});

if (errors.length) {
  console.error('Ingestion contracts validation failed:');
  errors.forEach(e=>console.error(' -',e));
  process.exit(1);
}
console.log('Ingestion contracts validation: OK');

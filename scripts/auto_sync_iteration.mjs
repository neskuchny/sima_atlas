#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [,, blockId='b.docs', notes=''] = process.argv;
if (!notes.trim()) {
  console.error('Usage: node scripts/auto_sync_iteration.mjs <blockId> "<notes from dialogue>"');
  process.exit(1);
}
const root = process.cwd();
const scratchDir = path.join(root, 'atlas', 'ingestion_scratch');
fs.mkdirSync(scratchDir, { recursive: true });
const transcript = path.join(scratchDir, `auto_${Date.now()}.jsonl`);
const payload = [{ role:'user', text: notes }];
fs.writeFileSync(transcript, payload.map(x=>JSON.stringify(x)).join('\n')+'\n', 'utf8');

function run(args){ return execFileSync('node', args, { cwd: root, stdio: 'pipe' }).toString().trim(); }
const steps = [];
steps.push(run(['scripts/ingest_chat_batches.mjs', transcript, blockId, '1']));
steps.push(run(['scripts/finalize_cursor_iteration.mjs', blockId, transcript]));
steps.push(run(['scripts/generate_atlas_bootstrap_js.mjs']));
steps.push(run(['scripts/validate_bootstrap_projection.mjs']));

const outPath = path.join(root, 'atlas', 'process_runs', `auto_sync__${blockId}__${Date.now()}.json`);
fs.writeFileSync(outPath, JSON.stringify({ block_id:blockId, notes, transcript:path.relative(root, transcript), steps, status:'pass', at:new Date().toISOString() }, null, 2)+'\n', 'utf8');
console.log(`auto_sync_iteration: PASS -> ${path.relative(root, outPath)}`);

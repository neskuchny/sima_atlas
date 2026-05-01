#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [,, transcriptPath, blockId='b.docs', batchSizeRaw='6'] = process.argv;
if (!transcriptPath) {
  console.error('Usage: node scripts/ingest_chat_batches.mjs <transcript_jsonl> [blockId] [batchSize=6]');
  process.exit(1);
}

const root = process.cwd();
const abs = path.isAbsolute(transcriptPath) ? transcriptPath : path.join(root, transcriptPath);
if (!fs.existsSync(abs)) {
  console.error(`transcript not found: ${abs}`);
  process.exit(2);
}
const batchSize = Math.max(1, Number(batchSizeRaw) || 6);
const rows = fs.readFileSync(abs, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
  try { return JSON.parse(line); } catch { return { role: 'unknown', text: line }; }
});

function runNode(args){ execFileSync('node', args, { cwd: root, stdio: 'pipe' }); }
let queued = 0;
for (let i = 0; i < rows.length; i += batchSize) {
  const chunk = rows.slice(i, i + batchSize);
  const text = chunk.map((m) => `${m.role || 'user'}: ${m.text || m.message || ''}`.trim()).join('\n');
  const note = `batch-ingest ${i + 1}-${Math.min(i + batchSize, rows.length)} / ${rows.length}`;
  runNode(['scripts/enqueue_ingestion_item.mjs', blockId, note, 'false', text]);
  queued += 1;
}
runNode(['scripts/apply_ingestion_queue.mjs']);
console.log(`ingest_chat_batches: queued ${queued} chunks, applied queue`);

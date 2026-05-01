#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const stash = path.join(root, '.cursor', 'chat_buffer.jsonl');
const role = process.env.SIMA_CHAT_ROLE || 'user';
const text = process.env.SIMA_CHAT_TEXT || process.argv.slice(2).join(' ').trim();
const blockId = process.env.SIMA_BLOCK_ID || 'b.docs';
const threshold = Math.max(1, Number(process.env.SIMA_INGEST_EVERY || 6));

if (!text) {
  console.log('hook_ingest_recent_chat: skip (empty message)');
  process.exit(0);
}
fs.mkdirSync(path.dirname(stash), { recursive: true });
fs.appendFileSync(stash, JSON.stringify({ role, text, at: new Date().toISOString() }) + '\n', 'utf8');

const count = fs.readFileSync(stash, 'utf8').split(/\r?\n/).filter(Boolean).length;
if (count < threshold) {
  console.log(`hook_ingest_recent_chat: buffered ${count}/${threshold}`);
  process.exit(0);
}

execFileSync('node', ['scripts/ingest_chat_batches.mjs', stash, blockId, String(threshold)], { cwd: root, stdio: 'pipe' });
fs.writeFileSync(stash, '', 'utf8');
console.log(`hook_ingest_recent_chat: ingested ${count} messages for ${blockId}`);

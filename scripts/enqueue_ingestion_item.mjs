#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [,, blockId, note, applyToRules='false', conversationText=''] = process.argv;
if (!blockId || !note) {
  console.error('Usage: node scripts/enqueue_ingestion_item.mjs <blockId> "<note>" [applyToRules=true|false] [conversationText]');
  process.exit(1);
}

const root = process.cwd();
const queue = path.join(root, 'atlas', 'ingestion_queue.jsonl');
const item = {
  block_id: blockId,
  note,
  apply_to_rules: applyToRules === 'true',
  queued_at: new Date().toISOString(),
  conversation_text: conversationText || undefined,
};
fs.appendFileSync(queue, JSON.stringify(item)+'\n', 'utf8');
console.log(`Ingestion item queued for ${blockId}`);

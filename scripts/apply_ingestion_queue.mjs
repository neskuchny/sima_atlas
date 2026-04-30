#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const queuePath = path.join(atlas, 'ingestion_queue.jsonl');
if (!fs.existsSync(queuePath)) {
  fs.writeFileSync(queuePath, '', 'utf8');
  console.log('ingestion_queue: empty (created)');
  process.exit(0);
}

const lines = fs.readFileSync(queuePath,'utf8').split(/\r?\n/).filter(Boolean);
if (!lines.length) {
  console.log('ingestion_queue: empty');
  process.exit(0);
}

function append(file, line){ fs.appendFileSync(file, line.endsWith('\n')?line:line+'\n', 'utf8'); }
let applied = 0;
const rest = [];
for (const raw of lines){
  let e;
  try { e = JSON.parse(raw); } catch { continue; }
  if (!e.block_id || !e.note) { rest.push(raw); continue; }
  const blockDir = path.join(atlas, 'blocks', e.block_id);
  if (!fs.existsSync(blockDir)) { rest.push(raw); continue; }

  const ts = new Date().toISOString();
  const decisions = path.join(blockDir, 'decisions.log');
  const patterns = path.join(blockDir, 'patterns.md');
  const checks = path.join(blockDir, 'checks.log');
  if (!fs.existsSync(decisions)) fs.writeFileSync(decisions, '# decisions\n\n', 'utf8');
  if (!fs.existsSync(patterns)) fs.writeFileSync(patterns, `# ${e.block_id} — patterns\n\n`, 'utf8');

  append(decisions, `${ts}\tchat-distillate\t${e.note}`);
  append(patterns, `- ${ts}: ${e.note}`);
  append(checks, `${ts}\tingestion\tpass\tqueue applied`);
  if (e.apply_to_rules === true) {
    append(path.join(atlas,'rules.md'), `\n- [INGEST ${ts}] ${e.note}`);
  }
  applied += 1;
}

fs.writeFileSync(queuePath, rest.join('\n') + (rest.length ? '\n' : ''), 'utf8');
console.log(`ingestion_queue applied: ${applied}`);

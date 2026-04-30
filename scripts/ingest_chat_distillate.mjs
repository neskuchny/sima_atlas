#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [,, blockId, note] = process.argv;
if (!blockId || !note) {
  console.error('Usage: node scripts/ingest_chat_distillate.mjs <blockId> "<distilled_note>"');
  process.exit(1);
}

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const blockDir = path.join(atlas, 'blocks', blockId);
if (!fs.existsSync(blockDir)) {
  console.error(`Block dir not found: ${blockDir}`);
  process.exit(2);
}

const ts = new Date().toISOString();
const safeNote = note.trim();

function appendLine(file, line){ fs.appendFileSync(file, line.endsWith('\n')?line:line+'\n', 'utf8'); }

const decisions = path.join(blockDir, 'decisions.log');
const patterns = path.join(blockDir, 'patterns.md');
const checks = path.join(blockDir, 'checks.log');

if (!fs.existsSync(decisions)) fs.writeFileSync(decisions, '# decisions\n\n', 'utf8');
if (!fs.existsSync(patterns)) fs.writeFileSync(patterns, `# ${blockId} — patterns\n\n`, 'utf8');

appendLine(decisions, `${ts}\tchat-distillate\t${safeNote}`);
appendLine(patterns, `- ${ts}: ${safeNote}`);
appendLine(checks, `${ts}\tingestion\tpass\tdistillate saved`);

console.log(`Distillate ingested for ${blockId}`);

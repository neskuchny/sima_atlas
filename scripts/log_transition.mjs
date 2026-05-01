import fs from 'node:fs';
import path from 'node:path';

const [,, blockId, from, to, actor='cli', note=''] = process.argv;
if (!blockId || !from || !to) {
  console.error('Usage: node scripts/log_transition.mjs <blockId> <from> <to> [actor] [note]');
  process.exit(1);
}

const logPath = path.join(process.cwd(), 'atlas', 'transitions.log');
const ts = new Date().toISOString();
const line = `${ts}\t${blockId}\t${from}\t${to}\tactor=${actor}\tnote=${note}\n`;
fs.appendFileSync(logPath, line, 'utf8');
console.log(`Appended transition to ${logPath}`);

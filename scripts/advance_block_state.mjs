import fs from 'node:fs';
import path from 'node:path';

const [,, blockId, to, actor='cli', note=''] = process.argv;
if (!blockId || !to) {
  console.error('Usage: node scripts/advance_block_state.mjs <blockId> <to> [actor] [note]');
  process.exit(1);
}

const root = process.cwd();
const graphPath = path.join(root, 'atlas', 'graph.json');
const transitionsPath = path.join(root, 'atlas', 'transitions.log');

const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const blocks = graph.blocks || [];
const idx = blocks.findIndex((b) => b.id === blockId);
if (idx < 0) {
  console.error(`Block not found: ${blockId}`);
  process.exit(2);
}

const TRANSITIONS = {
  idea: ['wip'],
  wip: ['review', 'broken'],
  review: ['done', 'wip', 'broken'],
  done: ['wip'],
  broken: ['wip'],
};

const from = blocks[idx].status || 'idea';
const allowed = TRANSITIONS[from] || [];
if (!allowed.includes(to)) {
  console.error(`Invalid transition ${from} -> ${to}`);
  process.exit(3);
}

blocks[idx].status = to;
fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2) + '\n', 'utf8');

if (!fs.existsSync(transitionsPath)) {
  fs.writeFileSync(transitionsPath, '# ts\tblock_id\tfrom\tto\tmeta\n', 'utf8');
}
const ts = new Date().toISOString();
const line = `${ts}\t${blockId}\t${from}\t${to}\tactor=${actor}\tnote=${note}\n`;
fs.appendFileSync(transitionsPath, line, 'utf8');

const blockDir = path.join(root, 'atlas', 'blocks', blockId);
const checksPath = path.join(blockDir, 'checks.log');
if (fs.existsSync(blockDir)) {
  const checkLine = `${ts}\ttransition\tpass\t${from}->${to}\tactor=${actor}${note?`\tnote=${note}`:''}\n`;
  fs.appendFileSync(checksPath, checkLine, 'utf8');
}

console.log(`Transition applied: ${blockId} ${from} -> ${to}`);

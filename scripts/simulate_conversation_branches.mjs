#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const fixturePath = process.argv[2] || path.join(root, 'tests', 'fixtures', 'conversation_branches.json');
const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function runNode(args) {
  return execFileSync('node', args, { cwd: root, stdio: 'pipe' }).toString();
}

for (const branch of fixtures) {
  runNode(['scripts/enqueue_ingestion_item.mjs', branch.block_id, branch.note, 'false', branch.conversation_text]);
}
runNode(['scripts/apply_ingestion_queue.mjs']);

const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));
const byId = new Map((graph.blocks || []).map(b => [b.id, b]));
const checks = [];

checks.push({
  name: 'created b.realtime-ingestion',
  pass: byId.has('b.realtime-ingestion'),
});
checks.push({
  name: 'b.realtime-ingestion status wip',
  pass: byId.get('b.realtime-ingestion')?.status === 'wip',
});
checks.push({
  name: 'b.core-sync status done',
  pass: byId.get('b.core-sync')?.status === 'done',
});

const failed = checks.filter(c => !c.pass);
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}: ${c.name}`);
if (failed.length) {
  console.error(`simulate_conversation_branches: failed ${failed.length} checks`);
  process.exit(2);
}
console.log('simulate_conversation_branches: OK');

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlasRoot = path.join(root, 'atlas');
const blocksRoot = path.join(atlasRoot, 'blocks');
const graphPath = path.join(atlasRoot, 'graph.json');

const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const required = [
  'mission.md',
  'kpi.md',
  'acceptance.md',
  'tasks.md',
  'checks.log',
];

const errors = [];
for (const b of graph.blocks || []) {
  const dir = path.join(blocksRoot, b.id);
  if (!fs.existsSync(dir)) {
    errors.push(`${b.id}: missing dir atlas/blocks/${b.id}`);
    continue;
  }
  for (const file of required) {
    const p = path.join(dir, file);
    if (!fs.existsSync(p)) {
      errors.push(`${b.id}: missing ${file}`);
      continue;
    }
    const content = fs.readFileSync(p, 'utf8').trim();
    if (!content) errors.push(`${b.id}: empty ${file}`);
  }
}

if (errors.length) {
  console.error('Block contract validation failed:');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}

console.log('Block contract validation: OK');

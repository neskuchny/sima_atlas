import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlasRoot = path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlasRoot, 'graph.json'), 'utf8'));

function read(p) {
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

const errors = [];
for (const b of graph.blocks || []) {
  if (!['review', 'done'].includes(b.status)) continue;
  const checks = read(path.join(atlasRoot, 'blocks', b.id, 'checks.log')).toLowerCase();
  if (!checks.trim()) {
    errors.push(`${b.id}: checks.log empty for status=${b.status}`);
    continue;
  }
  const hasAcceptance = checks.includes('acceptance');
  if (!hasAcceptance) errors.push(`${b.id}: missing acceptance assertion in checks.log`);
  if (b.status === 'done') {
    if (!checks.includes('acceptance') || !checks.includes('pass')) {
      errors.push(`${b.id}: done block requires acceptance pass`);
    }
    if (!checks.includes('kpi') || !checks.includes('pass')) {
      errors.push(`${b.id}: done block requires kpi pass`);
    }
  }
}

if (errors.length) {
  console.error('Acceptance assertions validation failed:');
  errors.forEach(e => console.error(' -', e));
  process.exit(1);
}

console.log('Acceptance assertions validation: OK');

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlasRoot = path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlasRoot, 'graph.json'), 'utf8'));

function read(p) {
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

function parseChecklist(md){
  return md.split(/\r?\n/)
    .map(l => l.trim())
    .map((l) => {
      const m = l.match(/^- \[( |x|X)\] (.+)$/);
      if (!m) return null;
      return { checked: m[1].toLowerCase()==='x', text: m[2].trim() };
    })
    .filter(Boolean);
}

const errors = [];
for (const b of graph.blocks || []) {
  if (!['review', 'done'].includes(b.status)) continue;
  const blockDir = path.join(atlasRoot, 'blocks', b.id);
  const checks = read(path.join(blockDir, 'checks.log')).toLowerCase();
  const acceptanceMd = read(path.join(blockDir, 'acceptance.md'));
  const items = parseChecklist(acceptanceMd);

  if (!checks.trim()) {
    errors.push(`${b.id}: checks.log empty for status=${b.status}`);
    continue;
  }

  if (items.length < 2) {
    errors.push(`${b.id}: acceptance.md should contain at least 2 checklist items`);
  }

  const hasAcceptance = checks.includes('acceptance');
  if (!hasAcceptance) errors.push(`${b.id}: missing acceptance assertion in checks.log`);

  if (b.status === 'review') {
    const semanticTokens = ['логика', 'завис', 'ui', 'sync', 'scenario', 'flow'];
    if (!semanticTokens.some(t => acceptanceMd.toLowerCase().includes(t))) {
      errors.push(`${b.id}: acceptance.md lacks semantic scenario tokens`);
    }
  }

  if (b.status === 'done') {
    const checkedCount = items.filter(i => i.checked).length;
    if (checkedCount === 0) errors.push(`${b.id}: done block requires checked acceptance items`);
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

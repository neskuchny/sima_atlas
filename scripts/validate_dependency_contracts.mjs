import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlasRoot = path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlasRoot, 'graph.json'), 'utf8'));

function readLines(p) {
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

function parseProvides(blockId) {
  const lines = readLines(path.join(atlasRoot, 'blocks', blockId, 'provides.md'));
  // R-7.99 — capability is the FIRST identifier-like token. Inline
  // parenthetical annotations («personal_templates (для …)») are
  // operator-facing commentary, not part of the contract key. depends_on
  // referencing `personal_templates` matches.
  return new Set(
    lines
      .filter((l) => l.startsWith('- '))
      .map((l) => l.slice(2).trim())
      .filter((v) => v !== 'none')
      .map((v) => v.split(/[\s(]/, 1)[0].trim())
      .filter(Boolean)
  );
}

function parseDepends(blockId) {
  const lines = readLines(path.join(atlasRoot, 'blocks', blockId, 'depends_on.md'));
  return lines
    .filter(l => l.startsWith('- '))
    .map(l => l.slice(2).trim())
    .filter(v => v !== 'none')
    .map((v) => {
      const [dep, cap] = v.split(':').map(x => x.trim());
      return { dep, cap };
    });
}

const errors = [];
for (const b of graph.blocks || []) {
  const deps = parseDepends(b.id);
  for (const d of deps) {
    if (!d.dep || !d.cap) {
      errors.push(`${b.id}: invalid depends entry`);
      continue;
    }
    const depBlock = (graph.blocks || []).find(x => x.id === d.dep);
    if (!depBlock) {
      errors.push(`${b.id}: dependency block not found: ${d.dep}`);
      continue;
    }
    const provides = parseProvides(d.dep);
    if (!provides.has(d.cap)) {
      errors.push(`${b.id}: ${d.dep} does not provide '${d.cap}'`);
    }
  }
}

if (errors.length) {
  console.error('Dependency contract validation failed:');
  errors.forEach(e => console.error(' -', e));
  process.exit(1);
}
console.log('Dependency contract validation: OK');

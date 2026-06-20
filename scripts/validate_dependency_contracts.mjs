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
const reportDetails = [];
let totalDepsChecked = 0;

for (const b of graph.blocks || []) {
  const deps = parseDepends(b.id);
  const blockIssues = [];
  for (const d of deps) {
    totalDepsChecked++;
    if (!d.dep || !d.cap) {
      const issue = {
        type: 'invalid_depends_entry',
        message: `invalid depends entry`,
        file: `atlas/blocks/${b.id}/depends_on.md`,
        line: 1,
      };
      errors.push(`${b.id}: invalid depends entry`);
      blockIssues.push(issue);
      continue;
    }
    const depBlock = (graph.blocks || []).find(x => x.id === d.dep);
    if (!depBlock) {
      const issue = {
        type: 'missing_dep_block',
        message: `dependency block not found: ${d.dep}`,
        file: `atlas/blocks/${b.id}/depends_on.md`,
        line: 1,
      };
      errors.push(`${b.id}: dependency block not found: ${d.dep}`);
      blockIssues.push(issue);
      continue;
    }
    const provides = parseProvides(d.dep);
    if (!provides.has(d.cap)) {
      const issue = {
        type: 'missing_capability',
        message: `${d.dep} does not provide '${d.cap}'`,
        file: `atlas/blocks/${b.id}/depends_on.md`,
        line: 1,
      };
      errors.push(`${b.id}: ${d.dep} does not provide '${d.cap}'`);
      blockIssues.push(issue);
    }
  }
  if (blockIssues.length) {
    reportDetails.push({
      blockId: b.id,
      status: 'broken',
      reason: 'missing_capability',
      issues: blockIssues,
    });
  }
}

// Merge findings into atlas/sync_report.json (named-section merge — R-7.99)
const reportPath = path.join(atlasRoot, 'sync_report.json');
let report = {};
if (fs.existsSync(reportPath)) {
  try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch { report = {}; }
}
report.dependencyValidation = {
  checkedAt: new Date().toISOString(),
  totalDepsChecked,
  broken: reportDetails.length,
  details: reportDetails,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

if (errors.length) {
  console.error('Dependency contract validation failed:');
  errors.forEach(e => console.error(' -', e));
  process.exit(1);
}
console.log('Dependency contract validation: OK');

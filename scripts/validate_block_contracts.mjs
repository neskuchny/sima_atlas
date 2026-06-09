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

// Find line number of a block id in graph.json for precise file/line refs
const graphLines = fs.readFileSync(graphPath, 'utf8').split('\n');
function findBlockLine(blockId) {
  for (let i = 0; i < graphLines.length; i++) {
    if (graphLines[i].includes(`"id": "${blockId}"`)) return i + 1;
  }
  return 1;
}

const errors = [];
const reportDetails = [];

for (const b of graph.blocks || []) {
  const dir = path.join(blocksRoot, b.id);
  const blockIssues = [];

  if (!fs.existsSync(dir)) {
    const issue = {
      type: 'missing_dir',
      message: `missing dir atlas/blocks/${b.id}`,
      file: 'atlas/graph.json',
      line: findBlockLine(b.id),
    };
    errors.push(`${b.id}: ${issue.message}`);
    blockIssues.push(issue);
    reportDetails.push({ blockId: b.id, status: 'broken', reason: 'missing_dir', issues: blockIssues });
    continue;
  }

  for (const file of required) {
    const p = path.join(dir, file);
    const relFile = `atlas/blocks/${b.id}/${file}`;
    if (!fs.existsSync(p)) {
      const issue = { type: 'missing_file', message: `missing ${file}`, file: relFile, line: 1 };
      errors.push(`${b.id}: missing ${file}`);
      blockIssues.push(issue);
      continue;
    }
    const content = fs.readFileSync(p, 'utf8').trim();
    if (!content) {
      const issue = { type: 'empty_file', message: `empty ${file}`, file: relFile, line: 1 };
      errors.push(`${b.id}: empty ${file}`);
      blockIssues.push(issue);
    }
  }

  if (blockIssues.length) {
    reportDetails.push({ blockId: b.id, status: 'broken', reason: 'contract_incomplete', issues: blockIssues });
  }
}

// Write/merge atlas/sync_report.json with contract validation findings
const reportPath = path.join(atlasRoot, 'sync_report.json');
let report = {};
if (fs.existsSync(reportPath)) {
  try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch { report = {}; }
}
report.contractValidation = {
  checkedAt: new Date().toISOString(),
  total: graph.blocks?.length || 0,
  broken: reportDetails.length,
  details: reportDetails,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

if (errors.length) {
  console.error('Block contract validation failed:');
  errors.forEach((e) => console.error(' -', e));
  process.exit(1);
}

console.log('Block contract validation: OK');

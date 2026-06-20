// b.core-sync (PR2): consume b.code-graph: code_graph capability.
// Reads atlas/code_graph.json (produced by b.code-graph) and writes a
// codeGraphSummary section to atlas/sync_report.json for aggregation.
// This is the declared dependency: b.core-sync depends_on b.code-graph: code_graph.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlasRoot = path.join(root, 'atlas');

const codeGraphPath = path.join(atlasRoot, 'code_graph.json');
const reportPath = path.join(atlasRoot, 'sync_report.json');

let codeGraph = null;
if (fs.existsSync(codeGraphPath)) {
  try { codeGraph = JSON.parse(fs.readFileSync(codeGraphPath, 'utf8')); } catch { codeGraph = null; }
}

const blockEntries = codeGraph?.by_block ? Object.entries(codeGraph.by_block) : [];
const summary = {
  checkedAt: new Date().toISOString(),
  available: codeGraph !== null,
  backend: codeGraph?.backend || null,
  blockCount: blockEntries.length,
  blocks: Object.fromEntries(
    blockEntries.map(([id, data]) => [id, { fileCount: (data.files || []).length }])
  ),
};

let report = {};
if (fs.existsSync(reportPath)) {
  try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch { report = {}; }
}
report.codeGraphSummary = summary;
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

if (!codeGraph) {
  console.log('Code graph sync: SKIP (atlas/code_graph.json not found — b.code-graph has not run yet)');
} else {
  console.log(`Code graph sync: OK (${summary.blockCount} blocks indexed, backend=${summary.backend})`);
}

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const atlas = path.join(root, 'atlas');

const checks = [
  ['node', ['scripts/validate_block_contracts.mjs']],
  ['node', ['scripts/validate_dependency_contracts.mjs']],
  ['node', ['scripts/validate_ingestion_contracts.mjs']],
  ['node', ['scripts/validate_ingestion_quality.mjs']],
  ['node', ['scripts/simulate_conversation_branches.mjs']],
];

const rows = [];
for (const [cmd, args] of checks) {
  const r = spawnSync(cmd, args, { cwd: root, encoding: 'utf8' });
  rows.push({ cmd: [cmd, ...args].join(' '), ok: r.status === 0, out: (r.stdout + r.stderr).trim() });
}

const pass = rows.filter(r => r.ok).length;
const total = rows.length;
const ts = new Date().toISOString();
let md = `# Production Audit Report\n\nGenerated: ${ts}\n\nSummary: ${pass === total ? 'PASS' : 'FAIL'} (${pass}/${total})\n\n`;
for (const r of rows) {
  md += `- [${r.ok ? 'x' : ' '}] \`${r.cmd}\`\n`;
}
md += '\n## Details\n\n';
for (const r of rows) {
  md += `### ${r.ok ? 'PASS' : 'FAIL'} — ${r.cmd}\n\n\`\`\`\n${r.out}\n\`\`\`\n\n`;
}

fs.writeFileSync(path.join(atlas, 'production_audit_report.md'), md, 'utf8');
console.log(`production_audit: ${pass}/${total}`);
if (pass !== total) process.exit(1);

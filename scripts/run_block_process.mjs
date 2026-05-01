#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [,, blockId, processName='sync_audit_context'] = process.argv;
if (!blockId) {
  console.error('Usage: node scripts/run_block_process.mjs <blockId> [processName]');
  process.exit(1);
}

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const outDir = path.join(atlas, 'process_runs');
fs.mkdirSync(outDir, { recursive: true });
const ts = new Date().toISOString();

function run(cmd, args){
  const res = execFileSync(cmd, args, { cwd: root, stdio: 'pipe' }).toString().trim();
  return res;
}

const steps = [];
try {
  steps.push({ step: 'build_context_pack', output: run('node', ['scripts/build_context_pack.mjs', blockId]) });
  if (processName.includes('sync')) steps.push({ step: 'sync_check', output: run('node', ['scripts/validate_block_contracts.mjs']) });
  if (processName.includes('audit')) steps.push({ step: 'audit', output: run('node', ['scripts/audit_production_readiness.mjs']) });

  const packPath = path.join(atlas, 'context_packs', `${blockId}.json`);
  const report = {
    block_id: blockId,
    process: processName,
    executed_at: ts,
    context_pack: fs.existsSync(packPath) ? path.relative(root, packPath) : null,
    steps,
    status: 'pass',
  };
  const out = path.join(outDir, `${blockId}__${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`run_block_process: PASS -> ${path.relative(root, out)}`);
} catch (e) {
  const out = path.join(outDir, `${blockId}__${Date.now()}__fail.json`);
  fs.writeFileSync(out, JSON.stringify({ block_id:blockId, process:processName, executed_at:ts, status:'fail', error:String(e) }, null, 2) + '\n', 'utf8');
  console.error(`run_block_process: FAIL -> ${path.relative(root, out)}`);
  process.exit(2);
}

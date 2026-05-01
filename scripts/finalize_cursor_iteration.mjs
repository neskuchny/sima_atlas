#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const [,, blockId='b.docs', transcriptPath=''] = process.argv;
const root = process.cwd();
const atlas = path.join(root, 'atlas');
const ts = new Date().toISOString();

function run(name, cmd, args) {
  const out = execFileSync(cmd, args, { cwd: root, stdio: 'pipe' }).toString().trim();
  return { name, ok: true, out };
}

const steps = [];
try {
  if (transcriptPath) {
    steps.push(run('ingest_chat_batches', 'node', ['scripts/ingest_chat_batches.mjs', transcriptPath, blockId, '6']));
  }
  steps.push(run('run_block_process', 'node', ['scripts/run_block_process.mjs', blockId, 'sync_audit_context']));
  steps.push(run('nightly_consolidation', 'node', ['scripts/nightly_consolidation.mjs']));
  steps.push(run('generate_wiki', 'node', ['scripts/generate_wiki.mjs']));
  steps.push(run('generate_tz', 'node', ['scripts/generate_tz_from_atlas.mjs']));

  const report = {
    block_id: blockId,
    transcript: transcriptPath || null,
    finished_at: ts,
    profile: 'atlas/operator_profile.json',
    steps,
    status: 'pass'
  };
  const outPath = path.join(atlas, 'process_runs', `finalize__${blockId}__${Date.now()}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`finalize_cursor_iteration: PASS -> ${path.relative(root, outPath)}`);
} catch (e) {
  console.error('finalize_cursor_iteration: FAIL', String(e));
  process.exit(2);
}

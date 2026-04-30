import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const [,, blockId, to, actor='cli', note=''] = process.argv;
if (!blockId || !to) {
  console.error('Usage: node scripts/pipeline_step.mjs <blockId> <to> [actor] [note]');
  process.exit(1);
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

// 1) transition block
run('node', ['scripts/advance_block_state.mjs', blockId, to, actor, note]);

// 2) sync-check regression (runtime safety gate)
run('node', ['tests/atlas_sync.selftest.mjs']);

// 3) validate block contracts
run('node', ['scripts/validate_block_contracts.mjs']);

// 4) validate dependency contracts
run('node', ['scripts/validate_dependency_contracts.mjs']);

// 5) validate acceptance assertions
run('node', ['scripts/validate_acceptance_assertions.mjs']);

// 6) rebuild roadmap from updated graph
run('node', ['scripts/rebuild_atlas_roadmap.mjs']);

// 7) append pipeline check for mutation-path traceability
const checksPath = path.join(process.cwd(), 'atlas', 'blocks', blockId, 'checks.log');
if (existsSync(checksPath)) {
  appendFileSync(checksPath, `${new Date().toISOString()}\tpipeline\tpass\t${to}\tactor=${actor}\n`, 'utf8');
}

console.log(`Pipeline step completed for ${blockId} -> ${to}`);

#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

function run(args){ return execFileSync('node', args, { stdio: 'pipe' }).toString().trim(); }

run(['scripts/generate_atlas_bootstrap_js.mjs']);
const out = run(['scripts/validate_bootstrap_projection.mjs']);
if (!out.includes('OK')) {
  console.error('Bootstrap regeneration validation failed');
  process.exit(2);
}
console.log('Bootstrap regeneration validation: OK');

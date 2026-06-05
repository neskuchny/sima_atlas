#!/usr/bin/env node
// R-7.89 (Phase II) — guarded Playwright runner.
//
// nightly_consolidation runs the Playwright specs directly. On a machine
// where `@playwright/test` (or its browsers) isn't installed — common on a
// fresh clone, since CI installs it via `npm ci` but a casual `npm install`
// or a sandbox may not — `npx playwright test` exits non-zero with
// ERR_MODULE_NOT_FOUND and turns the whole nightly red for an environment
// reason, not a real regression.
//
// This wrapper resolves @playwright/test first. If present → run the spec
// (exit code passed through). If absent → print a clear skip line and
// exit 0, so the nightly stays honest: «not run here», not «failed».
// In CI (where npm ci installs it) the spec runs normally.
//
// Usage:
//   node scripts/run_playwright_guarded.mjs <spec-path> [extra playwright args...]

import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const spec = process.argv[2];
const extra = process.argv.slice(3);

if (!spec) {
  console.error('run_playwright_guarded: <spec-path> required');
  process.exit(2);
}

let available = true;
try {
  require.resolve('@playwright/test');
} catch {
  available = false;
}

if (!available) {
  console.log(`skip: @playwright/test not installed — ${spec} not run here (CI installs it via npm ci)`);
  process.exit(0);
}

const args = ['playwright', 'test', spec, '--reporter=line', ...extra];
const r = spawnSync('npx', args, { stdio: 'inherit', cwd: process.cwd() });
// If npx itself can't find the browser binaries, Playwright exits non-zero
// with a clear install hint — that's a real "installed but not set up"
// state worth surfacing, so we pass the code through.
process.exit(r.status == null ? 1 : r.status);

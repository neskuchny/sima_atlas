#!/usr/bin/env node
// Phase R-1 — verify_all forces mock LLM provider so the green-build stays
// fast / deterministic / free regardless of available API keys or local
// `claude` CLI. Real providers are for interactive UI work, not CI.
process.env.ATLAS_FORCE_MOCK_LLM = '1';

// Sima Atlas — single-command verifier.
//
// Runs every automated check we have in one go. Prints a single summary at
// the end. Designed to be the answer to "как мне проверить всё?".
//
// Phases (each gated by --skip-<name>):
//   1. nightly      — full nightly_consolidation (all selftests + smokes)
//   2. acceptance   — verify_all_acceptance.mjs (cross-block verdicts)
//   3. cursor       — cursor_live.headless.smoke (hook actions)
//   4. screenshots  — Playwright canvas screenshots (live UI smoke)
//   5. mcp          — mcp_smoke_e2e.mjs (round-trip through MCP JSON-RPC)
//
// Usage:
//   node scripts/verify_all.mjs                  # run everything
//   node scripts/verify_all.mjs --skip-screenshots
//   node scripts/verify_all.mjs --json
//   npm run verify                               # alias from package.json

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const argv = process.argv.slice(2);
const json = argv.includes('--json');
function skipped(name) { return argv.includes(`--skip-${name}`); }
function only(name) {
  const i = argv.indexOf('--only');
  if (i < 0) return false;
  return argv[i + 1] !== name;
}

function step(name, cmd, args, opts = {}) {
  if (skipped(name) || only(name)) return { name, status: 'skipped', duration_ms: 0 };
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8', ...opts });
  const tail = (r.stdout || '').trim().split(/\r?\n/).slice(-3).join(' / ').slice(0, 240);
  return {
    name,
    status: r.status === 0 ? 'pass' : 'fail',
    exit_code: r.status,
    duration_ms: Date.now() - t0,
    summary: tail,
    stderr_tail: r.status !== 0 ? (r.stderr || '').slice(-400) : undefined,
  };
}

const results = [];

console.log('▶ Sima Atlas verify_all — running every automated check.\n');

results.push(step('nightly', 'node', ['scripts/nightly_consolidation.mjs']));
console.log(formatStep(results.at(-1)));

results.push(step('acceptance', 'node', ['scripts/verify_all_acceptance.mjs']));
console.log(formatStep(results.at(-1)));

results.push(step('cursor', 'node', ['tests/cursor_live.headless.smoke.mjs']));
console.log(formatStep(results.at(-1)));

results.push(step('screenshots', 'npx', ['playwright', 'test', 'tests/playwright/canvas_screenshots.spec.ts', '--reporter=line']));
console.log(formatStep(results.at(-1)));

results.push(step('mcp', 'node', ['scripts/mcp_smoke_e2e.mjs']));
console.log(formatStep(results.at(-1)));

const passed = results.filter((r) => r.status === 'pass').length;
const failed = results.filter((r) => r.status === 'fail').length;
const skip = results.filter((r) => r.status === 'skipped').length;

console.log('\n────────────────────────────────────────');
console.log(`▶ Sima Atlas verify_all: ${passed} pass / ${failed} fail / ${skip} skipped`);
const acc = JSON.parse(fs.readFileSync(path.join(ROOT, 'atlas', 'acceptance_runs', '_summary.json'), 'utf8').toString().trim() || '{}');
if (acc && acc.totals) {
  console.log(`  acceptance: blocks_pass=${acc.totals.blocks_pass} blocks_fail=${acc.totals.blocks_fail} blocks_inconclusive=${acc.totals.blocks_inconclusive}`);
}
const screenshotsDir = path.join(ROOT, 'tests', 'playwright', 'screenshots');
if (fs.existsSync(screenshotsDir)) {
  const shots = fs.readdirSync(screenshotsDir).filter((f) => f.endsWith('.png'));
  console.log(`  screenshots: ${shots.length} captured under tests/playwright/screenshots/`);
}
const runs = path.join(ROOT, 'atlas', 'run_state');
if (fs.existsSync(runs)) {
  console.log(`  run_state: ${fs.readdirSync(runs).length} agent run(s) tracked`);
}

if (json) console.log('\n' + JSON.stringify({ results, totals: { passed, failed, skipped: skip } }, null, 2));

process.exit(failed > 0 ? 1 : 0);

function formatStep(r) {
  const symbol = r.status === 'pass' ? '✓' : r.status === 'fail' ? '✗' : '·';
  const t = `${(r.duration_ms / 1000).toFixed(1)}s`;
  const line = ` ${symbol} ${r.name.padEnd(14)} ${r.status.padEnd(8)} ${t.padStart(7)}  ${r.summary || ''}`;
  if (r.status === 'fail') return line + (r.stderr_tail ? `\n     stderr: ${r.stderr_tail}` : '');
  return line;
}

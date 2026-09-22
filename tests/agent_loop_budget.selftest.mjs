#!/usr/bin/env node
// R-8.10 (b.agent-orchestrator) — the autonomous loop's budget counts only
// what THIS loop spent.
//
// It used to read the repo's rolling 24-hour total (token_economics --days 1)
// as «spent during this loop». Every nightly run, test and operator session
// that day was billed to the loop, so on a busy day it stopped with
// «budget — spent ~$1.19 ≥ cap $1.00» before touching a single block — found
// when the frame-gate test started failing for a reason it does not test.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregateTokenEconomics } from '../scripts/token_economics.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const failures = [];
const check = (name, cond, detail = '') => { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); };

// ── Group 1: --since is an exact lower bound, the day window is not ────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-budget-'));
  const dir = path.join(tmp, 'atlas', 'llm_traces');
  fs.mkdirSync(dir, { recursive: true });
  const now = Date.now();
  const trace = (msAgo, tokens) => {
    const at = new Date(now - msAgo).toISOString();
    fs.writeFileSync(path.join(dir, `${at.replace(/[:.]/g, '-')}__t.json`), JSON.stringify({ at, input_tokens: tokens, output_tokens: 0 }));
  };
  trace(3 * 60 * 60 * 1000, 1_000_000);   // someone else's work, 3 h ago
  trace(10 * 60 * 1000, 1_000_000);       // 10 min ago — before the loop started
  trace(60 * 1000, 2_000);                // the loop's own call, 1 min ago
  const loopStarted = new Date(now - 5 * 60 * 1000).toISOString();

  const day = aggregateTokenEconomics({ days: 1, root: tmp });
  const own = aggregateTokenEconomics({ since: loopStarted, root: tmp });
  check('g1: the day window sees every trace', day.totals.trace_count === 3, String(day.totals.trace_count));
  check('g1: --since sees only what came after it', own.totals.trace_count === 1 && own.totals.input_tokens === 2_000, JSON.stringify(own.totals));
  check('g1: the result says which bound it used', own.since === loopStarted);
  check('g1: an unparsable since falls back to the day window, never to «all time»',
    aggregateTokenEconomics({ days: 1, since: 'not-a-date', root: tmp }).totals.trace_count === 3);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── Group 2: the loop asks for its own window ───────────────────────────────
{
  const src = fs.readFileSync(path.join(ROOT, 'scripts', 'agent_loop_daemon.mjs'), 'utf8');
  check('g2: the budget reads token_economics with --since', /token_economics\.mjs', '--since', sinceIso/.test(src));
  check('g2: no rolling day window left in the budget', !/token_economics\.mjs', '--days'/.test(src));
  const calls = src.match(/costEquivalentSince\(([^)]*)\)/g) || [];
  check('g2: every budget call passes the loop start', calls.length >= 3 && calls.every((c) => /costEquivalentSince\((startedAt|sinceIso)\)/.test(c)), calls.join(' '));
}

if (failures.length) {
  console.error('agent_loop_budget.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('agent_loop_budget.selftest: OK (2 groups, all assertions green)');

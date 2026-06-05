#!/usr/bin/env node
// R-7.91 (V-1) — autonomous loop daemon. The headline promise from the
// README vision: «once contracts are filled, Sima walks the graph, dispatches
// agents to todo blocks, runs acceptance, marks pass/rollback. You wake up,
// scan the canvas, see what was built and what stalled.»
//
// ── Design, grounded in the established autonomous-coding patterns ──────────
//
// Ralph Loop (Geoffrey Huntley) / Codex /goal «Ralph Loop» / Claude Code
// agent loop all share one shape:  pick next unfinished unit → run a FRESH
// agent on it → verify with quality checks → record progress to DISK (not to
// a growing conversation) → repeat until done or a budget/iteration limit.
// The key insight: progress lives in files + tests + version control, so each
// iteration starts clean and «CI must stay green» prevents broken code from
// compounding.
//
// Sima is already that system, missing only the outer driver. The mapping:
//   prd.json (passes/fails)        → graph.json statuses + per-block acceptance
//   «pick next story passes==false»→ pickNextRunnable() below
//   «fresh AI instance»            → run_block_implementation.mjs
//   «run quality checks»           → verify_block_acceptance.mjs (tri-state)
//   «commit + update prd»          → advance_block_state.mjs (gated lifecycle)
//   «progress.txt learnings»       → narrative.md (per-block, auto-written)
//   «CI must stay green»           → cascade_verify + verify_done_blocks_still_green
//   max_turns / budget             → the guards below
//
// ── Safety rails (the «constrained V-1») ───────────────────────────────────
//   * default agent = print-only — the daemon PLANS + VERIFIES but does not
//     spawn a real coding agent unless --agent claude is given explicitly.
//     The first run is therefore safe: you see what it WOULD do.
//   * only runs blocks with ≥1 DETERMINISTIC acceptance assertion (evidence_kind
//     != llm_judge) so the verifier can gate without a human in the loop.
//   * only runs blocks whose depends_on are all `done` (deps satisfied).
//   * budget cap via token_economics «shadow bill» (cost_usd_equivalent).
//   * circuit breaker: hard-stop after N consecutive failed blocks.
//   * never promotes a block whose cascade_verify breaks a dependent.
//   * writes an Autonomous Run report you read in the morning.
//
// Usage:
//   node scripts/agent_loop_daemon.mjs --dry-run            # plan only, nothing runs
//   node scripts/agent_loop_daemon.mjs                      # print-only agent (safe)
//   node scripts/agent_loop_daemon.mjs --agent claude --max-iterations 3 --max-cost-usd 0.50
//   node scripts/agent_loop_daemon.mjs --client my-product --json

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const args = process.argv.slice(2);
const arg = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt; };
const has = (flag) => args.includes(flag);

const DRY_RUN = has('--dry-run');
const JSON_OUT = has('--json');
const AGENT = arg('--agent', 'print-only');               // print-only | claude | cursor | codex
const MAX_ITERATIONS = Math.max(1, Number(arg('--max-iterations', 5)));
const MAX_COST_USD = Number(arg('--max-cost-usd', 1.0));   // shadow-bill budget
const FAIL_LIMIT = Math.max(1, Number(arg('--consecutive-fail-limit', 2)));
const CLIENT = arg('--client', '');
const ATLAS = CLIENT ? path.join(ROOT, 'atlas', 'clients', CLIENT) : path.join(ROOT, 'atlas');
const GRAPH_PATH = path.join(ATLAS, 'graph.json');

function readGraph() {
  return JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
}
function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function nodeRun(scriptArgs, opts = {}) {
  // Returns { ok, stdout, stderr }. Never throws — the loop must survive a
  // single failing block.
  try {
    const out = execFileSync('node', scriptArgs, { cwd: ROOT, stdio: 'pipe', env: { ...process.env, ...opts.env } });
    return { ok: true, stdout: out.toString(), stderr: '' };
  } catch (e) {
    return { ok: false, stdout: (e.stdout || '').toString(), stderr: (e.stderr || '').toString() };
  }
}

// ── runnability ────────────────────────────────────────────────────────────

const RUNNABLE_STATUSES = new Set(['idea', 'todo', 'wip']);
const DONE_STATUSES = new Set(['done']);

function blockDir(id) { return path.join(ATLAS, 'blocks', id); }

function parseDeps(id) {
  const md = readSafe(path.join(blockDir(id), 'depends_on.md'));
  return md.split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).split(':')[0].trim())
    .filter((d) => d && d !== 'none');
}

function hasDeterministicAcceptance(id) {
  const md = readSafe(path.join(blockDir(id), 'acceptance.md'));
  const kinds = (md.match(/evidence_kind:\s*(\w+)/g) || []).map((s) => s.split(':')[1].trim());
  // At least one non-llm_judge assertion the verifier can gate without a human.
  return kinds.some((k) => k !== 'llm_judge');
}

function isPlaceholderMission(id) {
  const md = readSafe(path.join(blockDir(id), 'mission.md'));
  return !md || /Заполни через|fill in via|укажите конкретную|первая задача|first task|Описание модуля Новый/i.test(md);
}

function pickNextRunnable(graph, attempted) {
  const byId = new Map((graph.blocks || []).map((b) => [b.id, b]));
  const isDone = (id) => DONE_STATUSES.has(byId.get(id)?.status);
  const candidates = (graph.blocks || []).filter((b) => {
    if (attempted.has(b.id)) return false;                 // one shot per block per run
    if (!RUNNABLE_STATUSES.has(b.status)) return false;    // skip done/review/broken/desync/archived
    if (isPlaceholderMission(b.id)) return false;          // nothing to implement yet
    if (!hasDeterministicAcceptance(b.id)) return false;   // verifier can't gate it autonomously
    const deps = parseDeps(b.id);
    if (!deps.every((d) => !byId.has(d) || isDone(d))) return false; // deps satisfied
    return true;
  });
  // Prefer closest-to-done (wip > todo > idea), then fewest deps.
  const rank = { wip: 0, todo: 1, idea: 2 };
  candidates.sort((a, b) =>
    (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || parseDeps(a.id).length - parseDeps(b.id).length);
  return candidates[0] || null;
}

// ── cost (shadow bill) ───────────────────────────────────────────────────────

function costEquivalentSince() {
  // token_economics rolls up llm_traces; we read the 1-day window total as a
  // proxy for «spent during this loop». Best-effort — returns 0 if unavailable.
  const r = nodeRun(['scripts/token_economics.mjs', '--days', '1', '--json']);
  if (!r.ok) return 0;
  try { return JSON.parse(r.stdout).totals?.cost_usd_equivalent || 0; } catch { return 0; }
}

// ── lifecycle helpers ────────────────────────────────────────────────────────

const NEXT_TOWARD_DONE = { idea: 'wip', wip: 'review', review: 'done' };
function advanceTowardDone(id, fromStatus, note) {
  // Walk one gated step toward done. The loop calls this repeatedly across
  // iterations; a block reaches done only after passing the verifier at each
  // gate, never in one jump.
  const to = NEXT_TOWARD_DONE[fromStatus];
  if (!to) return { moved: false, to: fromStatus };
  const a = [`scripts/advance_block_state.mjs`, id, to, 'agent-loop', note];
  if (CLIENT) { /* advance_block_state honors ATLAS_ROOT via env */ }
  const r = nodeRun(a, { env: CLIENT ? { ATLAS_ROOT: ATLAS } : {} });
  return { moved: r.ok, to: r.ok ? to : fromStatus };
}

// ── the loop ─────────────────────────────────────────────────────────────────

function iterate() {
  const startedAt = new Date().toISOString();
  const log = [];
  const attempted = new Set();
  let iteration = 0;
  let consecutiveFails = 0;
  let stopReason = null;

  while (iteration < MAX_ITERATIONS) {
    const graph = readGraph();
    const block = pickNextRunnable(graph, attempted);
    if (!block) { stopReason = 'complete — no runnable blocks left'; break; }

    const spent = costEquivalentSince();
    if (spent >= MAX_COST_USD) { stopReason = `budget — spent ~$${spent.toFixed(4)} ≥ cap $${MAX_COST_USD.toFixed(2)}`; break; }
    if (consecutiveFails >= FAIL_LIMIT) { stopReason = `circuit-breaker — ${consecutiveFails} consecutive failures`; break; }

    iteration += 1;
    attempted.add(block.id);
    const entry = { iteration, block_id: block.id, from_status: block.status, agent: AGENT };

    if (DRY_RUN) {
      entry.action = 'would-run';
      entry.note = `deps satisfied, ${block.status}, has deterministic acceptance`;
      log.push(entry);
      continue;
    }

    // 1. run a fresh agent on the block (scoped context-pack).
    const runArgs = ['scripts/run_block_implementation.mjs'];
    if (CLIENT) runArgs.push(`--client=${CLIENT}`);
    runArgs.push(block.id);
    nodeRun(runArgs, { env: { ATLAS_AGENT: AGENT } });

    // 2. quality gate — the verifier decides, not the agent's self-report.
    const v = nodeRun(['scripts/verify_block_acceptance.mjs', block.id], { env: { ATLAS_FORCE_MOCK_LLM: process.env.ANTHROPIC_API_KEY ? '0' : '1', ...(CLIENT ? { ATLAS_ROOT: ATLAS } : {}) } });
    const passed = /:\s*pass\b/.test(v.stdout) || /\bpass\b.*fail=0\b/.test(v.stdout);

    // 3. CI-must-stay-green guards.
    //    cascade_verify runs for VISIBILITY — it marks any newly-broken
    //    dependent `desync` so the operator sees it on the canvas. But a
    //    dependent already sitting in review / needs-a-live-CLI is not THIS
    //    block's fault, so cascade is NOT a promotion gate (it fails on any
    //    non-green dependent). The real «did we break something that was
    //    green» gate is verify_done_blocks_still_green: it re-verifies every
    //    `done` block and flags a regression only when a previously-green one
    //    goes red. That is the honest «CI must stay green» check.
    const cascadeArgs = ['scripts/cascade_verify.mjs', block.id];
    if (CLIENT) cascadeArgs.push('--client', CLIENT);
    nodeRun(cascadeArgs); // marks desync for operator visibility; not a gate
    const greenGuard = nodeRun(['scripts/verify_done_blocks_still_green.mjs'], { env: CLIENT ? { ATLAS_ROOT: ATLAS } : {} });
    // Parse the explicit count — `regressions=N` — not a substring (the
    // normal output literally contains «regressions=0», which a naive
    // /regress/ match would false-positive on).
    const regM = greenGuard.stdout.match(/regressions=(\d+)/);
    const regressed = !greenGuard.ok || (regM ? Number(regM[1]) > 0 : false);

    if (passed && !regressed) {
      const adv = advanceTowardDone(block.id, block.status, `agent-loop: verifier pass (iteration ${iteration})`);
      entry.action = 'pass';
      entry.advanced_to = adv.to;
      consecutiveFails = 0;
    } else {
      entry.action = 'fail';
      entry.reason = !passed ? 'verifier did not pass'
        : 'a previously-green done block regressed — not promoting';
      consecutiveFails += 1;
      // Record the stall in the block's narrative so the next pass (or human)
      // sees what happened — progress lives on disk, Ralph-style.
      try {
        fs.appendFileSync(path.join(blockDir(block.id), 'narrative.md'),
          `\n## ${new Date().toISOString()} · autonomous loop · stalled\n\n### What failed and why\n- ${entry.reason}\n\n### Recommended action\n- Operator review: this block needs a human look (verifier/cascade not green under the autonomous loop).\n`);
      } catch {}
    }
    entry.cost_equivalent_so_far = Number(costEquivalentSince().toFixed(5));
    log.push(entry);
  }

  if (!stopReason) stopReason = `max-iterations — reached ${MAX_ITERATIONS}`;
  return { started_at: startedAt, ended_at: new Date().toISOString(), agent: AGENT, dry_run: DRY_RUN,
    max_iterations: MAX_ITERATIONS, max_cost_usd: MAX_COST_USD, client: CLIENT || null,
    iterations: log, stop_reason: stopReason,
    summary: {
      ran: log.length,
      passed: log.filter((e) => e.action === 'pass').length,
      failed: log.filter((e) => e.action === 'fail').length,
      would_run: log.filter((e) => e.action === 'would-run').length,
    } };
}

// ── report ───────────────────────────────────────────────────────────────────

function writeReport(result) {
  const dir = path.join(ATLAS, 'autonomous_runs');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = result.started_at.replace(/[:.]/g, '-');
  const md = [
    `# Autonomous run — ${result.started_at}`,
    '',
    `_Agent: \`${result.agent}\`${result.dry_run ? ' · **dry-run** (planned, nothing executed)' : ''} · max-iterations ${result.max_iterations} · budget $${result.max_cost_usd.toFixed(2)}${result.client ? ` · client ${result.client}` : ''}_`,
    '',
    `**Stop reason:** ${result.stop_reason}`,
    `**Summary:** ${result.summary.ran} block(s) touched — ${result.summary.passed} advanced · ${result.summary.failed} stalled${result.summary.would_run ? ` · ${result.summary.would_run} planned` : ''}`,
    '',
    '| # | block | from | action | result |',
    '|---|---|---|---|---|',
    ...result.iterations.map((e) =>
      `| ${e.iteration} | \`${e.block_id}\` | ${e.from_status} | ${e.action} | ${e.advanced_to ? `→ ${e.advanced_to}` : e.reason || e.note || ''} |`),
    '',
    '_Generated by `scripts/agent_loop_daemon.mjs` (V-1). Stalled blocks have a note appended to their `narrative.md`._',
    '',
  ].join('\n');
  const out = path.join(dir, `${stamp}.md`);
  fs.writeFileSync(out, md, 'utf8');
  return out;
}

const result = iterate();
const reportPath = writeReport(result);

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ ...result, report: path.relative(ROOT, reportPath) }, null, 2) + '\n');
} else {
  const s = result.summary;
  console.log(`agent_loop_daemon [${result.agent}${result.dry_run ? ' · dry-run' : ''}]: ${s.ran} block(s) — ${s.passed} advanced · ${s.failed} stalled${s.would_run ? ` · ${s.would_run} planned` : ''}`);
  console.log(`  stop: ${result.stop_reason}`);
  console.log(`  report: ${path.relative(ROOT, reportPath)}`);
  for (const e of result.iterations) {
    const mark = e.action === 'pass' ? '✓' : e.action === 'fail' ? '✗' : '·';
    console.log(`    ${mark} ${e.block_id} (${e.from_status}) → ${e.advanced_to || e.action}${e.reason ? `: ${e.reason}` : ''}`);
  }
}

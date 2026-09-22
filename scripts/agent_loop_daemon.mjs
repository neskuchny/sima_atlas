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
//   * R-8.09 — respects the frame review. A block whose agent has not had its
//     understanding.md confirmed by the operator gets a declare-only run (or
//     none, if a declaration is already waiting) and is reported as
//     «awaiting-frame» — never verified, promoted, or counted as a failure.
//     Overnight that means: agents declare at night, you confirm in the
//     morning, code is written the next night. `--frame-review skip` restores
//     the single-run flow for a fully unattended night (logged per block).
//
// Usage:
//   node scripts/agent_loop_daemon.mjs --dry-run            # plan only, nothing runs
//   node scripts/agent_loop_daemon.mjs                      # print-only agent (safe)
//   node scripts/agent_loop_daemon.mjs --agent claude --max-iterations 3 --max-cost-usd 0.50
//   node scripts/agent_loop_daemon.mjs --client my-product --json
//   npm run loop            # dry-run
//   npm run loop:run        # print-only
//   npm run loop:overnight  # real agent, overnight defaults (8 iters, $2 cap)
//
// ── Schedule it overnight (cron / launchd / Task Scheduler) ────────────────
// This is a one-shot, not a resident process — cron-friendly. The «you wake up,
// scan the canvas» promise = schedule it for the small hours, read the
// Autonomous Run report (and the canvas) in the morning.
//   crontab -e:
//     # 02:00 nightly — autonomous loop on the real agent, capped at $2
//     0 2 * * *  cd /path/to/sima_atlas && /usr/bin/node scripts/agent_loop_daemon.mjs \
//                  --agent claude --max-iterations 8 --max-cost-usd 2.00 >> atlas/autonomous_runs/cron.log 2>&1

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const args = process.argv.slice(2);
const arg = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt; };
const has = (flag) => args.includes(flag);

const DRY_RUN = has('--dry-run');
const JSON_OUT = has('--json');
const AGENT = arg('--agent', 'print-only');               // print-only | claude | cursor | codex | gemini
// R-7.99 — operator-targeted run: `--only b.x,b.y` restricts the queue to
// the named blocks (eligibility rules still apply — a block that isn't
// runnable/semantic-red is still skipped). The «доделай вот этот блок
// сейчас» case, without waiting for the queue to reach it.
const ONLY = String(arg('--only', '')).split(',').map((s) => s.trim()).filter(Boolean);
const MAX_ITERATIONS = Math.max(1, Number(arg('--max-iterations', 5)));
const MAX_COST_USD = Number(arg('--max-cost-usd', 1.0));   // shadow-bill budget
const FAIL_LIMIT = Math.max(1, Number(arg('--consecutive-fail-limit', 2)));
const CLIENT = arg('--client', '');
const FRAME_REVIEW = String(arg('--frame-review', '')).toLowerCase();   // '' | skip
if (FRAME_REVIEW && FRAME_REVIEW !== 'skip') {
  console.error(`agent_loop_daemon: --frame-review accepts only "skip", got "${FRAME_REVIEW}"`);
  process.exit(1);
}
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

function ownedAliveFiles(id) {
  // Real code files the block owns (alive in files.md), for auto-rollback.
  const md = readSafe(path.join(blockDir(id), 'files.md'));
  return md.split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- ') && /\[alive\]/.test(l))
    .map((l) => l.slice(2).split(/\s+\[alive\]/)[0].trim())
    .filter((f) => f && fs.existsSync(path.join(ROOT, f)));
}

function snapshotOwnedFiles(id) {
  // Copy the block's alive files to a temp dir so a regressing run can be
  // undone. Returns { restore() } or null if nothing to snapshot.
  const files = ownedAliveFiles(id);
  if (!files.length) return null;
  const snapDir = fs.mkdtempSync(path.join(os.tmpdir(), `sima-rollback-${id}-`));
  const saved = [];
  for (const f of files) {
    const src = path.join(ROOT, f);
    const dst = path.join(snapDir, f.replace(/[\\/]/g, '__'));
    try { fs.copyFileSync(src, dst); saved.push({ f, dst }); } catch {}
  }
  return {
    count: saved.length,
    restore() {
      let n = 0;
      for (const { f, dst } of saved) {
        try { fs.copyFileSync(dst, path.join(ROOT, f)); n += 1; } catch {}
      }
      try { fs.rmSync(snapDir, { recursive: true, force: true }); } catch {}
      return n;
    },
    discard() { try { fs.rmSync(snapDir, { recursive: true, force: true }); } catch {} },
  };
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

// R-7.95 — a `done` block whose persisted semantic_review.json says the
// implementation does NOT match the contract (mission or methodology FAILED)
// is no longer truly done by the Kanon's «Contract as Arbiter» standard.
// Operator's transcript: «мы могли потом запустить нашу систему, и она
// прошлась по всем блокам, всё проверила и всё переписала так, как нужно».
// The loop picks such blocks back up (treats them as runnable) so the agent
// gets the previous run's todo_to_pass and can remediate.
function isDoneButSemanticRed(id) {
  const p = path.join(blockDir(id), 'semantic_review.json');
  if (!fs.existsSync(p)) return false;
  try {
    const sr = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (sr.mock) return false; // inconclusive → don't disturb
    return sr.mission_fulfilled?.verdict === 'fail' || sr.methodology_followed?.verdict === 'fail';
  } catch { return false; }
}

function pickNextRunnable(graph, attempted) {
  const byId = new Map((graph.blocks || []).map((b) => [b.id, b]));
  const isDone = (id) => DONE_STATUSES.has(byId.get(id)?.status);
  // «still done» for dependency-satisfaction: a semantic-red done block still
  // counts as done for OTHER blocks (depends_on satisfied) — we don't cascade
  // distrust — but the daemon will revisit it on its own pass.
  const candidates = (graph.blocks || []).filter((b) => {
    if (attempted.has(b.id)) return false;                 // one shot per block per run
    if (ONLY.length && !ONLY.includes(b.id)) return false; // operator-targeted run
    // Include done blocks ONLY IF semantic review says they failed.
    const eligibleStatus = RUNNABLE_STATUSES.has(b.status)
      || (b.status === 'done' && isDoneButSemanticRed(b.id));
    if (!eligibleStatus) return false;
    if (isPlaceholderMission(b.id)) return false;          // nothing to implement yet
    if (!hasDeterministicAcceptance(b.id)) return false;   // verifier can't gate it autonomously
    // Deps check: required for blocks being implemented FROM SCRATCH (idea/
    // todo/wip → done). NOT required for done-block remediation: if the block
    // is already done, its deps were satisfied at promotion time and we're
    // only fixing its semantic gap (e.g. an internal bug), not rebuilding.
    const isRemediation = b.status === 'done';
    if (!isRemediation) {
      const deps = parseDeps(b.id);
      if (!deps.every((d) => !byId.has(d) || isDone(d))) return false;
    }
    return true;
  });
  // Prefer closest-to-done (wip > todo > idea), then semantic-red done blocks
  // (so the loop finishes started work before starting new), then fewest deps.
  const rank = { wip: 0, todo: 1, idea: 2, done: 3 };
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

// ── R-8.05 verdict + env helpers ─────────────────────────────────────────────

// The persisted run report is the source of truth for «did the verifier pass».
// Parsing the verifier's human-readable stdout was how `inconclusive` leaked
// through as a pass. A missing / unparseable report is NOT a pass.
function readVerdict(blockId) {
  const p = path.join(ATLAS, 'acceptance_runs', blockId, '_latest.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')).verdict || null; }
  catch { return null; }
}

// One mock-decision for every verification lane in an iteration (block
// verifier, cascade, green guard). Previously the three disagreed: the block
// verifier forced mock unless ANTHROPIC_API_KEY was set (ignoring google /
// openai / claude_cli / ollama), cascade inherited the raw env and so ran
// live-LLM selftests, and the green guard always forced mock. The same
// assertion could therefore pass in one lane and mint a `desync` in another.
const LIVE_PROVIDER_AVAILABLE = Boolean(
  process.env.ANTHROPIC_API_KEY || process.env.GOOGLE_API_KEY || process.env.OPENAI_API_KEY,
);
const verifyEnv = {
  ATLAS_FORCE_MOCK_LLM: LIVE_PROVIDER_AVAILABLE ? '0' : '1',
  ...(CLIENT ? { ATLAS_ROOT: ATLAS } : {}),
};

// How many `done` blocks are red BEFORE we touch anything. Used as the
// regression baseline so pre-existing red (e.g. a block needing a live agent
// CLI) is reported but never attributed to this run.
function countRedDoneBlocks() {
  const g = nodeRun(['scripts/verify_done_blocks_still_green.mjs'], { env: CLIENT ? { ATLAS_ROOT: ATLAS } : {} });
  const m = g.stdout.match(/regressions=(\d+)/);
  return m ? Number(m[1]) : (g.ok ? 0 : null);
}

// ── the loop ─────────────────────────────────────────────────────────────────

function iterate() {
  const startedAt = new Date().toISOString();
  const log = [];
  const attempted = new Set();
  let iteration = 0;
  let consecutiveFails = 0;
  let stopReason = null;
  // Baseline measured once, before any agent runs (skipped in dry-run — it
  // spawns verifiers and dry-run must not execute anything).
  const baselineRed = DRY_RUN ? null : countRedDoneBlocks();
  if (baselineRed) console.log(`  (baseline: ${baselineRed} done block(s) already red — will not be attributed to this run)`);

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

    // 0. snapshot the block's owned files so a regressing run can be undone.
    //    Only for real agent runs — print-only edits nothing.
    const snapshot = AGENT !== 'print-only' ? snapshotOwnedFiles(block.id) : null;

    // 1. run a fresh agent on the block (scoped context-pack).
    const runArgs = ['scripts/run_block_implementation.mjs'];
    if (CLIENT) runArgs.push(`--client=${CLIENT}`);
    runArgs.push(block.id);
    const run = nodeRun(runArgs, { env: { ATLAS_AGENT: AGENT, ...(FRAME_REVIEW ? { ATLAS_FRAME_REVIEW: FRAME_REVIEW } : {}) } });

    // R-8.09 — a run that only declared the frame (or did not start the agent
    // because a declaration is waiting) wrote no code. Verifying it would
    // measure the old state and could promote or «fail» the block for work
    // that was never attempted.
    const gatePhase = ((run.stdout || '').match(/^frame_gate: phase=(\w+)/m) || [])[1] || null;
    entry.frame_gate = gatePhase;
    if (gatePhase === 'declare' || gatePhase === 'awaiting' || gatePhase === 'refused') {
      if (snapshot) snapshot.discard();
      if (gatePhase === 'declare' && !run.ok) {
        entry.action = 'fail';
        entry.reason = 'declare phase: the agent did not write understanding.md';
        consecutiveFails += 1;
      } else {
        entry.action = 'awaiting-frame';
        entry.note = gatePhase === 'declare'
          ? 'agent declared its frame — confirm or correct it on the canvas'
          : 'frame awaits the operator — agent not started';
      }
      entry.cost_equivalent_so_far = Number(costEquivalentSince().toFixed(5));
      log.push(entry);
      continue;
    }

    // 2. quality gate — the verifier decides, not the agent's self-report.
    const v = nodeRun(['scripts/verify_block_acceptance.mjs', block.id], { env: verifyEnv });
    // R-8.05 — this used to be a pair of stdout regexes:
    //     /:\s*pass\b/.test(out) || /\bpass\b.*fail=0\b/.test(out)
    // The second one matched the verifier's INCONCLUSIVE line, because
    // «· b.x: inconclusive (pass=0 fail=0 skipped=7)» contains `pass=0`
    // followed by `fail=0`. Since neither the semantic nor the diff-review
    // gate blocks on inconclusive, an unverifiable block was promoted — the
    // exact «silent green» Kanon V forbids, in the one place that writes
    // status autonomously. The persisted run report is now the source of
    // truth, and a parse failure never green-lights (the same rule this file
    // already applies to the semantic gate).
    const passed = readVerdict(block.id) === 'pass';

    // 3. CI-must-stay-green guards.
    //    ORDER MATTERS (R-8.05): verify_done_blocks_still_green runs BEFORE
    //    cascade_verify. cascade rewrites a failing dependent's status to
    //    `desync`, and the green guard only inspects blocks whose status is
    //    `done` — so running cascade first HID exactly the regressions the
    //    guard exists to catch (a done dependent broken by this run was
    //    relabelled desync and then counted as regressions=0).
    //    cascade_verify still runs, for VISIBILITY: it marks newly-broken
    //    dependents so the operator sees them on the canvas. It is not a
    //    promotion gate (it fails on any non-green dependent, including ones
    //    that were already red for unrelated reasons).
    const greenGuard = nodeRun(['scripts/verify_done_blocks_still_green.mjs'], { env: CLIENT ? { ATLAS_ROOT: ATLAS } : {} });
    // Parse the explicit count — `regressions=N` — not a substring (the
    // normal output literally contains «regressions=0», which a naive
    // /regress/ match would false-positive on).
    const regM = greenGuard.stdout.match(/regressions=(\d+)/);
    const afterRed = regM ? Number(regM[1]) : (greenGuard.ok ? 0 : null);
    // R-8.05 — compare against the pre-run baseline. A done block that was
    // ALREADY red (e.g. «needs a live cursor-agent CLI») used to make every
    // iteration report «regressed», rolling back the agent's unrelated work,
    // writing a false attribution to narrative.md and tripping the circuit
    // breaker after two iterations.
    const preExistingRed = baselineRed;
    const regressed = afterRed === null
      ? !greenGuard.ok
      : (preExistingRed === null ? afterRed > 0 : afterRed > preExistingRed);
    entry.pre_existing_red = preExistingRed;
    entry.done_blocks_red_after = afterRed;

    const cascadeArgs = ['scripts/cascade_verify.mjs', block.id];
    if (CLIENT) cascadeArgs.push('--client', CLIENT);
    nodeRun(cascadeArgs, { env: verifyEnv }); // marks desync for operator visibility; not a gate

    // 4. SEMANTIC gate (Kanon «Contract as Arbiter», Counter-Force to
    //    simplification). Deterministic checks passing isn't enough — the
    //    operator's «does it match the meaning + methodology + will it work?»
    //    must hold too. We run semantic_verify and BLOCK promotion only on a
    //    hard semantic FAIL (mission or methodology). `inconclusive` (e.g. no
    //    live LLM) does NOT block — graceful degradation — but is surfaced.
    let semanticFail = false, semanticVerdict = 'skipped';
    const wasDoneRemediation = block.status === 'done';
    if (passed && !regressed) {
      const semArgs = ['scripts/semantic_verify.mjs', block.id, '--json'];
      if (CLIENT) semArgs.push('--client', CLIENT);
      nodeRun(semArgs);
      // R-7.99 — source of truth is the PERSISTED semantic_review.json that
      // semantic_verify writes before exiting, NOT its stdout. Caught live:
      // the gateway logs a provider line to stdout before the JSON, so
      // JSON.parse(stdout) threw, the catch silently yielded `inconclusive`,
      // and a block whose fresh verdict was fail-on-all-five-dimensions got
      // promoted to «done (remediated)». A parse failure must never
      // green-light.
      let sv = null;
      try { sv = JSON.parse(fs.readFileSync(path.join(blockDir(block.id), 'semantic_review.json'), 'utf8')); } catch {}
      if (sv && !sv.mock) {
        semanticVerdict = sv.overall || 'inconclusive';
        // hard-fail only when the judge is sure the meaning/methodology is wrong
        semanticFail = sv.mission_fulfilled?.verdict === 'fail' || sv.methodology_followed?.verdict === 'fail';
        if (semanticFail) entry.semantic_todo = (sv.todo_to_pass || []).slice(0, 5);
      } else {
        semanticVerdict = 'inconclusive';
      }
      entry.semantic = semanticVerdict;
      // For a block picked BECAUSE it was semantic-red, the bar is higher:
      // «remediated» requires the red to be ACTUALLY CLEARED by a live
      // verdict. `inconclusive` (no key / mock / parse issue) clears nothing
      // — without this, the loop would stamp «remediated» on every revisit
      // while the persisted verdict stays fail, forever.
      if (wasDoneRemediation && !semanticFail && semanticVerdict === 'inconclusive') {
        semanticFail = true;
        entry.reason_hint = 'remediation requires a live semantic verdict clearing the red — got inconclusive';
      }
    }

    // 5. DIFF-REVIEW gate (R-8.01, b.diff-review — the fourth arbiter).
    //    The semantic judge asks «does it match the mission?» reading whole
    //    files; this one asks «is there a bug/security-hole/regression/ReDoS
    //    in THIS CHANGE?» reading only the diff of the block's owned files.
    //    A hard BLOCKING fail blocks promotion exactly like a semantic fail;
    //    `inconclusive` (no live LLM) does NOT block — graceful degradation.
    let diffReviewFail = false, diffReviewVerdict = 'skipped';
    if (passed && !regressed && !semanticFail) {
      const owned = ownedAliveFiles(block.id);
      if (owned.length) {
        const drArgs = ['scripts/review_diff.mjs', '--since', 'HEAD', '--block', block.id, '--json'];
        for (const f of owned) { drArgs.push('--files', f); }
        nodeRun(drArgs, { env: CLIENT ? { ATLAS_ROOT: ATLAS } : {} });
        // Source of truth is the persisted diff_review.json, not stdout
        // (same lesson as the semantic gate — the gateway pollutes stdout).
        let dr = null;
        try { dr = JSON.parse(fs.readFileSync(path.join(blockDir(block.id), 'diff_review.json'), 'utf8')); } catch {}
        if (dr && !dr.mock) {
          diffReviewVerdict = dr.verdict || 'inconclusive';
          diffReviewFail = dr.verdict === 'fail';
          if (diffReviewFail) entry.diff_review_findings = (dr.findings || []).filter((f) => f.severity === 'blocking').slice(0, 5);
        } else {
          diffReviewVerdict = 'inconclusive';
        }
        entry.diff_review = diffReviewVerdict;
      } else {
        entry.diff_review = 'no-owned-files';
      }
    }

    if (passed && !regressed && !semanticFail && !diffReviewFail) {
      // For a semantic-red done block we just re-judged: if it's now green we
      // DON'T need to advance (it stays `done`) — the verdict update IS the
      // promotion. Otherwise walk one gated step.
      if (wasDoneRemediation) {
        entry.action = 'pass';
        entry.advanced_to = 'done (remediated)';
      } else {
        const adv = advanceTowardDone(block.id, block.status, `agent-loop: verifier pass + semantic ${semanticVerdict} (iteration ${iteration})`);
        entry.action = 'pass';
        entry.advanced_to = adv.to;
      }
      consecutiveFails = 0;
      if (snapshot) snapshot.discard(); // run was good — drop the safety copy
    } else {
      entry.action = 'fail';
      entry.reason = !passed ? 'verifier did not pass'
        : regressed ? 'a previously-green done block regressed — not promoting'
        : semanticFail ? (entry.reason_hint || 'semantic verify FAILED — implementation does not match the block\'s meaning/methodology')
        : diffReviewFail ? 'diff-review FAILED — a BLOCKING problem in the change (security/correctness/regression/ReDoS)'
        : entry.reason_hint || 'gate failed';
      consecutiveFails += 1;
      // AUTO-ROLLBACK: if this run regressed a previously-green done block,
      // undo the agent's edits to this block's owned files. A failed
      // implementation should leave the tree no worse than it found it
      // («marks pass/rollback»). We only roll back on REGRESSION, not on a
      // plain non-pass (a todo block that's simply not done yet is expected
      // to be red — its partial progress is kept for the next iteration).
      if (snapshot && regressed) {
        const restored = snapshot.restore();
        entry.rolled_back = restored;
        entry.reason += ` — auto-rolled-back ${restored} owned file(s)`;
        // re-mark dependents green now that we reverted (best-effort)
        nodeRun(['scripts/verify_done_blocks_still_green.mjs'], { env: CLIENT ? { ATLAS_ROOT: ATLAS } : {} });
      } else if (snapshot) {
        snapshot.discard();
      }
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
      awaiting_frame: log.filter((e) => e.action === 'awaiting-frame').length,
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
    `**Summary:** ${result.summary.ran} block(s) touched — ${result.summary.passed} advanced · ${result.summary.failed} stalled${result.summary.would_run ? ` · ${result.summary.would_run} planned` : ''}${result.summary.awaiting_frame ? ` · ${result.summary.awaiting_frame} waiting for you to confirm the agent's frame (Overview panel)` : ''}`,
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
  console.log(`agent_loop_daemon [${result.agent}${result.dry_run ? ' · dry-run' : ''}]: ${s.ran} block(s) — ${s.passed} advanced · ${s.failed} stalled${s.would_run ? ` · ${s.would_run} planned` : ''}${s.awaiting_frame ? ` · ${s.awaiting_frame} awaiting frame confirmation` : ''}`);
  console.log(`  stop: ${result.stop_reason}`);
  console.log(`  report: ${path.relative(ROOT, reportPath)}`);
  for (const e of result.iterations) {
    const mark = e.action === 'pass' ? '✓' : e.action === 'fail' ? '✗' : e.action === 'awaiting-frame' ? '⏸' : '·';
    console.log(`    ${mark} ${e.block_id} (${e.from_status}) → ${e.advanced_to || e.action}${e.reason ? `: ${e.reason}` : e.note ? `: ${e.note}` : ''}`);
  }
}

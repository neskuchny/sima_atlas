#!/usr/bin/env node
// PR4.5: run_block_implementation
//
// Single entry point that asks the user's coding agent to implement a block:
//   1. builds the deterministic context-pack via scripts/build_context_pack.mjs
//   2. composes a prompt = block tasks + acceptance + caller's free-form prompt
//   3. tries to invoke `claude --print --add-dir atlas/blocks/<id>` (Claude Code
//      CLI). If `claude` is not on PATH, falls back to printing a ready-to-paste
//      prompt and saving it to atlas/agent_invocations/<UTC>__<block>.txt so
//      Cursor / any other agent can pick it up.
//   4. logs an `agent_invocation` line into the block's checks.log.
//
// Usage:
//   node scripts/run_block_implementation.mjs <block_id> [-- "<additional prompt>"]
//   ATLAS_AGENT=claude node scripts/run_block_implementation.mjs b.docs -- "fix mermaid render"
//
// Env:
//   ATLAS_AGENT       — 'claude' (default) | 'codex' | 'cursor' | 'print-only'
//   ATLAS_AGENT_FLAGS — extra flags forwarded to the CLI (e.g. "--model claude-haiku-4-5")
//   ATLAS_ROOT        — overrides atlas root (set automatically when --client= is passed,
//                       so run_state, verifier, etc. write under atlas/clients/<id>/)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startRun, transitionRunState } from './run_state.mjs';
import { createWorkspace, captureDiff, writeDiffProposal, cleanupWorkspace } from './agent_workspace.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

// Phase R-7.22 — multi-tenant orchestrator. `--client=<id>` redirects the
// atlas root to atlas/clients/<id>/ so blocks, rules, tech_stack, run_state
// and acceptance verdicts all land under the active client. Without it we
// fall back to the legacy single-tenant atlas/ root.
const argv = process.argv.slice(2);
const clientFlagIdx = argv.findIndex((a) => a.startsWith('--client='));
const clientId = clientFlagIdx >= 0 ? argv[clientFlagIdx].slice('--client='.length).trim() : '';
if (clientFlagIdx >= 0) argv.splice(clientFlagIdx, 1);
if (clientId && !/^[a-zA-Z0-9._-]+$/.test(clientId)) {
  console.error(`run_block_implementation: invalid --client value "${clientId}"`);
  process.exit(1);
}

const ATLAS = clientId ? path.join(ROOT, 'atlas', 'clients', clientId) : path.join(ROOT, 'atlas');
const BLOCKS = path.join(ATLAS, 'blocks');
const INVOCATIONS_DIR = path.join(ATLAS, 'agent_invocations');

// Children (run_state, verify_block_acceptance) honor ATLAS_ROOT, so set it
// once here and they all redirect to the client root automatically.
if (clientId) process.env.ATLAS_ROOT = ATLAS;

const dashDash = argv.indexOf('--');
const blockId = argv[0];
const extraPrompt = dashDash >= 0 ? argv.slice(dashDash + 1).join(' ').trim() : '';
if (!blockId) {
  console.error('Usage: node scripts/run_block_implementation.mjs [--client=<id>] <block_id> [-- "<extra prompt>"]');
  process.exit(1);
}

const blockDir = path.join(BLOCKS, blockId);
if (!fs.existsSync(blockDir)) {
  console.error(`run_block_implementation: block dir not found → ${blockDir}`);
  process.exit(2);
}

// 1. Build context-pack (rebuilds atlas/context_packs/<id>.json).
// build_context_pack does not honor ATLAS_ROOT yet — for multi-tenant
// runs we let it fail soft with a warning. The agent still has the
// inline prompt + block dir mounted, so it can work without the pack.
try {
  execFileSync('node', ['scripts/build_context_pack.mjs', blockId], { cwd: ROOT, stdio: 'pipe' });
} catch (e) {
  console.warn(`run_block_implementation: build_context_pack failed (non-fatal) → ${e.message}`);
}

// 2. Compose the prompt
function readSafe(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }
function readJsonSafe(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function tailLines(s, n) {
  const all = String(s || '').split(/\r?\n/);
  return all.slice(-n).join('\n');
}
const mission = readSafe(path.join(blockDir, 'mission.md'));
const kpi = readSafe(path.join(blockDir, 'kpi.md'));
const acceptance = readSafe(path.join(blockDir, 'acceptance.md'));
const tasks = readSafe(path.join(blockDir, 'tasks.md'));
const filesList = readSafe(path.join(blockDir, 'files.md'));
const rules = readSafe(path.join(ATLAS, 'rules.md'));
const techStack = readSafe(path.join(ATLAS, 'tech_stack.md'));

// R-7.77 — memory injection. Agent sees what was tried before, what
// was rejected, and operator-level architectural rules. Prevents the
// "I asked for LLM, agent wrote a math formula" failure mode by
// surfacing past decisions and dont_use rules at prompt time.
const checksTail = tailLines(readSafe(path.join(blockDir, 'checks.log')), 30);
const decisions = readSafe(path.join(blockDir, 'decisions.log')).trim();
const codeSummary = readSafe(path.join(blockDir, 'code_summary.md')).trim();
const narrative = readSafe(path.join(blockDir, 'narrative.md')).trim();
const profileDir = path.join(ATLAS, 'operator_profile');
const opMem = {
  lessons:    (readJsonSafe(path.join(profileDir, 'lessons.json'))?.lessons || []).filter(e => !e.block_id || e.block_id === blockId).slice(-15),
  dont_use:   (readJsonSafe(path.join(profileDir, 'dont_use.json'))?.entries || []).filter(e => !e.block_id || e.block_id === blockId).slice(-15),
  always_use: (readJsonSafe(path.join(profileDir, 'always_use.json'))?.entries || []).filter(e => !e.block_id || e.block_id === blockId).slice(-15),
};
const fmtList = (arr, key = 'rule') => arr.map((e, i) => `- ${e[key] || e.text || e.note || JSON.stringify(e)}${e.reason ? ` — ${e.reason}` : ''}`).join('\n');
const dontUseTxt = opMem.dont_use.length ? fmtList(opMem.dont_use) : '';
const alwaysUseTxt = opMem.always_use.length ? fmtList(opMem.always_use) : '';
const lessonsTxt = opMem.lessons.length ? fmtList(opMem.lessons, 'lesson') : '';
const hasMemory = (decisions || narrative || codeSummary || checksTail || dontUseTxt || alwaysUseTxt || lessonsTxt);

const prompt = [
  `# Implement block ${blockId}`,
  '',
  '## Mission',
  mission.trim(),
  '',
  '## Tasks (pick the first unchecked one)',
  tasks.trim(),
  '',
  '## KPI to satisfy',
  kpi.trim(),
  '',
  '## Acceptance criteria',
  acceptance.trim(),
  '',
  '## Files you may edit (alive only)',
  filesList.trim(),
  '',
  '## Project rules',
  rules.trim(),
  '',
  '## Tech stack (forbidden commands enforced via guard_against_drift)',
  techStack.trim(),
  '',
  // R-7.77 — block memory: surface past decisions, narrative summary,
  // and operator hard rules. Each section guarded so we don't dump
  // empty headings on virgin blocks.
  hasMemory ? '## ⚠ Block memory (read this BEFORE writing code)' : '',
  hasMemory ? 'These are constraints, decisions, and lessons accumulated from previous runs and operator feedback. Do NOT contradict them without explicit operator override.' : '',
  hasMemory ? '' : '',
  dontUseTxt ? `### NEVER do (operator-locked):\n${dontUseTxt}\n` : '',
  alwaysUseTxt ? `### ALWAYS do (operator-locked):\n${alwaysUseTxt}\n` : '',
  decisions ? `### Past decisions (don't reverse):\n${decisions}\n` : '',
  lessonsTxt ? `### Lessons from this & related blocks:\n${lessonsTxt}\n` : '',
  narrative ? `### Run history (human-readable):\n${tailLines(narrative, 80)}\n` : '',
  codeSummary ? `### Current code summary:\n${codeSummary}\n` : '',
  checksTail ? `### Recent run log (last 30 lines of checks.log):\n\`\`\`\n${checksTail}\n\`\`\`\n` : '',
  extraPrompt ? `## Operator note\n${extraPrompt}\n` : '',
  '## How to report progress',
  `Append a line to \`${path.relative(ROOT, blockDir).split(path.sep).join('/')}/checks.log\` with the test/check result.`,
  'When done, set status to `review` via MCP transition_block.',
  '',
  '## How to update memory',
  'After your run, summarize what you did in human language and write it to:',
  `- \`${path.relative(ROOT, blockDir).split(path.sep).join('/')}/narrative.md\` — append a section headed \`## <ISO-timestamp> · <one-line summary>\` with sub-sections \`### What I tried\`, \`### What worked\`, \`### What failed and why\`, \`### Decisions made\`. Write in plain English (or operator's language), not jargon-only — future agents will read this in 2 weeks.`,
  `- \`${path.relative(ROOT, blockDir).split(path.sep).join('/')}/decisions.log\` — for each architectural choice, append \`<ISO-timestamp> | <decision> | <rationale>\` (one line each). These are append-only; don't rewrite past entries.`,
  '',
].filter(Boolean).join('\n');

// 3. Persist invocation prompt for audit / Cursor pickup
fs.mkdirSync(INVOCATIONS_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const invocationPath = path.join(INVOCATIONS_DIR, `${ts}__${blockId}.txt`);
fs.writeFileSync(invocationPath, prompt, 'utf8');

// 4. Invoke the agent
const agent = (process.env.ATLAS_AGENT || 'claude').toLowerCase();
const extraFlags = (process.env.ATLAS_AGENT_FLAGS || '').split(/\s+/).filter(Boolean);

function which(cmd) {
  const looker = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  if (looker.status === 0) return looker.stdout.split(/\r?\n/)[0].trim() || null;
  return null;
}

function appendCheck(kind, result, note) {
  const checks = path.join(blockDir, 'checks.log');
  fs.appendFileSync(checks, `${new Date().toISOString()}\t${kind}\t${result}\t${note}\n`, 'utf8');
}

function runCli(cmd, args, opts) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 240_000,
    ...opts,
  });
  return r;
}

// PR-7+8 (b.agent-orchestrator): start FSM + optional workspace BEFORE the
// agent spawns. Workspace gated on ATLAS_USE_WORKSPACE=1 so existing flows
// keep working unchanged.
const useWorkspace = process.env.ATLAS_USE_WORKSPACE === '1';
let runState = null;
let workspace = null;
try {
  runState = startRun({
    block_id: blockId,
    agent,
    prompt_file: invocationPath,
    run_id: process.env.ATLAS_PRESET_RUN_ID || null,
  });
  if (useWorkspace && agent !== 'print-only') {
    workspace = createWorkspace({ block_id: blockId, run_id: runState.run_id });
    transitionRunState(runState.run_id, 'PreparingWorkspace', { workspace_path: workspace.workspace_path });
  }
} catch (e) {
  console.warn(`run_block_implementation: FSM init failed (${e.message}); continuing without state tracking`);
}

function fsm(state, meta) {
  if (!runState) return;
  try { transitionRunState(runState.run_id, state, meta || {}); }
  catch (e) { console.warn(`fsm: ${state} transition failed: ${e.message}`); }
}

if (agent === 'print-only' || (agent === 'claude' && !which('claude')) || (agent === 'codex' && !which('codex')) || (agent === 'cursor' && !which('cursor-agent'))) {
  // R-7.32 — добавил cursor-agent в fallback. Раньше при отсутствии
  // cursor-agent CLI оркестратор крашился `spawnSync ENOENT` exit 5.
  // Graceful fallback: print the prompt for the user to paste anywhere.
  console.log(`run_block_implementation: agent CLI "${agent}" not on PATH or print-only mode`);
  console.log(`  prompt saved to: ${path.relative(ROOT, invocationPath)}`);
  console.log(`  context-pack:   atlas/context_packs/${blockId}.json`);
  console.log('');
  console.log('--- prompt below — paste into any coding agent ---');
  console.log(prompt);
  appendCheck('agent_invocation', 'pass', `agent=${agent} mode=print-only file=${path.relative(ROOT, invocationPath)}`);
  // PR-4: in print-only mode the agent hasn't run yet, so verifier would only
  // measure the pre-existing state. Surface that explicitly without spawning.
  console.log('');
  console.log(`tip: after pasting & implementing, run \`node scripts/verify_block_acceptance.mjs ${blockId}\` to see acceptance verdict.`);
  // PR-7: FSM completes immediately in print-only mode — there's no agent
  // run to track further. We mark Succeeded with a clear summary so the UI
  // doesn't show a perpetually-pending run.
  if (runState) {
    fsm('LaunchingAgent', { note: 'print-only mode' });
    fsm('Running', { note: 'print-only invocation; agent will run externally' });
    fsm('Finishing', { note: 'print-only handoff' });
    fsm('Succeeded', { exit_code: 0, summary: 'print-only — operator picks up the prompt' });
  }
  process.exit(0);
}

// Multi-tenant: --add-dir paths must point at the actual block dir under
// the active client, not the legacy atlas/blocks/<id>.
const blockDirRel = path.relative(ROOT, blockDir).split(path.sep).join('/');
const atlasDirRel = path.relative(ROOT, ATLAS).split(path.sep).join('/');

let cmd, args;
if (agent === 'claude') {
  cmd = 'claude';
  args = ['--print', '--add-dir', blockDirRel, '--add-dir', atlasDirRel, ...extraFlags];
} else if (agent === 'codex') {
  cmd = 'codex';
  args = ['exec', '--add-dir', blockDirRel, ...extraFlags];
} else if (agent === 'cursor') {
  cmd = 'cursor-agent';
  args = ['--print', ...extraFlags];
} else {
  console.error(`run_block_implementation: unknown ATLAS_AGENT=${agent}`);
  process.exit(4);
}

fsm('LaunchingAgent', { note: `${cmd} ${args.join(' ')}` });
const r = runCli(cmd, args, { input: prompt, cwd: workspace ? workspace.workspace_path : undefined });
fsm('Running', { note: `${cmd} spawned${workspace ? ' inside workspace' : ''}` });
if (r.error) {
  console.error(`run_block_implementation: ${cmd} failed → ${r.error.message}`);
  appendCheck('agent_invocation', 'fail', `agent=${agent} error=${r.error.message}`);
  fsm('Failed', { error: r.error.message });
  process.exit(5);
}
if (r.status !== 0) {
  console.error(`run_block_implementation: ${cmd} exited ${r.status}`);
  console.error((r.stderr || '').slice(0, 1000));
  appendCheck('agent_invocation', 'fail', `agent=${agent} exit=${r.status}`);
  fsm('Failed', { exit_code: r.status, error: (r.stderr || '').slice(0, 200) });
  process.exit(r.status || 1);
}

const out = (r.stdout || '').trim();
const summary = out.split(/\r?\n/).slice(0, 8).join(' / ').slice(0, 240);
appendCheck('agent_invocation', 'pass', `agent=${agent} summary=${summary}`);

console.log(`run_block_implementation: agent=${agent} block=${blockId}`);
console.log(`  prompt:   ${path.relative(ROOT, invocationPath)}`);
if (workspace) console.log(`  workspace: ${workspace.workspace_path}`);
console.log(`  output:`);
console.log(out.split(/\r?\n/).map((l) => '    ' + l).join('\n'));

fsm('Finishing', { note: 'agent exit 0', summary });

// PR-9: when running inside a sandboxed workspace, capture diff against
// origin and write a kind=agent_run_diff proposal. The operator Accepts
// to merge into the real repo. The verifier runs IN THE WORKSPACE so a
// fail blocks Accept (verifier verdict is recorded on FSM).
let diffProposalId = null;
if (workspace) {
  try {
    const diff = captureDiff({ workspace_path: workspace.workspace_path });
    if (diff.changed_files.length > 0) {
      diffProposalId = writeDiffProposal({
        run_id: runState ? runState.run_id : null,
        block_id: blockId,
        workspace_path: workspace.workspace_path,
        diff,
      });
      console.log(`  diff:     ${diff.changed_files.length} files changed; proposal=${diffProposalId}`);
    } else {
      console.log(`  diff:     no changes captured (agent may have no-op'd)`);
    }
  } catch (e) {
    console.warn(`  diff capture failed: ${e.message}`);
  }
}

// PR-4 + PR-9: auto-spawn acceptance verifier. When workspace is active,
// verifier runs INSIDE the workspace (cwd + ATLAS_ROOT pointed there) so
// the verdict reflects the agent's work in isolation. Skip via
// ATLAS_SKIP_VERIFIER=1.
let verifierVerdict = null;
if (process.env.ATLAS_SKIP_VERIFIER !== '1') {
  console.log('');
  console.log(`run_block_implementation: spawning acceptance verifier${workspace ? ' (in workspace)' : ''}...`);
  fsm('Verifying');
  const v = spawnSync('node', [path.join(ROOT, 'scripts/verify_block_acceptance.mjs'), blockId], {
    cwd: workspace ? workspace.workspace_path : ROOT,
    stdio: 'inherit',
    env: { ...process.env, ATLAS_ROOT: workspace ? path.join(workspace.workspace_path, 'atlas') : process.env.ATLAS_ROOT },
  });
  const verdictExit = v.status;
  if (verdictExit === 0) { verifierVerdict = 'pass'; console.log(`  ✓ acceptance: pass — block is gate-eligible for → done`); }
  else if (verdictExit === 1) { verifierVerdict = 'fail'; console.log(`  ✗ acceptance: fail — log_transition will block → done until fixed`); }
  else if (verdictExit === 2) { verifierVerdict = 'inconclusive'; console.log(`  · acceptance: inconclusive — collectors need YAML evidence_spec or LLM key`); }
}

// R-7.82 (S-3) — runtime content drift scan. Catches «agent wrote
// math instead of LLM call» class of violations where the issue isn't
// a forbidden shell command but a forbidden content pattern. The
// scanner reads the agent's modified files and matches them against
// dont_use.json + always_use.json rules scoped to this block. Hard
// violations exit 1 and we transition to Failed; soft violations
// just log to checks.log + narrative.md so the operator sees them.
let driftViolations = null;
if (process.env.ATLAS_SKIP_DRIFT_SCAN !== '1') {
  // start cutoff: scanner default is "last hour"; we narrow to start of
  // this run via runState if available, else fall back to 30 min ago.
  const startedAtIso = (runState && runState.started_at)
    ? runState.started_at
    : new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const d = spawnSync('node', [path.join(ROOT, 'scripts/scan_run_for_drift.mjs'), blockId, '--since-iso', startedAtIso], {
    cwd: workspace ? workspace.workspace_path : ROOT,
    stdio: 'inherit',
    env: { ...process.env, ATLAS_ROOT: workspace ? path.join(workspace.workspace_path, 'atlas') : process.env.ATLAS_ROOT },
    timeout: 30_000,
  });
  if (d.status === 1) {
    driftViolations = 'hard';
    console.log(`  ✗ content drift: hard violation — overrides verifier verdict → run marked Failed`);
    verifierVerdict = 'fail';
  } else if (d.status === 0) {
    driftViolations = 'pass';
  }
  // status === 2+ means scanner crashed; treat as inconclusive, don't fail the run
}

fsm(verifierVerdict === 'fail' ? 'Failed' : 'Succeeded', {
  exit_code: r.status,
  summary,
  verifier_verdict: verifierVerdict,
  diff_proposal_id: diffProposalId,
});

// Phase O-5 + O-2: post-run analysis pipeline (separate concerns).
//   distill → atomic decisions from log → decisions.log     (history)
//   reflect → short lesson worked/failed/next time → patterns.md (advice)
// Future agent runs read both via context-pack. Skipped via
// ATLAS_SKIP_REFLECT=1 (e.g. for selftests). Mock provider returns
// empty/[demo] but never fails the run.
if (process.env.ATLAS_SKIP_REFLECT !== '1' && runState?.run_id) {
  try {
    const { distillRunLog } = await import('./distill_run_log.mjs');
    const d = await distillRunLog(runState.run_id);
    if (d.ok && d.written) console.log(`  ✓ distill: ${d.written} decisions → ${blockId}/decisions.log${d.mock ? ' (demo)' : ''}`);
    else if (d.ok && d.skipped) console.log(`  · distill: ${d.skipped}`);
    else console.log(`  · distill: ${d.error || 'no decisions extracted'}`);
  } catch (e) {
    console.log(`  · distill: failed (${e.message})`);
  }
  try {
    const { reflectAfterRun } = await import('./reflect_after_run.mjs');
    const r = await reflectAfterRun(runState.run_id);
    if (r.ok) console.log(`  ✓ reflect: appended to ${blockId}/patterns.md (${r.reflection?.mock ? 'demo' : 'real'})`);
    else console.log(`  · reflect: skipped (${r.error})`);
  } catch (e) {
    console.log(`  · reflect: failed (${e.message})`);
  }
  // Phase Q-2: regenerate code_summary.md so the next run reads
  // a fresh summary instead of re-loading every file.
  try {
    const { summarizeBlockCode } = await import('./summarize_block_code.mjs');
    const s = await summarizeBlockCode(blockId);
    if (s.ok) console.log(`  ✓ code_summary: ${blockId}/code_summary.md (${s.files_read} files, ${s.summary?.mock ? 'demo' : 'real'})`);
    else console.log(`  · code_summary: skipped (${s.error})`);
  } catch (e) {
    console.log(`  · code_summary: failed (${e.message})`);
  }
  // Phase Q-4: trim decisions.log + patterns.md so memory stays bounded
  // and the next agent run doesn't re-read hundreds of stale entries.
  try {
    const { cleanupBlockMemory } = await import('./cleanup_block_memory.mjs');
    const c = cleanupBlockMemory(blockId);
    if (c.ok && (c.decisions_trimmed || c.patterns_trimmed)) {
      console.log(`  ✓ memory: trimmed decisions=${c.decisions_trimmed}, patterns=${c.patterns_trimmed}`);
    }
  } catch (e) {
    console.log(`  · memory cleanup: failed (${e.message})`);
  }
}

// Workspace cleanup: only when there's NO pending diff proposal (operator
// needs to apply it) AND verifier didn't fail (preserve workspace for
// inspection on fail).
if (workspace && verifierVerdict !== 'fail' && !diffProposalId) {
  try {
    cleanupWorkspace({ workspace_path: workspace.workspace_path });
    console.log(`  workspace cleaned: ${workspace.workspace_path}`);
  } catch (e) {
    console.warn(`  workspace cleanup failed: ${e.message}`);
  }
}

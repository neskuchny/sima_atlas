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

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startRun, transitionRunState } from './run_state.mjs';
import { createWorkspace, captureDiff, writeDiffProposal, cleanupWorkspace } from './agent_workspace.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');
const BLOCKS = path.join(ATLAS, 'blocks');
const INVOCATIONS_DIR = path.join(ATLAS, 'agent_invocations');

const argv = process.argv.slice(2);
const dashDash = argv.indexOf('--');
const blockId = argv[0];
const extraPrompt = dashDash >= 0 ? argv.slice(dashDash + 1).join(' ').trim() : '';
if (!blockId) {
  console.error('Usage: node scripts/run_block_implementation.mjs <block_id> [-- "<extra prompt>"]');
  process.exit(1);
}

const blockDir = path.join(BLOCKS, blockId);
if (!fs.existsSync(blockDir)) {
  console.error(`run_block_implementation: block dir not found → ${blockDir}`);
  process.exit(2);
}

// 1. Build context-pack (rebuilds atlas/context_packs/<id>.json)
try {
  execFileSync('node', ['scripts/build_context_pack.mjs', blockId], { cwd: ROOT, stdio: 'pipe' });
} catch (e) {
  console.error(`run_block_implementation: build_context_pack failed → ${e.message}`);
  process.exit(3);
}

// 2. Compose the prompt
function readSafe(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }
const mission = readSafe(path.join(blockDir, 'mission.md'));
const kpi = readSafe(path.join(blockDir, 'kpi.md'));
const acceptance = readSafe(path.join(blockDir, 'acceptance.md'));
const tasks = readSafe(path.join(blockDir, 'tasks.md'));
const filesList = readSafe(path.join(blockDir, 'files.md'));
const rules = readSafe(path.join(ATLAS, 'rules.md'));
const techStack = readSafe(path.join(ATLAS, 'tech_stack.md'));

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
  extraPrompt ? `## Operator note\n${extraPrompt}\n` : '',
  '## How to report progress',
  `Append a line to \`atlas/blocks/${blockId}/checks.log\` with the test/check result.`,
  'When done, set status to `review` via MCP transition_block.',
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
  runState = startRun({ block_id: blockId, agent, prompt_file: invocationPath });
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

if (agent === 'print-only' || (agent === 'claude' && !which('claude')) || (agent === 'codex' && !which('codex'))) {
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

let cmd, args;
if (agent === 'claude') {
  cmd = 'claude';
  args = ['--print', '--add-dir', `atlas/blocks/${blockId}`, '--add-dir', 'atlas', ...extraFlags];
} else if (agent === 'codex') {
  cmd = 'codex';
  args = ['exec', '--add-dir', `atlas/blocks/${blockId}`, ...extraFlags];
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

fsm(verifierVerdict === 'fail' ? 'Failed' : 'Succeeded', {
  exit_code: r.status,
  summary,
  verifier_verdict: verifierVerdict,
  diff_proposal_id: diffProposalId,
});

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

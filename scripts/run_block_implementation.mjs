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
// R-8.09 — two-phase by default. The agent first declares how it understood
// the block (understanding.md) and STOPS; code is written only by a later run,
// after the operator confirmed that frame on the canvas. What a run does is
// decided by frameGate (scripts/block_meaning.mjs):
//   no declaration / contract changed / operator corrected → declare phase
//   declared, not yet answered                            → agent NOT started
//   confirmed for this text and this contract              → implement phase
// Every run prints one machine-readable line: `frame_gate: phase=<p> state=<s>`.
//   --phase=declare        force a (re-)declaration
//   --phase=implement      refuse (exit 3) unless the frame is confirmed
//   --frame-review=skip    the pre-R-8.09 single run: declare + code at once,
//                          the operator sees the frame only after the code.
//                          Logged to checks.log every time it is used.
//
// Env:
//   ATLAS_AGENT        — 'claude' (default) | 'codex' | 'cursor' | 'print-only'
//   ATLAS_AGENT_FLAGS  — extra flags forwarded to the CLI (e.g. "--model claude-haiku-4-5")
//   ATLAS_ROOT         — overrides atlas root (set automatically when --client= is passed,
//                        so run_state, verifier, etc. write under atlas/clients/<id>/)
//   ATLAS_RUN_PHASE    — same as --phase=
//   ATLAS_FRAME_REVIEW — same as --frame-review=
//   ATLAS_OPERATOR_LANG — language of the declaration (default: detected from the mission)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startRun, transitionRunState } from './run_state.mjs';
import { createWorkspace, captureDiff, writeDiffProposal, cleanupWorkspace } from './agent_workspace.mjs';
import {
  readTrajectory, trajectoryPromptLines, understandingPromptLines,
  frameGate, recordDeclared, readUnderstanding, understandingSha, operatorLanguage,
  declarePhasePromptLines, implementPhasePromptLines,
} from './block_meaning.mjs';

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

// R-8.09 — phase flags. Taken out of argv (like --client=) so the block id
// stays argv[0] wherever the caller put them. Only flags before `--` count:
// what follows `--` is the operator's free-form prompt.
function takeFlag(prefix) {
  const end = argv.indexOf('--') >= 0 ? argv.indexOf('--') : argv.length;
  const i = argv.findIndex((a, k) => k < end && a.startsWith(prefix));
  if (i < 0) return '';
  const v = argv[i].slice(prefix.length).trim();
  argv.splice(i, 1);
  return v;
}
const phaseFlag = (takeFlag('--phase=') || process.env.ATLAS_RUN_PHASE || 'auto').toLowerCase();
const frameReviewFlag = (takeFlag('--frame-review=') || process.env.ATLAS_FRAME_REVIEW || '').toLowerCase();
if (!['auto', 'declare', 'implement'].includes(phaseFlag)) {
  console.error(`run_block_implementation: --phase must be auto|declare|implement, got "${phaseFlag}"`);
  process.exit(1);
}
if (frameReviewFlag && frameReviewFlag !== 'skip') {
  console.error(`run_block_implementation: --frame-review accepts only "skip", got "${frameReviewFlag}"`);
  process.exit(1);
}

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

function appendCheck(kind, result, note) {
  const checks = path.join(blockDir, 'checks.log');
  fs.appendFileSync(checks, `${new Date().toISOString()}\t${kind}\t${result}\t${String(note).replace(/[\t\r\n]+/g, ' ')}\n`, 'utf8');
}

// R-8.09 — decide what this run is allowed to do.
const gate = frameGate(blockId, ATLAS);
let phase;
if (frameReviewFlag === 'skip') phase = 'full';
else if (phaseFlag === 'declare') phase = 'declare';
else if (phaseFlag === 'implement') phase = gate.state === 'confirmed' ? 'implement' : 'refused';
else phase = gate.next === 'implement' ? 'implement' : gate.next === 'declare' ? 'declare' : 'awaiting';
console.log(`frame_gate: phase=${phase} state=${gate.state}`);

if (phase === 'awaiting' || phase === 'refused') {
  // The agent is not started: the next step belongs to the operator.
  appendCheck('frame_gate', 'skipped', `${phase === 'refused' ? '--phase=implement refused' : 'agent not started'} — ${gate.reason}`);
  console.log(`run_block_implementation: ${blockId} — ${gate.reason}.`);
  console.log('  The agent was not started. Open the block on the canvas (Overview → «How the agent understood this block»)');
  console.log('  and answer «right» or «wrong»; the next run then writes code or re-declares.');
  process.exit(phase === 'refused' ? 3 : 0);
}
if (phase === 'full') {
  appendCheck('frame_gate', 'skipped', 'frame review skipped (--frame-review=skip): declare + code in one run, the operator sees the frame after the code');
}

// 1. Build context-pack (rebuilds atlas/context_packs/<id>.json).
// build_context_pack does not honor ATLAS_ROOT yet — for multi-tenant
// runs we let it fail soft with a warning. The agent still has the
// inline prompt + block dir mounted, so it can work without the pack.
//
// R-7.86 (S-4) — profile selection. Default = design (full pack).
// CLI: --profile <name>; env: ATLAS_PACK_PROFILE.
const profileFlagIdx = process.argv.indexOf('--profile');
const packProfile = profileFlagIdx >= 0
  ? process.argv[profileFlagIdx + 1]
  : (process.env.ATLAS_PACK_PROFILE || 'design');
try {
  execFileSync('node', ['scripts/build_context_pack.mjs', blockId, '--profile', packProfile], { cwd: ROOT, stdio: 'pipe' });
} catch (e) {
  console.warn(`run_block_implementation: build_context_pack [${packProfile}] failed (non-fatal) → ${e.message}`);
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
// R-8.08 (b.clarify) — the trajectory section is pulled out of the mission and
// rendered on its own, with instructions on how to use it. Leaving it inside
// the Mission as well would send the same text twice.
const trajectory = readTrajectory(mission);
const blockDirRelForPrompt = path.relative(ROOT, blockDir).split(path.sep).join('/');
const kpi = readSafe(path.join(blockDir, 'kpi.md'));
const acceptance = readSafe(path.join(blockDir, 'acceptance.md'));
const tasks = readSafe(path.join(blockDir, 'tasks.md'));
const filesList = readSafe(path.join(blockDir, 'files.md'));
const rules = readSafe(path.join(ATLAS, 'rules.md'));
const techStack = readSafe(path.join(ATLAS, 'tech_stack.md'));
// R-7.85 (S-6) — project-level architectural decisions, append-only
const archDecisions = readSafe(path.join(ATLAS, 'architecture_decisions.md')).trim();

// R-7.77 — memory injection. Agent sees what was tried before, what
// was rejected, and operator-level architectural rules. Prevents the
// "I asked for LLM, agent wrote a math formula" failure mode by
// surfacing past decisions and dont_use rules at prompt time.
const checksTail = tailLines(readSafe(path.join(blockDir, 'checks.log')), 30);
const decisions = readSafe(path.join(blockDir, 'decisions.log')).trim();
const codeSummary = readSafe(path.join(blockDir, 'code_summary.md')).trim();
const narrative = readSafe(path.join(blockDir, 'narrative.md')).trim();
// R-7.95 — the last semantic review's `todo_to_pass` is the concrete list of
// what the «Contract as Arbiter» said must change for the block to genuinely
// satisfy its contract. When present, inject it into the prompt so the agent
// works from that list, not from its own guess. This is the loop that
// «доделывает блоки исходя из того что там написано» (operator's words).
const userStory = readSafe(path.join(blockDir, 'user_story.md')).trim();
let semanticTodo = '';
try {
  const sr = JSON.parse(readSafe(path.join(blockDir, 'semantic_review.json')) || '{}');
  if (!sr.mock && Array.isArray(sr.todo_to_pass) && sr.todo_to_pass.length) {
    semanticTodo = `### Semantic verdict (Contract-as-Arbiter) said this is NOT yet right\n`
      + `overall: ${sr.overall} · summary: ${sr.summary || ''}\n\n**TO GENUINELY SATISFY THE CONTRACT, DO THESE (this is the most important section):**\n`
      + sr.todo_to_pass.map((t) => `  - ${t}`).join('\n') + '\n';
  }
} catch {}
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

// R-8.09 — the prompt is assembled from shared parts so the three phases can
// never drift apart in what they tell the agent about the block itself.
const operatorLang = operatorLanguage([mission, userStory].join('\n'));
const understandingNow = readUnderstanding(blockId, ATLAS);
const blockDirRelSlash = path.relative(ROOT, blockDir).split(path.sep).join('/');

const contractPart = [
  '## Mission',
  trajectory.missionWithout.trim(),
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
  // R-8.08 — where the block is heading. Acceptance cannot tell apart the
  // several implementations that all satisfy it; the direction can. Absent a
  // declared trajectory, the agent is told its choice is a guess and must be
  // recorded, not made silently.
  ...trajectoryPromptLines(trajectory, { recordIn: phase === 'implement' ? 'narrative.md' : 'understanding.md' }),
  '',
];

// R-8.02 — contract-bounded sizing steer. Captures Ponytail's pre-generation
// leverage (less code → cheaper, faster) WITHOUT adopting its «be lazy»
// philosophy, which would violate Kanon Principle II (counter-force to the
// simplification gradient). The «right amount of engineering» is defined by
// the contract above — not by laziness. This line reinforces Principle II
// («don't cut what the contract requires») while trimming gold-plating.
const rightSizePart = [
  '## How much to build (right-size to the contract)',
  '- Implement EXACTLY what the mission + acceptance above require — no more, no less.',
  '- Do NOT add abstractions, layers, config options, or dependencies the contract does not demand. The laziest correct change that satisfies acceptance wins.',
  '- Equally: do NOT cut corners the contract requires. A mock where the mission demands real logic, or a regex where it demands an LLM, FAILS — even if it is shorter. (Kanon Principle II.)',
  '- Prefer: nothing → stdlib → existing dependency → one line → minimal new code. Reach for a new abstraction only when the contract forces it.',
  '',
];

const contextPart = [
  phase === 'declare'
    ? '## Files the implementation run may edit (read-only in this run)'
    : '## Files you may edit (alive only)',
  filesList.trim(),
  '',
  '## Project rules',
  rules.trim(),
  '',
  '## Tech stack (forbidden commands enforced via guard_against_drift)',
  techStack.trim(),
  '',
  // R-7.85 (S-6) — project-level architectural decisions. Append-only,
  // operator-locked. Agent MUST NOT silently reverse a past decision —
  // if a decision needs to change, surface it in narrative.md and ask
  // the operator. This is the strongest lock against the «LLM not math»
  // class of failure: it lives at project level, gets re-injected on
  // EVERY run, and is impossible to forget between sessions.
  archDecisions ? `## ⚖ Architecture decisions (project-level, append-only — DO NOT silently reverse)\n${archDecisions}\n` : '',
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
  userStory ? `### User story (TOP-layer — what the user actually wants)\n${userStory}\n` : '',
  semanticTodo,
  extraPrompt ? `## Operator note\n${extraPrompt}\n` : '',
];

const reportPart = [
  '## How to report progress',
  `Append a line to \`${blockDirRelSlash}/checks.log\` with the test/check result.`,
  // R-8.05 — this used to say «When done, set status to `review` via MCP
  // transition_block.» That instruction put the agent's self-report in charge
  // of the lifecycle: inside the V-1 loop the agent moved the block before the
  // verifier ever ran, and the daemon then tried an already-consumed
  // transition. The verifier decides; the agent reports evidence.
  'Do NOT change the block status yourself — the acceptance verifier decides and the loop advances the block.',
  '',
  '## How to update memory',
  'After your run, summarize what you did in human language and write it to:',
  `- \`${blockDirRelSlash}/narrative.md\` — append a section headed \`## <ISO-timestamp> · <one-line summary>\` with sub-sections \`### What I tried\`, \`### What worked\`, \`### What failed and why\`, \`### Decisions made\`. Write in plain English (or operator's language), not jargon-only — future agents will read this in 2 weeks.`,
  `- \`${blockDirRelSlash}/decisions.log\` — for each architectural choice, append \`<ISO-timestamp> | <decision> | <rationale>\` (one line each). These are append-only; don't rewrite past entries.`,
  '',
];

let promptParts;
if (phase === 'declare') {
  promptParts = [
    `# Declare your understanding of block ${blockId} (phase 1 of 2 — no code in this run)`,
    '',
    ...contractPart,
    ...declarePhasePromptLines(blockDirRelForPrompt, {
      language: operatorLang,
      correction: gate.state === 'corrected' ? gate.correction : null,
      previousFrame: gate.state === 'corrected' ? gate.previous_frame : null,
    }),
    '',
    'Use the section below when you write «In scope» and «Out of scope»: it is what the implementation run will be held to.',
    ...rightSizePart,
    ...contextPart,
  ];
} else if (phase === 'implement') {
  promptParts = [
    `# Implement block ${blockId}`,
    '',
    ...contractPart,
    // R-8.09 — the frame the operator confirmed, given as data, not re-asked.
    ...implementPhasePromptLines(blockDirRelForPrompt, { understandingText: understandingNow.text, confirmedAt: gate.confirmed_at }),
    '',
    ...rightSizePart,
    ...contextPart,
    ...reportPart,
  ];
} else {
  promptParts = [
    `# Implement block ${blockId}`,
    '',
    ...contractPart,
    // R-8.08 — declare the frame before code, in the same run (only when the
    // frame review was explicitly skipped).
    ...understandingPromptLines(blockDirRelForPrompt, { language: operatorLang }),
    '',
    ...rightSizePart,
    ...contextPart,
    ...reportPart,
  ];
}
const prompt = promptParts.filter(Boolean).join('\n');

// 3. Persist invocation prompt for audit / Cursor pickup
fs.mkdirSync(INVOCATIONS_DIR, { recursive: true });
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const invocationPath = path.join(INVOCATIONS_DIR, `${ts}__${blockId}${phase === 'declare' ? '__declare' : ''}.txt`);
fs.writeFileSync(invocationPath, prompt, 'utf8');

// 4. Invoke the agent
const agent = (process.env.ATLAS_AGENT || 'claude').toLowerCase();
const extraFlags = (process.env.ATLAS_AGENT_FLAGS || '').split(/\s+/).filter(Boolean);

function which(cmd) {
  const looker = spawnSync(process.platform === 'win32' ? 'where' : 'which', [cmd], { encoding: 'utf8' });
  if (looker.status === 0) return looker.stdout.split(/\r?\n/)[0].trim() || null;
  return null;
}

function runCli(cmd, args, opts) {
  // R-7.99 — agent timeout is env-tunable: 240s suits quick fixes, but a
  // real remediation pass (V-1 feeding todo_to_pass to a live agent) often
  // needs more than 4 minutes of wall-clock.
  const timeoutMs = Number(process.env.ATLAS_AGENT_TIMEOUT_MS) > 0
    ? Number(process.env.ATLAS_AGENT_TIMEOUT_MS) : 240_000;
  // stdin must be 'pipe' when a prompt is passed via `input` — an explicit
  // stdio[0]='ignore' silently discards the input option, and `claude
  // --print` then exits 1 with «Input must be provided either through
  // stdin…». Caught live on the first real V-1 agent run (R-7.99).
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: [opts && opts.input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: timeoutMs,
    ...opts,
  });
  return r;
}

// PR-7+8 (b.agent-orchestrator): start FSM + optional workspace BEFORE the
// agent spawns. Workspace gated on ATLAS_USE_WORKSPACE=1 so existing flows
// keep working unchanged.
// R-8.09 — never in the declare phase: its only output is understanding.md in
// the real block folder, where the gate and the canvas read it.
const useWorkspace = process.env.ATLAS_USE_WORKSPACE === '1' && phase !== 'declare';
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

if (agent === 'print-only'
    || (agent === 'claude' && !which('claude'))
    || (agent === 'codex' && !which('codex'))
    || (agent === 'cursor' && !which('cursor-agent'))
    || (agent === 'gemini' && !which('gemini'))) {
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
  if (phase === 'declare') {
    console.log(`tip: this is phase 1 — the agent only writes ${blockDirRelSlash}/understanding.md. Then confirm or correct it on the canvas`);
    console.log('     (Overview → «How the agent understood this block»); the next run writes code only after «right».');
  } else {
    console.log(`tip: after pasting & implementing, run \`node scripts/verify_block_acceptance.mjs ${blockId}\` to see acceptance verdict.`);
  }
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
} else if (agent === 'gemini') {
  // R-8.00 — @google/gemini-cli backend. Mirrors the claude pattern:
  // prompt arrives via stdin (input opt), agent edits files in `--include`
  // dirs, exits when done. `--yolo` is gemini's «accept all edits without
  // asking» flag (the equivalent of claude's --permission-mode acceptEdits).
  // First-launch verification is on the operator — gemini CLI flag
  // conventions are still moving; if the operator finds a flag wrong, the
  // narrative.md trace will say so.
  cmd = 'gemini';
  args = ['--yolo', '--include', blockDirRel, '--include', atlasDirRel, ...extraFlags];
} else {
  console.error(`run_block_implementation: unknown ATLAS_AGENT=${agent}`);
  process.exit(4);
}

// R-8.09 — what the declare phase is allowed to touch is exactly one file.
// Snapshot the block's owned files so a phase-1 agent that wrote code anyway
// is reported, not silently accepted as «just a declaration».
function ownedFileHashes() {
  const out = {};
  for (const line of filesList.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s+(\S+)\s+\[alive\]/);
    if (!m) continue;
    const abs = path.resolve(ROOT, m[1]);
    if (!abs.startsWith(ROOT + path.sep) || path.basename(abs) === 'understanding.md') continue;
    try { out[m[1]] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex'); } catch { out[m[1]] = null; }
  }
  return out;
}
const ownedBefore = phase === 'declare' ? ownedFileHashes() : null;
const agentStartedMs = Date.now();

fsm('LaunchingAgent', { note: `${cmd} ${args.join(' ')}${phase === 'declare' ? ' (declare phase)' : ''}` });
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

// R-8.09 — phase 1 ends here. No verifier, no drift scan, no cascade, no
// reflection: no code was supposed to change. What must be true instead: the
// agent (re-)wrote understanding.md, and nothing else it owns changed.
if (phase === 'declare') {
  const u = readUnderstanding(blockId, ATLAS);
  const rewrote = u.exists && (!understandingNow.exists
    || understandingSha(u.text) !== understandingSha(understandingNow.text)
    || u.mtimeMs >= agentStartedMs - 1000);
  if (!rewrote) {
    appendCheck('frame_declared', 'fail', `agent=${agent} did not write understanding.md in the declare phase`);
    console.log(`  ✗ declare phase: the agent did not write ${blockDirRelSlash}/understanding.md`);
    fsm('Finishing', { note: 'declare phase: no declaration written' });
    fsm('Failed', { exit_code: 6, error: 'declare phase produced no understanding.md', phase: 'declare' });
    process.exit(6);
  }
  const ownedAfter = ownedFileHashes();
  const touched = Object.keys(ownedAfter).filter((f) => ownedAfter[f] !== ownedBefore[f]);
  if (touched.length) {
    appendCheck('frame_declared', 'warn', `agent changed files during the declare phase (it was told not to): ${touched.join(', ')}`);
    console.log(`  ⚠ declare phase: the agent also changed ${touched.join(', ')} — review before confirming`);
  }
  recordDeclared({ block_id: blockId, atlas_root: ATLAS, run_id: runState ? runState.run_id : null, agent, language: operatorLang });
  const frame = String(u.sections.treating_as || '').replace(/\s+/g, ' ').trim();
  appendCheck('frame_declared', u.complete ? 'pass' : 'warn',
    `agent=${agent} ${u.complete ? '' : `incomplete (${[...u.missing, ...u.empty].join(', ')}) `}treating_as=${frame.slice(0, 160)}`);
  console.log('');
  console.log(`frame_gate: phase=declare done — awaiting operator confirmation`);
  console.log(`  treating as: ${frame.slice(0, 300) || '(empty)'}`);
  console.log('  Confirm or correct it on the canvas (Overview → «How the agent understood this block»).');
  console.log('  Code is written by the next run, and only after «right».');
  fsm('Finishing', { note: 'declare phase done', summary: `frame declared — awaiting operator: ${frame.slice(0, 160)}`, phase: 'declare' });
  fsm('Succeeded', { exit_code: 0, summary: `frame declared — awaiting operator confirmation`, phase: 'declare' });
  process.exit(0);
}

// R-8.09 — phase 2 builds inside the confirmed frame and must not rewrite it.
if (phase === 'implement') {
  const u = readUnderstanding(blockId, ATLAS);
  if (!u.exists || understandingSha(u.text) !== understandingSha(understandingNow.text)) {
    appendCheck('frame_gate', 'warn', `agent=${agent} rewrote the confirmed understanding.md during implementation — the confirmation no longer applies; the next run stops for a new one`);
    console.log('  ⚠ the agent rewrote the confirmed understanding.md — the next run will stop for a new confirmation');
  }
}
// With the review skipped the frame still gets recorded: it anchors staleness
// to the contract it was written for, and it stays visibly unconfirmed.
if (phase === 'full') {
  const u = readUnderstanding(blockId, ATLAS);
  if (u.exists && (!understandingNow.exists || understandingSha(u.text) !== understandingSha(understandingNow.text))) {
    try { recordDeclared({ block_id: blockId, atlas_root: ATLAS, run_id: runState ? runState.run_id : null, agent, language: operatorLang }); } catch { /* reporting only */ }
  }
}

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

// R-7.84 (S-8) — cascade verify: if THIS block's run succeeded, walk
// reverse-dependencies and re-verify each consumer. Anything that
// broke gets auto-flagged status:desync on the canvas with a clear
// «cascade: parent X edit» reason. Operator sees the break inline,
// not at next morning's nightly sweep.
//
// Skip when:
//   - this run failed (no point checking dependents of broken work)
//   - ATLAS_SKIP_CASCADE=1 (CI / test isolation)
let cascadeBroken = 0;
if (verifierVerdict === 'pass' && process.env.ATLAS_SKIP_CASCADE !== '1') {
  console.log('');
  console.log(`run_block_implementation: cascade-verifying dependents of ${blockId}...`);
  const c = spawnSync('node', [path.join(ROOT, 'scripts/cascade_verify.mjs'), blockId], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, ATLAS_ROOT: workspace ? path.join(workspace.workspace_path, 'atlas') : process.env.ATLAS_ROOT },
    timeout: 120_000,
  });
  if (c.status === 1) {
    cascadeBroken = 1; // dependents broken; not fatal for THIS run, but visible
    console.log(`  ⚠ cascade: dependent block(s) broken — auto-flagged desync on canvas`);
  } else if (c.status === 0) {
    console.log(`  ✓ cascade: all dependents still green`);
  }
}

fsm(verifierVerdict === 'fail' ? 'Failed' : 'Succeeded', {
  exit_code: r.status,
  summary,
  verifier_verdict: verifierVerdict,
  diff_proposal_id: diffProposalId,
  cascade_broken: cascadeBroken,
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

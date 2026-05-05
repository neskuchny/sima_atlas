#!/usr/bin/env node
// Atlas Runs API — read-side helpers + async start, used by the design UI's
// RunStatusSection / AcceptanceSection / "Send to agent" buttons.
//
// The synchronous /run-block endpoint blocks the HTTP request until the
// agent finishes (minutes). For UI flows we need a non-blocking variant:
// `startRunAsync` spawns run_block_implementation.mjs detached and returns
// immediately with a `run_id` the UI can poll.
//
// Run state lives at atlas/run_state/<run_id>.json (managed by run_state.mjs).
// Acceptance verdicts live at atlas/acceptance_runs/<block_id>/_latest.json.
//
// Public functions:
//   listRunsByBlock({ block_id, active_only, limit, root }) → [run...]
//   getRun(run_id, { root }) → run | null
//   getLatestAcceptance({ block_id, root }) → { assertions, summary } | null
//   startRunAsync({ block_id, agent, prompt }) → { run_id, pid }

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS_DEFAULT = path.join(ROOT, 'atlas');

const TERMINAL_STATES = new Set(['Succeeded', 'Failed', 'Stalled', 'Canceled']);

function runStateDir(root) { return path.join(root || ATLAS_DEFAULT, 'run_state'); }
function acceptanceDir(root) { return path.join(root || ATLAS_DEFAULT, 'acceptance_runs'); }

function safeReadJson(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

export function listRunsByBlock({ block_id, active_only = false, limit = 20, root, enriched = false } = {}) {
  const dir = runStateDir(root);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const runs = [];
  for (const f of files) {
    const r = safeReadJson(path.join(dir, f));
    if (!r) continue;
    if (block_id && r.block_id !== block_id) continue;
    if (active_only && TERMINAL_STATES.has(r.current_state)) continue;
    runs.push(r);
  }
  runs.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
  const sliced = runs.slice(0, limit);
  if (!enriched) return sliced;
  // Phase I: attach acceptance_after + cost_usd + file_count to each run.
  // Acceptance verdict is the verifier output that landed in the window
  // [run.started_at, next-run.started_at). Cost is the sum of all
  // llm_traces in that same window.
  return enrichRunsBatch(sliced, root);
}

function enrichRunsBatch(runs, root) {
  // Cache acceptance + traces per block to avoid re-reading per-run.
  const accCache = new Map();
  const traceList = listLlmTracesSummary(root);
  const out = [];
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    const next = runs[i - 1]; // newer-first sort: index i-1 is newer
    const lo = r.started_at || '';
    const hi = next?.started_at || '9999';
    if (!accCache.has(r.block_id)) accCache.set(r.block_id, listAcceptanceForBlock(r.block_id, root));
    const accs = accCache.get(r.block_id);
    const acceptance = accs.find((a) => a.checked_at >= lo && a.checked_at < hi);
    const tracesInWindow = traceList.filter((t) => t.at >= lo && t.at < hi);
    const cost_usd = tracesInWindow.reduce((s, t) => s + (t.cost_usd || 0), 0);
    const trace_count = tracesInWindow.length;
    const file_count = listRunFiles({ run_id: r.run_id, root }).length;
    out.push({
      ...r,
      enriched: {
        acceptance_after: acceptance ? { verdict: acceptance.verdict, checked_at: acceptance.checked_at, counts: acceptance.counts || null } : null,
        cost_usd: Math.round(cost_usd * 1e5) / 1e5,
        trace_count,
        file_count,
      },
    });
  }
  return out;
}

function listAcceptanceForBlock(block_id, root) {
  const dir = path.join(acceptanceDir(root), block_id);
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === '_latest.json' || f === '_previous.json') continue;
    const r = safeReadJson(path.join(dir, f));
    if (r) out.push({ verdict: r.verdict || null, checked_at: r.checked_at || '', counts: r.counts || null });
  }
  return out.sort((a, b) => a.checked_at.localeCompare(b.checked_at));
}

function listLlmTracesSummary(root) {
  const dir = path.join(root || ATLAS_DEFAULT, 'llm_traces');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const r = safeReadJson(path.join(dir, f));
    if (r) out.push({ at: r.at || '', cost_usd: Number(r.cost_usd) || 0, op: r.op || '', provider: r.provider || '' });
  }
  return out;
}

export function getRun(run_id, { root } = {}) {
  if (!run_id) return null;
  const p = path.join(runStateDir(root), `${run_id}.json`);
  return safeReadJson(p);
}

// Compresses a raw acceptance run JSON to the fields the UI cares about.
function compactAcceptance(r) {
  if (!r) return null;
  const assertions = (r.assertions || []).map((a) => ({
    id: a.id,
    text: a.text,
    verdict: a.verdict,
    evidence_kind: a.evidence_kind,
    reasoning: a.reasoning,
    duration_ms: a.duration_ms,
  }));
  const summary = {
    pass:    assertions.filter((a) => a.verdict === 'pass').length,
    fail:    assertions.filter((a) => a.verdict === 'fail').length,
    skip:    assertions.filter((a) => a.verdict === 'skip' || a.verdict === 'skipped').length,
    inconclusive: assertions.filter((a) => a.verdict === 'inconclusive').length,
    total:   assertions.length,
  };
  return {
    block_id: r.block_id,
    verdict: r.verdict || null,
    checked_at: r.checked_at || null,
    duration_ms: r.duration_ms || null,
    counts: r.counts || null,
    assertions,
    summary,
  };
}

export function getLatestAcceptance({ block_id, root } = {}) {
  if (!block_id) return null;
  const p = path.join(acceptanceDir(root), block_id, '_latest.json');
  return compactAcceptance(safeReadJson(p));
}

// Returns latest + previous + per-assertion delta. Used by the design UI's
// AcceptanceSection to highlight regressions and improvements after a run.
//   delta[id] = { from: 'pass'|'fail'|..., to: ..., kind: 'regressed'|'improved'|'same'|'new'|'removed' }
export function getAcceptanceDiff({ block_id, root } = {}) {
  if (!block_id) return null;
  const dir = path.join(acceptanceDir(root), block_id);
  const latest = compactAcceptance(safeReadJson(path.join(dir, '_latest.json')));
  if (!latest) return null;
  const prev = compactAcceptance(safeReadJson(path.join(dir, '_previous.json')));
  if (!prev) return { latest, previous: null, delta: {} };

  const SCORES = { pass: 2, skipped: 1, skip: 1, inconclusive: 1, fail: 0 };
  const prevById = Object.fromEntries(prev.assertions.map((a) => [a.id, a.verdict]));
  const latestById = Object.fromEntries(latest.assertions.map((a) => [a.id, a.verdict]));
  const delta = {};
  for (const a of latest.assertions) {
    const before = prevById[a.id];
    const after = a.verdict;
    if (!before) { delta[a.id] = { from: null, to: after, kind: 'new' }; continue; }
    if (before === after) { delta[a.id] = { from: before, to: after, kind: 'same' }; continue; }
    const sb = SCORES[before] ?? 0;
    const sa = SCORES[after]  ?? 0;
    delta[a.id] = { from: before, to: after, kind: sa > sb ? 'improved' : sa < sb ? 'regressed' : 'same' };
  }
  for (const id of Object.keys(prevById)) {
    if (!(id in latestById)) delta[id] = { from: prevById[id], to: null, kind: 'removed' };
  }
  return { latest, previous: prev, delta };
}

// Spawn run_block_implementation.mjs in the background. We do NOT block on
// completion — the script writes its own run_state file as it progresses,
// and the UI polls listRunsByBlock to track it.
//
// Stdout/stderr are captured to atlas/run_logs/<run_id>.log so the UI's
// /runs/log endpoint can tail them. Run id is derived in the same way
// run_state.startRun does (block_id__<UTC ts>) so we know it up-front
// without racing the child.
export function startRunAsync({ block_id, agent, prompt } = {}) {
  if (!block_id) throw new Error('startRunAsync: block_id required');
  const args = ['scripts/run_block_implementation.mjs', String(block_id)];
  if (prompt) args.push('--', String(prompt));
  const env = { ...process.env };
  if (agent) env.ATLAS_AGENT = String(agent);

  // Predict run_id same way run_state.startRun does, then pass it via env
  // so the child uses our id instead of computing its own. This lets the
  // UI tail logs immediately without polling for the run to appear.
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const run_id = `${block_id}__${ts}`;
  env.ATLAS_PRESET_RUN_ID = run_id;

  const logsDir = path.join(ROOT, 'atlas', 'run_logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `${run_id}.log`);
  const out = fs.openSync(logPath, 'a');
  const err = fs.openSync(logPath, 'a');
  fs.writeFileSync(logPath, `# run ${run_id}  block=${block_id}  agent=${agent || '(default)'}  started=${new Date().toISOString()}\n`);

  const child = spawn('node', args, {
    cwd: ROOT,
    env,
    stdio: ['ignore', out, err],
    detached: true,
  });
  child.unref();
  fs.closeSync(out);
  fs.closeSync(err);

  return { ok: true, pid: child.pid, run_id, block_id, agent: agent || null };
}

// Tail the captured run log starting at byte offset `since`. Returns the
// new bytes plus the next offset so the UI can poll incrementally without
// re-reading the whole log every tick. `tail_bytes` caps initial fetch
// for clients that pass since=0 on a long-running log.
export function readRunLog({ run_id, since = 0, tail_bytes = 16000, root } = {}) {
  if (!run_id) throw new Error('readRunLog: run_id required');
  const p = path.join(root || ATLAS_DEFAULT, 'run_logs', `${run_id}.log`);
  if (!fs.existsSync(p)) return { ok: true, run_id, text: '', size: 0, next: 0 };
  const stat = fs.statSync(p);
  const size = stat.size;
  let start = Math.max(0, Number(since) || 0);
  if (start === 0 && size > tail_bytes) start = size - tail_bytes;
  if (start >= size) return { ok: true, run_id, text: '', size, next: size };
  const fd = fs.openSync(p, 'r');
  const buf = Buffer.alloc(size - start);
  fs.readSync(fd, buf, 0, buf.length, start);
  fs.closeSync(fd);
  return { ok: true, run_id, text: buf.toString('utf8'), size, next: size, truncated: since === 0 && size > tail_bytes };
}

// Files an agent edited during a run. Two sources, in priority order:
//   1. block's checks.log (`+files: …` lines we add when patchBlock writes)
//   2. git diff in the workspace, if a workspace was created
// For now we read checks.log entries newer than the run's started_at and
// extract any file paths mentioned. The list is best-effort.
export function listRunFiles({ run_id, root } = {}) {
  if (!run_id) return [];
  const run = getRun(run_id, { root });
  if (!run) return [];
  const block_id = run.block_id;
  const startedAt = run.started_at;
  const checks = path.join(root || ATLAS_DEFAULT, 'blocks', block_id, 'checks.log');
  if (!fs.existsSync(checks)) return [];
  const lines = fs.readFileSync(checks, 'utf8').split(/\n/);
  const files = new Set();
  for (const ln of lines) {
    const m = ln.match(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z/);
    if (!m) continue;
    if (startedAt && ln.slice(0, 24) < startedAt.slice(0, 24)) continue;
    const fileMatches = ln.match(/[a-zA-Z0-9_/.-]+\.(?:mjs|js|jsx|ts|tsx|md|json|css|html|py|sh)/g);
    if (fileMatches) for (const f of fileMatches) files.add(f);
  }
  return Array.from(files).sort();
}

// Per-screen system prompts so «Совет Клода» says something useful for
// the actual surface the operator is looking at. Default = generic block
// advice. Each kind gets a tailored angle without needing custom prompts
// from the UI.
const ADVICE_PROMPTS = {
  block:           'Give concise, actionable advice on this BLOCK: name a concrete next step, a risk, and a simplification.',
  block_acceptance:'Acceptance is failing. Reason about WHY this block might fail those criteria. Propose 1-2 focused fixes.',
  block_field:     'The operator is editing one specific contract file. Suggest one concrete improvement to its content.',
  block_connections:'Look at this block\'s incoming/outgoing edges and propose ONE missing dependency that would make it complete.',
  tz:              'This is a TZ (technical spec) draft. Suggest how to tighten it: what to remove, what to make more testable.',
  graph_overview:  'You are looking at the WHOLE product graph. Propose ONE highest-leverage thing to do next: which block, why now.',
  gallery:         'Browsing artefacts. Suggest which artefact is most worth turning into a block right now.',
};

export async function callAdvice({ block_id, prompt, context, context_kind } = {}) {
  const { callLLM } = await import('./llm_gateway.mjs');
  const kind = ADVICE_PROMPTS[context_kind] ? context_kind : 'block';
  const sys = [
    'You are SIMA Atlas — a coding architect.',
    ADVICE_PROMPTS[kind],
    'Reply in the same language the user wrote in (Russian if Russian, English if English).',
    'Keep replies under 6 short sentences. No fluff, no preamble.',
  ].join(' ');
  const ctx = context && typeof context === 'object'
    ? `\n\nContext: ${JSON.stringify(context).slice(0, 1500)}`
    : '';
  const blk = block_id ? `\nBlock id: ${block_id}` : '';
  const kindLine = `\nScreen kind: ${kind}`;
  const userPrompt = `${prompt || 'Дай совет.'}${blk}${kindLine}${ctx}`;
  try {
    const r = await callLLM({
      provider: process.env.LLM_DEFAULT_PROVIDER || undefined,
      system: sys,
      prompt: userPrompt,
      max_tokens: 400,
      temperature: 0.4,
      op: 'design_ui_advice',
    });
    const provider = r.trace?.provider || r.provider || null;
    const model = r.trace?.model || r.model || null;
    const advice = typeof r.value === 'string' ? r.value : (r.value?.text || JSON.stringify(r.value));
    const isMock = provider === 'mock';
    return {
      ok: true,
      advice: isMock
        ? 'Совет в demo-режиме: задайте ANTHROPIC_API_KEY (или GOOGLE_API_KEY) и Совет Клода вернёт реальный ответ модели.'
        : advice,
      provider, model, kind, mock: isMock,
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

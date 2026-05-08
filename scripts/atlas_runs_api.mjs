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

// Phase R-7.22 — every read-side helper now accepts either an explicit
// `root` (legacy) OR a `client_id`. clientRoot() resolves a client to its
// atlas/clients/<id>/ subdir; bare ROOT is the unscoped legacy path.
function clientRoot(client_id) {
  if (!client_id) return ATLAS_DEFAULT;
  if (!/^[a-zA-Z0-9._-]+$/.test(String(client_id))) return ATLAS_DEFAULT;
  return path.join(ROOT, 'atlas', 'clients', String(client_id));
}
function resolveRoot({ root, client_id } = {}) {
  if (root) return root;
  return clientRoot(client_id);
}
function runStateDir(root) { return path.join(root || ATLAS_DEFAULT, 'run_state'); }
function acceptanceDir(root) { return path.join(root || ATLAS_DEFAULT, 'acceptance_runs'); }

function safeReadJson(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

// R-7.41 — собирает «внешние запуски» из checks.log блока. Внешние = когда
// агент (Cursor IDE / Claude Code в другом терминале / etc.) поработал
// напрямую и оставил строку в checks.log, не проходя через наш orchestrator
// (`/runs/start`). Без этого внешние прогоны не видны во вкладке «Запуски».
//
// Парсим строки вида:
//   `<ISO ts>\t<kind>\t<verdict>\t<note>`
// где kind ∈ {cursor_run, claude_run, codex_run, agent_invocation}.
// Возвращаем синтетические run-объекты с run_id `ext_<ts>_<kind>` —
// merge'аются в один поток с реальными run_state-объектами.
const EXTERNAL_RUN_KINDS = new Set(['cursor_run', 'claude_run', 'codex_run', 'agent_invocation']);
function listExternalRunsFromChecks(block_id, root) {
  if (!block_id) return [];
  const checks = path.join(root || ATLAS_DEFAULT, 'blocks', block_id, 'checks.log');
  if (!fs.existsSync(checks)) return [];
  const lines = fs.readFileSync(checks, 'utf8').split(/\r?\n/);
  const out = [];
  for (const ln of lines) {
    if (!ln.trim()) continue;
    const parts = ln.split('\t');
    if (parts.length < 3) continue;
    const [ts, kind, verdict, ...rest] = parts;
    if (!/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(ts)) continue;
    if (!EXTERNAL_RUN_KINDS.has(kind)) continue;
    const note = rest.join('\t');
    // Из note вытащим agent — обычно это или префикс «agent=cursor» или
    // имя в начале (Cursor / Claude / Codex). Default по kind.
    let agent = 'unknown';
    const agentM = note.match(/agent=([a-z-]+)/i);
    if (agentM) agent = agentM[1];
    else if (kind === 'cursor_run') agent = 'cursor';
    else if (kind === 'claude_run') agent = 'claude';
    else if (kind === 'codex_run') agent = 'codex';
    else if (kind === 'agent_invocation') agent = 'unknown';
    const state = verdict === 'pass' ? 'Succeeded' : verdict === 'fail' ? 'Failed' : 'Succeeded';
    out.push({
      run_id: `ext_${ts.replace(/[:.]/g, '-')}_${kind}`,
      block_id,
      agent,
      started_at: ts,
      current_state: state,
      last_event_at: ts,
      external: true,        // флаг для UI: это не наш orchestrator
      source_kind: kind,
      summary: note.slice(0, 200),
      history: [{ ts, from: null, to: state, note: `external: ${kind} ${verdict}` }],
    });
  }
  return out;
}

export function listRunsByBlock({ block_id, active_only = false, limit = 20, root, client_id, enriched = false, include_external = true } = {}) {
  const eff = resolveRoot({ root, client_id });
  const dir = runStateDir(eff);
  const runs = [];
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const r = safeReadJson(path.join(dir, f));
      if (!r) continue;
      if (block_id && r.block_id !== block_id) continue;
      if (active_only && TERMINAL_STATES.has(r.current_state)) continue;
      runs.push(r);
    }
  }
  // R-7.41 — добавляем external runs из checks.log если запрошен block_id.
  // Без block_id (list-all-runs view) — пропускаем, иначе пришлось бы
  // сканировать все блоки клиента; это редкий path.
  if (include_external && block_id) {
    const ext = listExternalRunsFromChecks(block_id, eff);
    for (const r of ext) {
      if (active_only) continue; // external уже terminal по определению
      runs.push(r);
    }
  }
  runs.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
  const sliced = runs.slice(0, limit);
  if (!enriched) return sliced;
  // Phase I: attach acceptance_after + cost_usd + file_count to each run.
  // Acceptance verdict is the verifier output that landed in the window
  // [run.started_at, next-run.started_at). Cost is the sum of all
  // llm_traces in that same window.
  return enrichRunsBatch(sliced, eff);
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

export function getRun(run_id, { root, client_id } = {}) {
  if (!run_id) return null;
  const eff = resolveRoot({ root, client_id });
  const p = path.join(runStateDir(eff), `${run_id}.json`);
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
export function startRunAsync({ block_id, agent, prompt, client_id } = {}) {
  if (!block_id) throw new Error('startRunAsync: block_id required');
  if (client_id && !/^[a-zA-Z0-9._-]+$/.test(String(client_id))) {
    throw new Error(`startRunAsync: invalid client_id "${client_id}"`);
  }
  const args = ['scripts/run_block_implementation.mjs'];
  if (client_id) args.push(`--client=${String(client_id)}`);
  args.push(String(block_id));
  if (prompt) args.push('--', String(prompt));
  const env = { ...process.env };
  if (agent) env.ATLAS_AGENT = String(agent);

  // R-7.22: child + its grand-children (run_state, verify_block_acceptance)
  // honor ATLAS_ROOT, so we set it once here. This is what makes
  // run_state/<run_id>.json land under atlas/clients/<id>/run_state/.
  if (client_id) env.ATLAS_ROOT = path.join(ROOT, 'atlas', 'clients', String(client_id));

  // Predict run_id same way run_state.startRun does, then pass it via env
  // so the child uses our id instead of computing its own. This lets the
  // UI tail logs immediately without polling for the run to appear.
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const run_id = `${block_id}__${ts}`;
  env.ATLAS_PRESET_RUN_ID = run_id;

  // run_logs are kept in a single shared dir at ROOT/atlas/run_logs/ —
  // run_id is unique enough across clients (block_id__UTC). The UI's
  // /runs/log endpoint reads from here regardless of client.
  const logsDir = path.join(ROOT, 'atlas', 'run_logs');
  fs.mkdirSync(logsDir, { recursive: true });
  const logPath = path.join(logsDir, `${run_id}.log`);
  const out = fs.openSync(logPath, 'a');
  const err = fs.openSync(logPath, 'a');
  fs.writeFileSync(logPath, `# run ${run_id}  block=${block_id}  agent=${agent || '(default)'}  client=${client_id || '(default)'}  started=${new Date().toISOString()}\n`);

  const child = spawn('node', args, {
    cwd: ROOT,
    env,
    stdio: ['ignore', out, err],
    detached: true,
  });
  child.unref();
  fs.closeSync(out);
  fs.closeSync(err);

  return { ok: true, pid: child.pid, run_id, block_id, agent: agent || null, client_id: client_id || null };
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
export function listRunFiles({ run_id, root, client_id } = {}) {
  if (!run_id) return [];
  const eff = resolveRoot({ root, client_id });
  const run = getRun(run_id, { root: eff });
  if (!run) return [];
  const block_id = run.block_id;
  const startedAt = run.started_at;
  const checks = path.join(eff, 'blocks', block_id, 'checks.log');
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

// Phase O-4: pull a tight operator-profile snippet for graph-level
// advice so Sima can reference the user's stack history / don't-use
// list when deciding what to suggest. Returns empty string when the
// profile is warming up (no aggregated data yet) or absent.
function readOperatorProfileSnippet() {
  try {
    const p = path.join(ATLAS_DEFAULT, 'operator_profile', 'profile.json');
    if (!fs.existsSync(p)) return '';
    const prof = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (prof._status === 'warming_up') return '';
    const parts = [];
    if (Array.isArray(prof.tech_stack_history) && prof.tech_stack_history.length) {
      parts.push(`tech_stack_history: ${prof.tech_stack_history.slice(0, 8).map((t) => t.value || t).join(', ')}`);
    }
    if (Array.isArray(prof.dont_use) && prof.dont_use.length) {
      parts.push(`dont_use: ${prof.dont_use.slice(0, 8).map((t) => t.value || t).join(', ')}`);
    }
    if (Array.isArray(prof.lesson) && prof.lesson.length) {
      parts.push(`recent lessons: ${prof.lesson.slice(0, 4).map((l) => l.summary || l.note || '').filter(Boolean).join('; ')}`);
    }
    return parts.length ? `Operator profile (Sima knows about you): ${parts.join(' | ')}` : '';
  } catch { return ''; }
}

export async function callAdvice({ block_id, prompt, context, context_kind } = {}) {
  const { callLLM } = await import('./llm_gateway.mjs');
  const kind = ADVICE_PROMPTS[context_kind] ? context_kind : 'block';
  // Profile awareness only for graph-level advice — adding it to
  // every block-level call would add noise without benefit.
  const profileSnippet = ['graph_overview', 'gallery'].includes(kind) ? readOperatorProfileSnippet() : '';
  const sys = [
    'You are SIMA Atlas — a coding architect.',
    ADVICE_PROMPTS[kind],
    profileSnippet ? `\n${profileSnippet}\nUse this to bias recommendations toward the operator's preferences.` : '',
    'Reply in the same language the user wrote in (Russian if Russian, English if English).',
    'Keep replies under 6 short sentences. No fluff, no preamble.',
  ].filter(Boolean).join(' ');
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

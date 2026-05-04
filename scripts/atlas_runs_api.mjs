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

export function listRunsByBlock({ block_id, active_only = false, limit = 20, root } = {}) {
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
  return runs.slice(0, limit);
}

export function getRun(run_id, { root } = {}) {
  if (!run_id) return null;
  const p = path.join(runStateDir(root), `${run_id}.json`);
  return safeReadJson(p);
}

export function getLatestAcceptance({ block_id, root } = {}) {
  if (!block_id) return null;
  const p = path.join(acceptanceDir(root), block_id, '_latest.json');
  const r = safeReadJson(p);
  if (!r) return null;
  // Compress: only return what the UI needs to keep payload small.
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

// Spawn run_block_implementation.mjs in the background. We do NOT block on
// completion — the script writes its own run_state file as it progresses,
// and the UI polls listRunsByBlock to track it.
export function startRunAsync({ block_id, agent, prompt } = {}) {
  if (!block_id) throw new Error('startRunAsync: block_id required');
  const args = ['scripts/run_block_implementation.mjs', String(block_id)];
  if (prompt) args.push('--', String(prompt));
  const env = { ...process.env };
  if (agent) env.ATLAS_AGENT = String(agent);

  const child = spawn('node', args, {
    cwd: ROOT,
    env,
    stdio: 'ignore',
    detached: true,
  });
  child.unref();

  // The child's startRun() writes run_id = `<block_id>__<UTC-ts>`. We can't
  // know the exact timestamp the child will pick (clock skew between this
  // call and child boot is ~ms). Best-effort: poll listRunsByBlock for ~1s
  // and return the newest entry.
  return { ok: true, pid: child.pid, block_id, agent: agent || null };
}

// Convenience: callLLM-backed advice for the design UI's "Совет Клода"
// button. Falls back to mock provider if no API keys are configured, so
// the route is always usable in dev / sandbox.
export async function callAdvice({ block_id, prompt, context } = {}) {
  const { callLLM } = await import('./llm_gateway.mjs');
  const sys = [
    'You are SIMA Atlas — a coding architect. Give concise, actionable advice.',
    'Reply in the same language the user wrote in (Russian if Russian, English if English).',
    'Be specific: name a concrete next step, a risk, and a simplification if any.',
    'Keep replies under 6 short sentences.',
  ].join(' ');
  const ctx = context && typeof context === 'object'
    ? `\n\nContext: ${JSON.stringify(context).slice(0, 1000)}`
    : '';
  const blk = block_id ? `\nBlock id: ${block_id}` : '';
  const userPrompt = `${prompt || 'Дай совет по этому блоку.'}${blk}${ctx}`;
  try {
    const r = await callLLM({
      provider: process.env.LLM_DEFAULT_PROVIDER || undefined,
      system: sys,
      prompt: userPrompt,
      max_tokens: 400,
      temperature: 0.4,
      op: 'design_ui_advice',
    });
    // callLLM returns {value, provider, model, usage,...}; .value is text or object
    const advice = typeof r.value === 'string' ? r.value : (r.value?.text || JSON.stringify(r.value));
    // Detect the mock fallback (no API key configured) and label it so the
    // UI can show a soft "demo mode" hint instead of pretending it's real.
    const isMock = r.provider === 'mock';
    return {
      ok: true,
      advice: isMock
        ? 'Совет в demo-режиме: задайте ANTHROPIC_API_KEY (или GOOGLE_API_KEY) и Совет Клода вернёт реальный ответ модели.'
        : advice,
      provider: r.provider,
      model: r.model,
      mock: isMock,
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

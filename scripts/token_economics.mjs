#!/usr/bin/env node
// R-7.87 (S-9) — token economics aggregator.
//
// Operator pain: «я гоняю агентов часами и не вижу куда уходят токены». LLM
// traces are written for every call (atlas/llm_traces/*.json) but the only
// visualisation today is per-run cost in the Activity panel and provider
// totals in operator_profile. There's no answer to:
//   - который op жрёт больше всего? (extract_block_schema или verifier?)
//   - сколько за последние 30 дней потрачено в total + по дням?
//   - сколько бы это стоило если бы мы шли через Anthropic API
//     (а не через Claude CLI subscription)? Shadow bill.
//   - который block самый дорогой?
//
// This module is pure — read-only over atlas/llm_traces. It does NOT call
// any LLM. Output is a structured roll-up that the API + UI can consume.
//
// Two cost dimensions:
//   - cost_usd_actual       — what was charged. claude_cli/ollama/mock = 0.
//   - cost_usd_equivalent   — what it WOULD cost on Anthropic Haiku 4.5
//                             (input $1/Mtok, output $5/Mtok). Stable
//                             across providers, makes the «what if I
//                             switched off claude_cli subscription» visible.
//
// Per-block attribution: traces don't carry block_id. We attribute by
// scanning run_state/*.json (each has block_id + started_at + ended_at)
// and assigning traces in that window to the run's block. Best-effort —
// traces outside any window stay block-less and roll up only into totals.
//
// Usage:
//   node scripts/token_economics.mjs                     (last 30 days, all blocks)
//   node scripts/token_economics.mjs --days 7
//   node scripts/token_economics.mjs --block b.docs
//   node scripts/token_economics.mjs --json              (full JSON, no pretty print)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Equivalent-cost reference: Anthropic Haiku 4.5 (Jan 2026 list price).
// Hard-coded here on purpose — this is the «what would API cost» column;
// it must NOT drift with provider env-config changes.
const EQUIV_PRICE_IN_PER_MTOK = 1.0;
const EQUIV_PRICE_OUT_PER_MTOK = 5.0;

function safeReadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function listTraces(atlas, days) {
  const dir = path.join(atlas, 'llm_traces');
  if (!fs.existsSync(dir)) return [];
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    if (f < cutoff.slice(0, 19).replace(/[:.]/g, '-')) continue; // filename is ISO-ish; cheap pre-filter
    const r = safeReadJson(path.join(dir, f));
    if (!r || !r.at || r.at < cutoff) continue;
    out.push(r);
  }
  return out;
}

function listRunWindows(atlas) {
  // For per-block attribution. Each run has block_id + started_at + ended_at.
  const dir = path.join(atlas, 'run_state');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    if (f === 'chat_watch_cursor.json' || f === 'chat_watch_status.json') continue;
    const r = safeReadJson(path.join(dir, f));
    if (!r?.block_id || !r?.started_at) continue;
    out.push({ block_id: r.block_id, started_at: r.started_at, ended_at: r.ended_at || '9999' });
  }
  return out.sort((a, b) => a.started_at.localeCompare(b.started_at));
}

function attributeBlock(trace, windows) {
  // Linear scan — list is small (typically <500 runs even after months).
  for (const w of windows) {
    if (trace.at >= w.started_at && trace.at < w.ended_at) return w.block_id;
  }
  return null;
}

function equivalentCost(trace) {
  return (trace.input_tokens || 0) * EQUIV_PRICE_IN_PER_MTOK / 1e6
       + (trace.output_tokens || 0) * EQUIV_PRICE_OUT_PER_MTOK / 1e6;
}

export function aggregateTokenEconomics({ days = 30, blockFilter = '', root = process.cwd() } = {}) {
  const atlas = path.join(root, 'atlas');
  const traces = listTraces(atlas, days);
  const windows = listRunWindows(atlas);
  const totals = {
    trace_count: 0,
    input_tokens: 0,
    output_tokens: 0,
    cost_usd_actual: 0,
    cost_usd_equivalent: 0,
  };
  const byBlock = new Map();
  const byOp = new Map();
  const byProvider = new Map();
  const byDay = new Map();

  const bump = (map, key, t, equiv) => {
    let e = map.get(key);
    if (!e) { e = { key, count: 0, in: 0, out: 0, actual: 0, equiv: 0 }; map.set(key, e); }
    e.count += 1;
    e.in += t.input_tokens || 0;
    e.out += t.output_tokens || 0;
    e.actual += t.cost_usd || 0;
    e.equiv += equiv;
  };

  for (const t of traces) {
    const equiv = equivalentCost(t);
    const block_id = attributeBlock(t, windows);
    if (blockFilter && block_id !== blockFilter) continue;
    totals.trace_count += 1;
    totals.input_tokens += t.input_tokens || 0;
    totals.output_tokens += t.output_tokens || 0;
    totals.cost_usd_actual += t.cost_usd || 0;
    totals.cost_usd_equivalent += equiv;
    if (block_id) bump(byBlock, block_id, t, equiv);
    bump(byOp, t.op || 'unknown', t, equiv);
    bump(byProvider, t.provider || 'unknown', t, equiv);
    const day = (t.at || '').slice(0, 10);
    if (day) bump(byDay, day, t, equiv);
  }

  const sortByEquiv = (m) => Array.from(m.values()).sort((a, b) => b.equiv - a.equiv);
  const sortByDay = (m) => Array.from(m.values()).sort((a, b) => a.key.localeCompare(b.key));

  return {
    window_days: days,
    block_filter: blockFilter || null,
    totals: {
      ...totals,
      cost_usd_actual: round(totals.cost_usd_actual),
      cost_usd_equivalent: round(totals.cost_usd_equivalent),
    },
    top_blocks: sortByEquiv(byBlock).slice(0, 10).map(roundEntry),
    top_ops: sortByEquiv(byOp).slice(0, 10).map(roundEntry),
    by_provider: sortByEquiv(byProvider).map(roundEntry),
    daily: sortByDay(byDay).map(roundEntry),
  };
}

function round(n) { return Math.round(n * 1e5) / 1e5; }
function roundEntry(e) {
  return {
    key: e.key,
    count: e.count,
    input_tokens: e.in,
    output_tokens: e.out,
    cost_usd_actual: round(e.actual),
    cost_usd_equivalent: round(e.equiv),
  };
}

// CLI entry — only when invoked directly, not when imported.
const isCli = (() => {
  try { return process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]); }
  catch { return false; }
})();

if (isCli) {
  const args = process.argv.slice(2);
  const arg = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt; };
  const result = aggregateTokenEconomics({
    days: Number(arg('--days', 30)),
    blockFilter: arg('--block', ''),
    root: arg('--root', process.cwd()),
  });
  const JSON_OUT = args.includes('--json');
  if (JSON_OUT) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    const r = result;
  const fmt = (n) => `$${n.toFixed(4)}`;
  const fmtTok = (n) => n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n);
  console.log(`Token economics — last ${r.window_days} days${r.block_filter ? ` (block ${r.block_filter})` : ''}`);
  console.log(`  traces:           ${r.totals.trace_count}`);
  console.log(`  input tokens:     ${fmtTok(r.totals.input_tokens)}`);
  console.log(`  output tokens:    ${fmtTok(r.totals.output_tokens)}`);
  console.log(`  actual cost:      ${fmt(r.totals.cost_usd_actual)}  (what was charged)`);
  console.log(`  equivalent cost:  ${fmt(r.totals.cost_usd_equivalent)}  (Anthropic Haiku 4.5 list price)`);
  if (r.top_blocks.length) {
    console.log(`\nTop blocks (by equivalent cost):`);
    for (const b of r.top_blocks) {
      console.log(`  ${b.key.padEnd(30)} ${fmt(b.cost_usd_equivalent).padStart(10)}   ${String(b.count).padStart(4)} calls`);
    }
  }
  console.log(`\nTop ops (by equivalent cost):`);
  for (const o of r.top_ops) {
    console.log(`  ${o.key.padEnd(30)} ${fmt(o.cost_usd_equivalent).padStart(10)}   ${String(o.count).padStart(4)} calls`);
  }
    console.log(`\nBy provider:`);
    for (const p of r.by_provider) {
      console.log(`  ${p.key.padEnd(30)} actual ${fmt(p.cost_usd_actual).padStart(10)}  equiv ${fmt(p.cost_usd_equivalent).padStart(10)}   ${String(p.count).padStart(5)} calls`);
    }
  }
}

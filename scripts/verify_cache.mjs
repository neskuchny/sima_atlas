#!/usr/bin/env node
// R-8.11 (b.acceptance-verifier-loop) — KPI-6: the verifier returns a cached
// verdict when nothing it depends on has changed.
//
// A cache that returns «pass» after a real change is the silent green this
// whole system exists to prevent, so the key is conservative and was chosen
// by measuring what a verification pass actually touches, not by guessing:
//
//   code       git HEAD + the content of every changed / untracked file
//              outside atlas/ (tests, scripts, frontend, config, verifier
//              itself). Any code change invalidates every block.
//   contracts  every block's contract files, graph.json (minus canvas
//              coordinates), project rules, tech stack, operator locks.
//   verdicts   every block's latest verdict + counts and latest kpi result,
//              without timestamps — what the validators an assertion may run
//              actually read. Re-verifying a block with the same outcome
//              does not change it.
//   targets    this block's explicit evidence targets: the content of each
//              log_grep file, the file list of each fs_glob.
//   env        LLM mode (forced mock, provider pins, which keys are present —
//              never their values), node version, atlas root.
//
// Left out on purpose, per the measurement: the verifier's own outputs
// (acceptance_runs/), derived artifacts regenerated with fresh timestamps by
// the very commands being verified (WIKI.md, wiki.html, roadmap.md,
// sync_report.json …), sandbox and history dirs, runtime logs other than the
// verdict lines above, and llm_traces (outputs of LLM calls, not inputs). If
// a block's assertion greps one of those files explicitly, that file IS in
// the block's key (targets).
//
// Rules:
//   * `pass` is cached; `inconclusive` only under ATLAS_FORCE_MOCK_LLM=1,
//     where it is deterministic (the judge is skipped, not asked) — the LLM
//     mode is in the key, so such an entry is never served to a live run;
//     `fail` is never cached: a transient timeout must not stick for a day.
//     Neither cached verdict can be a false green;
//   * blocks with a file_diff assertion (depends on the whole git diff) or an
//     fs_glob with max_age_min (depends on the clock) are never cached;
//   * no git (an installed copy) → no cache, and it says so;
//   * the key is stored AFTER the caller's own writes, so the verifier's own
//     output never invalidates it; a miss names what changed;
//   * entries expire after ATLAS_VERIFY_CACHE_TTL_H hours (default 36, so
//     consecutive nightlies can hit, and nothing unkeyed lives longer);
//   * off: ATLAS_VERIFY_CACHE=0 or `verify_block_acceptance --no-cache`.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_ATLAS = () => process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');

export const CACHE_FILE = '_cache.json';
export const STATS_FILE = '_cache_stats.jsonl';
const CONTRACT_FILES = ['mission.md', 'acceptance.md', 'kpi.md', 'user_story.md', 'depends_on.md',
  'provides.md', 'files.md', 'tasks.md', 'understanding.md'];
const TOP_FILES = ['rules.md', 'tech_stack.md', 'project.md', 'architecture_decisions.md',
  'dependency_cycle_exemptions.json', 'operator_profile/dont_use.json',
  'operator_profile/always_use.json'];
// Rewritten by aggregate_operator_profile every night with a new updated_at
// and trace counters (measured: nothing else changed between two nights).
// Hashed with numbers and timestamps blanked, so structure and text — where
// a leaked e-mail or key would show up — still invalidate, counters do not.
const NORMALIZED_JSON = ['operator_profile/profile.json'];
// Generated from the atlas (and stamped with a time) — not code, though it
// lives outside atlas/.
const DERIVED_OUTSIDE_ATLAS = ['frontend/atlas_bootstrap.js'];
function normalizeJson(buf) {
  const walk = (v) => (typeof v === 'number' ? 0
    : typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) ? '<ts>'
      : Array.isArray(v) ? v.map(walk)
        : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)])) : v);
  try { return JSON.stringify(walk(JSON.parse(String(buf)))); } catch { return String(buf); }
}

const sha = (x) => crypto.createHash('sha256').update(x).digest('hex').slice(0, 16);
const readOr = (p, dflt = '') => { try { return fs.readFileSync(p); } catch { return dflt; } };

export function cacheEnabled() {
  if (process.env.ATLAS_VERIFY_CACHE === '0') return { ok: false, reason: 'disabled (ATLAS_VERIFY_CACHE=0)' };
  if (!fs.existsSync(path.join(ROOT, '.git'))) return { ok: false, reason: 'no git repository — the code part of the key cannot be computed' };
  return { ok: true };
}

function ttlMs() {
  const h = Number(process.env.ATLAS_VERIFY_CACHE_TTL_H);
  return (Number.isFinite(h) && h > 0 ? h : 36) * 3600 * 1000;
}

// ── key parts ───────────────────────────────────────────────────────────────
function codePart() {
  const opts = { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 };
  const head = execFileSync('git', ['rev-parse', 'HEAD'], opts).trim();
  const status = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', '.', ':(exclude)atlas',
    ...DERIVED_OUTSIDE_ATLAS.map((f) => `:(exclude)${f}`)], opts);
  const h = crypto.createHash('sha256').update(head);
  for (const entry of status.split('\0').filter(Boolean).sort()) {
    h.update(entry);
    const p = entry.length > 3 ? entry.slice(3) : entry;
    h.update(readOr(path.join(ROOT, p), '<missing>'));
  }
  return h.digest('hex').slice(0, 16);
}

function contractsPart(atlasRoot) {
  const h = crypto.createHash('sha256');
  try {
    const graph = JSON.parse(fs.readFileSync(path.join(atlasRoot, 'graph.json'), 'utf8'));
    // Canvas layout is not meaning: dragging a node must not void the cache.
    for (const b of graph.blocks || []) { delete b.canvas_x; delete b.canvas_y; delete b.canvas_size; }
    h.update(JSON.stringify(graph));
  } catch { h.update('<no graph>'); }
  for (const f of TOP_FILES) { h.update(f); h.update(readOr(path.join(atlasRoot, f))); }
  for (const f of NORMALIZED_JSON) { h.update(f); h.update(normalizeJson(readOr(path.join(atlasRoot, f)))); }
  const blocksDir = path.join(atlasRoot, 'blocks');
  for (const id of fs.existsSync(blocksDir) ? fs.readdirSync(blocksDir).sort() : []) {
    for (const f of CONTRACT_FILES) { h.update(`${id}/${f}`); h.update(readOr(path.join(blocksDir, id, f))); }
  }
  return h.digest('hex').slice(0, 16);
}

function latestKpiResult(checksText) {
  const lines = String(checksText).split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const c = lines[i].split(/\t|\s{2,}/).map((x) => x.trim());
    if (c.length >= 3 && /^kpi/i.test(c[1])) return c[2].toLowerCase();
  }
  return null;
}

function verdictsPart(atlasRoot) {
  const summary = {};
  const runsDir = path.join(atlasRoot, 'acceptance_runs');
  const blocksDir = path.join(atlasRoot, 'blocks');
  for (const id of fs.existsSync(blocksDir) ? fs.readdirSync(blocksDir).sort() : []) {
    let v = null;
    try {
      const r = JSON.parse(fs.readFileSync(path.join(runsDir, id, '_latest.json'), 'utf8'));
      v = { verdict: r.verdict, counts: r.counts };
    } catch { /* never verified */ }
    summary[id] = { v, kpi: latestKpiResult(readOr(path.join(blocksDir, id, 'checks.log'))) };
  }
  return sha(JSON.stringify(summary));
}

function envPart(atlasRoot) {
  const has = (k) => Boolean(process.env[k] && process.env[k].trim());
  return sha(JSON.stringify({
    node: process.version,
    force_mock: process.env.ATLAS_FORCE_MOCK_LLM === '1',
    provider: process.env.LLM_DEFAULT_PROVIDER || null,
    prefer_cli: process.env.LLM_PREFER_CLI || null,
    prefer_ollama: process.env.LLM_PREFER_OLLAMA || null,
    keys: { anthropic: has('ANTHROPIC_API_KEY'), google: has('GOOGLE_API_KEY'), openai: has('OPENAI_API_KEY') },
    atlas: path.relative(ROOT, atlasRoot) || '.',
  }));
}

/** Why a block can never be cached, or null. */
export function uncacheableReason(parsed) {
  const specs = [...(parsed.assertions || []), ...(parsed.inconclusive_if || [])];
  for (const a of specs) {
    if (a.evidence_kind === 'file_diff') return `${a.id || 'a condition'} is file_diff — depends on the whole git diff`;
    if (a.evidence_kind === 'fs_glob' && a.evidence_spec && a.evidence_spec.max_age_min !== undefined) {
      return `${a.id || 'a condition'} is fs_glob with max_age_min — depends on the clock`;
    }
  }
  return null;
}

function targetsPart(parsed, glob) {
  const h = crypto.createHash('sha256');
  const specs = [...(parsed.assertions || []), ...(parsed.inconclusive_if || [])];
  for (const a of specs) {
    const s = a.evidence_spec || {};
    if (a.evidence_kind === 'log_grep' && typeof s.file === 'string') {
      h.update(`log_grep:${s.file}`); h.update(readOr(path.resolve(ROOT, s.file), '<missing>'));
    } else if (a.evidence_kind === 'fs_glob' && typeof s.pattern === 'string') {
      let files = [];
      try { files = glob ? glob(s.pattern) : []; } catch { files = ['<glob error>']; }
      h.update(`fs_glob:${s.pattern}:${files.map((f) => path.relative(ROOT, f)).sort().join('|')}`);
    }
  }
  return h.digest('hex').slice(0, 16);
}

export function computeKeyParts({ blockId, atlasRoot = DEFAULT_ATLAS(), parsed, glob }) {
  return {
    block: blockId,
    code: codePart(),
    contracts: contractsPart(atlasRoot),
    verdicts: verdictsPart(atlasRoot),
    targets: targetsPart(parsed, glob),
    env: envPart(atlasRoot),
  };
}
const keyOf = (parts) => sha(JSON.stringify(parts));

const PART_NAMES = {
  code: 'code changed (a commit, or a changed / new file outside atlas/)',
  contracts: 'a contract, graph.json or project rules changed',
  verdicts: 'another block\'s verdict or kpi result changed',
  targets: 'a file this block\'s assertions read changed',
  env: 'LLM mode, node version or atlas root changed',
};

function cachePath(atlasRoot, blockId) { return path.join(atlasRoot, 'acceptance_runs', blockId, CACHE_FILE); }

function recordStat(atlasRoot, row) {
  try {
    const dir = path.join(atlasRoot, 'acceptance_runs');
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, STATS_FILE), JSON.stringify({ ts: new Date().toISOString(), ...row }) + '\n');
  } catch { /* stats are best-effort */ }
}

/**
 * Look up a cached pass. Returns { hit: true, result, lookup_ms } or
 * { hit: false, reason, lookup_ms }. Never throws — any problem is a miss.
 */
const cacheable = (verdict) => verdict === 'pass' || (verdict === 'inconclusive' && process.env.ATLAS_FORCE_MOCK_LLM === '1');

export function lookupVerifyCache({ blockId, atlasRoot = DEFAULT_ATLAS(), parsed, glob }) {
  const t0 = process.hrtime.bigint();
  const ms = () => Number(process.hrtime.bigint() - t0) / 1e6;
  const miss = (reason) => {
    const lookup_ms = ms();
    recordStat(atlasRoot, { block_id: blockId, hit: false, reason, lookup_ms });
    return { hit: false, reason, lookup_ms };
  };
  const en = cacheEnabled();
  if (!en.ok) return { hit: false, reason: en.reason, lookup_ms: 0 };
  const unc = uncacheableReason(parsed);
  if (unc) return miss(`never cached: ${unc}`);
  let entry;
  try { entry = JSON.parse(fs.readFileSync(cachePath(atlasRoot, blockId), 'utf8')); } catch { return miss('no cached pass yet'); }
  if (!entry || !cacheable(entry.result?.verdict)) return miss('no cached result (pass, or inconclusive under the mock, is cached — never fail)');
  const age = Date.now() - Date.parse(entry.stored_at);
  if (!(age >= 0 && age <= ttlMs())) return miss(`cached pass expired (${Math.round(age / 3600000)} h old)`);
  let parts;
  try { parts = computeKeyParts({ blockId, atlasRoot, parsed, glob }); } catch (e) { return miss(`key not computable: ${e.message}`); }
  if (keyOf(parts) !== entry.key) {
    const changed = Object.keys(PART_NAMES).filter((k) => parts[k] !== entry.parts?.[k]).map((k) => PART_NAMES[k]);
    return miss(changed.length ? changed.join('; ') : 'key changed');
  }
  const lookup_ms = ms();
  recordStat(atlasRoot, { block_id: blockId, hit: true, lookup_ms });
  const result = JSON.parse(JSON.stringify(entry.result));
  result.cache = { hit: true, stored_at: entry.stored_at, verified_at: entry.result.checked_at, lookup_ms };
  return { hit: true, result, lookup_ms };
}

/**
 * Store a cacheable result. Call it AFTER your own writes (_latest.json, checks.log):
 * the key must describe the state the next lookup will see.
 */
export function storeVerifyCache({ blockId, atlasRoot = DEFAULT_ATLAS(), parsed, glob, result }) {
  if (!result || !cacheable(result.verdict) || result.cache?.hit) return { stored: false };
  if (!cacheEnabled().ok || uncacheableReason(parsed)) return { stored: false };
  try {
    const parts = computeKeyParts({ blockId, atlasRoot, parsed, glob });
    const clean = JSON.parse(JSON.stringify(result));
    delete clean.cache;
    const p = cachePath(atlasRoot, blockId);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({ key: keyOf(parts), parts, stored_at: new Date().toISOString(), result: clean }, null, 2) + '\n');
    return { stored: true };
  } catch { return { stored: false }; }
}

/** Hit rate and lookup latency over the stats since `sinceIso` (KPI-6). */
export function cacheStats({ atlasRoot = DEFAULT_ATLAS(), sinceIso = null } = {}) {
  const p = path.join(atlasRoot, 'acceptance_runs', STATS_FILE);
  const rows = String(readOr(p)).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter((r) => r && (!sinceIso || r.ts >= sinceIso));
  const hits = rows.filter((r) => r.hit);
  const lat = hits.map((r) => r.lookup_ms).sort((a, b) => a - b);
  const pct = (q) => (lat.length ? lat[Math.min(lat.length - 1, Math.floor(q * lat.length))] : null);
  return {
    lookups: rows.length, hits: hits.length, misses: rows.length - hits.length,
    hit_rate: rows.length ? hits.length / rows.length : null,
    hit_ms_p50: pct(0.5), hit_ms_p95: pct(0.95),
    miss_reasons: rows.filter((r) => !r.hit).reduce((m, r) => { m[r.reason] = (m[r.reason] || 0) + 1; return m; }, {}),
  };
}

// CLI: node scripts/verify_cache.mjs stats [--since <ISO>]
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--since');
  const s = cacheStats({ sinceIso: i >= 0 ? args[i + 1] : null });
  console.log(JSON.stringify(s, null, 2));
}

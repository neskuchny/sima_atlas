#!/usr/bin/env node
// PR-1 (b.operator-profile-learner): read-only aggregator from existing repo
// signals → atlas/operator_profile/{profile.json, patterns/*.json,
// history/<UTC>.json}.
//
// No LLM calls. Pure rule-based counters / frequencies / success-rates.
//
// Sources (only those that exist in this repo today; missing → silently
// skipped):
//   atlas/transitions.log                    — block status transitions
//   atlas/blocks/<id>/checks.log             — per-block events incl. acceptance
//   atlas/blocks/<id>/decisions.log          — architectural decisions
//   atlas/blocks/<id>/patterns.md            — what worked / what didn't
//   atlas/blocks/<id>/files.md               — alive/archived/dead split
//   atlas/proposals/*.json                   — accept/reject rate of LLM proposals
//   atlas/llm_traces/*.json                  — provider/model/cost/fallback stats
//   atlas/graph.json                         — per-block tech_stack
//
// Min-data guard: if `done` transitions < 5 AND llm_extraction lines < 10
// → profile._status = "warming_up" and patterns are emitted empty. This is
// the contract `inject_context_pack` and `pickTemplate` rely on to stay
// silent until enough evidence has accumulated.
//
// CLI:
//   node scripts/aggregate_operator_profile.mjs            # write profile
//   node scripts/aggregate_operator_profile.mjs --dry-run  # print to stdout
//   node scripts/aggregate_operator_profile.mjs --json     # write + print json
//
// Programmatic:
//   import { aggregateOperatorProfile } from './aggregate_operator_profile.mjs';
//   const p = aggregateOperatorProfile({ atlas_root: '...' }); // returns profile

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const MIN_DONE_TRANSITIONS = Number(process.env.OPERATOR_PROFILE_MIN_DONE || 5);
const MIN_INVOCATIONS = Number(process.env.OPERATOR_PROFILE_MIN_INVOCATIONS || 10);

const KNOWN_AGENTS = ['claude', 'codex', 'cursor', 'openai', 'gemini', 'mock'];
const KNOWN_PROVIDERS = ['anthropic', 'google', 'openai', 'mock'];

// ────────────────────────────────────────────────────────── readers
function safeReadLines(p) {
  if (!fs.existsSync(p)) return [];
  try {
    return fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean);
  } catch { return []; }
}

function safeReadJson(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function readTransitions(atlas_root) {
  const p = path.join(atlas_root, 'transitions.log');
  const out = [];
  for (const line of safeReadLines(p)) {
    if (line.startsWith('#')) continue;
    const [ts, block_id, from, to, ...rest] = line.split('\t');
    if (!ts || !block_id || !to) continue;
    out.push({ ts, block_id, from, to, meta: rest.join('\t') });
  }
  return out;
}

function readChecksLogs(atlas_root) {
  // Returns array of {block_id, ts, kind, result, note}
  const blocksDir = path.join(atlas_root, 'blocks');
  if (!fs.existsSync(blocksDir)) return [];
  const out = [];
  for (const blockId of fs.readdirSync(blocksDir)) {
    const p = path.join(blocksDir, blockId, 'checks.log');
    for (const line of safeReadLines(p)) {
      const [ts, kind, result, ...rest] = line.split('\t');
      if (!ts || !kind) continue;
      out.push({ block_id: blockId, ts, kind, result, note: rest.join('\t') });
    }
  }
  return out;
}

function readDecisionsLogs(atlas_root) {
  const blocksDir = path.join(atlas_root, 'blocks');
  if (!fs.existsSync(blocksDir)) return [];
  const out = [];
  for (const blockId of fs.readdirSync(blocksDir)) {
    const p = path.join(blocksDir, blockId, 'decisions.log');
    for (const line of safeReadLines(p)) {
      if (line.startsWith('#')) continue;
      const [ts, kind, ...rest] = line.split('\t');
      if (!ts) continue;
      out.push({ block_id: blockId, ts, kind: kind || 'misc', text: rest.join('\t') });
    }
  }
  return out;
}

function readPatternsCounts(atlas_root) {
  // Just count blocks that have any content in patterns.md.
  const blocksDir = path.join(atlas_root, 'blocks');
  if (!fs.existsSync(blocksDir)) return { with_patterns: 0, total: 0 };
  let withPatterns = 0; let total = 0;
  for (const blockId of fs.readdirSync(blocksDir)) {
    total += 1;
    const p = path.join(blocksDir, blockId, 'patterns.md');
    if (fs.existsSync(p) && fs.readFileSync(p, 'utf8').trim().length > 0) withPatterns += 1;
  }
  return { with_patterns: withPatterns, total };
}

function readProposals(atlas_root) {
  // Returns {total, accepted, rejected, pending, by_block}
  const dir = path.join(atlas_root, 'proposals');
  if (!fs.existsSync(dir)) return { total: 0, accepted: 0, rejected: 0, pending: 0, by_block: {} };
  const out = { total: 0, accepted: 0, rejected: 0, pending: 0, by_block: {} };
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json') || f === 'index.json') continue;
    const j = safeReadJson(path.join(dir, f));
    if (!j) continue;
    out.total += 1;
    const verdict = j.verdict || 'pending';
    if (out[verdict] !== undefined) out[verdict] += 1;
    const bid = j.block_id || 'unknown';
    out.by_block[bid] = out.by_block[bid] || { total: 0, accepted: 0, rejected: 0, pending: 0 };
    out.by_block[bid].total += 1;
    if (out.by_block[bid][verdict] !== undefined) out.by_block[bid][verdict] += 1;
  }
  return out;
}

function readLlmTraces(atlas_root) {
  // Returns {total, by_provider: {anthropic|google|openai|mock: {count, fallback_to_mock_count, total_cost_usd}}}
  const dir = path.join(atlas_root, 'llm_traces');
  if (!fs.existsSync(dir)) return { total: 0, by_provider: {} };
  const out = { total: 0, by_provider: {} };
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    const j = safeReadJson(path.join(dir, f));
    if (!j) continue;
    out.total += 1;
    const provider = j.provider || 'unknown';
    out.by_provider[provider] = out.by_provider[provider]
      || { count: 0, fallback_to_mock_count: 0, total_cost_usd: 0, schema_ok_count: 0 };
    out.by_provider[provider].count += 1;
    if (j.fallback_to_mock) out.by_provider[provider].fallback_to_mock_count += 1;
    if (typeof j.cost_usd === 'number') out.by_provider[provider].total_cost_usd += j.cost_usd;
    if (j.schema_ok) out.by_provider[provider].schema_ok_count += 1;
  }
  return out;
}

function readTechStacks(atlas_root) {
  // From graph.json + projects/<proj>/graph.json: gather { stack_name: {uses, satisfaction} }
  const out = {};
  function ingestGraph(p, scopeBuckets) {
    const j = safeReadJson(p);
    if (!j || !Array.isArray(j.blocks)) return;
    for (const b of j.blocks) {
      const layer = b.layer || 'unknown';
      const scope = layerToScope(layer);
      if (!scope) continue;
      out[scope] = out[scope] || {};
      for (const t of (b.tech_stack || [])) {
        out[scope][t] = out[scope][t] || { name: t, uses: 0, satisfaction: 'unknown', evidence: [] };
        out[scope][t].uses += 1;
        out[scope][t].evidence.push(b.id);
      }
    }
  }
  ingestGraph(path.join(atlas_root, 'graph.json'));
  const projDir = path.join(atlas_root, 'projects');
  if (fs.existsSync(projDir)) {
    for (const proj of fs.readdirSync(projDir)) {
      ingestGraph(path.join(projDir, proj, 'graph.json'));
    }
  }
  // Convert nested object → arrays sorted by uses desc.
  const result = {};
  for (const scope of Object.keys(out)) {
    result[scope] = Object.values(out[scope]).sort((a, b) => b.uses - a.uses);
  }
  return result;
}

function layerToScope(layer) {
  if (layer === 'logic' || layer === 'data' || layer === 'ext') return 'backend';
  if (layer === 'front' || layer === 'user') return 'frontend';
  if (layer === 'testing') return 'testing';
  if (layer === 'ai') return 'ai';
  if (layer === 'content') return 'content';
  return null;
}

// ────────────────────────────────────────────────────────── aggregator
function pickAgentFromInvocationNote(note) {
  if (!note) return null;
  for (const a of KNOWN_AGENTS) {
    if (note.toLowerCase().includes(a)) return a;
  }
  return null;
}

function pickProviderFromNote(note) {
  if (!note) return null;
  for (const p of KNOWN_PROVIDERS) {
    if (note.toLowerCase().includes(`provider=${p}`) || note.toLowerCase().includes(` ${p} `)) return p;
  }
  return null;
}

function aggregate({ transitions, checks, proposals, llm, decisions, patterns, techStacks }) {
  // ── work_style
  const doneTransitions = transitions.filter((t) => t.to === 'done');
  const brokenTransitions = transitions.filter((t) => t.to === 'broken');
  const wipTransitions = transitions.filter((t) => t.to === 'wip');

  // median time idea→done per block (only blocks that reached done)
  const ideaToDone = {};
  for (const t of transitions) {
    if (!ideaToDone[t.block_id]) ideaToDone[t.block_id] = { firstWipAt: null, doneAt: null };
    if (t.to === 'wip' && !ideaToDone[t.block_id].firstWipAt) ideaToDone[t.block_id].firstWipAt = t.ts;
    if (t.to === 'done' && !ideaToDone[t.block_id].doneAt) ideaToDone[t.block_id].doneAt = t.ts;
  }
  const durations = [];
  for (const v of Object.values(ideaToDone)) {
    if (v.firstWipAt && v.doneAt) {
      const d = (new Date(v.doneAt) - new Date(v.firstWipAt)) / (1000 * 60 * 60);
      if (d > 0) durations.push(d);
    }
  }
  durations.sort((a, b) => a - b);
  const medianHours = durations.length ? durations[Math.floor(durations.length / 2)] : null;

  // rollback rate = broken / (broken + done)
  const rollbackRate = (brokenTransitions.length + doneTransitions.length)
    ? brokenTransitions.length / (brokenTransitions.length + doneTransitions.length)
    : 0;

  // ── agents_used (from agent_invocation lines in checks.log + checks where note mentions provider)
  const invocations = checks.filter((c) => c.kind === 'agent_invocation' || c.kind === 'llm_extraction');
  const agentBuckets = {};
  for (const c of invocations) {
    const agent = pickAgentFromInvocationNote(c.note);
    if (!agent) continue;
    agentBuckets[agent] = agentBuckets[agent]
      || { count: 0, success_count: 0, blocks_touched: new Set(), best_for: [] };
    agentBuckets[agent].count += 1;
    if ((c.result || '').toLowerCase() === 'pass') agentBuckets[agent].success_count += 1;
    agentBuckets[agent].blocks_touched.add(c.block_id);
  }
  const agentsUsed = {};
  for (const [agent, b] of Object.entries(agentBuckets)) {
    agentsUsed[agent] = {
      count: b.count,
      success_rate: b.count ? Number((b.success_count / b.count).toFixed(2)) : 0,
      blocks_touched: Array.from(b.blocks_touched),
      best_for: [],
    };
  }

  // ── failure modes (from broken transitions + checks with result=fail)
  const failures = [];
  const failChecks = checks.filter((c) => (c.result || '').toLowerCase() === 'fail');
  for (const c of failChecks) {
    failures.push({ block_id: c.block_id, ts: c.ts, kind: c.kind, note: (c.note || '').slice(0, 200) });
  }
  for (const t of brokenTransitions) {
    failures.push({ block_id: t.block_id, ts: t.ts, kind: 'transition_broken', note: t.meta });
  }

  // ── llm preferences (which provider has lowest fallback rate)
  const providerStats = {};
  for (const [p, s] of Object.entries(llm.by_provider || {})) {
    providerStats[p] = {
      ...s,
      fallback_rate: s.count ? Number((s.fallback_to_mock_count / s.count).toFixed(2)) : 0,
      schema_ok_rate: s.count ? Number((s.schema_ok_count / s.count).toFixed(2)) : 0,
      avg_cost_usd: s.count ? Number((s.total_cost_usd / s.count).toFixed(6)) : 0,
    };
  }

  // ── tech_stack_history → satisfaction inferred from rollback_rate per block
  // (a tech_stack entry whose blocks rarely go to broken → satisfaction 'high')
  const blocksByBroken = {};
  for (const t of transitions) {
    blocksByBroken[t.block_id] = blocksByBroken[t.block_id] || { broken: 0, done: 0 };
    if (t.to === 'broken') blocksByBroken[t.block_id].broken += 1;
    if (t.to === 'done') blocksByBroken[t.block_id].done += 1;
  }
  const techWithSatisfaction = {};
  for (const [scope, items] of Object.entries(techStacks)) {
    techWithSatisfaction[scope] = items.map((item) => {
      const evidence = item.evidence || [];
      const total = evidence.reduce((acc, bid) => {
        const b = blocksByBroken[bid] || { broken: 0, done: 0 };
        return acc + b.broken + b.done;
      }, 0);
      const broken = evidence.reduce((acc, bid) => acc + (blocksByBroken[bid]?.broken || 0), 0);
      const rb = total ? broken / total : null;
      let satisfaction = 'unknown';
      if (rb !== null) satisfaction = rb < 0.1 ? 'high' : rb < 0.3 ? 'medium' : 'low';
      return { ...item, satisfaction };
    });
  }

  return {
    work_style: {
      total_done: doneTransitions.length,
      total_broken: brokenTransitions.length,
      total_wip_started: wipTransitions.length,
      rollback_rate: Number(rollbackRate.toFixed(2)),
      median_time_idea_to_done_h: medianHours,
      common_failure_modes: failures
        .map((f) => f.kind)
        .reduce((acc, k) => { acc[k] = (acc[k] || 0) + 1; return acc; }, {}),
    },
    agents_used: agentsUsed,
    tech_stack_history: techWithSatisfaction,
    llm_provider_stats: providerStats,
    proposals_stats: {
      total: proposals.total,
      accept_rate: proposals.total ? Number((proposals.accepted / proposals.total).toFixed(2)) : 0,
      reject_rate: proposals.total ? Number((proposals.rejected / proposals.total).toFixed(2)) : 0,
      pending: proposals.pending,
    },
    decisions_stats: {
      total: decisions.length,
      blocks_with_decisions: new Set(decisions.map((d) => d.block_id)).size,
    },
    patterns_stats: patterns,
    failures,
    invocations_total: invocations.length,
  };
}

// ────────────────────────────────────────────────────────── writer
function writeProfile(profile, atlas_root, { dry_run } = {}) {
  if (dry_run) return profile;
  const dir = path.join(atlas_root, 'operator_profile');
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'patterns'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'history'), { recursive: true });

  fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(profile, null, 2) + '\n', 'utf8');

  const isLive = profile._status === 'live';
  fs.writeFileSync(path.join(dir, 'patterns', 'work_style.json'),
    JSON.stringify(isLive ? profile.work_style : { _status: 'warming_up' }, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'patterns', 'agents.json'),
    JSON.stringify(isLive ? profile.agents_used : { _status: 'warming_up' }, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'patterns', 'tech_stack.json'),
    JSON.stringify(isLive ? profile.tech_stack_history : { _status: 'warming_up' }, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'patterns', 'failures.json'),
    JSON.stringify(isLive ? profile.failures : { _status: 'warming_up' }, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(dir, 'patterns', 'environment.json'),
    JSON.stringify({
      _status: isLive ? 'live' : 'warming_up',
      node_version: process.version,
      platform: process.platform,
      detected_at: profile.updated_at,
    }, null, 2) + '\n', 'utf8');

  // History snapshot
  const ts = profile.updated_at.replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(dir, 'history', `${ts}.json`),
    JSON.stringify(profile, null, 2) + '\n', 'utf8');

  return profile;
}

// ────────────────────────────────────────────────────────── orchestrator
export function aggregateOperatorProfile({ atlas_root, dry_run, operator_id } = {}) {
  const root = atlas_root || path.join(ROOT, 'atlas');

  const transitions = readTransitions(root);
  const checks = readChecksLogs(root);
  const proposals = readProposals(root);
  const llm = readLlmTraces(root);
  const decisions = readDecisionsLogs(root);
  const patterns = readPatternsCounts(root);
  const techStacks = readTechStacks(root);

  const agg = aggregate({ transitions, checks, proposals, llm, decisions, patterns, techStacks });

  // min-data guard
  const totalDone = agg.work_style.total_done;
  const totalInvocations = agg.invocations_total;
  const isWarmingUp = totalDone < MIN_DONE_TRANSITIONS && totalInvocations < MIN_INVOCATIONS;

  const profile = {
    operator_id: operator_id || 'default',
    updated_at: new Date().toISOString(),
    _status: isWarmingUp ? 'warming_up' : 'live',
    _min_data: {
      done_transitions: totalDone,
      done_required: MIN_DONE_TRANSITIONS,
      invocations: totalInvocations,
      invocations_required: MIN_INVOCATIONS,
    },
    ...(isWarmingUp ? {} : agg),
    // Always expose minimal preview even when warming_up, so UI can show
    // "1/5 done, 8/10 invocations" without having to query separately.
    _preview: {
      total_done: totalDone,
      total_invocations: totalInvocations,
      total_traces: llm.total,
      total_proposals: proposals.total,
    },
  };

  writeProfile(profile, root, { dry_run });
  return profile;
}

// ────────────────────────────────────────────────────────── CLI
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry-run');
  const json = argv.includes('--json');
  const profile = aggregateOperatorProfile({ dry_run: dry });
  if (dry || json) {
    console.log(JSON.stringify(profile, null, 2));
  } else {
    console.log(`operator_profile: ${profile._status} (done=${profile._preview.total_done}, invocations=${profile._preview.total_invocations}, traces=${profile._preview.total_traces}, proposals=${profile._preview.total_proposals})`);
  }
}

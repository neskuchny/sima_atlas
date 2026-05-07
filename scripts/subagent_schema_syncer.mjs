#!/usr/bin/env node
// Subagent: schema-syncer.
//
// Role: walk the whole atlas/, run all consistency validators, and emit
// a structured drift report. Designed to be called by Cursor / Codex
// as a subagent (.cursor/agents.json) or from the design UI's
// «Подагенты» panel via /atlas/subagents/run?name=schema-syncer.
//
// Emits JSON to stdout:
//   {
//     ok: bool,
//     started_at, finished_at, duration_ms,
//     validators: [{ name, exit, ok, summary }],
//     drift_blocks: [{ block_id, reason }],
//     broken_blocks: [{ block_id, reason }],
//     summary: { total_blocks, ok, drift, broken },
//   }
//
// CLI:
//   node scripts/subagent_schema_syncer.mjs [--json]
//
// MCP-tool wrapper (add to mcp_atlas_server.mjs):
//   schema_syncer_run

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const VALIDATORS = [
  { name: 'no_template_placeholders', cmd: ['scripts/validate_no_template_placeholders.mjs'] },
  { name: 'files_registry',           cmd: ['scripts/validate_files_registry.mjs'] },
  { name: 'projects_contracts',       cmd: ['scripts/validate_projects.mjs'] },
  { name: 'subschemas_contracts',     cmd: ['scripts/validate_subschemas.mjs'] },
  { name: 'dependency_contracts',     cmd: ['scripts/validate_dependency_contracts.mjs'] },
  { name: 'acceptance_assertions',    cmd: ['scripts/validate_acceptance_assertions.mjs'] },
  { name: 'cursor_hooks',             cmd: ['scripts/validate_cursor_hooks.mjs'] },
  { name: 'agent_parity',             cmd: ['scripts/validate_agent_parity.mjs'] },
  { name: 'parity_matrix',            cmd: ['scripts/validate_parity_matrix.mjs'] },
];

function runValidator(v) {
  const r = spawnSync('node', v.cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const stdoutTail = (r.stdout || '').split(/\n/).filter(Boolean).slice(-3).join(' · ');
  const stderrTail = (r.stderr || '').split(/\n/).filter(Boolean).slice(-3).join(' · ');
  const summary = stdoutTail || stderrTail || (r.status === 0 ? 'ok' : `exit ${r.status}`);
  return { name: v.name, exit: r.status, ok: r.status === 0, summary };
}

function readGraph() {
  const p = path.join(ROOT, 'atlas', 'graph.json');
  if (!fs.existsSync(p)) return { blocks: [] };
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return { blocks: [] }; }
}

function classifyBlocks(graph) {
  const drift = [], broken = [];
  for (const b of (graph.blocks || [])) {
    if (b.status === 'archived') continue;
    if (b.status === 'broken' || b.status === 'fail') broken.push({ block_id: b.id, reason: b.status_reason || '(no reason)' });
    else if (b.status === 'drift' || b.status === 'desync') drift.push({ block_id: b.id, reason: b.status_reason || '(no reason)' });
  }
  return { drift, broken };
}

export function runSchemaSyncer() {
  const startedAt = new Date();
  const validators = VALIDATORS.map(runValidator);
  const graph = readGraph();
  const cl = classifyBlocks(graph);
  const finishedAt = new Date();
  const okCount = validators.filter((v) => v.ok).length;
  const totalBlocks = (graph.blocks || []).filter((b) => b.status !== 'archived').length;
  return {
    ok: validators.every((v) => v.ok) && cl.broken.length === 0,
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt - startedAt,
    validators,
    drift_blocks: cl.drift,
    broken_blocks: cl.broken,
    summary: {
      total_blocks: totalBlocks,
      ok: totalBlocks - cl.drift.length - cl.broken.length,
      drift: cl.drift.length,
      broken: cl.broken.length,
      validators_pass: okCount,
      validators_total: validators.length,
    },
  };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = runSchemaSyncer();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`schema-syncer: ${out.summary.ok}/${out.summary.total_blocks} ok, ${out.summary.drift} drift, ${out.summary.broken} broken; validators ${out.summary.validators_pass}/${out.summary.validators_total}`);
    if (out.broken_blocks.length) {
      console.log('broken:');
      for (const b of out.broken_blocks) console.log(`  ✗ ${b.block_id} — ${b.reason}`);
    }
    if (out.drift_blocks.length) {
      console.log('drift:');
      for (const b of out.drift_blocks) console.log(`  ⚠ ${b.block_id} — ${b.reason}`);
    }
  }
  process.exit(out.ok ? 0 : 1);
}

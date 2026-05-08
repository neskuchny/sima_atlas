#!/usr/bin/env node
// Subagent: verifier.
//
// Role: run acceptance verifier (per-block or all blocks) AND the
// LLM-validator (mission vs reality), merge into one verdict per block.
//
// CLI:
//   node scripts/subagent_verifier.mjs <block_id> [--json]
//   node scripts/subagent_verifier.mjs --all [--json]

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateBlock } from './atlas_synthesis_api.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

function safeRead(p, max = 4000) {
  try { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8').slice(0, max) : ''; } catch { return ''; }
}
function tail(p, lines = 30) {
  try {
    if (!fs.existsSync(p)) return '';
    return fs.readFileSync(p, 'utf8').split(/\n/).slice(-lines).join('\n');
  } catch { return ''; }
}

async function verifyOne(block_id) {
  const blkDir = path.join(ROOT, 'atlas', 'blocks', block_id);
  if (!fs.existsSync(blkDir)) return { block_id, ok: false, error: 'block not found' };

  // 1. Acceptance verifier (deterministic)
  const accRes = spawnSync('node', ['scripts/verify_block_acceptance.mjs', block_id], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const latestPath = path.join(ROOT, 'atlas', 'acceptance_runs', block_id, '_latest.json');
  let acceptance = null;
  if (fs.existsSync(latestPath)) {
    try { acceptance = JSON.parse(fs.readFileSync(latestPath, 'utf8')); } catch {}
  }

  // 2. LLM-validator (mission vs reality)
  let validation = null;
  try {
    const inputs = {
      block_id,
      mission:       safeRead(path.join(blkDir, 'mission.md')),
      kpi:           safeRead(path.join(blkDir, 'kpi.md')),
      acceptance:    safeRead(path.join(blkDir, 'acceptance.md')),
      tasks:         safeRead(path.join(blkDir, 'tasks.md')),
      depends_on_md: safeRead(path.join(blkDir, 'depends_on.md'), 1500),
      provides_md:   safeRead(path.join(blkDir, 'provides.md'), 1500),
      decisions:     tail(path.join(blkDir, 'decisions.log'), 40),
      checks_tail:   tail(path.join(blkDir, 'checks.log'), 25),
      files:         safeRead(path.join(blkDir, 'files.md'), 1500),
      project_md:    safeRead(path.join(ROOT, 'atlas', 'project.md')),
      rules_md:      safeRead(path.join(ROOT, 'atlas', 'rules.md')),
      tech_stack_md: safeRead(path.join(ROOT, 'atlas', 'tech_stack.md')),
    };
    validation = await validateBlock(inputs);
  } catch (e) {
    validation = { ok: false, error: String(e.message || e) };
  }

  // Combined verdict: broken if either is broken; drift if any drift; else aligned
  const accVerdict = acceptance?.verdict || 'inconclusive';
  const valVerdict = validation?.verdict || 'inconclusive';
  let combined = 'aligned';
  if (accVerdict === 'fail' || valVerdict === 'broken') combined = 'broken';
  else if (accVerdict === 'inconclusive' || valVerdict === 'drift' || valVerdict === 'inconclusive') combined = 'drift';

  return {
    block_id,
    ok: combined === 'aligned',
    verdict: combined,
    acceptance: acceptance ? {
      verdict: acceptance.verdict, counts: acceptance.counts, checked_at: acceptance.checked_at,
    } : null,
    validation: validation ? {
      verdict: validation.verdict, summary: validation.summary,
      violations: validation.violations, matches: validation.matches, mock: validation.mock,
    } : null,
  };
}

export async function runVerifier({ block_id = null } = {}) {
  if (block_id) return await verifyOne(block_id);
  const graphPath = path.join(ROOT, 'atlas', 'graph.json');
  if (!fs.existsSync(graphPath)) return { ok: false, error: 'graph.json missing' };
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const blocks = (graph.blocks || []).filter((b) => b.status !== 'archived').map((b) => b.id);
  const results = [];
  for (const id of blocks) results.push(await verifyOne(id));
  return {
    ok: results.every((r) => r.ok),
    block_count: results.length,
    aligned: results.filter((r) => r.verdict === 'aligned').length,
    drift:   results.filter((r) => r.verdict === 'drift').length,
    broken:  results.filter((r) => r.verdict === 'broken').length,
    blocks: results,
  };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const wantJson = args.includes('--json');
  const all = args.includes('--all');
  const bid = args.find((a) => /^b\./.test(a));
  if (!all && !bid) { console.error('usage: subagent_verifier.mjs <b.block_id>|--all [--json]'); process.exit(1); }
  (async () => {
    const out = bid ? await runVerifier({ block_id: bid }) : await runVerifier({});
    if (wantJson) console.log(JSON.stringify(out, null, 2));
    else if (bid) console.log(`verifier ${bid}: ${out.verdict}` + (out.validation?.summary ? ` — ${out.validation.summary}` : ''));
    else console.log(`verifier (all): ${out.aligned} aligned, ${out.drift} drift, ${out.broken} broken / ${out.block_count} blocks`);
    process.exit(out.ok ? 0 : 1);
  })();
}

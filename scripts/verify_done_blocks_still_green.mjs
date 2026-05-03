#!/usr/bin/env node
// PR-4 (b.acceptance-verifier-loop): nightly regression check for `done` blocks.
//
// For every block in graph.json with status === 'done', re-runs the verifier.
// If the verdict is no longer `pass`, writes a proposal to atlas/proposals/
// suggesting `done → broken` so the operator can review and accept the
// regression status (or reject if the verifier itself is at fault).
//
// We DO NOT auto-flip done → broken — the proposal flow keeps the human in
// the loop. UI ProposalsPanel surfaces these as `acceptance_regression`.
//
// CLI:
//   node scripts/verify_done_blocks_still_green.mjs [--json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyAndPersist } from './verify_block_acceptance.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');
const PROPOSALS = path.join(ATLAS, 'proposals');

async function run() {
  const graph = JSON.parse(fs.readFileSync(path.join(ATLAS, 'graph.json'), 'utf8'));
  const doneBlocks = (graph.blocks || []).filter((b) => b.status === 'done');
  const out = { generated_at: new Date().toISOString(), checked: doneBlocks.length, regressions: [], green: [], inconclusive: [] };

  fs.mkdirSync(PROPOSALS, { recursive: true });

  for (const b of doneBlocks) {
    const r = await verifyAndPersist(b.id);
    if (r.error) { out.inconclusive.push({ block_id: b.id, reason: r.error }); continue; }
    if (r.verdict === 'pass') { out.green.push(b.id); continue; }
    if (r.verdict === 'inconclusive') { out.inconclusive.push({ block_id: b.id, counts: r.counts }); continue; }
    // Regression detected — write proposal (skip if a recent identical
    // proposal already exists to avoid spam).
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const proposalId = `${ts}__${b.id}__acceptance_regression`;
    const filePath = path.join(PROPOSALS, `${proposalId}.json`);

    // Dedup: don't write if there's already a pending acceptance_regression
    // for this block.
    const existing = fs.readdirSync(PROPOSALS).find((f) => f.endsWith('__acceptance_regression.json') && f.includes(`__${b.id}__`));
    if (existing) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(PROPOSALS, existing), 'utf8'));
        if (j.verdict === 'pending') {
          out.regressions.push({ block_id: b.id, counts: r.counts, proposal: existing, status: 'already_pending' });
          continue;
        }
      } catch {}
    }

    const sample = r.assertions
      .filter((a) => a.verdict === 'fail')
      .slice(0, 5)
      .map((a) => ({ id: a.id, evidence: a.evidence, reasoning: a.reasoning }));

    fs.writeFileSync(filePath, JSON.stringify({
      id: proposalId,
      block_id: b.id,
      kind: 'acceptance_regression',
      created_at: new Date().toISOString(),
      source: { detector: 'verify_done_blocks_still_green' },
      current: { status: 'done' },
      proposed: { status: 'broken', reason: `acceptance verifier verdict=${r.verdict}` },
      counts: r.counts,
      sample_failures: sample,
      retry_prompt_hint: sample.length
        ? `Acceptance regressed in ${b.id}. Failing: ${sample.map((s) => s.id).join(', ')}. First fail: ${sample[0].evidence}. Re-run verifier after fix: node scripts/verify_block_acceptance.mjs ${b.id}`
        : '',
      verdict: 'pending',
    }, null, 2) + '\n', 'utf8');
    out.regressions.push({ block_id: b.id, counts: r.counts, proposal: path.basename(filePath), status: 'created' });
  }

  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = await run();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`verify_done_blocks_still_green: checked=${summary.checked} green=${summary.green.length} regressions=${summary.regressions.length} inconclusive=${summary.inconclusive.length}`);
    for (const r of summary.regressions) console.log(`  ✗ ${r.block_id} (${r.status}): ${JSON.stringify(r.counts)}`);
    for (const r of summary.inconclusive) console.log(`  · ${r.block_id} inconclusive`);
    for (const id of summary.green) console.log(`  ✓ ${id}`);
  }
  // Exit 0 always — info-only step in nightly. Regressions surface as
  // proposals, not as nightly fail.
}

export { run as verifyDoneBlocksStillGreen };

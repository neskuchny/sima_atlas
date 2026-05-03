#!/usr/bin/env node
// PR-2 (b.acceptance-verifier-loop): walk all blocks in graph.json, run
// verifyBlock on each, and write:
//   atlas/acceptance_runs/<block_id>/<UTC>.json   ← per-run report
//   atlas/acceptance_runs/<block_id>/_latest.json ← copy of the most recent
//   atlas/acceptance_runs/_summary.json           ← aggregate { ts, blocks: [{block_id, verdict, counts, duration_ms}] }
//
// CLI:
//   node scripts/verify_all_acceptance.mjs           # write reports + console summary
//   node scripts/verify_all_acceptance.mjs --json    # also dump _summary.json to stdout
//
// Exit code: 0 always (info-only step). Block-level fails are surfaced in the
// summary; a future PR-4 will turn the verdicts into actual gates against
// `wip → done` transitions.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyBlock } from './collect_evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');
const RUNS_DIR = path.join(ATLAS, 'acceptance_runs');

function run() {
  const graph = JSON.parse(fs.readFileSync(path.join(ATLAS, 'graph.json'), 'utf8'));
  const blocks = graph.blocks || [];
  const ts = new Date().toISOString();
  const tsSafe = ts.replace(/[:.]/g, '-');

  fs.mkdirSync(RUNS_DIR, { recursive: true });

  const summary = { generated_at: ts, blocks: [], totals: { pass: 0, fail: 0, skipped: 0, blocks_pass: 0, blocks_fail: 0, blocks_inconclusive: 0 } };

  for (const b of blocks) {
    if (!b.id) continue;
    const accPath = path.join(ATLAS, 'blocks', b.id, 'acceptance.md');
    if (!fs.existsSync(accPath)) {
      summary.blocks.push({ block_id: b.id, verdict: 'no_acceptance_md', counts: { pass: 0, fail: 0, skipped: 0 }, duration_ms: 0 });
      continue;
    }

    const r = verifyBlock(b.id);
    const blockDir = path.join(RUNS_DIR, b.id);
    fs.mkdirSync(blockDir, { recursive: true });
    fs.writeFileSync(path.join(blockDir, `${tsSafe}.json`), JSON.stringify(r, null, 2) + '\n', 'utf8');
    fs.writeFileSync(path.join(blockDir, '_latest.json'), JSON.stringify(r, null, 2) + '\n', 'utf8');

    summary.blocks.push({
      block_id: b.id,
      verdict: r.verdict,
      counts: r.counts,
      duration_ms: r.duration_ms,
      sample_failures: r.assertions
        .filter((a) => a.verdict === 'fail')
        .slice(0, 3)
        .map((a) => ({ id: a.id, evidence: a.evidence, reasoning: a.reasoning })),
    });

    summary.totals.pass += r.counts.pass;
    summary.totals.fail += r.counts.fail;
    summary.totals.skipped += r.counts.skipped;
    if (r.verdict === 'pass') summary.totals.blocks_pass += 1;
    else if (r.verdict === 'fail') summary.totals.blocks_fail += 1;
    else summary.totals.blocks_inconclusive += 1;
  }

  fs.writeFileSync(path.join(RUNS_DIR, '_summary.json'), JSON.stringify(summary, null, 2) + '\n', 'utf8');

  // Console summary
  const T = summary.totals;
  console.log(`verify_all_acceptance: ${T.blocks_pass} pass / ${T.blocks_fail} fail / ${T.blocks_inconclusive} inconclusive (assertions: ${T.pass} pass / ${T.fail} fail / ${T.skipped} skipped)`);
  for (const b of summary.blocks) {
    const symbol = b.verdict === 'pass' ? '✓' : b.verdict === 'fail' ? '✗' : '·';
    console.log(`  ${symbol} ${b.block_id.padEnd(35)} ${b.verdict.padEnd(15)} pass=${b.counts.pass} fail=${b.counts.fail} skipped=${b.counts.skipped}`);
    for (const sf of (b.sample_failures || [])) {
      console.log(`     ✗ ${sf.id}: ${(sf.evidence || '').slice(0, 100)}`);
    }
  }

  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const summary = run();
  if (process.argv.includes('--json')) {
    console.log('---');
    console.log(JSON.stringify(summary, null, 2));
  }
  // Exit 0 always — info-only step. PR-4 will turn this into a gate.
}

export { run as verifyAllAcceptance };

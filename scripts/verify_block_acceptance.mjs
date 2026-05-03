#!/usr/bin/env node
// PR-4 (b.acceptance-verifier-loop): single-block verifier orchestrator.
//
// Calls verifyBlock (parser + collectors + LLM-judge) and:
//   * writes atlas/acceptance_runs/<block>/<UTC>.json
//   * updates atlas/acceptance_runs/<block>/_latest.json
//   * appends a single line to atlas/blocks/<id>/checks.log:
//       <ts>\tacceptance_verifier\t<verdict>\t<short summary + sample failures>
//
// Used by:
//   * scripts/run_block_implementation.mjs — auto-spawn after agent exit 0
//   * scripts/log_transition.mjs            — read _latest.json before wip→done
//   * scripts/nightly_consolidation.mjs     — re-verify done blocks
//   * MCP tool verify_block_acceptance      — surface verdict for UI
//
// Exit code mirrors verdict:
//   0 — pass
//   1 — fail
//   2 — inconclusive (no deterministic checks AND LLM-judge unavailable)
//   3 — block_id not found / acceptance.md missing
//
// CLI:
//   node scripts/verify_block_acceptance.mjs <block_id> [--json] [--quiet]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyBlock } from './collect_evidence.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');

export async function verifyAndPersist(blockId) {
  const blockDir = path.join(ATLAS, 'blocks', blockId);
  const accPath = path.join(blockDir, 'acceptance.md');
  if (!fs.existsSync(accPath)) {
    return { block_id: blockId, verdict: 'no_acceptance_md', error: `acceptance.md missing: ${accPath}` };
  }

  const result = await verifyBlock(blockId, { atlas_root: ATLAS });

  // Persist
  const runsDir = path.join(ATLAS, 'acceptance_runs', blockId);
  fs.mkdirSync(runsDir, { recursive: true });
  const tsSafe = result.checked_at.replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(runsDir, `${tsSafe}.json`), JSON.stringify(result, null, 2) + '\n', 'utf8');
  fs.writeFileSync(path.join(runsDir, '_latest.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');

  // Append single-line summary to block's checks.log
  const checksPath = path.join(blockDir, 'checks.log');
  const sampleFails = result.assertions
    .filter((a) => a.verdict === 'fail')
    .slice(0, 2)
    .map((a) => `${a.id}:${(a.evidence || '').slice(0, 60).replace(/\s+/g, ' ')}`)
    .join('; ');
  const note = `verdict=${result.verdict} pass=${result.counts.pass} fail=${result.counts.fail} skipped=${result.counts.skipped}${sampleFails ? ' fails=[' + sampleFails + ']' : ''}`;
  // checks.log uses tab separator: ts\tkind\tresult\tnote
  // Map verifier verdict → checks.log result column:
  //   pass         → pass
  //   fail         → fail
  //   inconclusive → pass (info-only — not a real failure for older readers
  //                  that fail-fast on `fail` lines; the verdict in note is
  //                  authoritative for new code)
  const checkResult = result.verdict === 'fail' ? 'fail' : 'pass';
  fs.appendFileSync(checksPath, `${result.checked_at}\tacceptance_verifier\t${checkResult}\t${note}\n`, 'utf8');

  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const blockId = argv.find((a) => !a.startsWith('--'));
  const json = argv.includes('--json');
  const quiet = argv.includes('--quiet');
  if (!blockId) {
    console.error('Usage: node scripts/verify_block_acceptance.mjs <block_id> [--json] [--quiet]');
    process.exit(3);
  }
  const r = await verifyAndPersist(blockId);
  if (r.error) {
    console.error(`verify_block_acceptance: ${blockId}: ${r.error}`);
    process.exit(3);
  }
  if (json) {
    console.log(JSON.stringify(r, null, 2));
  } else if (!quiet) {
    const tick = r.verdict === 'pass' ? '✓' : r.verdict === 'fail' ? '✗' : '·';
    console.log(`${tick} ${blockId}: ${r.verdict} (pass=${r.counts.pass} fail=${r.counts.fail} skipped=${r.counts.skipped})`);
    for (const a of r.assertions) {
      if (a.verdict === 'fail') console.log(`  ✗ ${a.id} → ${(a.evidence || '').slice(0, 120)}`);
    }
  }
  process.exit(r.verdict === 'pass' ? 0 : r.verdict === 'fail' ? 1 : 2);
}

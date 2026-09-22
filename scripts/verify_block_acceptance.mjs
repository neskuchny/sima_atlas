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
//   node scripts/verify_block_acceptance.mjs <block_id> [--json] [--quiet] [--no-cache]
//
// R-8.11 (KPI-6) — a pass is cached (verify_cache.mjs). On a hit nothing is
// re-run and no new run is written; the ledgers are only brought in line with
// the cached pass if they disagree. --no-cache always verifies.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyBlock, globForCache } from './collect_evidence.mjs';
import { parseAcceptance } from './parse_acceptance.mjs';
import { storeVerifyCache } from './verify_cache.mjs';
import { applyTransition, rejectionMessage } from './lifecycle_gate.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');

export async function verifyAndPersist(blockId, { cache = true } = {}) {
  const blockDir = path.join(ATLAS, 'blocks', blockId);
  const accPath = path.join(blockDir, 'acceptance.md');
  if (!fs.existsSync(accPath)) {
    return { block_id: blockId, verdict: 'no_acceptance_md', error: `acceptance.md missing: ${accPath}` };
  }

  const result = await verifyBlock(blockId, { atlas_root: ATLAS, cache });

  // R-8.11 — a cached pass: nothing it depends on changed since it was
  // verified. No new run is written. The ledgers are only brought in line
  // with it if something else wrote a different verdict in between (the
  // gate and the validators read them).
  if (result.cache?.hit) {
    const runsDir = path.join(ATLAS, 'acceptance_runs', blockId);
    const latestPath = path.join(runsDir, '_latest.json');
    let latest = null;
    try { latest = JSON.parse(fs.readFileSync(latestPath, 'utf8')); } catch { /* none */ }
    if (!latest || latest.verdict !== result.verdict) {
      fs.mkdirSync(runsDir, { recursive: true });
      fs.writeFileSync(latestPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
    }
    const checksPath = path.join(blockDir, 'checks.log');
    const lines = fs.existsSync(checksPath) ? fs.readFileSync(checksPath, 'utf8').split(/\r?\n/) : [];
    const lastVerifier = [...lines].reverse().find((l) => l.split('\t')[1] === 'acceptance_verifier');
    if (!lastVerifier || lastVerifier.split('\t')[2] !== result.verdict) {
      fs.appendFileSync(checksPath, `${new Date().toISOString()}\tacceptance_verifier\t${result.verdict}\tverdict=${result.verdict} pass=${result.counts.pass} fail=${result.counts.fail} skipped=${result.counts.skipped} cached=verified ${result.checked_at}\n`, 'utf8');
    }
    return result;
  }

  // Persist
  const runsDir = path.join(ATLAS, 'acceptance_runs', blockId);
  fs.mkdirSync(runsDir, { recursive: true });
  const tsSafe = result.checked_at.replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(runsDir, `${tsSafe}.json`), JSON.stringify(result, null, 2) + '\n', 'utf8');
  // Phase D-3: snapshot previous _latest as _previous before overwriting,
  // so the design UI can render a per-assertion diff (pass→fail, skip→pass).
  const latestPath = path.join(runsDir, '_latest.json');
  if (fs.existsSync(latestPath)) {
    fs.copyFileSync(latestPath, path.join(runsDir, '_previous.json'));
  }
  fs.writeFileSync(latestPath, JSON.stringify(result, null, 2) + '\n', 'utf8');

  // Append single-line summary to block's checks.log
  const checksPath = path.join(blockDir, 'checks.log');
  const sampleFails = result.assertions
    .filter((a) => a.verdict === 'fail')
    .slice(0, 2)
    .map((a) => `${a.id}:${(a.evidence || '').slice(0, 60).replace(/\s+/g, ' ')}`)
    .join('; ');
  const note = `verdict=${result.verdict} pass=${result.counts.pass} fail=${result.counts.fail} skipped=${result.counts.skipped}${sampleFails ? ' fails=[' + sampleFails + ']' : ''}`;
  // checks.log uses tab separator: ts\tkind\tresult\tnote
  // R-8.05 — the result column carries the REAL tri-state verdict. It used to
  // map inconclusive → pass «for older readers that fail-fast on fail lines»,
  // which is exactly the silent green Kanon V forbids: readers that scan the
  // column (validate_acceptance_assertions, calc_intelligence_health,
  // mcp sync_check) and the llm-judge, which is fed checks.log as evidence
  // context, all saw an unverifiable run as a green one.
  const checkResult = result.verdict; // pass | fail | inconclusive
  fs.appendFileSync(checksPath, `${result.checked_at}\tacceptance_verifier\t${checkResult}\t${note}\n`, 'utf8');

  // R-8.05 — clear a stale `desync`. cascade_verify marks a broken dependent
  // desync, and its narrative entry told the operator to «re-run
  // verify_block_acceptance to clear the desync status» — but nothing here
  // ever touched graph.json, so the instruction was false and the mark was a
  // one-way door: b.acceptance-verifier-loop sat desync for months while its
  // own _latest.json said pass. A green run that is NEWER than the mark now
  // restores the status the block held before cascade touched it.
  // Deliberately narrow: only desync → previous status, only on a fresh pass,
  // never a promotion (a block that was never done cannot become done here).
  if (result.verdict === 'pass') {
    try { restoreFromDesyncIfGreen(blockId, result.checked_at); }
    catch (e) { console.warn(`  warning: desync check failed: ${e.message}`); }
  }

  // R-8.11 — store the pass AFTER every write above, so the key describes the
  // state the next lookup will see and our own output never invalidates it.
  if (cache) {
    try { storeVerifyCache({ blockId, atlasRoot: ATLAS, parsed: parseAcceptance(blockId, ATLAS), glob: globForCache, result }); }
    catch { /* a failed store is a future miss, never a wrong hit */ }
  }
  return result;
}

function restoreFromDesyncIfGreen(blockId, checkedAt) {
  const graphPath = path.join(ATLAS, 'graph.json');
  if (!fs.existsSync(graphPath)) return;
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const idx = (graph.blocks || []).findIndex((b) => b.id === blockId);
  if (idx < 0) return;
  const block = graph.blocks[idx];
  if (block.status !== 'desync') return;

  const markedAt = block.desync_marked_at || block.updated_at || null;
  if (markedAt && Date.parse(checkedAt) <= Date.parse(markedAt)) return; // run predates the mark

  const target = block.status_before_desync;
  if (!target) {
    // Legacy mark (pre-R-8.05) — we do not know what to restore to, so we do
    // NOT guess. Tell the operator the exact gated command instead.
    console.log(`  · ${blockId} is desync and now verifies green, but no status_before_desync was recorded.`);
    console.log(`    Restore explicitly: node scripts/advance_block_state.mjs ${blockId} <wip|done> operator "re-verified green at ${checkedAt}"`);
    return;
  }

  // R-8.10 — through the lifecycle gate, the one writer of status and both
  // ledgers. This used to write graph.json, transitions.log and checks.log by
  // hand, and could move desync → review, which the gate's own table forbade.
  // The gate now re-checks what this function assumes: the green run is newer
  // than the mark, and the target is what the block held before (never a
  // promotion). A target the gate cannot restore to is left to the operator.
  if (!['done', 'review', 'wip'].includes(target)) {
    console.log(`  · ${blockId} is desync and verifies green; it was "${target}" before, which is not restored automatically.`);
    console.log(`    Decide explicitly: node scripts/advance_block_state.mjs ${blockId} wip operator "re-verified green at ${checkedAt}"`);
    return;
  }
  const r = applyTransition({
    atlasRoot: ATLAS, blockId, to: target, actor: 'verifier',
    note: `desync cleared — re-verified green at ${checkedAt} (was marked ${markedAt || 'unknown'})`,
  });
  if (!r.ok) {
    console.log(rejectionMessage(blockId, target, r).split('\n').map((l) => `  · ${l}`).join('\n'));
    return;
  }
  console.log(`  · ${blockId}: desync cleared → ${target} (re-verified green, through the lifecycle gate)`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const blockId = argv.find((a) => !a.startsWith('--'));
  const json = argv.includes('--json');
  const quiet = argv.includes('--quiet');
  if (!blockId) {
    console.error('Usage: node scripts/verify_block_acceptance.mjs <block_id> [--json] [--quiet] [--no-cache]');
    process.exit(3);
  }
  const r = await verifyAndPersist(blockId, { cache: !argv.includes('--no-cache') });
  if (r.error) {
    console.error(`verify_block_acceptance: ${blockId}: ${r.error}`);
    process.exit(3);
  }
  if (json) {
    console.log(JSON.stringify(r, null, 2));
  } else if (!quiet) {
    const tick = r.verdict === 'pass' ? '✓' : r.verdict === 'fail' ? '✗' : '·';
    console.log(`${tick} ${blockId}: ${r.verdict} (pass=${r.counts.pass} fail=${r.counts.fail} skipped=${r.counts.skipped})`);
    if (r.cache?.hit) console.log(`  · cached: nothing it depends on changed since ${r.cache.verified_at} (lookup ${r.cache.lookup_ms.toFixed(1)} ms; --no-cache to re-run)`);
    else if (r.cache?.reason) console.log(`  · verified (cache miss: ${r.cache.reason})`);
    for (const a of r.assertions) {
      if (a.verdict === 'fail') console.log(`  ✗ ${a.id} → ${(a.evidence || '').slice(0, 120)}`);
    }
  }
  process.exit(r.verdict === 'pass' ? 0 : r.verdict === 'fail' ? 1 : 2);
}

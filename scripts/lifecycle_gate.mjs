#!/usr/bin/env node
// R-8.05 — the single lifecycle gate.
//
// WHY THIS EXISTS
// ---------------
// b.acceptance-verifier-loop's contract states that a block «cannot transition
// to done via transition_block» until acceptance passes, and that the gate
// applies «через CLI/MCP/UI». An audit of the self-control claims found that
// only ONE path was ever gated — scripts/log_transition.mjs — and that path
// does not even write graph.json (it only appends to the ledger). Every path
// that actually mutates status skipped the verdict entirely:
//
//   scripts/advance_block_state.mjs   adjacency check only
//   scripts/mcp_atlas_server.mjs      transitionBlock(): b.status = to
//   scripts/manage_block.mjs          set-status: any value, no log
//   scripts/atlas_blocks_api.mjs      patchBlock(): body.status copied verbatim
//   scripts/accept_proposal.mjs       applies proposal status
//
// Proof it was never exercised on the real atlas: no line in
// atlas/transitions.log carries the `gate=pass(N/M)` / `gate=overridden(...)`
// suffix that log_transition always appends.
//
// WHAT IS GATED
// -------------
// Hard, verdict-backed:
//   * → done       requires acceptance_runs/<id>/_latest.json verdict === 'pass'
//   * desync → X   requires a green run NEWER than the desync mark, and X must
//                  be the recorded status_before_desync (or 'wip'). A block
//                  that was never done can never reach done through desync.
// Structural:
//   * adjacency per the TRANSITIONS table below.
//
// Deliberately NOT gated: everything else stays soft, because the documented
// product decision (README «Hard lifecycle gates — won't fix», article
// Appendix B.2) is that draft-stage iteration must stay fast. This module
// hardens exactly the two places where a wrong status is a dishonest claim
// about verified work.
//
// Override: allowNoVerifier (CLI --allow-no-verifier / ATLAS_ALLOW_NO_VERIFIER=1).
// It is never silent — the ledger line records gate=overridden(...).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

export const TRANSITIONS = {
  idea: ['wip'],
  wip: ['review', 'broken'],
  review: ['done', 'wip', 'broken'],
  done: ['wip'],
  broken: ['wip'],
  // cascade_verify writes `desync` straight into graph.json. Recovery paths:
  //   desync → done    (re-verify came back green AND the block was done before)
  //   desync → review  (R-8.10: same, for a block that was in review before —
  //                     restoring it to wip would silently undo the agent's
  //                     «ready for the operator» state)
  //   desync → wip     (genuinely broken by the upstream change — needs work)
  desync: ['done', 'review', 'wip'],
};

function defaultAtlasRoot() {
  return process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');
}

function readGraph(atlasRoot) {
  const p = path.join(atlasRoot, 'graph.json');
  return { path: p, graph: JSON.parse(fs.readFileSync(p, 'utf8')) };
}

function latestRun(atlasRoot, blockId) {
  const p = path.join(atlasRoot, 'acceptance_runs', blockId, '_latest.json');
  if (!fs.existsSync(p)) return { exists: false };
  try { return { exists: true, run: JSON.parse(fs.readFileSync(p, 'utf8')) }; }
  catch (e) { return { exists: true, unparseable: e.message }; }
}

/**
 * Pure check — decides whether a transition is allowed. No writes.
 * Returns { ok, reason, from, gateNote, fixHint }.
 */
export function checkTransition({ atlasRoot = defaultAtlasRoot(), blockId, to, allowNoVerifier = false } = {}) {
  if (!blockId || !to) return { ok: false, reason: 'blockId and to are required' };
  const { graph } = readGraph(atlasRoot);
  const block = (graph.blocks || []).find((b) => b.id === blockId);
  if (!block) return { ok: false, reason: `block not found: ${blockId}` };

  const from = block.status || 'idea';
  if (from === to) return { ok: false, reason: `block is already ${to}`, from };

  const allowed = TRANSITIONS[from];
  if (!allowed) return { ok: false, reason: `unknown source status "${from}" — no transitions defined`, from };
  if (!allowed.includes(to)) {
    return { ok: false, from, reason: `invalid transition ${from} -> ${to} (allowed from ${from}: ${allowed.join(', ')})` };
  }

  let gateNote = '';

  // ── desync recovery: never promote a block that was never there.
  if (from === 'desync') {
    const before = block.status_before_desync || null;
    if (to === 'done' && before && before !== 'done') {
      return {
        ok: false, from,
        reason: `desync -> done refused: this block was "${before}" before it was marked desync, not done`,
        fixHint: `node scripts/advance_block_state.mjs ${blockId} ${before === 'review' ? 'review' : 'wip'}`,
      };
    }
    // R-8.10 — desync → review restores a block that WAS in review; it is
    // never a way to promote one that was not.
    if (to === 'review' && before !== 'review') {
      return {
        ok: false, from,
        reason: `desync -> review refused: this block was "${before || 'unknown (legacy mark)'}" before it was marked desync, not review`,
        fixHint: `node scripts/advance_block_state.mjs ${blockId} wip`,
      };
    }
    const { exists, run } = latestRun(atlasRoot, blockId);
    const markedAt = block.desync_marked_at || block.updated_at || null;
    const fresh = exists && run && markedAt ? Date.parse(run.checked_at) > Date.parse(markedAt) : false;
    if (!allowNoVerifier && (to === 'done' || to === 'review')) {
      if (!exists || !run || run.verdict !== 'pass') {
        return {
          ok: false, from,
          reason: `desync -> ${to} refused: latest verdict is ${run?.verdict || 'missing'}`,
          fixHint: `node scripts/verify_block_acceptance.mjs ${blockId}`,
        };
      }
      if (!fresh) {
        return {
          ok: false, from,
          reason: `desync -> ${to} refused: the green run (${run.checked_at}) is not newer than the desync mark (${markedAt})`,
          fixHint: `node scripts/verify_block_acceptance.mjs ${blockId}`,
        };
      }
      gateNote = ` gate=pass(desync-cleared ${run.counts?.pass}/${(run.counts?.pass || 0) + (run.counts?.fail || 0) + (run.counts?.skipped || 0)})`;
    }
  }

  // ── the → done gate (same contract as log_transition.mjs).
  if (to === 'done' && from !== 'done' && from !== 'desync') {
    const { exists, run, unparseable } = latestRun(atlasRoot, blockId);
    if (!exists) {
      if (!allowNoVerifier) {
        return {
          ok: false, from,
          reason: 'no acceptance verifier run exists for this block',
          fixHint: `node scripts/verify_block_acceptance.mjs ${blockId}`,
        };
      }
      gateNote = ' gate=overridden(no_run)';
    } else if (unparseable) {
      if (!allowNoVerifier) return { ok: false, from, reason: `cannot parse _latest.json: ${unparseable}` };
      gateNote = ' gate=overridden(unparseable)';
    } else if (run.verdict !== 'pass') {
      if (!allowNoVerifier) {
        const fails = (run.assertions || []).filter((a) => a.verdict === 'fail').slice(0, 3)
          .map((a) => `${a.id}: ${(a.evidence || '').slice(0, 90)}`);
        return {
          ok: false, from,
          reason: `acceptance verdict = ${run.verdict} (pass=${run.counts?.pass} fail=${run.counts?.fail} skipped=${run.counts?.skipped})`
            + (fails.length ? `\n    ✗ ${fails.join('\n    ✗ ')}` : ''),
          fixHint: `node scripts/verify_block_acceptance.mjs ${blockId}`,
        };
      }
      gateNote = ` gate=overridden(verdict=${run.verdict})`;
    } else {
      const total = (run.counts?.pass || 0) + (run.counts?.fail || 0) + (run.counts?.skipped || 0);
      gateNote = ` gate=pass(${run.counts?.pass}/${total})`;
    }
  }

  return { ok: true, from, gateNote };
}

/**
 * Check + write. The ONLY sanctioned writer of block status + both ledgers.
 * Returns { ok, from, to, reason?, fixHint? }.
 */
export function applyTransition({ atlasRoot = defaultAtlasRoot(), blockId, to, actor = 'cli', note = '', allowNoVerifier = false } = {}) {
  const verdict = checkTransition({ atlasRoot, blockId, to, allowNoVerifier });
  if (!verdict.ok) return { ...verdict, to };

  const { path: graphPath, graph } = readGraph(atlasRoot);
  const idx = (graph.blocks || []).findIndex((b) => b.id === blockId);
  const block = graph.blocks[idx];
  const from = verdict.from;
  const ts = new Date().toISOString();

  block.status = to;
  block.updated_at = ts;
  if (from === 'desync') {
    delete block.status_before_desync;
    delete block.desync_marked_at;
    if (block.status_reason && /^cascade:/.test(block.status_reason)) delete block.status_reason;
  }
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2) + '\n', 'utf8');

  const transitionsPath = path.join(atlasRoot, 'transitions.log');
  if (!fs.existsSync(transitionsPath)) {
    fs.writeFileSync(transitionsPath, '# ts\tblock_id\tfrom\tto\tmeta\n', 'utf8');
  }
  const finalNote = `${note || ''}${verdict.gateNote || ''}`;
  fs.appendFileSync(transitionsPath, `${ts}\t${blockId}\t${from}\t${to}\tactor=${actor}\tnote=${finalNote}\n`, 'utf8');

  const blockDir = path.join(atlasRoot, 'blocks', blockId);
  if (fs.existsSync(blockDir)) {
    fs.appendFileSync(path.join(blockDir, 'checks.log'),
      `${ts}\ttransition\tpass\t${from}->${to}\tactor=${actor}${finalNote ? `\tnote=${finalNote}` : ''}\n`, 'utf8');
  }

  return { ok: true, from, to, gateNote: verdict.gateNote || '' };
}

/** Formats a rejection the same way every caller should surface it. */
export function rejectionMessage(blockId, to, result) {
  const lines = [`REJECTED ${blockId} ${result.from || '?'} → ${to}`, `  reason: ${result.reason}`];
  if (result.fixHint) lines.push(`  fix:    ${result.fixHint}`);
  lines.push('  bypass: --allow-no-verifier / ATLAS_ALLOW_NO_VERIFIER=1 (override is logged)');
  return lines.join('\n');
}

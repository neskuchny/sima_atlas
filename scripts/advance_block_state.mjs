#!/usr/bin/env node
// Thin CLI over the shared lifecycle gate (scripts/lifecycle_gate.mjs).
//
// R-8.05 — this script used to own the TRANSITIONS table and applied ONLY the
// adjacency check before writing graph.json: `→ done` never read the acceptance
// verdict, so the V-1 daemon (which promotes through this script) and every
// operator invocation could mark a block done with a failing verifier. The
// gate, the ledger write and the checks.log line now live in one module that
// every status-writing path shares.
//
// Usage:
//   node scripts/advance_block_state.mjs <blockId> <to> [actor] [note] [--allow-no-verifier]
//
// Exit codes (kept stable for existing callers):
//   0 — applied
//   2 — block not found
//   3 — transition refused (invalid adjacency or failing acceptance gate)

import { applyTransition, rejectionMessage } from './lifecycle_gate.mjs';

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith('--'));
const [blockId, to, actor = 'cli', note = ''] = argv.filter((a) => !a.startsWith('--'));
const allowNoVerifier = flags.includes('--allow-no-verifier') || process.env.ATLAS_ALLOW_NO_VERIFIER === '1';

if (!blockId || !to) {
  console.error('Usage: node scripts/advance_block_state.mjs <blockId> <to> [actor] [note] [--allow-no-verifier]');
  process.exit(1);
}

const r = applyTransition({ blockId, to, actor, note, allowNoVerifier });

if (!r.ok) {
  if (/block not found/.test(r.reason || '')) {
    console.error(`Block not found: ${blockId}`);
    process.exit(2);
  }
  console.error(rejectionMessage(blockId, to, r));
  process.exit(3);
}

console.log(`Transition applied: ${blockId} ${r.from} -> ${r.to}${r.gateNote ? ` (${r.gateNote.trim()})` : ''}`);

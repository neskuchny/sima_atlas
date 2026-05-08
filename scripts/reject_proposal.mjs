#!/usr/bin/env node
// PR3.5: reject a pending LLM proposal.
//
// Usage:
//   node scripts/reject_proposal.mjs <proposal_id> [reason] [--client <id>]
//
// Marks the proposal verdict='rejected' (we keep the file for audit) and
// appends one line to the block's decisions.log so the next LLM pass knows
// "this kind of change has been rejected before" if we wire it back later.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const argv = process.argv.slice(2);
const clientIdx = argv.indexOf('--client');
const client = clientIdx >= 0 ? argv[clientIdx + 1] : null;
// Strip the --client pair so the remaining positional args are id + reason.
const positional = argv.filter((a, i) => a !== '--client' && argv[i - 1] !== '--client');
const idArg = positional[0];
const reasonParts = positional.slice(1);

const ATLAS = client ? path.join(ROOT, 'atlas', 'clients', client) : path.join(ROOT, 'atlas');
const PROPOSALS_DIR = path.join(ATLAS, 'proposals');

if (!idArg) {
  console.error('Usage: node scripts/reject_proposal.mjs <proposal_id> [reason] [--client <id>]');
  process.exit(1);
}
const reason = reasonParts.join(' ').trim() || '(no reason)';

const filePath = path.join(PROPOSALS_DIR, idArg.endsWith('.json') ? idArg : `${idArg}.json`);
if (!fs.existsSync(filePath)) {
  console.error(`reject_proposal: proposal not found → ${filePath}`);
  process.exit(2);
}

const proposal = JSON.parse(fs.readFileSync(filePath, 'utf8'));
if (proposal.verdict !== 'pending') {
  console.error(`reject_proposal: proposal already ${proposal.verdict}`);
  process.exit(3);
}

const ts = new Date().toISOString();
proposal.verdict = 'rejected';
proposal.rejected_at = ts;
proposal.reject_reason = reason;
fs.writeFileSync(filePath, JSON.stringify(proposal, null, 2) + '\n', 'utf8');

const decisionsPath = path.join(ATLAS, 'blocks', proposal.block_id, 'decisions.log');
if (fs.existsSync(path.dirname(decisionsPath))) {
  fs.appendFileSync(decisionsPath, `${ts}\tproposal_rejected\t${proposal.id}\t${reason}\n`, 'utf8');
}

console.log(`reject_proposal: ${proposal.id} rejected (${reason})`);

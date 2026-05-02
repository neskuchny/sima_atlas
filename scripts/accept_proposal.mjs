#!/usr/bin/env node
// PR3.5: accept a pending LLM proposal.
//
// Usage:
//   node scripts/accept_proposal.mjs <proposal_id>
//
// Steps:
//   1. Load atlas/proposals/<id>.json (must be verdict=pending).
//   2. Apply each non-conflicting change to atlas/graph.json:
//        layer / type / mvp / status      → overwrite
//        depends_on_add / provides_add /  → array union
//        tech_stack_add
//        mission_preview                  → IGNORED (mission stays human-written)
//   3. Append a `proposal_accepted` line into the block's checks.log
//      with the diff summary.
//   4. Mark proposal verdict='accepted', applied_at=<now>; keep the file
//      for audit (it does NOT delete history).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');
const PROPOSALS_DIR = path.join(ATLAS, 'proposals');
const GRAPH_PATH = path.join(ATLAS, 'graph.json');

const [, , idArg] = process.argv;
if (!idArg) {
  console.error('Usage: node scripts/accept_proposal.mjs <proposal_id>');
  process.exit(1);
}

const filePath = path.join(PROPOSALS_DIR, idArg.endsWith('.json') ? idArg : `${idArg}.json`);
if (!fs.existsSync(filePath)) {
  console.error(`accept_proposal: proposal not found → ${filePath}`);
  process.exit(2);
}

const proposal = JSON.parse(fs.readFileSync(filePath, 'utf8'));
if (proposal.verdict !== 'pending') {
  console.error(`accept_proposal: proposal already ${proposal.verdict}`);
  process.exit(3);
}

const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
const block = (graph.blocks || []).find((b) => b.id === proposal.block_id);
if (!block) {
  console.error(`accept_proposal: block ${proposal.block_id} no longer in graph.json`);
  process.exit(4);
}

const c = proposal.changes || {};
const applied = [];

if (c.layer)  { block.layer  = c.layer.to;  applied.push(`layer=${c.layer.to}`); }
if (c.type)   { block.type   = c.type.to;   applied.push(`type=${c.type.to}`); }
if (c.mvp)    { block.mvp    = c.mvp.to;    applied.push(`mvp=${c.mvp.to}`); }
if (c.status) { block.status = c.status.to; applied.push(`status=${c.status.to}`); }
if (Array.isArray(c.depends_on_add) && c.depends_on_add.length) {
  block.depends_on = [...new Set([...(block.depends_on || []), ...c.depends_on_add])];
  applied.push(`depends_on+=[${c.depends_on_add.join(',')}]`);
}
if (Array.isArray(c.tech_stack_add) && c.tech_stack_add.length) {
  block.tech_stack = [...new Set([...(block.tech_stack || []), ...c.tech_stack_add])];
  applied.push(`tech_stack+=[${c.tech_stack_add.join(',')}]`);
}

fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2) + '\n', 'utf8');

// Append trace into the block's checks.log
const logPath = path.join(ATLAS, 'blocks', block.id, 'checks.log');
const ts = new Date().toISOString();
const note = `proposal_accepted ${proposal.id} :: ${applied.join(' ') || '(no structural change)'}`;
if (fs.existsSync(path.dirname(logPath))) {
  fs.appendFileSync(logPath, `${ts}\tproposal\tpass\t${note}\n`, 'utf8');
}

proposal.verdict = 'accepted';
proposal.applied_at = ts;
proposal.applied = applied;
fs.writeFileSync(filePath, JSON.stringify(proposal, null, 2) + '\n', 'utf8');

console.log(`accept_proposal: ${proposal.id} applied to ${block.id} → ${applied.join(' ') || '(no-op)'}`);

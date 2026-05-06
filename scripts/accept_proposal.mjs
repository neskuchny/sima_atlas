#!/usr/bin/env node
// PR3.5: accept a pending LLM proposal.
//
// Usage:
//   node scripts/accept_proposal.mjs <proposal_id> [--client <id>]
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
//
// Phase R-4: also handles kind='chat_fill' plans by iterating
// new_block_proposals and creating each block via atlas_blocks_api.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBlock as apiCreateBlock, patchBlockFile } from './atlas_blocks_api.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const argv = process.argv.slice(2);
const idArg = argv.find((a) => !a.startsWith('--')) || null;
const clientIdx = argv.indexOf('--client');
const client = clientIdx >= 0 ? argv[clientIdx + 1] : null;

const ATLAS = client ? path.join(ROOT, 'atlas', 'clients', client) : path.join(ROOT, 'atlas');
const PROPOSALS_DIR = path.join(ATLAS, 'proposals');
const GRAPH_PATH = path.join(ATLAS, 'graph.json');

if (!idArg) {
  console.error('Usage: node scripts/accept_proposal.mjs <proposal_id> [--client <id>]');
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

// Phase R-4 — chat_fill plans don't target a single block; they bundle
// (a) field fills already applied during sima_fill_from_chat dry/auto run
// (b) new_block_proposals waiting for the operator's go-ahead. Accept means
// "create the proposed new blocks now and write their contract files".
if (proposal.kind === 'chat_fill') {
  const created = [];
  const skipped = [];
  for (const np of (proposal.new_block_proposals || [])) {
    if (!np?.id || !np.title) { skipped.push({ id: np?.id || null, reason: 'missing id/title' }); continue; }
    try {
      apiCreateBlock({ atlas_root: ATLAS, body: { id: np.id, title: np.title, layer: np.layer || 'logic', status: 'idea' } });
    } catch (e) {
      if (!/already exists/i.test(String(e.message || e))) {
        skipped.push({ id: np.id, reason: String(e.message || e) }); continue;
      }
    }
    const writeIfText = (file, content) => {
      if (!content || !String(content).trim()) return;
      try { patchBlockFile({ atlas_root: ATLAS, block_id: np.id, file, content: String(content) }); } catch {}
    };
    writeIfText('mission.md',    `# ${np.id} — mission\n\n${np.mission || ''}\n`);
    if (Array.isArray(np.kpi) && np.kpi.length)
      writeIfText('kpi.md',        `# ${np.id} — KPI\n\n${np.kpi.map((k) => `- ${k}`).join('\n')}\n`);
    if (Array.isArray(np.acceptance) && np.acceptance.length)
      writeIfText('acceptance.md', `# ${np.id} — acceptance\n\n${np.acceptance.map((a, i) => `- [ ] **A${i+1}.** ${a}`).join('\n')}\n`);
    if (Array.isArray(np.depends_on_capabilities) && np.depends_on_capabilities.length)
      writeIfText('depends_on.md', `# ${np.id} — depends_on\n\n${np.depends_on_capabilities.map((d) => `- ?: ${d}`).join('\n')}\n`);
    if (Array.isArray(np.provides_capabilities) && np.provides_capabilities.length)
      writeIfText('provides.md',   `# ${np.id} — provides\n\n${np.provides_capabilities.map((d) => `- ${d}`).join('\n')}\n`);
    created.push(np.id);
  }
  proposal.verdict = 'accepted';
  proposal.applied_at = new Date().toISOString();
  proposal.applied = { created, skipped };
  fs.writeFileSync(filePath, JSON.stringify(proposal, null, 2) + '\n', 'utf8');
  console.log(`accept_proposal: chat_fill plan ${proposal.id} → created ${created.length} block(s), skipped ${skipped.length}`);
  process.exit(0);
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

// PR-5 (b.acceptance-verifier-loop): proposals with kind='acceptance_regression'
// (and any future shape that puts the change inside proposed.<field> rather
// than changes.<field>) carry simple field overwrites. Apply only known-safe
// fields so we don't accidentally let an LLM-built proposal rewrite mission.
if (proposal.proposed && typeof proposal.proposed === 'object') {
  const safeFields = ['status', 'status_reason'];
  for (const f of safeFields) {
    const v = proposal.proposed[f];
    if (typeof v === 'string' && v && block[f] !== v) {
      block[f] = v;
      applied.push(`${f}=${v}`);
    }
  }
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

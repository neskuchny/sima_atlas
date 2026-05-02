#!/usr/bin/env node
// PR3.5 smoke: full proposals lifecycle (write → list → accept | reject) with
// rollback so the smoke is idempotent in nightly.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');
const GRAPH_PATH = path.join(ATLAS, 'graph.json');
const PROPOSALS_DIR = path.join(ATLAS, 'proposals');

function runNode(args) { return execFileSync('node', args, { cwd: ROOT, encoding: 'utf8' }).trim(); }

const failures = [];

// ─── Snapshot before ──────────────────────────────────────────────────────
const graphBefore = fs.readFileSync(GRAPH_PATH, 'utf8');
const docsChecksPath = path.join(ATLAS, 'blocks', 'b.docs', 'checks.log');
const docsChecksBefore = fs.readFileSync(docsChecksPath, 'utf8');
const dbDecisionsPath = path.join(ATLAS, 'blocks', 'b.db', 'decisions.log');
const dbDecisionsBefore = fs.existsSync(dbDecisionsPath) ? fs.readFileSync(dbDecisionsPath, 'utf8') : null;
const preDirSnapshot = fs.existsSync(PROPOSALS_DIR) ? new Set(fs.readdirSync(PROPOSALS_DIR)) : new Set();

try {
  // ─── 1. Write a fake proposal for b.docs and accept it ─────────────────
  fs.mkdirSync(PROPOSALS_DIR, { recursive: true });
  const acceptId = '__smoke_accept__b.docs';
  fs.writeFileSync(path.join(PROPOSALS_DIR, `${acceptId}.json`), JSON.stringify({
    id: acceptId, block_id: 'b.docs', kind: 'block_update',
    created_at: new Date().toISOString(),
    source: { provider: 'mock', model: 'mock-1', confidence: 0.9 },
    current: { status: 'wip' },
    proposed: { id: 'b.docs', status: 'review', tech_stack: ['nodejs', 'esm', 'markdown', 'mermaid'] },
    changes: { tech_stack_add: ['mermaid'] },
    verdict: 'pending',
  }, null, 2), 'utf8');

  const listOut = runNode(['scripts/list_proposals.mjs', '--json']);
  const list = JSON.parse(listOut);
  const found = list.find((p) => p.id === acceptId);
  if (!found) failures.push('list_proposals: smoke proposal not visible');

  runNode(['scripts/accept_proposal.mjs', acceptId]);
  const graphAfterAccept = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  const docs = (graphAfterAccept.blocks || []).find((b) => b.id === 'b.docs');
  if (!docs || !docs.tech_stack || !docs.tech_stack.includes('mermaid')) {
    failures.push('accept_proposal did not extend b.docs.tech_stack with mermaid');
  }
  const docsChecksAfter = fs.readFileSync(docsChecksPath, 'utf8');
  if (!/proposal_accepted/.test(docsChecksAfter.slice(docsChecksBefore.length))) {
    failures.push('accept_proposal did not log proposal_accepted to b.docs/checks.log');
  }
  const acceptedJson = JSON.parse(fs.readFileSync(path.join(PROPOSALS_DIR, `${acceptId}.json`), 'utf8'));
  if (acceptedJson.verdict !== 'accepted') failures.push('accept_proposal: verdict not flipped to "accepted"');

  // ─── 2. Write a fake proposal for b.db and reject it ───────────────────
  const rejectId = '__smoke_reject__b.db';
  fs.writeFileSync(path.join(PROPOSALS_DIR, `${rejectId}.json`), JSON.stringify({
    id: rejectId, block_id: 'b.db', kind: 'block_update',
    created_at: new Date().toISOString(),
    source: { provider: 'mock', model: 'mock-1', confidence: 0.4 },
    current: { status: 'idea' },
    proposed: { id: 'b.db', status: 'wip' },
    changes: { status: { from: 'idea', to: 'wip' } },
    verdict: 'pending',
  }, null, 2), 'utf8');

  runNode(['scripts/reject_proposal.mjs', rejectId, 'too low confidence']);
  const rejectedJson = JSON.parse(fs.readFileSync(path.join(PROPOSALS_DIR, `${rejectId}.json`), 'utf8'));
  if (rejectedJson.verdict !== 'rejected') failures.push('reject_proposal: verdict not flipped to "rejected"');
  const dbDecisionsAfter = fs.existsSync(dbDecisionsPath) ? fs.readFileSync(dbDecisionsPath, 'utf8') : '';
  if (!/proposal_rejected\t__smoke_reject__b\.db/.test(dbDecisionsAfter)) {
    failures.push('reject_proposal did not log to b.db/decisions.log');
  }
  // After reject, graph.json must NOT have status changed (b.db still idea).
  const graphAfterReject = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
  const db = (graphAfterReject.blocks || []).find((b) => b.id === 'b.db');
  if (!db || db.status !== 'idea') failures.push('reject_proposal must not change graph.json (b.db.status changed)');

  // ─── 3. list filters out non-pending entries ───────────────────────────
  const list2 = JSON.parse(runNode(['scripts/list_proposals.mjs', '--json']));
  if (list2.find((p) => p.id === acceptId)) failures.push('list_proposals: accepted proposal still listed as pending');
  if (list2.find((p) => p.id === rejectId)) failures.push('list_proposals: rejected proposal still listed as pending');

} finally {
  // ─── Restore ──────────────────────────────────────────────────────────
  fs.writeFileSync(GRAPH_PATH, graphBefore);
  fs.writeFileSync(docsChecksPath, docsChecksBefore);
  if (dbDecisionsBefore !== null) fs.writeFileSync(dbDecisionsPath, dbDecisionsBefore);
  else if (fs.existsSync(dbDecisionsPath)) fs.unlinkSync(dbDecisionsPath);
  if (fs.existsSync(PROPOSALS_DIR)) {
    for (const f of fs.readdirSync(PROPOSALS_DIR)) {
      if (!preDirSnapshot.has(f)) fs.unlinkSync(path.join(PROPOSALS_DIR, f));
    }
  }
}

if (failures.length) {
  console.error('proposals_flow.smoke: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('proposals_flow.smoke: OK (accept + reject + filter, state restored)');

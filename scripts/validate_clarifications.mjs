#!/usr/bin/env node
// R-8.06 (b.clarify) — make unresolved uncertainty a visible, blocking state.
//
// `[NEEDS CLARIFICATION: <question>]` is a first-class state of a contract:
// the contract declaring that a part of it is not settled. Its whole value is
// that it must NOT be silently outlivable. Without a validator, a marker is
// just text an agent walks past — and a block reaches `done` carrying an open
// question, which is precisely the divergence this system exists to catch.
//
// The rule, deliberately narrow:
//   status `done`   → an unresolved marker is an ERROR. Claiming a block is
//                     finished while its own contract says a part is undecided
//                     is a dishonest status, not a style problem.
//   status `review` → WARNING. Review is where these get resolved.
//   anything else   → INFO. Drafting freely is the point of `idea`/`wip`
//                     (README Appendix B.2 keeps early gates soft).
//
// Also reports assumption debt: `clarifications.md` entries are the record of
// what the model decided on its own. They are never an error — they are the
// surface area a reviewer should look at.
//
// Usage:
//   node scripts/validate_clarifications.mjs
//   node scripts/validate_clarifications.mjs --json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockMarkers } from './clarify_block.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');

const graphPath = path.join(ATLAS, 'graph.json');
if (!fs.existsSync(graphPath)) {
  console.error(`validate_clarifications: graph.json not found at ${graphPath}`);
  process.exit(1);
}
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

const errors = [];
const warnings = [];
const info = [];
const report = [];

for (const b of graph.blocks || []) {
  if (b.status === 'archived') continue;
  const markers = blockMarkers(b.id, ATLAS);
  const clarPath = path.join(ATLAS, 'blocks', b.id, 'clarifications.md');
  const answered = fs.existsSync(clarPath)
    ? (fs.readFileSync(clarPath, 'utf8').match(/^- Q: /gm) || []).length
    : 0;

  if (markers.length) {
    const where = markers.map((m) => `${m.file}:${m.line}`).join(', ');
    const line = `${b.id} (${b.status}): ${markers.length} unresolved clarification marker(s) — ${where}`;
    if (b.status === 'done') {
      errors.push(`${line}\n    ${markers.map((m) => `· ${m.question}`).join('\n    ')}`);
    } else if (b.status === 'review') {
      warnings.push(line);
    } else {
      info.push(line);
    }
  }

  if (markers.length || answered) {
    report.push({ block_id: b.id, status: b.status, open_markers: markers.length, answered_questions: answered, markers });
  }
}

if (asJson) {
  console.log(JSON.stringify({
    ok: errors.length === 0,
    errors: errors.length,
    warnings: warnings.length,
    blocks: report,
  }, null, 2));
  process.exit(errors.length ? 1 : 0);
}

if (errors.length) {
  console.error('Clarification validation failed — a done block cannot carry an open question:');
  errors.forEach((e) => console.error(' ✗', e));
}
warnings.forEach((w) => console.warn(' ⚠', w));
info.forEach((i) => console.log(' ·', i));

const totalOpen = report.reduce((n, r) => n + r.open_markers, 0);
const totalAnswered = report.reduce((n, r) => n + r.answered_questions, 0);
console.log(`validate_clarifications: ${totalOpen} open marker(s), ${totalAnswered} question(s) answered on record${errors.length ? '' : ' — OK'}`);
process.exit(errors.length ? 1 : 0);

#!/usr/bin/env node
// Log a block status transition to atlas/transitions.log.
//
// PR-4 (b.acceptance-verifier-loop): when the destination status is `done`,
// gate the transition on the latest acceptance verifier verdict. If
// atlas/acceptance_runs/<block>/_latest.json is missing OR verdict !== "pass",
// the transition is REJECTED with an explanatory message and exit 1.
//
// Override: pass `--allow-no-verifier` (or set ATLAS_ALLOW_NO_VERIFIER=1) to
// skip the gate. Use sparingly — the override is logged in the appended note.

import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const positional = argv.filter((a) => !a.startsWith('--'));
const allowOverride = argv.includes('--allow-no-verifier') || process.env.ATLAS_ALLOW_NO_VERIFIER === '1';
const [blockId, from, to, actor = 'cli', note = ''] = positional;
if (!blockId || !from || !to) {
  console.error('Usage: node scripts/log_transition.mjs <blockId> <from> <to> [actor] [note] [--allow-no-verifier]');
  process.exit(1);
}

const ROOT = process.cwd();
const ATLAS = path.join(ROOT, 'atlas');
const logPath = path.join(ATLAS, 'transitions.log');

// PR-4 acceptance gate: only triggers on `→ done`.
let gateNote = '';
if (to === 'done' && from !== 'done') {
  const latestPath = path.join(ATLAS, 'acceptance_runs', blockId, '_latest.json');
  if (!fs.existsSync(latestPath)) {
    if (!allowOverride) {
      console.error(`log_transition: REJECTED ${blockId} ${from} → done`);
      console.error(`  reason: no acceptance verifier run exists for this block`);
      console.error(`  fix:    node scripts/verify_block_acceptance.mjs ${blockId}`);
      console.error(`  bypass: rerun with --allow-no-verifier (override is logged)`);
      process.exit(1);
    }
    gateNote = ' gate=overridden(no_run)';
  } else {
    let latest = null;
    try { latest = JSON.parse(fs.readFileSync(latestPath, 'utf8')); }
    catch (e) {
      console.error(`log_transition: cannot parse ${latestPath}: ${e.message}`);
      if (!allowOverride) process.exit(1);
      gateNote = ' gate=overridden(unparseable)';
    }
    if (latest && latest.verdict !== 'pass') {
      if (!allowOverride) {
        const fails = (latest.assertions || []).filter((a) => a.verdict === 'fail').slice(0, 3);
        console.error(`log_transition: REJECTED ${blockId} ${from} → done`);
        console.error(`  reason: acceptance verdict = ${latest.verdict} (pass=${latest.counts?.pass} fail=${latest.counts?.fail} skipped=${latest.counts?.skipped})`);
        for (const a of fails) {
          console.error(`    ✗ ${a.id}: ${(a.evidence || '').slice(0, 100)}`);
        }
        console.error(`  fix:    address the failing assertions and rerun:`);
        console.error(`          node scripts/verify_block_acceptance.mjs ${blockId}`);
        console.error(`  bypass: rerun with --allow-no-verifier (override is logged)`);
        process.exit(1);
      }
      gateNote = ` gate=overridden(verdict=${latest.verdict})`;
    } else if (latest && latest.verdict === 'pass') {
      const total = latest.counts?.pass + latest.counts?.fail + latest.counts?.skipped;
      gateNote = ` gate=pass(${latest.counts?.pass}/${total})`;
    }
  }
}

const ts = new Date().toISOString();
const finalNote = (note || '') + gateNote;
const line = `${ts}\t${blockId}\t${from}\t${to}\tactor=${actor}\tnote=${finalNote}\n`;
fs.appendFileSync(logPath, line, 'utf8');
console.log(`Appended transition to ${logPath}${gateNote ? ' (' + gateNote.trim() + ')' : ''}`);

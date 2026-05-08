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
import { spawn } from 'node:child_process';

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

// PR-4 (b.user-docs-generator): when a block transitions INTO `done` and is
// user-facing (layer ∈ {user, front} OR user_facing: true in graph), spawn
// scripts/generate_user_docs.mjs in detached mode so the transition doesn't
// wait for the LLM call. Failures are non-fatal — a missed regen will be
// caught by the next nightly drift-check.
//
// Skip via ATLAS_SKIP_USER_DOCS=1 (e.g. in tests).
if (to === 'done' && from !== 'done' && process.env.ATLAS_SKIP_USER_DOCS !== '1') {
  let isUserFacing = false;
  try {
    const graph = JSON.parse(fs.readFileSync(path.join(ATLAS, 'graph.json'), 'utf8'));
    const block = (graph.blocks || []).find((b) => b.id === blockId);
    if (block && (block.user_facing === true || block.layer === 'user' || block.layer === 'front')) {
      isUserFacing = true;
    }
    // Also check projects/<proj>/graph.json
    if (!isUserFacing) {
      const projDir = path.join(ATLAS, 'projects');
      if (fs.existsSync(projDir)) {
        for (const proj of fs.readdirSync(projDir)) {
          const g = path.join(projDir, proj, 'graph.json');
          if (!fs.existsSync(g)) continue;
          try {
            const j = JSON.parse(fs.readFileSync(g, 'utf8'));
            const b = (j.blocks || []).find((x) => x.id === blockId);
            if (b && (b.user_facing === true || b.layer === 'user' || b.layer === 'front')) {
              isUserFacing = true; break;
            }
          } catch {}
        }
      }
    }
  } catch {}
  if (isUserFacing) {
    try {
      const child = spawn('node', ['scripts/generate_user_docs.mjs', blockId], {
        cwd: ROOT, detached: true, stdio: 'ignore',
      });
      child.unref();
      console.log(`  (spawned generate_user_docs.mjs ${blockId} async; pid=${child.pid})`);
    } catch (e) {
      console.warn(`  warning: could not spawn generate_user_docs: ${e.message}`);
    }
  }
}

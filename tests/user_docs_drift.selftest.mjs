#!/usr/bin/env node
// PR-4 (b.user-docs-generator): selftest for regenerate_user_docs_drift +
// listUserDocs / readUserDocs / lockUserDocs.
//
// 6 test groups:
//  1. Drift run on bare repo (no _meta entries) → seeded for every
//     user-facing block, summary.seeded.length === number of user-facing
//     blocks
//  2. Re-run idempotent → all skipped_unchanged
//  3. Tampered meta hash + locked=false → status: refreshed
//  4. Tampered meta hash + locked=true → status: locked_drift, proposal
//     kind=user_docs_locked written
//  5. listUserDocs surfaces all blocks; readUserDocs returns markdown +
//     meta; lockUserDocs flips the locked flag
//  6. Cleanup leaves no test artefacts in the real repo

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  runDriftCheck, listUserDocs, readUserDocs, lockUserDocs,
} from '../scripts/regenerate_user_docs_drift.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(REPO_ROOT, 'atlas');
const DOCS_ROOT = path.join(ATLAS, 'docs', 'end-user');
const META_DIR = path.join(DOCS_ROOT, '_meta');
const PROPOSALS = path.join(ATLAS, 'proposals');

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

function cleanupDocsDir() { if (fs.existsSync(DOCS_ROOT)) fs.rmSync(DOCS_ROOT, { recursive: true }); }
function cleanupTestProposals(beforeSet) {
  if (!fs.existsSync(PROPOSALS)) return;
  for (const f of fs.readdirSync(PROPOSALS)) {
    if (beforeSet.has(f)) continue;
    if (f.endsWith('__user_docs_locked.json')) {
      try { fs.unlinkSync(path.join(PROPOSALS, f)); } catch {}
    }
  }
}

const proposalsBefore = new Set(fs.existsSync(PROPOSALS) ? fs.readdirSync(PROPOSALS) : []);

try {
  cleanupDocsDir();

  // ─── Group 1: bare repo → seed
  {
    const r = await runDriftCheck();
    check('group1:checked > 0', r.checked > 0, `checked=${r.checked}`);
    check('group1:all seeded', r.seeded.length === r.checked,
      `seeded=${r.seeded.length}, checked=${r.checked}`);
    check('group1:no failures', r.failed.length === 0,
      `failed=${JSON.stringify(r.failed)}`);
    check('group1:_drift_summary.json written',
      fs.existsSync(path.join(DOCS_ROOT, '_drift_summary.json')));
  }

  // ─── Group 2: idempotent re-run
  {
    const r = await runDriftCheck();
    check('group2:all skipped_unchanged', r.skipped_unchanged.length === r.checked,
      `skipped=${r.skipped_unchanged.length}, checked=${r.checked}`);
    check('group2:no refreshed', r.refreshed.length === 0);
    check('group2:no seeded', r.seeded.length === 0);
  }

  // ─── Group 3: tamper meta hash, locked=false → refreshed
  {
    const docs = listUserDocs();
    if (!docs.length) {
      failures.push('group3:no docs to test');
    } else {
      const target = docs[0].block_id;
      const metaPath = path.join(META_DIR, `${target}.json`);
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      meta.hash = 'staleforce0000000';
      meta.locked = false;
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      const r = await runDriftCheck();
      check('group3:1 refreshed', r.refreshed.includes(target),
        `refreshed=${JSON.stringify(r.refreshed)}, target=${target}`);
      check('group3:no locked_drift', r.locked_drift.length === 0);
    }
  }

  // ─── Group 4: tamper hash + locked=true → locked_drift + proposal
  {
    const docs = listUserDocs();
    const target = docs[0].block_id;
    const metaPath = path.join(META_DIR, `${target}.json`);
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    meta.hash = 'lockedstale000000';
    meta.locked = true;
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));

    const r = await runDriftCheck();
    check('group4:locked_drift recorded',
      r.locked_drift.some((ld) => ld.block_id === target),
      `locked_drift=${JSON.stringify(r.locked_drift)}`);
    check('group4:not refreshed', !r.refreshed.includes(target));

    // Proposal file written
    const proposals = fs.readdirSync(PROPOSALS).filter((f) =>
      f.endsWith('__user_docs_locked.json') && f.includes(`__${target}__`) && !proposalsBefore.has(f));
    check('group4:proposal written', proposals.length === 1,
      `proposals=${proposals.length}`);
    if (proposals.length) {
      const j = JSON.parse(fs.readFileSync(path.join(PROPOSALS, proposals[0]), 'utf8'));
      check('group4:proposal kind', j.kind === 'user_docs_locked');
      check('group4:proposal block_id', j.block_id === target);
      check('group4:proposal new_hash', typeof j.new_hash === 'string' && j.new_hash !== 'lockedstale000000');
      check('group4:retry_prompt_hint present',
        typeof j.retry_prompt_hint === 'string' && j.retry_prompt_hint.length > 30);
    }

    // Re-run dedups
    const r2 = await runDriftCheck();
    const proposals2 = fs.readdirSync(PROPOSALS).filter((f) =>
      f.endsWith('__user_docs_locked.json') && f.includes(`__${target}__`) && !proposalsBefore.has(f));
    check('group4:dedup — no second proposal', proposals2.length === 1,
      `after re-run, proposal count=${proposals2.length}`);
  }

  // ─── Group 5: list/read/lock helpers
  {
    const all = listUserDocs();
    check('group5:listUserDocs non-empty', all.length > 0);
    const target = all[0].block_id;
    const r = readUserDocs({ block_id: target });
    check('group5:readUserDocs ok', r.status === 'ok');
    check('group5:markdown contains AUTOGENERATED',
      typeof r.markdown === 'string' && r.markdown.includes('AUTOGENERATED'));

    const before = listUserDocs().find((d) => d.block_id === target).locked;
    const lockResult = lockUserDocs({ block_id: target, locked: !before });
    check('group5:lock flipped', lockResult.locked === !before,
      `result.locked=${lockResult.locked}, before=${before}`);
    const after = listUserDocs().find((d) => d.block_id === target).locked;
    check('group5:list reflects new state', after === !before);

    // readUserDocs on missing block
    const miss = readUserDocs({ block_id: 'b.does-not-exist' });
    check('group5:missing block status no_doc', miss.status === 'no_doc');
  }

  // ─── Group 6: cleanup verification
  // (Not a test of behaviour, just ensures we don't leak artefacts.)
} finally {
  cleanupDocsDir();
  cleanupTestProposals(proposalsBefore);
}

if (failures.length) {
  console.error('user_docs_drift.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('user_docs_drift.selftest: OK (5 test groups, all assertions green)');

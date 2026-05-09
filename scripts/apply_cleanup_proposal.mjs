#!/usr/bin/env node
// R-7.88 (S-12 MVP) — apply ONE cleanup proposal previously emitted by
// housekeeping_sweeper.mjs.
//
// Two operating modes:
//
//   --id <proposal-id>    apply exactly one proposal by id
//   --kind <kind>         apply ALL proposals of a given kind (e.g. stale-alive)
//                         — useful for batch metadata cleanup
//
// Behaviour by proposal kind:
//
//   stale-alive       Removes the matching `- <path> [alive]` line from the
//                      block's files.md. Leaves any other content alone.
//                      Pure metadata edit. Idempotent.
//
//   stale-dead /
//   stale-archived    MOVES the file from its original location to
//                      `archive/<status>/<block_id>/<basename>` AND writes a
//                      breadcrumb `<original-path>.moved.md` containing
//                      moved-to / moved-at / reason / original-block. NEVER
//                      deletes anything.
//
//   orphan-code       MOVES the file to `archive/orphans/<YYYY-MM-DD>/<original-path>`
//                      AND writes a breadcrumb. NEVER deletes anything.
//
// ALL apply paths first re-check that the proposal is still valid (file
// still missing for stale-alive, file still present for moves) — protects
// against operator deleting/moving things between sweep and apply.
//
// Usage:
//   node scripts/apply_cleanup_proposal.mjs --id "stale-alive::b.ui-control::frontend/old.jsx"
//   node scripts/apply_cleanup_proposal.mjs --kind stale-alive
//   node scripts/apply_cleanup_proposal.mjs --kind stale-alive --dry-run
//   node scripts/apply_cleanup_proposal.mjs --id "..." --json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_ROOT = path.resolve(path.dirname(__filename), '..');

const args = process.argv.slice(2);
const arg = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt; };
const ROOT = path.resolve(arg('--root', SCRIPT_ROOT));
const ATLAS = path.join(ROOT, 'atlas');
const TARGET_ID = arg('--id', null);
const TARGET_KIND = arg('--kind', null);
const DRY_RUN = args.includes('--dry-run');
const JSON_OUT = args.includes('--json');

if (!TARGET_ID && !TARGET_KIND) {
  console.error('apply_cleanup_proposal: need --id <proposal-id> or --kind <kind>');
  console.error('  available kinds: stale-alive · stale-dead · stale-archived · orphan-code');
  process.exit(2);
}

function loadProposals() {
  const p = path.join(ATLAS, 'cleanup_proposals.json');
  if (!fs.existsSync(p)) {
    console.error('apply_cleanup_proposal: no atlas/cleanup_proposals.json — run housekeeping_sweeper.mjs first');
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function pickProposals(all) {
  if (TARGET_ID) {
    const found = all.proposals.find((p) => p.id === TARGET_ID);
    if (!found) {
      console.error(`apply_cleanup_proposal: id not found in current proposals: ${TARGET_ID}`);
      process.exit(2);
    }
    return [found];
  }
  return all.proposals.filter((p) => p.kind === TARGET_KIND);
}

// ─────────────────────────────────────── stale-alive: remove line from files.md
function applyStaleAlive(p) {
  const filesMdPath = path.join(ATLAS, 'blocks', p.block, 'files.md');
  if (!fs.existsSync(filesMdPath)) {
    return { ok: false, reason: `files.md missing for block ${p.block}` };
  }
  // Re-validate: file should still be missing
  if (fs.existsSync(path.join(ROOT, p.file))) {
    return { ok: false, reason: 'file now exists on disk; proposal is stale, re-run sweeper' };
  }
  const content = fs.readFileSync(filesMdPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const targetEscaped = p.file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^-\\s+${targetEscaped}\\s+\\[alive\\](?:\\s|$).*$`);
  let removed = 0;
  const filtered = lines.filter((l) => {
    if (re.test(l)) { removed += 1; return false; }
    return true;
  });
  if (removed === 0) {
    return { ok: false, reason: `no matching line in files.md for ${p.file}` };
  }
  if (DRY_RUN) {
    return { ok: true, action: 'would-remove-line', removed, file: filesMdPath };
  }
  fs.writeFileSync(filesMdPath, filtered.join('\n'), 'utf8');
  return { ok: true, action: 'removed-line', removed, file: filesMdPath };
}

// ─────────────────────────────────────── move-with-breadcrumb (stale-dead/archived/orphan)
function applyMove(p) {
  const src = path.join(ROOT, p.file);
  if (!fs.existsSync(src)) {
    return { ok: false, reason: 'source file no longer exists; proposal is stale, re-run sweeper' };
  }
  let destRel;
  if (p.kind === 'stale-dead') {
    destRel = path.join('archive', 'dead', p.block, path.basename(p.file));
  } else if (p.kind === 'stale-archived') {
    destRel = path.join('archive', 'archived', p.block, path.basename(p.file));
  } else if (p.kind === 'orphan-code') {
    const date = new Date().toISOString().slice(0, 10);
    destRel = path.join('archive', 'orphans', date, p.file);
  } else {
    return { ok: false, reason: `unknown move kind: ${p.kind}` };
  }
  const dest = path.join(ROOT, destRel);
  if (fs.existsSync(dest)) {
    return { ok: false, reason: `destination already exists: ${destRel}` };
  }
  if (DRY_RUN) {
    return { ok: true, action: 'would-move', from: p.file, to: destRel };
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(src, dest);
  // Write breadcrumb at original location so anyone (operator, agent, search)
  // looking for the file finds out where it went.
  const breadcrumb = [
    `# Moved to archive`,
    ``,
    `**Original path:** \`${p.file}\``,
    `**Moved to:** \`${destRel}\``,
    `**Moved at:** ${new Date().toISOString()}`,
    `**Reason:** ${p.reason}`,
    p.block ? `**Original owning block:** \`${p.block}\` (status at time of move: ${p.block_status || 'unknown'})` : `**Original owning block:** none (was orphan)`,
    ``,
    `_Auto-generated by \`scripts/apply_cleanup_proposal.mjs\` from a sweeper proposal._`,
    `_To restore: \`git mv ${destRel} ${p.file}\` (and delete this breadcrumb)._`,
    ``,
  ].join('\n');
  fs.writeFileSync(src + '.moved.md', breadcrumb, 'utf8');
  return { ok: true, action: 'moved-with-breadcrumb', from: p.file, to: destRel, breadcrumb: src + '.moved.md' };
}

// ─────────────────────────────────────── dispatcher
function applyOne(p) {
  if (p.kind === 'stale-alive') return applyStaleAlive(p);
  if (p.kind === 'stale-dead' || p.kind === 'stale-archived' || p.kind === 'orphan-code') return applyMove(p);
  return { ok: false, reason: `no apply handler for kind: ${p.kind}` };
}

const all = loadProposals();
const targets = pickProposals(all);
const results = targets.map((p) => ({ proposal: { id: p.id, kind: p.kind, file: p.file }, ...applyOne(p) }));

if (JSON_OUT) {
  process.stdout.write(JSON.stringify({ applied: results, dry_run: DRY_RUN }, null, 2) + '\n');
} else {
  for (const r of results) {
    const icon = r.ok ? '✓' : '✗';
    const dryTag = DRY_RUN ? ' [dry-run]' : '';
    if (r.ok) {
      console.log(`${icon}${dryTag} ${r.proposal.id} → ${r.action}${r.from ? ` ${r.from} → ${r.to}` : ''}`);
    } else {
      console.log(`${icon}${dryTag} ${r.proposal.id} → SKIPPED: ${r.reason}`);
    }
  }
  const ok = results.filter((r) => r.ok).length;
  const skipped = results.length - ok;
  console.log(`\n${ok} applied, ${skipped} skipped${DRY_RUN ? ' (dry-run — no changes written)' : ''}`);
}

process.exit(0);

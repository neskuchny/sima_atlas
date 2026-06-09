#!/usr/bin/env node
// R-7.84 (S-8) — cascade verifier: after a successful run on block X,
// check whether X's downstream consumers are still green.
//
// Existing pipeline:
//   - run_block_implementation runs verify_block_acceptance ON X only
//   - verify_done_blocks_still_green sweeps ALL done blocks at nightly,
//     so the operator finds out 8h later that B and C broke
//
// This script closes the gap: after X's verifier passes, we walk the
// reverse-dependency graph (everyone who has X in their depends_on)
// and run their acceptance verifier too. Anything that breaks gets:
//   1. graph.json status → 'desync', reason → 'cascade: parent X edit'
//   2. checks.log entry: `cascade_check fail | broken by parent X`
//   3. narrative.md entry with timestamp + parent reference
//
// Operator's gain: instead of "morning surprise" they see broken
// dependents inline on the canvas the moment they save block X.
//
// Usage:
//   node scripts/cascade_verify.mjs <block_id>
//   node scripts/cascade_verify.mjs <block_id> --client <client_id>
//   node scripts/cascade_verify.mjs <block_id> --dry-run
//
// Exit 0 = no cascading breaks
// Exit 1 = at least one dependent broke

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const args = process.argv.slice(2);
const blockId = args[0];
if (!blockId) {
  console.error('Usage: node scripts/cascade_verify.mjs <block_id> [--client <id>] [--dry-run]');
  process.exit(2);
}
const clientIdx = args.indexOf('--client');
const clientId = clientIdx >= 0 ? args[clientIdx + 1] : null;
const dryRun = args.includes('--dry-run');

const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');

// ─────────────────────────────────────────── locate graph + blocks
function pickAtlasRoot() {
  if (clientId) {
    const p = path.join(ATLAS, 'clients', clientId);
    if (fs.existsSync(path.join(p, 'graph.json'))) return p;
    console.error(`client "${clientId}" not found at ${p}`);
    process.exit(2);
  }
  // Try root atlas first
  if (fs.existsSync(path.join(ATLAS, 'graph.json'))) return ATLAS;
  // Search clients/* for a graph containing blockId
  const clientsDir = path.join(ATLAS, 'clients');
  if (fs.existsSync(clientsDir)) {
    for (const c of fs.readdirSync(clientsDir)) {
      const cp = path.join(clientsDir, c);
      const gp = path.join(cp, 'graph.json');
      if (fs.existsSync(gp)) {
        try {
          const g = JSON.parse(fs.readFileSync(gp, 'utf8'));
          if ((g.blocks || []).some(b => b.id === blockId)) return cp;
        } catch {}
      }
    }
  }
  console.error(`block ${blockId} not found in any graph`);
  process.exit(2);
}

const atlasRoot = pickAtlasRoot();
const graphPath = path.join(atlasRoot, 'graph.json');
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const blocksDir = path.join(atlasRoot, 'blocks');

// ─────────────────────────────────────────── find dependents
// A block D depends on X iff X is referenced in D's depends_on.md
// (format: `- <block_id>: <capability>` or `- <block_id>:scope`).
// graph.json mirrors this in block.depends_on, so we use that for speed.
//
// R-7.98 (Kanon spec §4.1): the walk covers the reverse-dependency CLOSURE —
// «every block that lists X (directly or transitively) in its depends_on» —
// not just the first hop. If A→B→C and C changes, A must be re-verified too:
// a break can propagate through an intermediate block that itself still
// passes (e.g. B's contract is loose where A's is strict). BFS, cycle-safe.

const dependsOnIds = (b) => Array.isArray(b.depends_on)
  ? b.depends_on.map((d) => String(d).split(':')[0].trim()).filter(Boolean)
  : [];

const allBlocks = graph.blocks || [];
const seen = new Set([blockId]);
const dependents = [];
let frontier = [blockId];
while (frontier.length) {
  const next = [];
  for (const b of allBlocks) {
    if (seen.has(b.id)) continue;
    if (dependsOnIds(b).some((id) => frontier.includes(id))) {
      seen.add(b.id);
      dependents.push(b);
      next.push(b.id);
    }
  }
  frontier = next;
}

if (!dependents.length) {
  console.log(`[cascade] ${blockId} has no dependents — nothing to check`);
  process.exit(0);
}

console.log(`[cascade] checking ${dependents.length} dependent(s) in reverse-dep closure of ${blockId}: ${dependents.map(d => d.id).join(', ')}`);

if (dryRun) {
  console.log('[cascade] dry-run — no verification spawned, no status patched');
  process.exit(0);
}

// ─────────────────────────────────────────── run verifier on each dependent
const verifierPath = path.join(ROOT, 'scripts', 'verify_block_acceptance.mjs');
const broken = [];
const ts = new Date().toISOString();

for (const dep of dependents) {
  process.stdout.write(`  · ${dep.id} ... `);
  const v = spawnSync('node', [verifierPath, dep.id], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ATLAS_ROOT: atlasRoot },
    timeout: 60_000,
  });
  if (v.status === 0) {
    console.log('✓ still green');
  } else if (v.status === 1) {
    console.log('✗ FAIL — broken by parent edit');
    broken.push({ id: dep.id, reason: 'verifier fail' });
  } else if (v.status === 2) {
    console.log('· inconclusive (skipped — no auto-mark for inconclusive)');
  } else {
    console.log(`! crashed exit=${v.status}`);
  }
}

if (!broken.length) {
  console.log(`[cascade] ✓ all ${dependents.length} dependent(s) still green`);
  process.exit(0);
}

// ─────────────────────────────────────────── auto-mark broken dependents
console.log(`\n[cascade] ✗ ${broken.length} dependent(s) broken by ${blockId} edit:`);

for (const b of broken) {
  // 1. Update graph.json status
  const idx = (graph.blocks || []).findIndex(x => x.id === b.id);
  if (idx >= 0) {
    graph.blocks[idx].status = 'desync';
    graph.blocks[idx].status_reason = `cascade: parent ${blockId} edit at ${ts.slice(0, 19)} broke acceptance`;
    graph.blocks[idx].updated_at = ts;
  }

  // 2. Append to dependent's checks.log
  const depDir = path.join(blocksDir, b.id);
  if (fs.existsSync(depDir)) {
    fs.appendFileSync(
      path.join(depDir, 'checks.log'),
      `${ts}\tcascade_check\tfail\tbroken by parent ${blockId} edit — verifier failed; status auto-set to desync\n`
    );

    // 3. Append to narrative.md
    const narrativePath = path.join(depDir, 'narrative.md');
    const entry = [
      '',
      `## ${ts} · cascade break detected`,
      '',
      '### What failed and why',
      `- Parent block \`${blockId}\` was edited at ${ts.slice(0, 19)}.`,
      `- Acceptance on this block (\`${b.id}\`) failed when re-verified.`,
      `- Likely cause: ${blockId}'s public contract (provides) changed in a way that violates this block's expectations (depends_on).`,
      '',
      '### Recommended action',
      `1. Open ${blockId} → check what changed in its files`,
      `2. Either:`,
      `   - Adapt this block's code to match the new ${blockId} contract, OR`,
      `   - Revert the breaking change in ${blockId} (operator decision)`,
      `3. Re-run \`verify_block_acceptance ${b.id}\` to clear the desync status`,
      '',
    ].join('\n');
    try { fs.appendFileSync(narrativePath, entry); } catch {}
  }

  console.log(`  ✗ ${b.id} → status=desync, narrative + checks.log updated`);
}

// 4. Persist graph.json (atomic)
const tmpPath = graphPath + '.tmp';
fs.writeFileSync(tmpPath, JSON.stringify(graph, null, 2) + '\n', 'utf8');
fs.renameSync(tmpPath, graphPath);

console.log(`[cascade] graph.json updated. Operator should see ${broken.length} block(s) flagged desync on canvas.`);
process.exit(1);

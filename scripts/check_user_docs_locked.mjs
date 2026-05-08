#!/usr/bin/env node
// PR-4 (b.user-docs-generator): pre-commit / CI guard.
//
// Walks staged or working-tree changes to atlas/docs/end-user/*.md and
// warns when the operator hand-edited a tutorial whose meta has
// locked: false. Auto-generated tutorials are clobbered on next regen,
// so manual changes either need:
//   * meta.locked = true (preserves the edits forever)
//   * OR the change baked into mission.md / JSX so the regenerator
//     produces the same output
//
// Wiring (manual):
//   .git/hooks/pre-commit:
//     #!/bin/sh
//     node scripts/check_user_docs_locked.mjs --staged || exit 1
//
// CLI:
//   node scripts/check_user_docs_locked.mjs           # check working tree
//   node scripts/check_user_docs_locked.mjs --staged  # check staged diff
//   node scripts/check_user_docs_locked.mjs --json    # machine-readable
//
// Exit code:
//   0 — no manual edits OR all edits are on locked docs
//   1 — manual edits on unlocked docs (operator should lock or rebase)

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');
const DOCS_ROOT = path.join(ATLAS, 'docs', 'end-user');
const META_DIR = path.join(DOCS_ROOT, '_meta');

const argv = process.argv.slice(2);
const staged = argv.includes('--staged');
const json = argv.includes('--json');

function changedDocs() {
  // git diff --name-only [--cached] -- atlas/docs/end-user/*.md
  const args = ['diff', '--name-only', staged ? '--cached' : 'HEAD', '--', 'atlas/docs/end-user/'];
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) return [];
  return (r.stdout || '').split(/\r?\n/)
    .map((s) => s.trim()).filter(Boolean)
    .filter((p) => p.endsWith('.md') && !p.includes('/_'));
}

function metaFor(blockId) {
  const p = path.join(META_DIR, `${blockId}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

const violations = [];
const accepted = [];
for (const file of changedDocs()) {
  const blockId = path.basename(file, '.md');
  const meta = metaFor(blockId);
  if (!meta) {
    violations.push({ file, block_id: blockId, reason: 'no _meta entry — file is orphaned' });
    continue;
  }
  if (meta.locked === true) { accepted.push({ file, block_id: blockId, locked: true }); continue; }
  violations.push({
    file, block_id: blockId,
    reason: 'manual edit on unlocked doc — change will be reverted on next regen',
    fix: `Either set meta.locked=true via \`node scripts/regenerate_user_docs_drift.mjs lock ${blockId}\` (when MCP/CLI lands) OR bake the change into atlas/blocks/${blockId}/mission.md or JSX.`,
  });
}

if (json) {
  console.log(JSON.stringify({ violations, accepted, mode: staged ? 'staged' : 'working_tree' }, null, 2));
} else if (violations.length) {
  console.error('check_user_docs_locked: manual edits detected on UNLOCKED auto-generated docs:');
  for (const v of violations) {
    console.error(` ✗ ${v.file} — ${v.reason}`);
    if (v.fix) console.error(`   fix: ${v.fix}`);
  }
  console.error('');
  console.error('To bypass once: git commit --no-verify');
} else {
  console.log(`check_user_docs_locked: OK (${accepted.length} locked, 0 unlocked-edits)`);
}

process.exit(violations.length ? 1 : 0);

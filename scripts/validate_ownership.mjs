#!/usr/bin/env node
// R-8.10 (b.core-sync) — every code file has exactly one owning block.
//
// The code-graph check (validate_code_graph_vs_contracts) only sees imports
// between files some block owns. 58 scripts and tests had no owner, so their
// imports were never checked; assigning them surfaced three undeclared
// cross-block dependencies at once, one of which would have been a cycle
// (the HTTP facade importing a file its own consumer would have owned). Two
// more files had two live owners, so «which block is this?» had two answers.
//
// This check is what would have caught both, and keeps them from coming back:
//   * unowned  — a file in scope listed in no block's files.md as [alive]
//   * doubled  — a file listed [alive] by more than one block
// Both are errors (exit 1), each with the fix.
//
// Scope: scripts/**/*.mjs, tests/**/*.mjs, frontend/atlas_design/*
// (js/jsx/css/html), extensions/desktop/** (mjs/js/json, without
// node_modules and build output).
//
// Usage: node scripts/validate_ownership.mjs [--json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');
const asJson = process.argv.includes('--json');

const owners = new Map();
const blocksDir = path.join(ATLAS, 'blocks');
for (const b of fs.existsSync(blocksDir) ? fs.readdirSync(blocksDir) : []) {
  const f = path.join(blocksDir, b, 'files.md');
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*-\s+(\S+)\s+\[alive[^\]]*\]/);
    if (!m) continue;
    if (!owners.has(m[1])) owners.set(m[1], []);
    owners.get(m[1]).push(b);
  }
}

const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', 'release', '.git']);
function walk(dir, re) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) out.push(...walk(rel, re)); }
    else if (re.test(e.name)) out.push(rel);
  }
  return out;
}
const files = [
  ...walk('scripts', /\.mjs$/),
  ...walk('tests', /\.mjs$/),
  ...walk('frontend/atlas_design', /\.(jsx?|css|html)$/),
  ...walk('extensions/desktop', /\.(mjs|js|json)$/),
].sort();

const unowned = files.filter((f) => !owners.has(f));
const doubled = [...owners].filter(([, bs]) => bs.length > 1).map(([f, bs]) => ({ file: f, blocks: bs }));
const errors = [
  ...unowned.map((f) => ({ kind: 'unowned', file: f, fix: `add «- ${f} [alive] (what it does)» to the files.md of the block it belongs to; then run build_code_graph and validate_code_graph_vs_contracts — its imports become checked and may need a depends_on line` })),
  ...doubled.map((d) => ({ kind: 'doubled', file: d.file, blocks: d.blocks, fix: `keep it [alive] in one of ${d.blocks.join(', ')} — the one whose mission it serves — and drop the line from the others` })),
];

if (asJson) {
  console.log(JSON.stringify({ ok: errors.length === 0, checked: files.length, errors }, null, 2));
  process.exit(errors.length ? 1 : 0);
}
if (errors.length) {
  console.error(`validate_ownership: ${errors.length} error(s) over ${files.length} files`);
  for (const e of errors) console.error(` ✗ ${e.kind}: ${e.file}${e.blocks ? ` (${e.blocks.join(', ')})` : ''}\n     fix: ${e.fix}`);
  process.exit(1);
}
console.log(`validate_ownership: OK — ${files.length} files, each owned by exactly one block`);

#!/usr/bin/env node
// R-7.88 (S-12 MVP) — housekeeping sweeper.
//
// Walks the workspace, cross-references atlas/blocks/<id>/files.md across
// all blocks, and PROPOSES cleanups. Never auto-deletes, never auto-moves.
// Output is a markdown checklist + structured JSON the operator (or the
// `apply_cleanup_proposal` tool) can act on one item at a time.
//
// Three categories of proposals:
//
//   1. STALE-ALIVE     `files.md` says `[alive]` but file doesn't exist
//                       → propose to remove the entry (metadata-only fix)
//
//   2. STALE-DEAD/ARCHIVED  file marked `[dead]` or `[archived]` but still
//                       sits in original location
//                       → propose to MOVE to `archive/<status>/<block>/<filename>`
//                       with a breadcrumb file at the original path
//
//   3. ORPHAN-CODE     code file on disk, not claimed by any block,
//                       not referenced by name in any .md
//                       → propose to MOVE to `archive/orphans/<date>/<original-path>`
//                       with a breadcrumb. NEVER delete.
//
// SAFETY RAILS (operator's «don't delete TZ/refs/anything-future-needed»):
//
//   * NEVER touch:   docs/ · archive/ · references/ · .git/ · node_modules/
//                    test-results/ · atlas/llm_traces/ · atlas/run_logs/
//                    atlas/run_state/ · atlas/acceptance_runs/
//                    atlas/process_runs/ · atlas/eval_history/
//                    atlas/operator_profile/ · atlas/proposals/
//                    atlas/context_packs/
//   * NEVER touch:   ANY .md / .txt / .svg / .png / .pdf inside atlas/
//                    (these are contracts, TZ, references, screenshots)
//   * NEVER touch:   architecture_decisions.md · narrative.md · decisions.log
//                    lessons.json · dont_use.json · always_use.json
//   * NEVER touch:   files referenced BY NAME (basename) in any .md inside
//                    atlas/ or docs/ — this catches «file is described in TZ /
//                    user-doc / mission, even if not in files.md»
//   * NEVER touch:   files belonging to a block whose status is not `done`
//                    (idea / todo / progress / wip / review / desync / broken
//                    blocks may still need their files for upcoming work)
//   * NEVER touch:   well-known top-level files (README.md, LICENSE, package.json,
//                    .gitignore, CHANGELOG.md, SECURITY.md, etc.)
//   * NEVER delete:  even when proposing «move», the apply tool MOVES
//                    (with breadcrumb), never `rm`
//
// Usage:
//   node scripts/housekeeping_sweeper.mjs                       (write proposals)
//   node scripts/housekeeping_sweeper.mjs --json                (machine output)
//   node scripts/housekeeping_sweeper.mjs --root <path>         (other repo)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SCRIPT_ROOT = path.resolve(path.dirname(__filename), '..');

const args = process.argv.slice(2);
const arg = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt; };
const ROOT = path.resolve(arg('--root', SCRIPT_ROOT));
const ATLAS = path.join(ROOT, 'atlas');
const JSON_OUT = args.includes('--json');

// ─────────────────────────────────────── safety: directories never to touch
const FOREVER_SKIP_DIRS = [
  'docs', 'archive', 'references', '.git', '.github',
  'node_modules', 'test-results', '.tmp',
  'atlas/llm_traces', 'atlas/run_logs', 'atlas/run_state',
  'atlas/acceptance_runs', 'atlas/process_runs', 'atlas/eval_history',
  'atlas/operator_profile', 'atlas/proposals', 'atlas/context_packs',
  'atlas/artifacts', 'atlas/architecture_reviews', 'atlas/ingestion_scratch',
];

// ─────────────────────────────────────── well-known untouchable files
const FOREVER_SKIP_FILES = new Set([
  'README.md', 'README.ru.md', 'LICENSE', 'package.json', 'package-lock.json',
  '.gitignore', '.mcp.json', 'CHANGELOG.md', 'SECURITY.md', 'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md', 'AGENTS.md', 'CLAUDE.md',
  // Defensive: never propose to touch the cleanup tooling itself
  'scripts/housekeeping_sweeper.mjs',
  'scripts/apply_cleanup_proposal.mjs',
]);

// ─────────────────────────────────────── never touch certain extensions inside atlas/
const ATLAS_PROTECTED_EXT = new Set(['.md', '.txt', '.svg', '.png', '.pdf', '.jpg', '.jpeg', '.gif']);

function isInSkipDir(relPath) {
  return FOREVER_SKIP_DIRS.some((d) => relPath === d || relPath.startsWith(d + '/'));
}

function isAtlasProtectedAsset(relPath) {
  if (!relPath.startsWith('atlas/')) return false;
  const ext = path.extname(relPath).toLowerCase();
  return ATLAS_PROTECTED_EXT.has(ext);
}

function isWellKnownUntouchable(relPath) {
  return FOREVER_SKIP_FILES.has(relPath);
}

// ─────────────────────────────────────── load graph + per-block files.md
function safeReadJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function safeRead(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function loadGraph() {
  const graph = safeReadJson(path.join(ATLAS, 'graph.json')) || { blocks: [] };
  return graph.blocks || [];
}

// Parse files.md lines like:
//   - scripts/foo.mjs [alive]
//   - frontend/old.jsx [archived] (replaced in R-7.30)
//   - tests/legacy.test.mjs [dead] (broken since R-5)
function parseFilesMd(content) {
  const out = [];
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith('- ')) continue;
    const m = line.match(/^-\s+(\S.*?)\s+\[(alive|archived|dead|pending)\](?:\s*\((.*)\))?\s*$/i);
    if (!m) continue;
    out.push({ path: m[1].trim(), status: m[2].toLowerCase(), reason: (m[3] || '').trim() });
  }
  return out;
}

function loadAllBlockFiles(blocks) {
  // Returns Map<filePath, { block_id, status, reason }>
  // (one file may be claimed by multiple blocks — last write wins; rare)
  const map = new Map();
  for (const b of blocks) {
    const fp = path.join(ATLAS, 'blocks', b.id, 'files.md');
    if (!fs.existsSync(fp)) continue;
    const entries = parseFilesMd(fs.readFileSync(fp, 'utf8'));
    for (const e of entries) {
      map.set(e.path, { block_id: b.id, block_status: b.status, status: e.status, reason: e.reason });
    }
  }
  return map;
}

// ─────────────────────────────────────── find filename references in any text file
// «TZ-awareness»: file referenced by name in any text file is presumed to be
// known/needed and must not be touched, even if it's orphan from files.md POV.
// We scan a broad set of text extensions so HTML <script src="">, JS imports,
// package.json scripts, mermaid diagrams in WIKI, etc. all count as references.
const SCAN_EXTENSIONS = new Set([
  '.md', '.txt', '.html', '.htm', '.json', '.jsonc',
  '.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx',
  '.css', '.scss', '.yml', '.yaml', '.toml', '.cfg', '.ini',
  '.sh', '.py',
]);

function buildReferencedSet() {
  const refs = new Set();
  walkAndScan(ROOT, (filePath) => {
    const rel = path.relative(ROOT, filePath);
    if (isInSkipDir(rel)) return;
    const ext = path.extname(filePath).toLowerCase();
    if (!SCAN_EXTENSIONS.has(ext)) return;
    const text = safeRead(filePath);
    if (!text) return;
    // crude but effective: any token with at least one dot and 2-5 letter ext
    // — catches import paths, <script src=>, package.json scripts, mermaid
    // node labels, markdown filename mentions, etc.
    const matches = text.match(/[A-Za-z0-9_\-./]+\.[A-Za-z]{1,5}/g) || [];
    for (const m of matches) {
      refs.add(path.basename(m));
      refs.add(m); // also full path mention
    }
  });
  return refs;
}

function walkAndScan(dir, cb) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    if (isInSkipDir(rel)) continue;
    if (entry.isDirectory()) walkAndScan(full, cb);
    else cb(full);
  }
}

// ─────────────────────────────────────── enumerate workspace files (filtered)
function enumerateWorkspaceFiles() {
  const out = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(ROOT, full);
      if (isInSkipDir(rel)) continue;
      if (entry.isDirectory()) walk(full);
      else out.push(rel);
    }
  }
  walk(ROOT);
  return out;
}

// ─────────────────────────────────────── compose proposals
function computeProposals() {
  const blocks = loadGraph();
  const blockMap = new Map(blocks.map((b) => [b.id, b]));
  const claimedFiles = loadAllBlockFiles(blocks); // Map<path, claim>
  const refs = buildReferencedSet();
  const proposals = [];

  // ── (1) stale-alive entries
  for (const [filePath, claim] of claimedFiles) {
    if (claim.status !== 'alive') continue;
    const absPath = path.join(ROOT, filePath);
    if (fs.existsSync(absPath)) continue;
    // file gone, [alive] entry stale → safe to clean (metadata only)
    proposals.push({
      id: `stale-alive::${claim.block_id}::${filePath}`,
      kind: 'stale-alive',
      file: filePath,
      block: claim.block_id,
      block_status: claim.block_status,
      reason: 'file does not exist on disk; entry in files.md is stale',
      action: 'remove-entry-from-files-md',
      safety: 'safe-metadata-only',
      apply_command: `node scripts/apply_cleanup_proposal.mjs --id "stale-alive::${claim.block_id}::${filePath}"`,
    });
  }

  // ── (2) stale-dead / stale-archived  (file is on disk but registry says dead/archived)
  for (const [filePath, claim] of claimedFiles) {
    if (claim.status !== 'dead' && claim.status !== 'archived') continue;
    const absPath = path.join(ROOT, filePath);
    if (!fs.existsSync(absPath)) continue;
    // file is on disk but tagged dead/archived
    // safety: if anything in atlas/ or docs/ still references it by name → skip
    const baseName = path.basename(filePath);
    if (refs.has(baseName) || refs.has(filePath)) {
      // referenced somewhere — leave it alone (operator's «может быть нужно для будущего ТЗ»)
      continue;
    }
    proposals.push({
      id: `stale-${claim.status}::${claim.block_id}::${filePath}`,
      kind: `stale-${claim.status}`,
      file: filePath,
      block: claim.block_id,
      block_status: claim.block_status,
      reason: `marked [${claim.status}] in files.md but still on disk; ${claim.reason || 'no reason given'}`,
      action: `move-to-archive/${claim.status}/${claim.block_id}/`,
      safety: 'move-with-breadcrumb',
      apply_command: `node scripts/apply_cleanup_proposal.mjs --id "stale-${claim.status}::${claim.block_id}::${filePath}"`,
    });
  }

  // ── (3) orphan code files (on disk, not claimed by any block, not referenced)
  // Scope: only look at scripts/, frontend/, tests/, extensions/. Skip everything else.
  const ORPHAN_SCAN_PREFIXES = ['scripts/', 'frontend/', 'tests/', 'extensions/'];
  const ORPHAN_CODE_EXT = new Set(['.mjs', '.js', '.jsx', '.ts', '.tsx', '.css', '.html']);
  for (const rel of enumerateWorkspaceFiles()) {
    if (isWellKnownUntouchable(rel)) continue;
    if (isAtlasProtectedAsset(rel)) continue;
    if (!ORPHAN_SCAN_PREFIXES.some((p) => rel.startsWith(p))) continue;
    const ext = path.extname(rel).toLowerCase();
    if (!ORPHAN_CODE_EXT.has(ext)) continue;
    if (claimedFiles.has(rel)) continue; // claimed by a block
    const baseName = path.basename(rel);
    if (refs.has(baseName) || refs.has(rel)) continue; // referenced in TZ/docs

    // Only propose move; don't classify owning-block (orphan = no block)
    proposals.push({
      id: `orphan::${rel}`,
      kind: 'orphan-code',
      file: rel,
      block: null,
      block_status: null,
      reason: 'on disk, no block claims it in files.md, no .md references its name — possibly cleanable',
      action: `move-to-archive/orphans/<date>/${rel}`,
      safety: 'move-with-breadcrumb',
      apply_command: `node scripts/apply_cleanup_proposal.mjs --id "orphan::${rel}"`,
    });
  }

  // ── (4) dead-code by IMPORT GRAPH (S-12 follow-up) ─────────────────────
  // More precise than orphan-code: a file can be MENTIONED in a comment (so
  // orphan-code skips it) yet never actually imported — truly dead. We build
  // the real import graph (import/require/from + <script src>) and flag code
  // files that NOTHING imports AND that are not entry points (CLI scripts,
  // HTML, package.json). Conservative on purpose: any `scripts/*.mjs` with a
  // shebang or invoked as `node scripts/X` somewhere is a CLI entry point,
  // never dead.
  const { importedTargets, entryPoints } = buildImportGraph();
  for (const rel of enumerateWorkspaceFiles()) {
    if (isWellKnownUntouchable(rel)) continue;
    if (isAtlasProtectedAsset(rel)) continue;
    if (!ORPHAN_SCAN_PREFIXES.some((p) => rel.startsWith(p))) continue;
    const ext = path.extname(rel).toLowerCase();
    if (!new Set(['.mjs', '.js', '.jsx', '.ts', '.tsx']).has(ext)) continue; // only modules
    if (claimedFiles.has(rel)) continue;          // a block owns it (alive)
    if (importedTargets.has(rel)) continue;        // something imports it
    if (entryPoints.has(rel)) continue;            // CLI / HTML / package entry
    // belt-and-suspenders: still skip anything an orphan-code proposal already covers
    if (proposals.some((p) => p.file === rel)) continue;
    proposals.push({
      id: `dead-code::${rel}`,
      kind: 'dead-code-unimported',
      file: rel,
      block: null,
      block_status: null,
      reason: 'no file imports it (import-graph), not a CLI/HTML/package entry point, no block claims it — likely dead code',
      action: `move-to-archive/dead-code/<date>/${rel}`,
      safety: 'move-with-breadcrumb',
      apply_command: `node scripts/apply_cleanup_proposal.mjs --id "dead-code::${rel}"`,
    });
  }

  return { generated_at: new Date().toISOString(), root: ROOT, proposals, summary: summarize(proposals) };
}

// Build { importedTargets:Set<relPath>, entryPoints:Set<relPath> } from the
// real import graph across the repo.
function buildImportGraph() {
  const importedTargets = new Set();
  const entryPoints = new Set();
  const codeFiles = [];
  walkAndScan(ROOT, (filePath) => {
    const rel = path.relative(ROOT, filePath);
    if (isInSkipDir(rel)) return;
    const ext = path.extname(filePath).toLowerCase();
    if (!['.mjs', '.js', '.jsx', '.ts', '.tsx', '.html', '.htm', '.json', '.md'].includes(ext)) return;
    const text = safeRead(filePath);
    if (!text) return;

    // 1. entry points: shebang scripts, HTML files, test-runner files
    if (['.html', '.htm'].includes(ext)) entryPoints.add(rel);
    if (/^#!.*node/.test(text)) entryPoints.add(rel);                 // CLI script
    // test-runner files are entry points (run by node/playwright/jest, never imported)
    if (/\.(spec|test|selftest|smoke|eval)\.[a-z]+$/.test(rel)) entryPoints.add(rel);

    // 1b. package.json (any, incl. nested like extensions/vscode/) declares
    //     main / bin / module — those files are entry points.
    if (path.basename(rel) === 'package.json') {
      try {
        const pkg = JSON.parse(text);
        const pkgDir = path.dirname(filePath);
        const addRel = (v) => { if (typeof v === 'string') entryPoints.add(path.relative(ROOT, path.resolve(pkgDir, v))); };
        addRel(pkg.main); addRel(pkg.module);
        if (pkg.bin && typeof pkg.bin === 'object') Object.values(pkg.bin).forEach(addRel);
        else addRel(pkg.bin);
      } catch {}
    }

    // 2. anything invoked as `node <path>` or `playwright test <path>` is an entry point
    for (const m of text.match(/(?:node|playwright test)\s+((?:scripts|tests|frontend|extensions)\/[A-Za-z0-9_\-./]+\.(?:mjs|js|jsx|ts|tsx))/g) || []) {
      entryPoints.add(m.replace(/^(?:node|playwright test)\s+/, '').trim());
    }

    // 3. import targets: import/require/from + <script src>
    if (['.mjs', '.js', '.jsx', '.ts', '.tsx'].includes(ext)) codeFiles.push({ rel, dir: path.dirname(filePath), text });
    for (const m of text.match(/<script[^>]+src=["']([^"']+)["']/g) || []) {
      const src = (m.match(/src=["']([^"']+)["']/) || [])[1] || '';
      const clean = src.split('?')[0].replace(/^\.?\//, '');
      // resolve relative to the HTML file's dir
      const resolved = path.relative(ROOT, path.resolve(path.dirname(filePath), clean));
      if (resolved) importedTargets.add(resolved);
    }
  });

  // resolve relative imports in code files to real paths
  const resolveImport = (fromDir, spec) => {
    if (!spec.startsWith('.')) return null; // bare/npm import — not a local file
    const base = path.resolve(fromDir, spec);
    const cands = [base, base + '.mjs', base + '.js', base + '.jsx', base + '.ts', base + '.tsx',
      path.join(base, 'index.mjs'), path.join(base, 'index.js')];
    for (const c of cands) { if (fs.existsSync(c) && fs.statSync(c).isFile()) return path.relative(ROOT, c); }
    return null;
  };
  for (const { dir, text } of codeFiles) {
    const specs = [];
    for (const m of text.match(/(?:import[^'"]*from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g) || []) {
      const s = (m.match(/['"]([^'"]+)['"]/) || [])[1];
      if (s) specs.push(s);
    }
    for (const s of specs) { const r = resolveImport(dir, s); if (r) importedTargets.add(r); }
  }
  return { importedTargets, entryPoints };
}

function summarize(proposals) {
  const by = { 'stale-alive': 0, 'stale-dead': 0, 'stale-archived': 0, 'orphan-code': 0, 'dead-code-unimported': 0 };
  for (const p of proposals) by[p.kind] = (by[p.kind] || 0) + 1;
  return by;
}

// ─────────────────────────────────────── output
function renderMarkdown(result) {
  const lines = [
    '# Cleanup proposals',
    '',
    `_Generated: ${result.generated_at}_  ·  _root: \`${path.relative(process.cwd(), result.root) || '.'}\`_`,
    '',
    'Pure proposals — **nothing is applied automatically**. Each item below has',
    'an apply-command. The apply tool MOVES files (with breadcrumb), never deletes.',
    'Files referenced by name in any `.md` inside `atlas/` or `docs/` are skipped',
    'on principle (operator: «может пригодиться для будущего ТЗ»).',
    '',
    `**Summary:** ${Object.entries(result.summary).map(([k, v]) => `${k}: ${v}`).join(' · ')}`,
    '',
  ];
  if (result.proposals.length === 0) {
    lines.push('_No proposals — workspace is clean._');
  } else {
    const grouped = {};
    for (const p of result.proposals) (grouped[p.kind] = grouped[p.kind] || []).push(p);
    for (const [kind, list] of Object.entries(grouped)) {
      lines.push(`## ${kind} (${list.length})`);
      lines.push('');
      for (const p of list) {
        lines.push(`- \`${p.file}\``);
        if (p.block) lines.push(`  - block: \`${p.block}\` (${p.block_status})`);
        lines.push(`  - reason: ${p.reason}`);
        lines.push(`  - action: ${p.action}`);
        lines.push(`  - apply: \`${p.apply_command}\``);
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

const result = computeProposals();
if (JSON_OUT) {
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} else {
  const md = renderMarkdown(result);
  const outPath = path.join(ATLAS, 'cleanup_proposals.md');
  fs.writeFileSync(outPath, md + '\n', 'utf8');
  // Also store machine version for the apply tool to consume.
  fs.writeFileSync(path.join(ATLAS, 'cleanup_proposals.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(`housekeeping_sweeper: ${result.proposals.length} proposal(s) — see ${path.relative(process.cwd(), outPath)}`);
  if (result.proposals.length > 0) {
    console.log(`  by kind: ${Object.entries(result.summary).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
  }
}

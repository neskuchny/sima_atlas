#!/usr/bin/env node
// R-7.99 (b.code-graph PR1) — deterministic imports/exports map for every
// alive .mjs/.js/.jsx file in the repo, grouped by owning block.
//
// Output: atlas/code_graph.json (sorted keys, POSIX paths). The artefact is
// consumed by b.core-sync (real-code drift detection), and by anyone who
// needs to know «who imports whom» without re-parsing files.
//
// Why pure-Node (no tree-sitter): our entire codebase is JS/JSX, and
// import/export statements have a stable, tractable syntax. A 100 MB native
// binding would violate dont_use/lightweight-by-default. Pluggable backend
// reserved for when non-JS files appear in files.md.
//
// Usage:
//   node scripts/build_code_graph.mjs          # writes atlas/code_graph.json
//   node scripts/build_code_graph.mjs --json   # print to stdout, no file write
//   node scripts/build_code_graph.mjs --check  # exit 1 if file would change
//                                              # (deterministic-rebuild gate)
//
// Library API:
//   import { extractModule, buildGraph } from './build_code_graph.mjs';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');

const SUPPORTED_EXT = new Set(['.mjs', '.js', '.jsx']);

// ── extractor ─────────────────────────────────────────────────────────────
// Strips //-line and /* */-block comments only. Earlier version also blanked
// string contents to avoid matching `import X from 'Y'` inside a literal,
// but that defeated the import-path regex (the path is itself a string
// literal) — every import came out with a blank `from`. Comments alone are
// the realistic source of false-positives; the rare in-string import-shaped
// substring (only in our own docs / templates) is acceptable noise.
function stripCommentsAndStrings(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c2 = src.slice(i, i + 2);
    if (c2 === '//') {
      const nl = src.indexOf('\n', i);
      if (nl < 0) { out += '\n'.repeat(0); break; }
      // Preserve the newline so line numbers stay correct.
      out += ' '.repeat(nl - i) + '\n';
      i = nl + 1;
      continue;
    }
    if (c2 === '/*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) { for (let k = i; k < n; k++) out += src[k] === '\n' ? '\n' : ' '; i = n; break; }
      for (let k = i; k < end + 2; k++) out += src[k] === '\n' ? '\n' : ' ';
      i = end + 2;
      continue;
    }
    out += src[i];
    i += 1;
  }
  return out;
}

// Returns 1-indexed line number for byte offset `off` in `src` (original).
function lineOf(src, off) {
  let line = 1;
  for (let i = 0; i < off && i < src.length; i++) if (src[i] === '\n') line += 1;
  return line;
}

const STATIC_IMPORT_RE = /\bimport\b(?:\s+([^'"\n;]+?))?\s+from\s*['"]([^'"\n]+)['"]/g;
const SIDE_EFFECT_IMPORT_RE = /\bimport\s*['"]([^'"\n]+)['"]/g;
const DYNAMIC_IMPORT_RE = /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;
const REEXPORT_RE = /\bexport\b[^'"\n;]*?from\s*['"]([^'"\n]+)['"]/g;

const NAMED_EXPORT_RE = /\bexport\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
const NAMED_LIST_EXPORT_RE = /\bexport\s*\{\s*([^}]+)\}/g;
const DEFAULT_EXPORT_RE = /\bexport\s+default\b/g;

function parseImportSpecifiers(clause) {
  // clause is whatever sits between `import` and `from`, e.g.
  //   `X`             default
  //   `{ a, b as c }` named
  //   `* as N`        namespace
  //   `X, { a }`      default + named
  // Returns sorted array of {kind, name, alias?}
  if (!clause) return [];
  const specs = [];
  const c = clause.trim();
  // namespace
  const ns = c.match(/\*\s*as\s+([A-Za-z_$][\w$]*)/);
  if (ns) specs.push({ kind: 'namespace', name: ns[1] });
  // named list
  const named = c.match(/\{([^}]*)\}/);
  if (named) {
    for (const part of named[1].split(',')) {
      const p = part.trim();
      if (!p) continue;
      const m = p.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (m) specs.push({ kind: 'named', name: m[1], ...(m[2] ? { alias: m[2] } : {}) });
    }
  }
  // default — the bare identifier at the start, not inside {}
  const dflt = c.replace(/\{[^}]*\}/, '').replace(/\*\s*as\s+[A-Za-z_$][\w$]*/, '').split(',')[0].trim();
  if (dflt && /^[A-Za-z_$][\w$]*$/.test(dflt)) specs.unshift({ kind: 'default', name: dflt });
  return specs.sort((a, b) => (a.kind + a.name).localeCompare(b.kind + b.name));
}

function resolveImport(fromAbs, spec) {
  // Relative paths get resolved against the importing file's dir + extension
  // fallbacks (.mjs > .js > .jsx > /index.mjs > /index.js).
  if (!spec.startsWith('.') && !spec.startsWith('/')) {
    return { external: true, resolved_to: null, raw: spec };
  }
  const baseDir = path.dirname(fromAbs);
  const cand = path.resolve(baseDir, spec);
  const tries = [
    cand,
    cand + '.mjs', cand + '.js', cand + '.jsx',
    path.join(cand, 'index.mjs'), path.join(cand, 'index.js'), path.join(cand, 'index.jsx'),
  ];
  for (const t of tries) {
    if (fs.existsSync(t) && fs.statSync(t).isFile()) {
      return { external: false, resolved_to: posixRel(t), raw: spec };
    }
  }
  // Relative but unresolved — possible non-JS asset (.css/.svg). Mark
  // external=false but resolved_to=null so callers can distinguish from
  // package imports.
  return { external: false, resolved_to: null, raw: spec };
}

function posixRel(abs) {
  return path.relative(ROOT, abs).split(path.sep).join('/');
}

export function extractModule(filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(ROOT, filePath);
  const src = fs.readFileSync(abs, 'utf8');
  const clean = stripCommentsAndStrings(src);

  const imports = [];
  const exports_ = [];
  const seen = new Set();

  const addImport = (clause, spec, off, kind) => {
    const resolved = resolveImport(abs, spec);
    const key = `${kind}|${spec}|${off}`;
    if (seen.has(key)) return;
    seen.add(key);
    imports.push({
      kind,                            // 'static' | 'dynamic' | 'reexport' | 'side_effect'
      from: spec,
      external: resolved.external,
      resolved_to: resolved.resolved_to,
      line: lineOf(src, off),
      specifiers: parseImportSpecifiers(clause),
    });
  };

  let m;
  STATIC_IMPORT_RE.lastIndex = 0;
  while ((m = STATIC_IMPORT_RE.exec(clean))) addImport(m[1], m[2], m.index, 'static');
  SIDE_EFFECT_IMPORT_RE.lastIndex = 0;
  while ((m = SIDE_EFFECT_IMPORT_RE.exec(clean))) {
    // Skip if the side-effect regex matched something that was actually
    // a static import (which also matches `import 'x'` at the start).
    const offset = m.index;
    const tail = clean.slice(offset, offset + 200);
    if (/\bfrom\s*['"]/.test(tail)) continue;
    if (/\bimport\s*\(/.test(tail.slice(0, m[0].length + 1))) continue;
    addImport(null, m[1], offset, 'side_effect');
  }
  DYNAMIC_IMPORT_RE.lastIndex = 0;
  while ((m = DYNAMIC_IMPORT_RE.exec(clean))) addImport(null, m[1], m.index, 'dynamic');
  REEXPORT_RE.lastIndex = 0;
  while ((m = REEXPORT_RE.exec(clean))) addImport(null, m[1], m.index, 'reexport');

  NAMED_EXPORT_RE.lastIndex = 0;
  while ((m = NAMED_EXPORT_RE.exec(clean))) {
    exports_.push({ kind: 'named', name: m[1], line: lineOf(src, m.index) });
  }
  NAMED_LIST_EXPORT_RE.lastIndex = 0;
  while ((m = NAMED_LIST_EXPORT_RE.exec(clean))) {
    for (const part of m[1].split(',')) {
      const p = part.trim();
      if (!p) continue;
      const mm = p.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (mm) exports_.push({ kind: 'named', name: mm[2] || mm[1], line: lineOf(src, m.index) });
    }
  }
  DEFAULT_EXPORT_RE.lastIndex = 0;
  while ((m = DEFAULT_EXPORT_RE.exec(clean))) {
    exports_.push({ kind: 'default', name: 'default', line: lineOf(src, m.index) });
  }

  // Sort for determinism.
  imports.sort((a, b) => `${a.line}-${a.kind}-${a.from}`.localeCompare(`${b.line}-${b.kind}-${b.from}`));
  exports_.sort((a, b) => `${a.line}-${a.kind}-${a.name}`.localeCompare(`${b.line}-${b.kind}-${b.name}`));
  return { imports, exports: exports_ };
}

// ── graph builder ─────────────────────────────────────────────────────────

function readAliveFiles(blockDir) {
  const p = path.join(blockDir, 'files.md');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split(/\r?\n/)
    .filter((l) => /^\s*-\s/.test(l) && /\[alive\]/.test(l))
    .map((l) => l.replace(/^\s*-\s+/, '').split(/\s+\[alive\]/)[0].trim())
    .filter(Boolean);
}

export function buildGraph({ atlasRoot } = {}) {
  const atlas = atlasRoot || ATLAS;
  const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));
  const blocks = (graph.blocks || []).filter((b) => b.status !== 'archived');

  // file → block map (a file usually lives in one block; if multiple
  // declare it, last wins — but we surface a warning).
  const fileToBlock = {};
  const ownerWarnings = [];
  const byBlock = {};

  for (const b of blocks) {
    byBlock[b.id] = { files: [] };
    const declared = readAliveFiles(path.join(atlas, 'blocks', b.id));
    for (const f of declared) {
      if (!SUPPORTED_EXT.has(path.extname(f))) continue;
      const norm = f.split(path.sep).join('/');
      if (fileToBlock[norm] && fileToBlock[norm] !== b.id) {
        ownerWarnings.push({ file: norm, claimed_by: [fileToBlock[norm], b.id] });
      }
      fileToBlock[norm] = b.id;
    }
  }

  // Walk files in deterministic order, extract per-file, accumulate edges.
  const filePaths = Object.keys(fileToBlock).sort();
  const files = {};
  const edgesMap = new Map(); // key: "from->to" → { from_block, to_block, examples:[{file, line, kind}] }

  for (const f of filePaths) {
    const abs = path.join(ROOT, f);
    if (!fs.existsSync(abs)) {
      // Declared in files.md but missing on disk — record but don't crash.
      files[f] = { imports: [], exports: [], owning_block: fileToBlock[f], missing_on_disk: true };
      byBlock[fileToBlock[f]].files.push(f);
      continue;
    }
    const ext = extractModule(abs);
    files[f] = { ...ext, owning_block: fileToBlock[f] };
    byBlock[fileToBlock[f]].files.push(f);

    for (const imp of ext.imports) {
      if (imp.external || !imp.resolved_to) continue;
      const targetOwner = fileToBlock[imp.resolved_to];
      if (!targetOwner) continue; // imported file isn't owned by any block (e.g. a node_modules-adjacent path)
      if (targetOwner === fileToBlock[f]) continue; // intra-block import — not an edge
      const key = `${fileToBlock[f]}->${targetOwner}`;
      if (!edgesMap.has(key)) {
        edgesMap.set(key, { from_block: fileToBlock[f], to_block: targetOwner, examples: [] });
      }
      const e = edgesMap.get(key);
      // Cap examples so the artefact stays small.
      if (e.examples.length < 8) {
        e.examples.push({ from_file: f, line: imp.line, kind: imp.kind, to_file: imp.resolved_to });
      }
    }
  }

  // Sort by_block files + edges deterministically.
  for (const k of Object.keys(byBlock)) byBlock[k].files.sort();
  const edges = [...edgesMap.values()].sort((a, b) => `${a.from_block}->${a.to_block}`.localeCompare(`${b.from_block}->${b.to_block}`));

  return {
    generated_at: new Date().toISOString(),
    backend: 'pure-node-esm-v1',
    supported_extensions: [...SUPPORTED_EXT].sort(),
    by_block: byBlock,
    edges,
    files,
    owner_warnings: ownerWarnings,
  };
}

// Stable JSON: sort all object keys deterministically (skip arrays).
function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep(value[k]);
    return out;
  }
  return value;
}

// ── CLI ───────────────────────────────────────────────────────────────────

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const print = argv.includes('--json');
  const check = argv.includes('--check');
  const out = sortKeysDeep(buildGraph());
  // Strip generated_at for determinism comparisons — its presence still
  // documents freshness, but the --check / sha256 paths exclude it.
  const stable = { ...out };
  delete stable.generated_at;

  const text = JSON.stringify(stable, null, 2) + '\n';
  const target = path.join(ATLAS, 'code_graph.json');

  if (print) {
    process.stdout.write(text);
    process.exit(0);
  }
  if (check) {
    const existing = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    if (existing.trim() === text.trim()) {
      console.log('build_code_graph --check: code_graph.json up-to-date');
      process.exit(0);
    }
    console.error('build_code_graph --check: code_graph.json would change. Rebuild & commit.');
    process.exit(1);
  }
  fs.writeFileSync(target, text, 'utf8');
  const fileCount = Object.keys(out.files).length;
  const edgeCount = out.edges.length;
  console.log(`build_code_graph: wrote atlas/code_graph.json (${fileCount} files, ${edgeCount} cross-block edges)`);
}

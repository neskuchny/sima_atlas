#!/usr/bin/env node
// R-7.99 (b.code-graph PR2) — code graph ↔ contract drift detector.
//
// Two detectors, both deterministic:
//
//   1. undeclared_code_dependency
//      File f in block A imports a symbol from file g, where g is owned by
//      block B != A, and A's depends_on.md does NOT list B. Drift record
//      pins the exact import (file + line + target file).
//
//   2. provided_capability_not_exported
//      Block A's provides.md lists capability X, but no file owned by A
//      exports any symbol named X (default export name 'default' does not
//      count). Drift record names the capability and the scanned files.
//
//   3. undeclared_runtime_call / stale_runtime_call / unknown_call_target
//      (R-8.15) — a block starts another block's script or calls its HTTP
//      routes while it works, and calls.md does not say so; or calls.md
//      declares a call no code makes (R-8.17: a line is confirmed by a start,
//      an HTTP call, or the other block's atlas data the code touches); or
//      names a block that does not exist.
//      A runtime call is not a dependency (depends_on.md orders building and
//      must stay acyclic), so it has its own contract file. Found the way the
//      code map finds them (scripts/atlas_map.mjs: string literals in launch
//      calls and argument arrays, server routes) — a heuristic, hence a
//      warning, not an error.
//
//   4. undeclared_data_link (R-8.16) — a block reads or writes an atlas file
//      another block owns (files.md lists it there, it lies in the block
//      store, or only that block writes it), and neither depends_on.md nor
//      calls.md names the other block. Found the way the code map finds them
//      (string literals naming atlas files) — a heuristic, hence a warning.
//
// Reads atlas/code_graph.json (built by build_code_graph.mjs). On a clean
// tree exits 0 with «OK». On drift exits 1 and emits a structured report
// AND merges findings into atlas/sync_report.json under `codeGraphDrift`
// (preserves earlier keys: contractValidation, stackMismatch).
//
// CLI:
//   node scripts/validate_code_graph_vs_contracts.mjs           # nightly mode
//   node scripts/validate_code_graph_vs_contracts.mjs --json    # machine-readable
//   node scripts/validate_code_graph_vs_contracts.mjs --silent  # exit-code only
//   node scripts/validate_code_graph_vs_contracts.mjs --runtime-calls  # R-8.15: calls.md vs code
//   node scripts/validate_code_graph_vs_contracts.mjs --data-links     # R-8.16: atlas files other blocks own

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCodeMap, readCalls } from './atlas_map.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ATLAS = path.join(ROOT, 'atlas');

function readSafe(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function readDeps(atlasRoot, blockId) {
  return readSafe(path.join(atlasRoot, 'blocks', blockId, 'depends_on.md')).split(/\r?\n/)
    .filter((l) => l.trim().startsWith('- '))
    .map((l) => l.slice(2).split(':')[0].trim())
    .filter((d) => d && d !== 'none');
}
function readProvides(atlasRoot, blockId) {
  return readSafe(path.join(atlasRoot, 'blocks', blockId, 'provides.md')).split(/\r?\n/)
    .filter((l) => l.trim().startsWith('- '))
    .map((l) => l.slice(2).split(':')[0].trim())
    .filter(Boolean);
}

function detectUndeclaredCodeDependency(graph, atlasRoot) {
  const drifts = [];
  // Build a per-block depends_on lookup once.
  const blocks = Object.keys(graph.by_block);
  const depsOf = Object.fromEntries(blocks.map((id) => [id, new Set(readDeps(atlasRoot, id))]));

  for (const edge of graph.edges) {
    const declared = depsOf[edge.from_block];
    if (!declared || declared.has(edge.to_block)) continue;
    drifts.push({
      kind: 'undeclared_code_dependency',
      severity: 'error', // real bug: the code knows something the contract doesn't
      block: edge.from_block,
      imports_from_block: edge.to_block,
      examples: edge.examples,
      hint: `Either add «- ${edge.to_block}: <capability>» to atlas/blocks/${edge.from_block}/depends_on.md, or remove the import.`,
    });
  }
  return drifts.sort((a, b) => `${a.block}->${a.imports_from_block}`.localeCompare(`${b.block}->${b.imports_from_block}`));
}

// A capability is only flag-worthy if it LOOKS like a code symbol the
// block is supposed to export. In Sima Atlas semantics, `provides`
// also covers non-code artefacts (sync_report → a JSON file;
// atlas_state_store → a markdown-DB concept; wiki_bundle → generated docs);
// flagging those as «not exported» drowns the real signal.
//
// Scope MVP to capabilities that:
//   1. Have a JS-identifier shape (`^[a-z][a-zA-Z0-9_]*$`) — `sync_report`
//      still matches, but `sync_report` ALSO appears in source as a
//      filename reference, so rule 3 saves it. Multi-word annotation
//      capabilities («agent_routing_hint (для …)») are skipped — anything
//      with a space or paren is non-code by intent.
//   2. The block has at least one supported-extension code file.
//   3. The capability name does NOT appear as either an export name OR
//      anywhere in any of the block's file sources (an unexported helper
//      that references the capability name in a JSON key / log tag counts).
//
// Tighter rules can come in PR3; for now KPI-6 (zero FP on clean tree)
// is the bar.
function detectProvidedCapabilityNotExported(graph, atlasRoot, sourceRoot) {
  const drifts = [];
  const IDENT = /^[a-z][a-zA-Z0-9_]*$/;
  const sourceCache = new Map(); // file → source string
  const sourceOf = (f) => {
    if (!sourceCache.has(f)) {
      try { sourceCache.set(f, fs.readFileSync(path.join(sourceRoot, f), 'utf8')); }
      catch { sourceCache.set(f, ''); }
    }
    return sourceCache.get(f);
  };

  for (const [blockId, info] of Object.entries(graph.by_block)) {
    if (!info.files.length) continue;
    const provides = readProvides(atlasRoot, blockId).filter((c) => c !== 'none' && IDENT.test(c));
    if (!provides.length) continue;
    const exportedNames = new Set();
    for (const f of info.files) {
      const fInfo = graph.files[f];
      if (!fInfo || !fInfo.exports) continue;
      for (const e of fInfo.exports) if (e.name && e.name !== 'default') exportedNames.add(e.name);
    }
    for (const cap of provides) {
      if (exportedNames.has(cap)) continue;
      const camel = cap.replace(/[_-]/g, '').toLowerCase();
      const fuzzyExport = [...exportedNames].some((n) => n.toLowerCase().includes(camel));
      if (fuzzyExport) continue;
      // Rule 3: capability name appears anywhere in block's source.
      const wordRe = new RegExp('\\b' + cap.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&') + '\\b');
      const inSource = info.files.some((f) => wordRe.test(sourceOf(f)));
      if (inSource) continue;
      drifts.push({
        kind: 'provided_capability_not_exported',
        // Soft signal: in Sima many capabilities are non-code artefacts
        // (sync_report.json, generated wiki bundle). Operator-review issue,
        // not a build break. Strict mode (--strict-provides) escalates to
        // error.
        severity: 'warning',
        block: blockId,
        capability: cap,
        scanned_files: info.files,
        exported_names_in_block: [...exportedNames].sort(),
        hint: `«${cap}» looks like a code symbol but the block neither exports it nor mentions it anywhere in source. Either implement it, or revise atlas/blocks/${blockId}/provides.md.`,
      });
    }
  }
  return drifts.sort((a, b) => `${a.block}-${a.capability}`.localeCompare(`${b.block}-${b.capability}`));
}

// A process start or an HTTP call is a runtime call. Reading another
// block's atlas file is data (R-8.16, its own finding), and a call through
// the server only backs a declared link. A calls.md line is confirmed by any
// of them (R-8.17): calls.md also holds the data a block writes into, sweeps
// or reads where depends_on would close a cycle.
const RUNTIME = new Set(['start', 'http']);
const CONFIRMS_CALL = new Set(['start', 'http', 'file', 'via']);
function codeMapOf(atlasRoot, sourceRoot) {
  try { return buildCodeMap({ repoRoot: sourceRoot, atlasRoot, history: false }); } catch { return null; }
}
function detectRuntimeCalls(atlasRoot, sourceRoot, map = codeMapOf(atlasRoot, sourceRoot)) {
  if (!map) return [];
  const drifts = [];
  for (const l of map.links) {
    const runtime = l.code.filter((c) => RUNTIME.has(c.kind) && !c.from_file.startsWith('tests/'));
    if (runtime.length && !l.contract && !l.tests_only) {
      drifts.push({
        kind: 'undeclared_runtime_call',
        severity: 'warning',
        block: l.from,
        calls_block: l.to,
        examples: runtime.slice(0, 4).map((c) => ({ from_file: c.from_file, line: c.line, to_file: c.to_file, kind: c.kind })),
        hint: `Add «- ${l.to}: <what it starts or calls, and why>» to atlas/blocks/${l.from}/calls.md — or to depends_on.md if ${l.from} cannot work without it and the edge forms no cycle.`,
      });
    }
    if (l.declared_in.includes('calls') && !l.code.some((c) => CONFIRMS_CALL.has(c.kind))) {
      drifts.push({
        kind: 'stale_runtime_call',
        severity: 'warning',
        block: l.from,
        calls_block: l.to,
        hint: `atlas/blocks/${l.from}/calls.md declares a call to ${l.to}, but no code of ${l.from} starts its scripts, calls its routes or touches its atlas files. Remove the line, or point it at the code that does.`,
      });
    }
  }
  const live = new Set(map.blocks.map((b) => b.id));
  for (const id of live) {
    for (const c of readCalls(atlasRoot, id)) {
      if (!live.has(c.to)) drifts.push({ kind: 'unknown_call_target', severity: 'warning', block: id, calls_block: c.to, hint: `atlas/blocks/${id}/calls.md names ${c.to}, which is not a live block.` });
    }
  }
  return drifts.sort((a, b) => `${a.kind}:${a.block}->${a.calls_block}`.localeCompare(`${b.kind}:${b.block}->${b.calls_block}`));
}

function detectDataLinks(map) {
  if (!map) return [];
  const drifts = [];
  for (const l of map.links) {
    const data = l.code.filter((c) => c.kind === 'file');
    if (!data.length || l.contract) continue;
    const writes = data.some((c) => c.mode !== 'read');
    drifts.push({
      kind: 'undeclared_data_link',
      severity: 'warning',
      block: l.from,
      data_of_block: l.to,
      files: [...new Set(data.map((c) => c.to_file))].sort(),
      examples: data.slice(0, 4).map((c) => ({ from_file: c.from_file, line: c.line, to_file: c.to_file, mode: c.mode })),
      hint: `${l.from} ${writes ? 'writes into' : 'reads'} atlas files that belong to ${l.to}. Name ${l.to} in atlas/blocks/${l.from}/depends_on.md if ${l.from} needs that data to work and the edge forms no cycle; in calls.md if it only writes into it while it works; or move the file to the block that really owns it (files.md).`,
    });
  }
  return drifts.sort((a, b) => `${a.block}->${a.data_of_block}`.localeCompare(`${b.block}->${b.data_of_block}`));
}

export function validate({ atlasRoot, sourceRoot } = {}) {
  const atlas = atlasRoot || ATLAS;
  // sourceRoot is where the validator reads ACTUAL source files for the
  // capability-in-source check. Defaults to the repo root, override in
  // tests with a synthetic tree.
  const src = sourceRoot || ROOT;
  const graphPath = path.join(atlas, 'code_graph.json');
  if (!fs.existsSync(graphPath)) {
    return {
      ok: false,
      missing_artifact: true,
      hint: 'Run `node scripts/build_code_graph.mjs` first to produce atlas/code_graph.json.',
      drifts: [],
    };
  }
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const map = codeMapOf(atlas, src);
  const drifts = [
    ...detectUndeclaredCodeDependency(graph, atlas),
    ...detectProvidedCapabilityNotExported(graph, atlas, src),
    ...detectRuntimeCalls(atlas, src, map),
    ...detectDataLinks(map),
  ];
  const errors = drifts.filter((d) => d.severity === 'error');
  const warnings = drifts.filter((d) => d.severity === 'warning');
  return {
    ok: errors.length === 0, // warnings don't block — surfaced for review
    error_count: errors.length,
    warning_count: warnings.length,
    drifts,
    unowned_data: map ? (map.data || []).filter((d) => !d.owner).map((d) => d.key) : [],
    checked_at: new Date().toISOString(),
  };
}

// Emit findings into atlas/sync_report.json under `codeGraphDrift`, merging
// with existing keys (the agent's earlier contractValidation + stackMismatch
// stay intact).
function emitToSyncReport(result, atlas) {
  const p = path.join(atlas, 'sync_report.json');
  let report = {};
  try { report = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  report.codeGraphDrift = {
    checkedAt: result.checked_at || new Date().toISOString(),
    driftCount: result.drifts.length,
    details: result.drifts,
  };
  fs.writeFileSync(p, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const silent = argv.includes('--silent');
  const strict = argv.includes('--strict-provides');
  const result = validate();
  // R-8.15 — `--runtime-calls`: only the runtime-call findings, as one line
  // an acceptance check can read; exit 1 when any call is undeclared, stale
  // or names an unknown block.
  if (argv.includes('--runtime-calls')) {
    const n = (k) => result.drifts.filter((d) => d.kind === k).length;
    const counts = { undeclared: n('undeclared_runtime_call'), stale: n('stale_runtime_call'), unknown: n('unknown_call_target') };
    for (const d of result.drifts.filter((x) => /runtime_call|call_target/.test(x.kind))) console.log(` ~ ${d.kind} :: ${d.block} → ${d.calls_block}`);
    console.log(`runtime calls: ${counts.undeclared} undeclared, ${counts.stale} stale, ${counts.unknown} unknown`);
    process.exit(counts.undeclared + counts.stale + counts.unknown ? 1 : 0);
  }
  // R-8.16 — `--data-links`: atlas files a block reads or writes that belong
  // to a block its contract does not name, and files nobody owns. R-8.17:
  // every one is written in a contract, so a new one fails the check (exit 1)
  // the way an undeclared runtime call does.
  if (argv.includes('--data-links')) {
    const found = result.drifts.filter((d) => d.kind === 'undeclared_data_link');
    for (const d of found) console.log(` ~ ${d.block} → ${d.data_of_block} :: ${d.files.join(', ')}`);
    if (result.unowned_data.length) console.log(` ? no owner: ${result.unowned_data.join(', ')}`);
    console.log(`data links: ${found.length} undeclared, ${result.unowned_data.length} atlas files without an owner`);
    process.exit(found.length + result.unowned_data.length ? 1 : 0);
  }
  // --strict-provides escalates warnings → errors (fails the validator on
  // unbacked capability promises).
  if (strict) {
    for (const d of result.drifts) if (d.severity === 'warning') d.severity = 'error';
    result.error_count = result.drifts.filter((d) => d.severity === 'error').length;
    result.warning_count = 0;
    result.ok = result.error_count === 0;
  }
  emitToSyncReport(result, ATLAS);
  const exitCode = result.ok ? 0 : 1;
  if (json) { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); process.exit(exitCode); }
  if (silent) process.exit(exitCode);
  if (result.drifts.length) {
    const label = (d) => d.severity === 'error' ? '✗' : '~';
    if (result.error_count) console.error(`Code-graph: ${result.error_count} error(s), ${result.warning_count} warning(s)`);
    else console.log(`Code-graph: OK (${result.warning_count} warning(s) — non-blocking; review atlas/sync_report.json codeGraphDrift)`);
    for (const d of result.drifts) {
      const stream = d.severity === 'error' ? console.error : console.log;
      stream(` ${label(d)} ${d.severity}: ${d.kind} :: ${d.block}` + (d.imports_from_block ? ` → ${d.imports_from_block}` : '') + (d.calls_block ? ` → ${d.calls_block}` : '') + (d.data_of_block ? ` → ${d.data_of_block}` : '') + (d.capability ? ` :: ${d.capability}` : ''));
      if (d.examples) for (const ex of d.examples.slice(0, 2)) stream(`     ${ex.from_file}:${ex.line} → ${ex.to_file}`);
    }
    process.exit(exitCode);
  }
  console.log('Code-graph validation: OK (0 drifts)');
}

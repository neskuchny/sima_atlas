#!/usr/bin/env node
// R-8.07 (b.core-sync) — the block dependency graph has two copies, and
// nothing checked that they agree.
//
// Each dependency edge lives in two places:
//   * atlas/blocks/<id>/depends_on.md  — canonical, with the capability
//   * atlas/graph.json  block.depends_on — a mirror, «for speed»
// and the consumers split between them:
//   * graph.json    ← cascade_verify (reverse-dependency closure), the canvas
//   * depends_on.md ← agent_loop_daemon (runnable selection), code-graph drift
//
// So when the two disagree, cascade and the autonomous loop are reasoning
// about DIFFERENT graphs, and every validator stayed green. That is exactly
// how R-8.06 went out: the code-graph drift detector said «declare this
// dependency», the edge was added to depends_on.md only, and it created two
// cycles (b.db → b.acceptance-verifier-loop → b.db, and the same through
// b.agent-orchestrator) that fanned out into ten. The daemon saw them; cascade
// did not; nightly passed 84/84.
//
// Three checks, all hard:
//
// 1. PARITY — for every live block, the set of block ids in graph.json equals
//    the set in depends_on.md. depends_on.md is canonical (it carries the
//    capability; graph.json is documented as its mirror).
//
// 2. FORMAT — every graph.json entry is a bare block id that exists. Some
//    entries carried a «b.x: capability» suffix; cascade_verify strips it, but
//    anything that looks the id up verbatim (the canvas drawing an edge) finds
//    no node. The capability belongs in depends_on.md, not in the mirror.
//
// 3. CYCLES — a cycle means neither block can be built first: the daemon only
//    runs a block whose dependencies are all done. The one escape hatch is an
//    explicit, justified entry in atlas/dependency_cycle_exemptions.json —
//    same shape as a «rejected alternative» record: what the cycle is, why it
//    is tolerated, and the condition under which the exemption must go. An
//    exemption that no longer matches any cycle is reported as stale, so the
//    list cannot quietly rot into permission.
//
// Every error carries a `fix:` line — the next command or edit, not only the
// diagnosis (a practice taken from OpenSpec's diagnostic envelope).
//
// Usage:
//   node scripts/validate_dependency_graph.mjs
//   node scripts/validate_dependency_graph.mjs --json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');
const asJson = process.argv.includes('--json');

const graphPath = path.join(ATLAS, 'graph.json');
if (!fs.existsSync(graphPath)) {
  console.error(`validate_dependency_graph: graph.json not found at ${graphPath}`);
  process.exit(1);
}
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const blocks = (graph.blocks || []).filter((b) => b.status !== 'archived');
const allIds = new Set((graph.blocks || []).map((b) => b.id));

/** Block ids from depends_on.md, in file order. null when the file is missing. */
export function readDependsMd(blockId, atlasRoot = ATLAS) {
  const p = path.join(atlasRoot, 'blocks', blockId, 'depends_on.md');
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
    .filter((v) => v && v !== 'none')
    .map((v) => v.split(':')[0].trim())
    .filter(Boolean);
}

/** Every elementary cycle reachable by DFS, as arrays of ids (first node not repeated). */
export function findCycles(adj) {
  const cycles = [];
  const seenKeys = new Set();
  const colour = {};
  const stack = [];
  const visit = (u) => {
    colour[u] = 1;
    stack.push(u);
    for (const v of adj[u] || []) {
      if (!(v in adj)) continue;
      if (colour[v] === 1) {
        const cyc = stack.slice(stack.indexOf(v));
        // canonical key: rotate so the smallest id comes first
        const i = cyc.indexOf([...cyc].sort()[0]);
        const key = [...cyc.slice(i), ...cyc.slice(0, i)].join('>');
        if (!seenKeys.has(key)) { seenKeys.add(key); cycles.push(cyc); }
      } else if (!colour[v]) {
        visit(v);
      }
    }
    stack.pop();
    colour[u] = 2;
  };
  for (const u of Object.keys(adj)) if (!colour[u]) visit(u);
  return cycles;
}

function loadExemptions() {
  const p = path.join(ATLAS, 'dependency_cycle_exemptions.json');
  if (!fs.existsSync(p)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(j.exemptions) ? j.exemptions : [];
  } catch (e) {
    console.error(`validate_dependency_graph: cannot parse ${p}: ${e.message}`);
    process.exit(1);
  }
}

const sameSet = (a, b) => a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');

const errors = [];
const warnings = [];

// ── 1. parity + 2. format ───────────────────────────────────────────────────
const adj = {};
for (const b of blocks) {
  const md = readDependsMd(b.id);
  const raw = Array.isArray(b.depends_on) ? b.depends_on : [];

  for (const entry of raw) {
    const s = String(entry);
    if (s.includes(':')) {
      errors.push({
        check: 'format', block: b.id,
        message: `graph.json depends_on entry "${s}" carries a capability suffix`,
        fix: `set it to "${s.split(':')[0].trim()}" — the capability belongs in atlas/blocks/${b.id}/depends_on.md`,
      });
    }
    const id = s.split(':')[0].trim();
    if (id && !allIds.has(id)) {
      errors.push({
        check: 'format', block: b.id,
        message: `graph.json depends_on names "${id}", which is not a block in graph.json`,
        fix: `remove it from both graph.json and depends_on.md, or create the block ${id}`,
      });
    }
  }

  if (md === null) {
    errors.push({
      check: 'parity', block: b.id,
      message: 'depends_on.md is missing',
      fix: `create atlas/blocks/${b.id}/depends_on.md (use «- none» if the block has no dependencies)`,
    });
    adj[b.id] = raw.map((d) => String(d).split(':')[0].trim());
    continue;
  }

  const graphIds = raw.map((d) => String(d).split(':')[0].trim()).filter(Boolean);
  const onlyGraph = graphIds.filter((x) => !md.includes(x));
  const onlyMd = md.filter((x) => !graphIds.includes(x));
  if (onlyGraph.length || onlyMd.length) {
    errors.push({
      check: 'parity', block: b.id,
      message: `graph.json and depends_on.md disagree — only in graph.json: [${onlyGraph.join(', ')}], only in depends_on.md: [${onlyMd.join(', ')}]`,
      fix: `depends_on.md is canonical: set graph.json blocks[${b.id}].depends_on to [${md.map((x) => `"${x}"`).join(', ')}]`,
    });
  }
  adj[b.id] = md;
}

// ── 3. cycles ───────────────────────────────────────────────────────────────
const exemptions = loadExemptions();
const usedExemptions = new Set();
for (const cyc of findCycles(adj)) {
  const ex = exemptions.findIndex((e) => Array.isArray(e.blocks) && sameSet(e.blocks, cyc));
  if (ex >= 0) { usedExemptions.add(ex); continue; }
  errors.push({
    check: 'cycle', block: cyc[0],
    message: `dependency cycle: ${[...cyc, cyc[0]].join(' → ')}`,
    fix: 'usually a file owned by the wrong block — move it to the block that owns the thing it writes; '
      + 'if the cycle is a genuine code-vs-data relationship, record it in atlas/dependency_cycle_exemptions.json with a reason and a removal condition',
  });
}
exemptions.forEach((e, i) => {
  if (!usedExemptions.has(i)) {
    warnings.push({
      check: 'stale_exemption', block: (e.blocks || [])[0] || '?',
      message: `exemption for [${(e.blocks || []).join(', ')}] matches no current cycle`,
      fix: 'remove it from atlas/dependency_cycle_exemptions.json — an exemption must not outlive its cycle',
    });
  }
});

// ── report ──────────────────────────────────────────────────────────────────
if (asJson) {
  console.log(JSON.stringify({
    ok: errors.length === 0,
    blocks: blocks.length,
    exemptions_in_use: usedExemptions.size,
    errors, warnings,
  }, null, 2));
  process.exit(errors.length ? 1 : 0);
}

for (const e of errors) {
  console.error(` ✗ [${e.check}] ${e.block}: ${e.message}`);
  console.error(`     fix: ${e.fix}`);
}
for (const w of warnings) {
  console.warn(` ⚠ [${w.check}] ${w.message}`);
  console.warn(`     fix: ${w.fix}`);
}
const tail = usedExemptions.size ? `, ${usedExemptions.size} justified cycle exemption(s) in use` : '';
if (errors.length) {
  console.error(`validate_dependency_graph: ${errors.length} error(s) across ${blocks.length} blocks${tail}`);
  process.exit(1);
}
console.log(`validate_dependency_graph: OK — ${blocks.length} blocks, graph.json mirrors depends_on.md, no unjustified cycles${tail}`);

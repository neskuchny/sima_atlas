#!/usr/bin/env node
// Phase R-5 (S-2 in roadmap) — soft-enforce lifecycle gates.
//
// Walks every block in atlas/graph.json and checks whether its current
// status is justified by the contract content. The gates we check:
//
//   IDEA → TODO   : mission ≥ 80 chars, ≥ 1 KPI line, ≥ 1 acceptance assertion
//   TODO → PROGRESS: depends_on/provides at least mention real capabilities
//                    (or explicitly «none»)
//   PROGRESS → REVIEW: latest acceptance_runs verdict ∈ {pass, partial}
//                      (we don't actually re-run; we trust the ledger)
//   REVIEW → DONE  : latest acceptance_runs verdict == pass
//
// The script is "soft": it never mutates graph.json or status. It just
// reports violations so the operator (or CI) can see at a glance which
// blocks are mis-statused. Hard enforcement (rejecting status writes
// that violate gates) is the next slice — see roadmap.
//
// Usage:
//   node scripts/validate_lifecycle_gates.mjs
//   node scripts/validate_lifecycle_gates.mjs --json
//   node scripts/validate_lifecycle_gates.mjs --client <id>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const argv = process.argv.slice(2);
const asJson = argv.includes('--json');
const clientIdx = argv.indexOf('--client');
const client = clientIdx >= 0 ? argv[clientIdx + 1] : null;

const ATLAS = client ? path.join(ROOT, 'atlas', 'clients', client) : path.join(ROOT, 'atlas');
const GRAPH_PATH = path.join(ATLAS, 'graph.json');
const BLOCKS_DIR = path.join(ATLAS, 'blocks');
const RUNS_DIR = path.join(ATLAS, 'acceptance_runs');

if (!fs.existsSync(GRAPH_PATH)) {
  console.error(`validate_lifecycle_gates: graph.json not found at ${GRAPH_PATH}`);
  process.exit(2);
}

const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
const blocks = (graph.blocks || []).filter((b) => b.status !== 'archived');

function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function nonEmptyBulletCount(text) {
  return text.split(/\r?\n/).filter((l) => /^\s*[-*]\s+\S/.test(l) && !/^\s*[-*]\s+none\s*$/i.test(l)).length;
}
function missionLength(text) {
  // Strip first H1 heading and YAML/comment fluff, count remaining chars.
  return text.replace(/^#[^\n]*\n+/, '').trim().length;
}
function latestVerdict(blockId) {
  const f = path.join(RUNS_DIR, blockId, '_latest.json');
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, 'utf8')).verdict || null; } catch { return null; }
}
function checkGates(b) {
  const dir = path.join(BLOCKS_DIR, b.id);
  const mission = read(path.join(dir, 'mission.md'));
  const kpi = read(path.join(dir, 'kpi.md'));
  const acc = read(path.join(dir, 'acceptance.md'));
  const dependsOn = read(path.join(dir, 'depends_on.md'));
  const provides = read(path.join(dir, 'provides.md'));
  const verdict = latestVerdict(b.id);

  const fails = [];
  const warns = [];
  const mLen = missionLength(mission);
  const kpiLines = nonEmptyBulletCount(kpi);
  const accLines = nonEmptyBulletCount(acc);

  // Gate 1: contract minimum (applies once status > idea).
  if (b.status !== 'idea') {
    if (mLen < 80) fails.push(`mission too short (${mLen} < 80 chars)`);
    if (kpiLines < 1) fails.push(`no KPI bullets`);
    if (accLines < 1) fails.push(`no acceptance assertions`);
  } else {
    // For idea blocks, the same shortfalls are warnings — they block the
    // next status transition but don't fail the current state.
    if (mLen < 80) warns.push(`mission still short (${mLen} chars) — blocks idea→todo`);
    if (kpiLines < 1) warns.push(`no KPI yet — blocks idea→todo`);
    if (accLines < 1) warns.push(`no acceptance yet — blocks idea→todo`);
  }

  // Gate 2: capability glue (applies once status > todo).
  if (['progress', 'review', 'done', 'regression'].includes(b.status)) {
    if (!dependsOn.trim()) fails.push(`depends_on.md missing — wire to neighbours or mark «none»`);
    if (!provides.trim()) fails.push(`provides.md missing — declare capabilities or mark «none»`);
  }

  // Gate 3: acceptance verdict (applies for review/done).
  if (b.status === 'done') {
    if (!verdict) fails.push(`status=done but no acceptance_runs verdict on file`);
    else if (verdict !== 'pass') fails.push(`status=done but latest acceptance verdict=${verdict}`);
  }
  if (b.status === 'review') {
    if (verdict && verdict !== 'pass' && verdict !== 'partial') {
      fails.push(`status=review but latest acceptance verdict=${verdict}`);
    }
  }

  return { id: b.id, status: b.status, mission_chars: mLen, kpi_lines: kpiLines, acceptance_lines: accLines, verdict, fails, warns };
}

const reports = blocks.map(checkGates);
const failing = reports.filter((r) => r.fails.length);
const warning = reports.filter((r) => !r.fails.length && r.warns.length);

if (asJson) {
  console.log(JSON.stringify({
    total_blocks: reports.length,
    failing: failing.length,
    warning: warning.length,
    reports,
  }, null, 2));
} else {
  console.log(`validate_lifecycle_gates — ${reports.length} blocks, ${failing.length} fail, ${warning.length} warn`);
  for (const r of failing) {
    console.log(`  ✗ ${r.id} [${r.status}]`);
    for (const f of r.fails) console.log(`      · ${f}`);
  }
  for (const r of warning) {
    console.log(`  · ${r.id} [${r.status}]`);
    for (const w of r.warns) console.log(`      · ${w}`);
  }
  if (!failing.length && !warning.length) console.log('  all blocks satisfy gates for their declared status');
}

// Phase R-5: lifecycle gates are SOFT for now — we report but don't fail
// the build. Once operators agree the gates are right, flip this to
// `process.exit(failing.length ? 1 : 0)` to make CI reject violations.
process.exit(0);

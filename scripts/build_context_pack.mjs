#!/usr/bin/env node
// R-7.86 (S-4) — context-pack profiles per task type.
//
// Until now, build_context_pack returned ONE pack: 5K-12K tokens with
// project + rules + tech_stack + arch_decisions + mission + kpi +
// acceptance + tasks + patterns + files + 5 memory artefacts +
// dependencies. Great for design, overkill for a UI fix.
//
// S-4 introduces 4 profiles. Each decides what's in / what's summarised /
// what's skipped. Pack size becomes a derivative; the goal is precision.
//
// Profiles:
//   design       — full pack: ALL deps full mission + provides; full
//                  kpi/acceptance; full memory layer. For new-block
//                  scoping or major refactors. Largest, ~5-15K.
//   backend-fix  — narrow: mission + acceptance + checks_tail + decisions +
//                  narrative + code_summary. Deps' provides only (not
//                  full mission). No patterns. Skip kpi (verifiers
//                  re-check anyway). ~2-4K.
//   ui-fix       — frontend-focused: mission + acceptance + files_alive +
//                  narrative + dont_use/always_use. Skip deps entirely
//                  (UI rarely needs upstream contracts at code level).
//                  ~1.5-3K.
//   acceptance-only — for verifier or "is this ready to ship" runs.
//                  acceptance + assertions + checks_tail + verdict
//                  history. Skip everything else. ~0.5-1.5K.
//
// Usage:
//   node scripts/build_context_pack.mjs <blockId>                 (default = design)
//   node scripts/build_context_pack.mjs <blockId> --profile design
//   node scripts/build_context_pack.mjs <blockId> --profile backend-fix
//   node scripts/build_context_pack.mjs <blockId> --profile ui-fix
//   node scripts/build_context_pack.mjs <blockId> --profile acceptance-only

import fs from 'node:fs';
import path from 'node:path';
import { filterAlive, listFiles } from './atlas_files_api.mjs';

const args = process.argv.slice(2);
const blockId = args[0];
if (!blockId) {
  console.error('Usage: node scripts/build_context_pack.mjs <blockId> [--profile design|backend-fix|ui-fix|acceptance-only]');
  process.exit(1);
}
const profileIdx = args.indexOf('--profile');
const profile = profileIdx >= 0 ? args[profileIdx + 1] : (process.env.ATLAS_PACK_PROFILE || 'design');
const KNOWN_PROFILES = ['design', 'backend-fix', 'ui-fix', 'acceptance-only'];
if (!KNOWN_PROFILES.includes(profile)) {
  console.error(`Unknown profile "${profile}". Known: ${KNOWN_PROFILES.join(', ')}`);
  process.exit(1);
}

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));

function read(p){ return fs.existsSync(p) ? fs.readFileSync(p,'utf8') : ''; }
function readJson(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function tail(s, lines) {
  const all = String(s || '').split(/\r?\n/);
  return all.slice(-lines).join('\n');
}
function listFrom(md){ return md.split(/\r?\n/).map(s=>s.trim()).filter(s=>s.startsWith('- ')).map(s=>s.slice(2)); }

function aliveFilesFromMd(md) {
  const items = listFrom(md);
  const paths = items.map((it) => String(it).split('[')[0].trim()).filter(Boolean);
  return filterAlive(paths);
}

function loadOperatorMemory(atlas, blockId) {
  const profileDir = path.join(atlas, 'operator_profile');
  const filterByBlock = (arr) => Array.isArray(arr)
    ? arr.filter((e) => !e.block_id || e.block_id === blockId).slice(-25)
    : [];
  return {
    lessons:    filterByBlock(readJson(path.join(profileDir, 'lessons.json'))?.lessons || []),
    dont_use:   filterByBlock(readJson(path.join(profileDir, 'dont_use.json'))?.entries || []),
    always_use: filterByBlock(readJson(path.join(profileDir, 'always_use.json'))?.entries || []),
  };
}

const block = (graph.blocks||[]).find(b => b.id===blockId);
if (!block) {
  console.error(`Block not found: ${blockId}`);
  process.exit(2);
}

const dir = path.join(atlas, 'blocks', blockId);
const dependsRaw = listFrom(read(path.join(dir,'depends_on.md'))).filter(x=>x!=='none');
const depends = dependsRaw.map(x => x.split(':')[0].trim()).filter(Boolean);

// ─────────────────────────────────────── profile-aware pack assembly

function buildBlockSection(profile) {
  const base = { meta: block };
  if (profile === 'acceptance-only') {
    return {
      ...base,
      acceptance: read(path.join(dir, 'acceptance.md')),
      checks_log_tail: tail(read(path.join(dir, 'checks.log')), 50),
    };
  }
  if (profile === 'ui-fix') {
    return {
      ...base,
      mission: read(path.join(dir, 'mission.md')),
      acceptance: read(path.join(dir, 'acceptance.md')),
      files_alive: aliveFilesFromMd(read(path.join(dir, 'files.md'))),
      narrative: read(path.join(dir, 'narrative.md')),
      checks_log_tail: tail(read(path.join(dir, 'checks.log')), 30),
    };
  }
  if (profile === 'backend-fix') {
    return {
      ...base,
      mission: read(path.join(dir, 'mission.md')),
      acceptance: read(path.join(dir, 'acceptance.md')),
      tasks: read(path.join(dir, 'tasks.md')),
      files_alive: aliveFilesFromMd(read(path.join(dir, 'files.md'))),
      files_dead: listFiles({ block_id: blockId, status: 'dead' }).map((e) => ({ path: e.path, reason: e.reason })),
      checks_log_tail: tail(read(path.join(dir, 'checks.log')), 50),
      decisions_log: read(path.join(dir, 'decisions.log')),
      code_summary: read(path.join(dir, 'code_summary.md')),
      narrative: read(path.join(dir, 'narrative.md')),
    };
  }
  // design (default) — everything
  return {
    ...base,
    mission: read(path.join(dir, 'mission.md')),
    kpi: read(path.join(dir, 'kpi.md')),
    acceptance: read(path.join(dir, 'acceptance.md')),
    tasks: read(path.join(dir, 'tasks.md')),
    patterns: read(path.join(dir, 'patterns.md')),
    files: read(path.join(dir, 'files.md')),
    files_alive: aliveFilesFromMd(read(path.join(dir, 'files.md'))),
    files_dead: listFiles({ block_id: blockId, status: 'dead' }).map((e) => ({ path: e.path, reason: e.reason })),
    files_archived: listFiles({ block_id: blockId, status: 'archived' }).map((e) => ({ path: e.path, reason: e.reason })),
    checks_log_tail: tail(read(path.join(dir, 'checks.log')), 50),
    decisions_log: read(path.join(dir, 'decisions.log')),
    code_summary: read(path.join(dir, 'code_summary.md')),
    narrative: read(path.join(dir, 'narrative.md')),
  };
}

function buildDependenciesSection(profile) {
  if (profile === 'acceptance-only') return [];
  if (profile === 'ui-fix') return []; // UI rarely needs upstream contracts at code-level
  if (profile === 'backend-fix') {
    // Provides only; agent doesn't need full upstream missions for a fix
    return depends.map(id => ({
      id,
      provides: read(path.join(atlas, 'blocks', id, 'provides.md')),
    }));
  }
  // design — full deps
  return depends.map(id => ({
    id,
    mission: read(path.join(atlas, 'blocks', id, 'mission.md')),
    provides: read(path.join(atlas, 'blocks', id, 'provides.md')),
  }));
}

function buildProjectSection(profile) {
  // architecture_decisions ALWAYS included — it's the lock-in (S-6)
  const archDecisions = read(path.join(atlas, 'architecture_decisions.md'));
  if (profile === 'acceptance-only') {
    return { architecture_decisions: archDecisions };
  }
  if (profile === 'ui-fix') {
    return {
      rules: read(path.join(atlas, 'rules.md')),
      tech_stack: read(path.join(atlas, 'tech_stack.md')),
      architecture_decisions: archDecisions,
    };
  }
  // backend-fix + design — full project context
  return {
    project: read(path.join(atlas, 'project.md')),
    rules: read(path.join(atlas, 'rules.md')),
    tech_stack: read(path.join(atlas, 'tech_stack.md')),
    architecture_decisions: archDecisions,
  };
}

const pack = {
  generated_at: new Date().toISOString(),
  block_id: blockId,
  profile,
  project: buildProjectSection(profile),
  block: buildBlockSection(profile),
  dependencies: buildDependenciesSection(profile),
  operator_memory: loadOperatorMemory(atlas, blockId),
};

const outDir = path.join(atlas, 'context_packs');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
// R-7.86 — profile-suffixed file so multiple profiles for same block coexist
const out = path.join(outDir, profile === 'design' ? `${blockId}.json` : `${blockId}.${profile}.json`);
const serialized = JSON.stringify(pack, null, 2);
const sizeBytes = Buffer.byteLength(serialized, 'utf8');
const estTokens = Math.ceil(sizeBytes / 4);
pack._meta = { size_bytes: sizeBytes, estimated_tokens: estTokens, profile };
fs.writeFileSync(out, JSON.stringify(pack, null, 2) + '\n', 'utf8');
console.log(`Context-pack [${profile}] written: ${out} (${sizeBytes} bytes ≈ ${estTokens} tokens)`);
if (estTokens > 8000) {
  console.warn(`⚠ pack is large (${estTokens} tokens). Consider --profile backend-fix or --profile ui-fix.`);
}

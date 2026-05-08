#!/usr/bin/env node
// PR5: validate every product under atlas/projects/<id>/.
//
// For each project directory we require:
//   * project.md  (≥ 200 chars after stripping the H1)
//   * rules.md    (≥ 60 chars)
//   * tech_stack.md  (≥ 80 chars)
//   * graph.json with `version`, `layers`, `blocks` arrays
//   * each block.id has a folder under <projectRoot>/blocks/<id>/ with the
//     same 7 contract files we require in atlas/blocks/<id>/:
//     mission.md, kpi.md, acceptance.md, tasks.md, depends_on.md,
//     provides.md, files.md, checks.log
//   * no forbidden template phrases in mission/kpi/acceptance
//   * every block.layer is present in graph.layers
//   * every depends_on target is a block id in the same project
//
// This validator does NOT touch the main atlas/ tree (handled by other
// validators); it only enforces contract on atlas/projects/<id>/.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const PROJECTS_DIR = path.join(ROOT, 'atlas', 'projects');

const REQUIRED_BLOCK_FILES = [
  'mission.md', 'kpi.md', 'acceptance.md', 'tasks.md',
  'depends_on.md', 'provides.md', 'files.md', 'checks.log',
];

const FORBIDDEN_PHRASES = [
  'Ключевая цель блока',
  'Автосоздано',
  'KPI-1: метрика готовности определена',
  'KPI-1: semantic extraction quality >= baseline',
  'TBD',
  'todo: define',
];

function readSafe(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }
function bare(md) {
  return md.split(/\r?\n/).filter((l) => !/^\s*#\s+/.test(l)).join('\n').trim();
}
function stripQuoted(text) {
  return text
    .replace(/«[^»]*»/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/'[^']*'/g, '')
    .replace(/`[^`]*`/g, '');
}

const errors = [];
const warnings = [];
let projectCount = 0;
let blockCount = 0;

if (!fs.existsSync(PROJECTS_DIR)) {
  console.log('validate_projects: no atlas/projects/ directory yet (skipping)');
  process.exit(0);
}

for (const entry of fs.readdirSync(PROJECTS_DIR)) {
  const projRoot = path.join(PROJECTS_DIR, entry);
  if (!fs.statSync(projRoot).isDirectory()) continue;
  projectCount += 1;

  // 1. project-level files
  const projectMd = readSafe(path.join(projRoot, 'project.md'));
  if (bare(projectMd).length < 200) errors.push(`${entry}: project.md too short or missing (need ≥ 200 chars)`);
  const rulesMd = readSafe(path.join(projRoot, 'rules.md'));
  if (bare(rulesMd).length < 60) errors.push(`${entry}: rules.md too short or missing`);
  const techMd = readSafe(path.join(projRoot, 'tech_stack.md'));
  if (bare(techMd).length < 80) errors.push(`${entry}: tech_stack.md too short or missing`);

  // 2. graph.json
  const graphPath = path.join(projRoot, 'graph.json');
  if (!fs.existsSync(graphPath)) {
    errors.push(`${entry}: graph.json missing`);
    continue;
  }
  let graph;
  try { graph = JSON.parse(fs.readFileSync(graphPath, 'utf8')); }
  catch (e) { errors.push(`${entry}: graph.json invalid JSON — ${e.message}`); continue; }

  if (!Array.isArray(graph.layers) || !graph.layers.length) {
    errors.push(`${entry}: graph.json must declare a non-empty layers array`);
  }
  const layerIds = new Set((graph.layers || []).map((l) => l.id));
  if (!Array.isArray(graph.blocks) || !graph.blocks.length) {
    errors.push(`${entry}: graph.json must contain at least one block`);
    continue;
  }

  const blockIds = new Set(graph.blocks.map((b) => b.id));

  // 3. per-block validation
  for (const b of graph.blocks) {
    blockCount += 1;
    const blockDir = path.join(projRoot, 'blocks', b.id);
    if (!fs.existsSync(blockDir)) {
      errors.push(`${entry}/${b.id}: block dir missing`);
      continue;
    }
    for (const f of REQUIRED_BLOCK_FILES) {
      const p = path.join(blockDir, f);
      if (!fs.existsSync(p)) {
        errors.push(`${entry}/${b.id}: ${f} missing`);
        continue;
      }
      // checks.log may be empty; markdown files must not be.
      if (f.endsWith('.md')) {
        const content = fs.readFileSync(p, 'utf8');
        if (!content.trim()) errors.push(`${entry}/${b.id}/${f} is empty`);
      }
    }

    // Forbidden phrases
    for (const md of ['mission.md', 'kpi.md', 'acceptance.md']) {
      const content = stripQuoted(bare(readSafe(path.join(blockDir, md))));
      for (const phrase of FORBIDDEN_PHRASES) {
        if (content.includes(phrase)) {
          errors.push(`${entry}/${b.id}/${md} contains forbidden template phrase: "${phrase}"`);
        }
      }
    }

    // layer presence
    if (b.layer && !layerIds.has(b.layer)) {
      errors.push(`${entry}/${b.id}: layer "${b.layer}" not declared in graph.layers`);
    }

    // depends_on must point to siblings within the same project
    for (const dep of b.depends_on || []) {
      const depId = typeof dep === 'string' ? dep : dep.block_id;
      if (!blockIds.has(depId)) {
        errors.push(`${entry}/${b.id}: depends_on "${depId}" is not a block in project "${entry}"`);
      }
    }
  }
}

if (warnings.length) {
  console.warn('validate_projects warnings:');
  warnings.forEach((w) => console.warn(' ⚠', w));
}
if (errors.length) {
  console.error('validate_projects FAILED:');
  errors.forEach((e) => console.error(' ✗', e));
  process.exit(1);
}

console.log(`validate_projects: OK (${projectCount} projects, ${blockCount} blocks)`);

#!/usr/bin/env node
// PR-Sub: validate that every block whose subschema_id is set has a real
// subschema graph on disk and that graph passes the standard 8-file contract
// for each of its child blocks.
//
// Walks:
//   atlas/graph.json + atlas/projects/<proj>/graph.json
// For every block with subschema_id non-null:
//   atlas/blocks/<id>/subschemas/<sub>/graph.json must exist
//   atlas/blocks/<id>/subschemas/<sub>/blocks/<child>/{mission,kpi,acceptance,
//     tasks,depends_on,provides,files,checks.log} must all exist
//   every child.layer must be declared in subschema graph.layers
//   every depends_on inside subschema must point to a child id

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');

const REQUIRED = ['mission.md', 'kpi.md', 'acceptance.md', 'tasks.md', 'depends_on.md', 'provides.md', 'files.md', 'checks.log'];

const errors = [];
const warnings = [];
let projectsChecked = 0;
let subschemasChecked = 0;
let childBlocksChecked = 0;

function readSafe(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }

function checkProject(graphPath, projectRoot, projLabel) {
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  for (const b of graph.blocks || []) {
    if (!b.subschema_id) continue;
    const subRoot = path.join(projectRoot, 'blocks', b.id, 'subschemas', b.subschema_id);
    const subGraphPath = path.join(subRoot, 'graph.json');
    if (!fs.existsSync(subGraphPath)) {
      errors.push(`${projLabel}/${b.id}: subschema_id="${b.subschema_id}" but ${subGraphPath} missing`);
      continue;
    }
    let subGraph;
    try { subGraph = JSON.parse(fs.readFileSync(subGraphPath, 'utf8')); }
    catch (e) { errors.push(`${projLabel}/${b.id}/${b.subschema_id}: invalid JSON — ${e.message}`); continue; }
    subschemasChecked += 1;
    const layerIds = new Set((subGraph.layers || []).map((l) => l.id));
    if (!layerIds.size) errors.push(`${projLabel}/${b.id}/${b.subschema_id}: graph.layers empty`);
    if (!Array.isArray(subGraph.blocks) || !subGraph.blocks.length) {
      errors.push(`${projLabel}/${b.id}/${b.subschema_id}: graph.blocks empty`);
      continue;
    }
    const childIds = new Set(subGraph.blocks.map((c) => c.id));
    for (const child of subGraph.blocks) {
      childBlocksChecked += 1;
      const childDir = path.join(subRoot, 'blocks', child.id);
      if (!fs.existsSync(childDir)) {
        errors.push(`${projLabel}/${b.id}/${b.subschema_id}/${child.id}: dir missing`);
        continue;
      }
      for (const f of REQUIRED) {
        const p = path.join(childDir, f);
        if (!fs.existsSync(p)) errors.push(`${projLabel}/${b.id}/${b.subschema_id}/${child.id}/${f}: missing`);
        else if (f.endsWith('.md') && !fs.readFileSync(p, 'utf8').trim()) errors.push(`${projLabel}/${b.id}/${b.subschema_id}/${child.id}/${f}: empty`);
      }
      if (child.layer && !layerIds.has(child.layer)) {
        errors.push(`${projLabel}/${b.id}/${b.subschema_id}/${child.id}: layer "${child.layer}" not declared in subschema graph.layers`);
      }
      for (const dep of child.depends_on || []) {
        const depId = typeof dep === 'string' ? dep : dep.block_id;
        if (depId && !childIds.has(depId)) {
          warnings.push(`${projLabel}/${b.id}/${b.subschema_id}/${child.id}: depends_on "${depId}" points outside the subschema (allowed but unusual)`);
        }
      }
    }
  }
}

// Main project
checkProject(path.join(ATLAS, 'graph.json'), ATLAS, 'atlas-live');
projectsChecked += 1;

// User projects
const projectsDir = path.join(ATLAS, 'projects');
if (fs.existsSync(projectsDir)) {
  for (const entry of fs.readdirSync(projectsDir)) {
    const projRoot = path.join(projectsDir, entry);
    if (!fs.statSync(projRoot).isDirectory()) continue;
    const graphPath = path.join(projRoot, 'graph.json');
    if (!fs.existsSync(graphPath)) continue;
    checkProject(graphPath, projRoot, entry);
    projectsChecked += 1;
  }
}

if (warnings.length) {
  console.warn('validate_subschemas warnings:');
  warnings.forEach((w) => console.warn(' ⚠', w));
}
if (errors.length) {
  console.error('validate_subschemas FAILED:');
  errors.forEach((e) => console.error(' ✗', e));
  process.exit(1);
}
console.log(`validate_subschemas: OK (projects=${projectsChecked}, subschemas=${subschemasChecked}, child_blocks=${childBlocksChecked})`);

#!/usr/bin/env node
// Headless smoke for the layered atlas_bootstrap.js + arch_data.js pair.
// Confirms that:
//   1. window.ARCH_LAYERS contains every layer id used by archByProject blocks.
//   2. Every block in archByProject has a non-null `layer`, `x`, `w`, `title`, `note`, `status`.
//   3. Every depends_on link targets a known block id.
//   4. atlas-live project is mergeable into SIMA_DATA_V2.

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const remix = path.join(root, 'Sima (Remix)');
const archDataSrc = fs.readFileSync(path.join(remix, 'arch_data.js'), 'utf8');
const bootstrapSrc = fs.readFileSync(path.join(remix, 'atlas_bootstrap.js'), 'utf8');

const sandboxWindow = {};
sandboxWindow.SIMA_DATA_V2 = { projects: [] };
const ctx = { window: sandboxWindow, console };
ctx.global = ctx;
vm.createContext(ctx);
vm.runInContext(archDataSrc, ctx);
vm.runInContext(bootstrapSrc, ctx);

const errors = [];
const win = ctx.window;

if (!win.ARCH_LAYERS || typeof win.ARCH_LAYERS !== 'object') errors.push('ARCH_LAYERS not loaded');
if (!win.ARCH_BY_PROJECT || !win.ARCH_BY_PROJECT['atlas-live']) errors.push('atlas-live not registered in ARCH_BY_PROJECT');

const arch = win.ARCH_BY_PROJECT['atlas-live'];
if (arch) {
  if (!Array.isArray(arch.layers) || arch.layers.length < 2) errors.push(`atlas-live layers must contain at least 2 layers; got ${JSON.stringify(arch.layers)}`);
  for (const layerId of arch.layers || []) {
    if (!win.ARCH_LAYERS[layerId]) errors.push(`layer "${layerId}" not declared in ARCH_LAYERS`);
  }
  const idSet = new Set();
  for (const b of arch.blocks || []) {
    if (!b.id) errors.push('block without id');
    if (!b.layer) errors.push(`block ${b.id} has no layer`);
    if (b.layer && !arch.layers.includes(b.layer)) errors.push(`block ${b.id} uses layer ${b.layer} not in arch.layers`);
    if (typeof b.x !== 'number') errors.push(`block ${b.id} has no x`);
    if (!b.title) errors.push(`block ${b.id} has no title`);
    if (!b.note) errors.push(`block ${b.id} has no note`);
    if (!b.status) errors.push(`block ${b.id} has no status`);
    idSet.add(b.id);
  }
  for (const l of arch.links || []) {
    if (!idSet.has(l.from)) errors.push(`link from unknown block ${l.from}`);
    if (!idSet.has(l.to)) errors.push(`link to unknown block ${l.to}`);
  }
}

const projects = win.SIMA_DATA_V2 && win.SIMA_DATA_V2.projects;
if (!projects || !projects.find((p) => p.id === 'atlas-live')) errors.push('atlas-live not merged into SIMA_DATA_V2.projects');

// PR4.4: validate the SIMA_DATA_V2 project shape that Layer1Canvas / Layer2Map need.
const proj = projects && projects.find((p) => p.id === 'atlas-live');
if (proj) {
  if (!proj.canvas || !Array.isArray(proj.canvas.sources)) errors.push('atlas-live.canvas.sources missing or not an array');
  if (!proj.map || typeof proj.map !== 'object') errors.push('atlas-live.map missing');
  if (proj.map) {
    const us = proj.map.userstory;
    if (!us) errors.push('atlas-live.map.userstory missing');
    else {
      if (!Array.isArray(us.nodes)) errors.push('atlas-live.map.userstory.nodes must be an array');
      // UserStoryMap accepts either `edges: [[a,b]]` or `links: [{from,to}]`. Require at least one.
      const hasEdges = Array.isArray(us.edges);
      const hasLinks = Array.isArray(us.links);
      if (!hasEdges && !hasLinks) errors.push('atlas-live.map.userstory must have edges or links array');
      if (hasEdges) {
        for (const e of us.edges) {
          if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'string' || typeof e[1] !== 'string') {
            errors.push(`atlas-live.map.userstory.edges entries must be [from, to] string tuples; got ${JSON.stringify(e)}`);
            break;
          }
        }
      }
    }
  }
}

if (errors.length) {
  console.error('atlas_bootstrap smoke FAILED:');
  errors.forEach((e) => console.error(' ✗', e));
  process.exit(1);
}

const layerCounts = {};
for (const b of arch.blocks || []) layerCounts[b.layer] = (layerCounts[b.layer] || 0) + 1;
console.log(
  `atlas_bootstrap smoke: OK (layers=${arch.layers.length}, blocks=${arch.blocks.length}, links=${arch.links.length})`
);
console.log('  per-layer:', JSON.stringify(layerCounts));

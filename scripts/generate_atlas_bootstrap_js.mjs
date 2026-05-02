#!/usr/bin/env node
// PR2: layered atlas bootstrap generator
// Reads atlas/graph.json v2 (with layer/type/mvp/files/depends_on),
// reads each block's mission.md / kpi.md / tasks.md / depends_on.md / provides.md / files.md,
// and emits Sima (Remix)/atlas_bootstrap.js so that the React UI renders blocks distributed
// across horizontal layer bands.
//
// Output shape consumed by Sima Remix:
//   window.SIMA_BOOTSTRAP = { data: {projects:[...]}, archByProject: {<projId>: {layers, blocks, links}} }
//   then merges archByProject into window.ARCH_BY_PROJECT
//   and merges projects into window.SIMA_DATA_V2.projects (so the project appears in tabs)

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const blocksRoot = path.join(atlas, 'blocks');
const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));

const PROJECT_ID = 'atlas-live';
const LAYER_BAND_X_START = 40;
const LAYER_BAND_X_STEP = 230;
const BLOCK_WIDTH = 210;

function readSafe(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }

function firstSentence(md) {
  const stripped = md
    .split(/\r?\n/)
    .filter((l) => !/^\s*#/.test(l))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return '';
  const m = stripped.match(/^(.{20,180}?)([.!?]|$)/);
  return (m ? m[1] + (m[2] || '') : stripped.slice(0, 180)).trim();
}

function listFromMd(md) {
  return md
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim())
    .filter((l) => l && l !== 'none');
}

function readBlockMeta(blockId) {
  const dir = path.join(blocksRoot, blockId);
  const mission = readSafe(path.join(dir, 'mission.md'));
  const kpi = readSafe(path.join(dir, 'kpi.md'));
  const tasks = readSafe(path.join(dir, 'tasks.md'));
  const depends = listFromMd(readSafe(path.join(dir, 'depends_on.md')));
  const provides = listFromMd(readSafe(path.join(dir, 'provides.md')));
  const files = listFromMd(readSafe(path.join(dir, 'files.md')));
  return { mission, kpi, tasks, depends, provides, files };
}

// ─── Layers ───────────────────────────────────────────────────────────────
const declaredLayers = (graph.layers || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
const layerHasBlocks = new Set((graph.blocks || []).map((b) => b.layer || 'logic'));
const activeLayers = declaredLayers.filter((l) => layerHasBlocks.has(l.id));

// ─── Blocks placement: horizontal lay-out inside each layer band ──────────
const blocksByLayer = {};
for (const b of graph.blocks || []) {
  const layer = b.layer || 'logic';
  (blocksByLayer[layer] = blocksByLayer[layer] || []).push(b);
}

const archBlocks = [];
for (const layer of activeLayers) {
  const list = blocksByLayer[layer.id] || [];
  list.forEach((b, idx) => {
    const meta = readBlockMeta(b.id);
    const note = firstSentence(meta.mission) || `${b.title}`;
    archBlocks.push({
      id: b.id,
      title: b.title,
      layer: layer.id,
      type: b.type || 'module',
      status: b.status || 'idea',
      status_reason: b.status_reason || null,
      mvp: !!b.mvp,
      subschema: b.subschema_id || null,
      x: LAYER_BAND_X_START + idx * LAYER_BAND_X_STEP,
      w: BLOCK_WIDTH,
      note,
      sources: meta.files.slice(0, 5),
      tech_stack: b.tech_stack || [],
    });
  });
}

// ─── Links: from depends_on ───────────────────────────────────────────────
const links = [];
const validIds = new Set(archBlocks.map((b) => b.id));
for (const b of graph.blocks || []) {
  for (const dep of b.depends_on || []) {
    const depId = typeof dep === 'string' ? dep : dep.block_id;
    if (validIds.has(depId)) {
      links.push({ from: b.id, to: depId, type: 'dep', label: '' });
    }
  }
}

// ─── data.projects entry (SIMA_DATA_V2 shape) ─────────────────────────────
const project = {
  id: PROJECT_ID,
  name: 'Sima Atlas',
  taskKind: 'продукт',
  taskTitle: 'Живая схема Atlas',
  taskNote: 'Блоки, слои, статусы и зависимости автогенерируются из /atlas',
  created: new Date().toISOString().slice(0, 10),
  owner: 'Cursor / Claude / Codex',
  canvas: {
    task: {
      id: 't1',
      x: 540, y: 40, w: 420, h: 100,
      title: 'Sima Atlas',
      subtitle: 'Многослойная схема: layer → block → файлы и связи',
    },
    sources: archBlocks.map((b, i) => ({
      id: b.id,
      type: 'artifact',
      x: 120 + (i % 4) * 230,
      y: 200 + Math.floor(i / 4) * 160,
      w: 220, h: 130,
      source: `${b.layer} · ${b.status}`,
      title: b.title,
      meta: b.id,
      take: b.note,
      tags: [`#${b.status}`, `#${b.layer}`],
    })),
    links: links.map((l) => ({
      id: `${l.from}__${l.to}`,
      from: l.from,
      to: l.to,
      label: `${l.from} → ${l.to}`,
      direction: 'to-task',
    })),
  },
  map: {
    mission: { id: 'm.mission', title: 'Миссия', value: 'Решить рассинхрон кода между сессиями ИИ через единый source-of-truth — /atlas/', filled: true },
    idea: { id: 'm.idea', title: 'Идея', value: 'Блоки лежат как markdown-файлы; агенты читают только нужный блок, не весь чат.', filled: true },
    goal: { id: 'm.goal', title: 'JTBD', value: 'Видеть на схеме что готово, что сломано, и одной кнопкой передавать context-pack агенту.', filled: true },
    audience: { id: 'm.audience', title: 'Для кого', value: 'Solo founder + AI-coding workflows (Cursor / Claude Code / Codex / Antigravity)', filled: true },
    value: { id: 'm.value', title: 'Ценность', value: 'Меньше токенов, меньше дрейфа, единое понимание продукта между всеми агентами.', filled: true },
    important: {
      id: 'm.important',
      title: 'Должно быть',
      items: archBlocks.filter((b) => b.mvp).map((b) => ({ label: `${b.title} (${b.layer} · ${b.status})`, filled: true })),
    },
    userstory: {
      id: 'm.us',
      title: 'User Story (по слоям)',
      nodes: archBlocks.map((b) => ({
        id: b.id,
        title: b.title,
        kind: `блок · ${b.layer}`,
        filled: true,
        body: b.note,
        hasSubschema: !!b.subschema,
        sources: b.sources,
      })),
      links: links.map((l) => ({ from: l.from, to: l.to, label: 'depends_on' })),
    },
  },
  tz: {
    sections: [
      { id: 's1', num: '1', title: 'Миссия и цели' },
      { id: 's2', num: '2', title: 'Архитектура (по слоям)' },
      { id: 's3', num: '3', title: 'Блоки и контракты' },
      { id: 's4', num: '4', title: 'Roadmap и зависимости' },
      { id: 's5', num: '5', title: 'Sync-check и валидаторы' },
    ],
  },
  impl: {
    blocks: archBlocks.map((b) => ({ id: b.id, title: b.title, status: b.status, layer: b.layer })),
  },
};

const archByProject = {
  [PROJECT_ID]: {
    projectId: PROJECT_ID,
    layers: activeLayers.map((l) => l.id),
    blocks: archBlocks,
    links,
    groups: [],
  },
};

const payload = { data: { projects: [project] }, archByProject };
const outPath = path.join(root, 'Sima (Remix)', 'atlas_bootstrap.js');

const layerDefs = {};
for (const l of graph.layers || []) {
  layerDefs[l.id] = { id: l.id, name: l.name, hue: l.hue || '#7A6A4F', bg: l.bg || 'rgba(122,106,79,0.06)' };
}

const text = `// AUTO-GENERATED by scripts/generate_atlas_bootstrap_js.mjs — do not edit by hand
// Source: atlas/graph.json + atlas/blocks/<id>/*.md
window.SIMA_BOOTSTRAP = ${JSON.stringify(payload, null, 2)};

// Inject any layer ids that are not yet declared in ARCH_LAYERS (set by arch_data.js).
window.ARCH_LAYERS = window.ARCH_LAYERS || {};
const __atlasLayerDefs = ${JSON.stringify(layerDefs)};
for (const __id in __atlasLayerDefs) {
  if (!window.ARCH_LAYERS[__id]) window.ARCH_LAYERS[__id] = __atlasLayerDefs[__id];
}

// Merge archByProject into window.ARCH_BY_PROJECT (defined by arch_data.js).
window.ARCH_BY_PROJECT = Object.assign(
  window.ARCH_BY_PROJECT || {},
  (window.SIMA_BOOTSTRAP && window.SIMA_BOOTSTRAP.archByProject) || {}
);

// Merge atlas-live project into window.SIMA_DATA_V2.projects so it shows up in tabs.
(function mergeAtlasIntoDataV2(){
  if (!window.SIMA_DATA_V2 || !Array.isArray(window.SIMA_DATA_V2.projects)) return;
  const incoming = (window.SIMA_BOOTSTRAP.data && window.SIMA_BOOTSTRAP.data.projects) || [];
  for (const p of incoming) {
    const idx = window.SIMA_DATA_V2.projects.findIndex(x => x.id === p.id);
    if (idx >= 0) window.SIMA_DATA_V2.projects[idx] = p;
    else window.SIMA_DATA_V2.projects.unshift(p);
  }
})();
`;

fs.writeFileSync(outPath, text, 'utf8');
console.log(`Generated ${outPath}`);
console.log(`  layers: ${activeLayers.map((l) => l.id).join(', ')}`);
console.log(`  blocks: ${archBlocks.length}`);
console.log(`  links:  ${links.length}`);

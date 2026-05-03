#!/usr/bin/env node
// PR5: multi-project layered atlas bootstrap generator.
//
// Reads:
//   - atlas/graph.json                          → project "atlas-live" (Sima itself)
//   - atlas/projects/<id>/graph.json            → user products (PR5+)
//   - <projectRoot>/blocks/<id>/{mission,kpi,...}.md
//
// Emits Sima (Remix)/atlas_bootstrap.js with one entry per discovered project.
//
// Output shape (consumed by Sima Remix):
//   window.SIMA_BOOTSTRAP = { data: {projects:[…]}, archByProject: {<projId>: {layers,blocks,links}} }
//   then merges archByProject → window.ARCH_BY_PROJECT
//   and merges projects        → window.SIMA_DATA_V2.projects (so they appear in tabs)

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlasRoot = path.join(root, 'atlas');
const projectsDir = path.join(atlasRoot, 'projects');

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

function readBlockMeta(blockDir) {
  return {
    mission:  readSafe(path.join(blockDir, 'mission.md')),
    kpi:      readSafe(path.join(blockDir, 'kpi.md')),
    tasks:    readSafe(path.join(blockDir, 'tasks.md')),
    depends:  listFromMd(readSafe(path.join(blockDir, 'depends_on.md'))),
    provides: listFromMd(readSafe(path.join(blockDir, 'provides.md'))),
    files:    listFromMd(readSafe(path.join(blockDir, 'files.md'))),
  };
}

// ─────────────────────────────────────────────────── per-project builder
function buildProject({ id, name, taskTitle, taskNote, ownerLabel, projectRoot }) {
  const graphPath = path.join(projectRoot, 'graph.json');
  if (!fs.existsSync(graphPath)) return null;
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

  const declaredLayers = (graph.layers || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
  const layerHasBlocks = new Set((graph.blocks || []).map((b) => b.layer || 'logic'));
  const activeLayers = declaredLayers.filter((l) => layerHasBlocks.has(l.id));

  const blocksByLayer = {};
  for (const b of graph.blocks || []) {
    const layer = b.layer || 'logic';
    (blocksByLayer[layer] = blocksByLayer[layer] || []).push(b);
  }

  const archBlocks = [];
  for (const layer of activeLayers) {
    const list = blocksByLayer[layer.id] || [];
    list.forEach((b, idx) => {
      const blockDir = path.join(projectRoot, 'blocks', b.id);
      const meta = readBlockMeta(blockDir);
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

  // PR-Conn: collect provides per block id from <projectRoot>/blocks/<id>/provides.md.
  // Each provides line is treated as a capability id this block exports.
  const providesByBlock = {};
  for (const b of graph.blocks || []) {
    const dir = path.join(projectRoot, 'blocks', b.id);
    providesByBlock[b.id] = new Set(listFromMd(readSafe(path.join(dir, 'provides.md'))));
  }
  // Parse depends_on.md too — each entry is "<block_id>" or "<block_id>: <cap>".
  function parseDependsLine(s) {
    const idx = s.indexOf(':');
    if (idx < 0) return { blockId: s.trim(), capability: null };
    return { blockId: s.slice(0, idx).trim(), capability: s.slice(idx + 1).trim() };
  }
  const dependsByBlock = {};
  for (const b of graph.blocks || []) {
    const dir = path.join(projectRoot, 'blocks', b.id);
    dependsByBlock[b.id] = listFromMd(readSafe(path.join(dir, 'depends_on.md'))).map(parseDependsLine);
  }

  // Build links. Each gets {broken, broken_reason} so the UI can paint
  // contract-violating connections in red.
  const links = [];
  const validIds = new Set(archBlocks.map((b) => b.id));
  for (const b of graph.blocks || []) {
    const declaredDeps = dependsByBlock[b.id] || [];
    // Index declared capability per parent by blockId (first occurrence wins).
    const capByDepId = {};
    for (const d of declaredDeps) {
      if (d.blockId && !(d.blockId in capByDepId)) capByDepId[d.blockId] = d.capability;
    }

    for (const dep of b.depends_on || []) {
      const depId = typeof dep === 'string' ? dep : dep.block_id;
      if (!validIds.has(depId)) continue;

      // Cross-check: if the .md says "depId: capability", and target's provides
      // does NOT include capability → flag the link as broken.
      const cap = capByDepId[depId] || null;
      let broken = false;
      let broken_reason = null;
      if (cap) {
        const targetProvides = providesByBlock[depId] || new Set();
        if (!targetProvides.has(cap)) {
          broken = true;
          broken_reason = `${depId} не предоставляет capability "${cap}"`;
        }
      }
      links.push({
        from: b.id,
        to: depId,
        type: 'dep',
        label: cap || '',
        capability: cap,
        broken,
        broken_reason,
      });
    }
  }

  // Project mission preview from project.md (if any)
  const projectMd = readSafe(path.join(projectRoot, 'project.md'));
  const projectMission = firstSentence(projectMd) || taskNote || '';

  const project = {
    id,
    name,
    taskKind: 'продукт',
    taskTitle,
    taskNote,
    created: new Date().toISOString().slice(0, 10),
    owner: ownerLabel,
    canvas: {
      task: { id: 't1', x: 540, y: 40, w: 420, h: 100, title: name, subtitle: taskTitle },
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
      mission:  { id: 'm.mission',  title: 'Миссия',          value: projectMission, filled: !!projectMission },
      idea:     { id: 'm.idea',     title: 'Идея',            value: taskTitle,      filled: true },
      goal:     { id: 'm.goal',     title: 'JTBD',            value: taskNote,       filled: true },
      audience: { id: 'm.audience', title: 'Для кого',        value: ownerLabel,     filled: true },
      value:    { id: 'm.value',    title: 'Ценность',        value: 'См. project.md и user-stories блока',     filled: true },
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
        edges: links.map((l) => [l.from, l.to]),
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

  const archEntry = {
    projectId: id,
    layers: activeLayers.map((l) => l.id),
    blocks: archBlocks,
    links,
    groups: [],
  };

  return { project, archEntry, layerDefs: declaredLayers, layersActive: activeLayers };
}

// ─────────────────────────────────────────────────── discover all projects
const built = [];

// 1) main atlas (Sima itself) — historically id 'atlas-live'.
const mainBuilt = buildProject({
  id: 'atlas-live',
  name: 'Sima Atlas',
  taskTitle: 'Живая схема Atlas',
  taskNote: 'Блоки, слои, статусы и зависимости автогенерируются из /atlas',
  ownerLabel: 'Cursor / Claude / Codex',
  projectRoot: atlasRoot,
});
if (mainBuilt) built.push(mainBuilt);

// 2) user products under atlas/projects/<id>/
if (fs.existsSync(projectsDir)) {
  for (const entry of fs.readdirSync(projectsDir).sort()) {
    const projectRoot = path.join(projectsDir, entry);
    if (!fs.statSync(projectRoot).isDirectory()) continue;
    if (!fs.existsSync(path.join(projectRoot, 'graph.json'))) continue;
    const projMd = readSafe(path.join(projectRoot, 'project.md'));
    const inferredName = (projMd.match(/^#\s+(.+)$/m) || [, entry])[1];
    const built2 = buildProject({
      id: entry,
      name: inferredName,
      taskTitle: firstSentence(projMd) || inferredName,
      taskNote: 'Project under atlas/projects/' + entry,
      ownerLabel: 'demo',
      projectRoot,
    });
    if (built2) built.push(built2);
  }
}

// 3) PR-Sub: subschemas. Any block with subschema_id pointing at
// <projectRoot>/blocks/<block_id>/subschemas/<sub_name>/graph.json
// becomes its own project entry, addressable as
// "<parentProjectId>:<block_id>:<sub_name>".
const subschemaProjects = [];
function discoverSubschemasFor(parentBuilt, parentProjectRoot) {
  for (const b of parentBuilt.archEntry.blocks) {
    if (!b.subschema) continue;
    const subRoot = path.join(parentProjectRoot, 'blocks', b.id, 'subschemas', b.subschema);
    const subGraph = path.join(subRoot, 'graph.json');
    if (!fs.existsSync(subGraph)) continue;
    const subBuilt = buildProject({
      id: `${parentBuilt.archEntry.projectId}:${b.id}:${b.subschema}`,
      name: `${b.title} → ${b.subschema}`,
      taskTitle: `Подсхема блока ${b.id}`,
      taskNote: `Subschema "${b.subschema}" of ${parentBuilt.archEntry.projectId}/${b.id}`,
      ownerLabel: parentBuilt.project.owner,
      projectRoot: subRoot,
    });
    if (subBuilt) {
      subBuilt.parent = { projectId: parentBuilt.archEntry.projectId, blockId: b.id, subId: b.subschema };
      subBuilt.project.parent = subBuilt.parent;
      subBuilt.archEntry.parent = subBuilt.parent;
      subschemaProjects.push(subBuilt);
      // Recurse: a subschema can itself have subschemas.
      discoverSubschemasFor(subBuilt, subRoot);
    }
  }
}
for (const b of [...built]) {
  const projectRoot = b.archEntry.projectId === 'atlas-live'
    ? atlasRoot
    : path.join(projectsDir, b.archEntry.projectId);
  discoverSubschemasFor(b, projectRoot);
}
for (const sb of subschemaProjects) built.push(sb);

if (!built.length) {
  console.error('No projects found. Expected at least atlas/graph.json.');
  process.exit(1);
}

// ─────────────────────────────────────────────────── assemble payload
const projects = built.map((b) => b.project);
const archByProject = {};
for (const b of built) archByProject[b.archEntry.projectId] = b.archEntry;

// Union of every layer id seen anywhere → used to seed window.ARCH_LAYERS.
const layerDefs = {};
for (const b of built) {
  for (const l of b.layerDefs) {
    if (!layerDefs[l.id]) {
      layerDefs[l.id] = { id: l.id, name: l.name, hue: l.hue || '#7A6A4F', bg: l.bg || 'rgba(122,106,79,0.06)' };
    }
  }
}

const payload = { data: { projects }, archByProject };

// PR-5 (b.acceptance-verifier-loop): expose latest verifier verdicts to the UI
// so ArchInspector can render the «Acceptance verifier» section without
// having to fetch the json files separately. We piggy-back on
// /atlas/payload's bootstrap regen so the data refreshes whenever the UI
// repolls.
const acceptanceRunsDir = path.join(root, 'atlas', 'acceptance_runs');
const acceptanceRuns = {};
if (fs.existsSync(acceptanceRunsDir)) {
  for (const blockId of fs.readdirSync(acceptanceRunsDir)) {
    const latestPath = path.join(acceptanceRunsDir, blockId, '_latest.json');
    if (!fs.existsSync(latestPath)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
      acceptanceRuns[blockId] = {
        verdict: j.verdict,
        counts: j.counts,
        checked_at: j.checked_at,
        // Trim assertions to UI-facing shape (skip raw payload, keep evidence
        // + reasoning text the inspector renders).
        assertions: (j.assertions || []).map((a) => ({
          id: a.id,
          label: a.label,
          text: a.text,
          checked: a.checked,
          verdict: a.verdict,
          evidence_kind: a.evidence_kind,
          evidence: a.evidence,
          reasoning: a.reasoning,
        })),
      };
    } catch {}
  }
  const summaryPath = path.join(acceptanceRunsDir, '_summary.json');
  if (fs.existsSync(summaryPath)) {
    try { payload.acceptanceSummary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')); } catch {}
  }
}
payload.acceptanceRuns = acceptanceRuns;

// PR-6 (b.operator-profile-learner): expose operator profile + lessons +
// dont_use to the UI so ProposalsPanel can compute compliance badges and
// ArchInspector can render the «Подсказки от профиля» section without an
// extra fetch. Always silent when profile is in warming_up state — UI
// surfaces a `Профиль ещё учится: N/M done, K/L invocations` notice instead.
const opProfileDir = path.join(root, 'atlas', 'operator_profile');
let operatorProfile = null;
let operatorLessons = [];
let operatorDontUse = [];
if (fs.existsSync(opProfileDir)) {
  const pp = path.join(opProfileDir, 'profile.json');
  if (fs.existsSync(pp)) {
    try { operatorProfile = JSON.parse(fs.readFileSync(pp, 'utf8')); } catch {}
  }
  const lp = path.join(opProfileDir, 'lessons.json');
  if (fs.existsSync(lp)) {
    try {
      const j = JSON.parse(fs.readFileSync(lp, 'utf8'));
      operatorLessons = Array.isArray(j) ? j : (Array.isArray(j.lessons) ? j.lessons : []);
    } catch {}
  }
  const dp = path.join(opProfileDir, 'dont_use.json');
  if (fs.existsSync(dp)) {
    try {
      const j = JSON.parse(fs.readFileSync(dp, 'utf8'));
      const arr = Array.isArray(j) ? j : (Array.isArray(j.items) ? j.items : []);
      operatorDontUse = arr.map((d) => typeof d === 'string' ? d : d.value).filter(Boolean);
    } catch {}
  }
}
payload.operatorProfile = operatorProfile;
payload.operatorLessons = operatorLessons;
payload.operatorDontUse = operatorDontUse;

const outPath = path.join(root, 'Sima (Remix)', 'atlas_bootstrap.js');

const text = `// AUTO-GENERATED by scripts/generate_atlas_bootstrap_js.mjs — do not edit by hand
// Sources: atlas/graph.json + atlas/projects/*/graph.json + blocks/<id>/*.md
window.SIMA_BOOTSTRAP = ${JSON.stringify(payload, null, 2)};

// Inject any layer ids not yet declared in ARCH_LAYERS (set by arch_data.js).
window.ARCH_LAYERS = window.ARCH_LAYERS || {};
const __atlasLayerDefs = ${JSON.stringify(layerDefs)};
for (const __id in __atlasLayerDefs) {
  if (!window.ARCH_LAYERS[__id]) window.ARCH_LAYERS[__id] = __atlasLayerDefs[__id];
}

// Merge archByProject into window.ARCH_BY_PROJECT.
window.ARCH_BY_PROJECT = Object.assign(
  window.ARCH_BY_PROJECT || {},
  (window.SIMA_BOOTSTRAP && window.SIMA_BOOTSTRAP.archByProject) || {}
);

// Merge real projects into window.SIMA_DATA_V2.projects so they show in tabs.
(function mergeProjectsIntoDataV2(){
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
console.log(`  projects: ${projects.map((p) => p.id).join(', ')}`);
for (const b of built) {
  console.log(`    ${b.archEntry.projectId.padEnd(14)}  layers=${b.archEntry.layers.length}  blocks=${b.archEntry.blocks.length}  links=${b.archEntry.links.length}`);
}

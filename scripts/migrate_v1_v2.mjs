#!/usr/bin/env node
// Migration runner: upgrades atlas/graph.json from schema v1 to v2.
// v2 adds: layers array, and layer/type/mvp fields on each block.
// Idempotent — safe to run on an already-v2 graph (exits 0, no writes).

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const graphPath = path.join(root, 'atlas', 'graph.json');

if (!fs.existsSync(graphPath)) {
  console.error(`migrate_v1_v2: graph.json not found at ${graphPath}`);
  process.exit(1);
}

const raw = fs.readFileSync(graphPath, 'utf8');
let graph;
try { graph = JSON.parse(raw); }
catch (e) { console.error(`migrate_v1_v2: invalid JSON — ${e.message}`); process.exit(1); }

if ((graph.version ?? 1) >= 2) {
  console.log('migrate_v1_v2: graph.json is already v2 — no migration needed. OK');
  process.exit(0);
}

let fieldsAdded = 0;

// Add layers array if missing
if (!Array.isArray(graph.layers) || graph.layers.length === 0) {
  graph.layers = [
    { id: 'user',  name: 'Пользователь / JTBD', order: 0 },
    { id: 'front', name: 'Фронтенд',             order: 1 },
    { id: 'logic', name: 'Логика / бэкенд',      order: 2 },
    { id: 'ai',    name: 'ИИ / агенты',          order: 3 },
    { id: 'data',  name: 'Данные / хранилище',   order: 4 },
  ];
  fieldsAdded += 1;
}

// Add layer/type/mvp to blocks that lack them
for (const block of graph.blocks || []) {
  if (!block.layer)           { block.layer = 'logic';   fieldsAdded += 1; }
  if (!block.type)            { block.type  = 'feature'; fieldsAdded += 1; }
  if (block.mvp === undefined){ block.mvp   = false;     fieldsAdded += 1; }
}

graph.version = 2;
if (!graph._note) {
  graph._note = 'v2 schema (migrate_v1_v2): blocks now carry layer/type/mvp. Layers declared at top for UI rendering.';
}

// Atomic write: tmp + rename so a mid-write crash leaves the old file intact
const tmpPath = graphPath + '.tmp';
fs.writeFileSync(tmpPath, JSON.stringify(graph, null, 2) + '\n', 'utf8');
fs.renameSync(tmpPath, graphPath);

console.log(`migrate_v1_v2: v1 → v2 complete. Fields added: ${fieldsAdded}. OK`);

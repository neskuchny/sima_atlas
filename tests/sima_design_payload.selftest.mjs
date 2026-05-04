#!/usr/bin/env node
// Selftest for scripts/build_sima_design_payload.mjs adapter.
//
// 8 test groups:
//  1. Adapter runs against the real atlas/ and produces a SIMA_DATA-shaped
//     payload (modules + edges + tasks + agents + product + _meta)
//  2. Status mapping: every visual status is one of {done, progress,
//     todo, fail, desync}
//  3. Layer mapping: every visual layer is one of {backend, frontend,
//     logic, tests}
//  4. Auto-layout: x/y are populated for every module
//  5. Edges built from depends_on with `block:capability` shape parsed
//  6. moduleDocs[id].short ≤ 240 chars (mission excerpt)
//  7. Per-client mode (synthetic client tree) writes to atlas/clients/<id>/
//  8. Multi-tenant fallback: ?client=<unknown> falls back to main atlas/

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSimaDesignPayload } from '../scripts/build_sima_design_payload.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

const VISUAL_STATUSES = new Set(['done', 'progress', 'todo', 'fail', 'desync']);
const VISUAL_LAYERS = new Set(['backend', 'frontend', 'logic', 'tests']);

try {
  // ─── Group 1: shape
  {
    const d = buildSimaDesignPayload();
    check('group1:has product', !!d.product && typeof d.product.title === 'string');
    check('group1:has modules array', Array.isArray(d.modules) && d.modules.length > 0,
      `modules.length=${d.modules?.length}`);
    check('group1:has edges array', Array.isArray(d.edges));
    check('group1:has tasks dict', d.tasks && typeof d.tasks === 'object');
    check('group1:has agents (4)', Array.isArray(d.agents) && d.agents.length === 4);
    check('group1:_meta has block_count', typeof d._meta?.block_count === 'number');
  }

  // ─── Group 2: status mapping
  {
    const d = buildSimaDesignPayload();
    for (const m of d.modules) {
      check(`group2:${m.id} status valid`, VISUAL_STATUSES.has(m.status),
        `got ${m.status}`);
    }
  }

  // ─── Group 3: layer mapping
  {
    const d = buildSimaDesignPayload();
    for (const m of d.modules) {
      check(`group3:${m.id} layer valid`, VISUAL_LAYERS.has(m.layer),
        `got ${m.layer}`);
    }
  }

  // ─── Group 4: auto-layout
  {
    const d = buildSimaDesignPayload();
    for (const m of d.modules) {
      check(`group4:${m.id} has x`, typeof m.x === 'number' && m.x > 0);
      check(`group4:${m.id} has y`, typeof m.y === 'number' && m.y > 0);
    }
  }

  // ─── Group 5: edges from depends_on
  {
    const d = buildSimaDesignPayload();
    // Each edge.from must reference a module id that exists
    const moduleIds = new Set(d.modules.map((m) => m.id));
    for (const e of d.edges) {
      check(`group5:edge from ${e.from} → ${e.to} from-id valid`,
        moduleIds.has(e.from), `from missing in modules`);
      check(`group5:edge has label`, typeof e.label === 'string' && e.label.length > 0);
      check(`group5:edge has biz copy`, typeof e.biz === 'string' && e.biz.length > 0);
    }
  }

  // ─── Group 6: moduleDocs short excerpt length
  {
    const d = buildSimaDesignPayload();
    for (const [id, doc] of Object.entries(d.moduleDocs || {})) {
      check(`group6:${id} short ≤ 240`, !doc.short || doc.short.length <= 240,
        `length=${doc.short?.length}`);
    }
  }

  // ─── Group 7: per-client tree
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'design-client-'));
    const clientId = 'synth-acme';
    const clientDir = path.join(REPO_ROOT, 'atlas', 'clients', clientId);
    // Use a fake atlas root via atlas_root parameter — avoids touching real repo
    const fakeRoot = path.join(tmp, 'fake-atlas');
    fs.mkdirSync(path.join(fakeRoot, 'blocks', 'b.x'), { recursive: true });
    fs.writeFileSync(path.join(fakeRoot, 'graph.json'), JSON.stringify({
      blocks: [{ id: 'b.x', title: 'X', layer: 'logic', status: 'wip', depends_on: [] }],
    }));
    fs.writeFileSync(path.join(fakeRoot, 'blocks', 'b.x', 'mission.md'),
      '# b.x — mission\n\nDoes X.\n');
    const d = buildSimaDesignPayload({ atlas_root: fakeRoot, client_id: clientId });
    check('group7:single module', d.modules.length === 1);
    check('group7:title preserved', d.modules[0].title === 'X');
    check('group7:status mapped', d.modules[0].status === 'progress');
    check('group7:layer mapped', d.modules[0].layer === 'logic');
    check('group7:moduleDocs short', /Does X/.test(d.moduleDocs['b.x']?.short || ''));
    check('group7:_meta carries client_id', d._meta.client_id === clientId);
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // ─── Group 8: unknown client falls back to main atlas
  {
    const d = buildSimaDesignPayload({ client_id: 'does-not-exist-xyzzy' });
    // _meta.atlas_root should point to plain `atlas`, not clients/<id>
    check('group8:fallback to main atlas', d._meta.atlas_root === 'atlas',
      `atlas_root=${d._meta.atlas_root}`);
    check('group8:_meta still records client_id', d._meta.client_id === 'does-not-exist-xyzzy');
    check('group8:modules from main repo', d.modules.length > 0);
  }
} catch (e) {
  failures.push('test runner threw: ' + e.message);
}

if (failures.length) {
  console.error('sima_design_payload.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('sima_design_payload.selftest: OK (8 test groups, all assertions green)');

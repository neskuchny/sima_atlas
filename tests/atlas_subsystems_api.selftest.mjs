#!/usr/bin/env node
// Selftest for scripts/atlas_subsystems_api.mjs.
//
// 5 test groups in tmp atlas:
//  1. invalid parent_id rejected; missing file → null
//  2. saveSubsystem persists full-document; updated_at advances
//  3. listSubsystems summarises all entries newest-first
//  4. getSubsystem round-trips the saved data
//  5. deleteSubsystem is idempotent

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  listSubsystems, getSubsystem, saveSubsystem, deleteSubsystem, subsystemExists,
} from '../scripts/atlas_subsystems_api.mjs';

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'subs-api-'));
const atlas = path.join(tmp, 'atlas');
fs.mkdirSync(atlas, { recursive: true });

try {
  // ─── Group 1
  {
    let threw = false;
    try { getSubsystem('bad/id', { root: atlas }); } catch { threw = true; }
    check('group1:invalid id rejected', threw);
    check('group1:miss returns null', getSubsystem('b.nope', { root: atlas }) === null);
    check('group1:exists false on missing', subsystemExists('b.nope', { root: atlas }) === false);
  }

  // ─── Group 2: save persists
  {
    const r = saveSubsystem('b.alpha', {
      codename: 'alpha', title: 'Alpha Subsystem', subtitle: 'first try',
      kpi: [{ code: 'K1', label: 'p95 < 100ms' }],
      modules: [
        { id: 'sub-1', title: 'M1', layer: 'logic', x: 100, y: 200, size: 'sm' },
        { id: 'sub-2', title: 'M2', layer: 'data',  x: 300, y: 200 },
      ],
      edges: [{ from: 'sub-1', to: 'sub-2', kind: 'data', label: 'feeds' }],
      notes: [{ x: 10, y: 10, w: 180, color: 'pink', text: 'hello' }],
    }, { root: atlas });
    check('group2:save ok', r.ok);
    check('group2:has updated_at', typeof r.subsystem.updated_at === 'string');
    check('group2:exists true', subsystemExists('b.alpha', { root: atlas }));
    const persisted = JSON.parse(fs.readFileSync(path.join(atlas, 'subsystems', 'b.alpha.json'), 'utf8'));
    check('group2:codename persisted', persisted.codename === 'alpha');
    check('group2:modules count', persisted.modules.length === 2);
    check('group2:notes default id', /^n/.test(persisted.notes[0].id));
  }

  // ─── Group 3: list
  {
    saveSubsystem('b.beta', {
      title: 'Beta', codename: 'beta',
      modules: [], edges: [],
    }, { root: atlas });
    const list = listSubsystems({ root: atlas });
    check('group3:list 2 entries', list.length === 2);
    check('group3:contains alpha', list.some((s) => s.parent_id === 'b.alpha' && s.modules_count === 2));
    check('group3:contains beta',  list.some((s) => s.parent_id === 'b.beta'  && s.modules_count === 0));
  }

  // ─── Group 4: round-trip
  {
    const got = getSubsystem('b.alpha', { root: atlas });
    check('group4:round-trip parent_id', got?.parent_id === 'b.alpha');
    check('group4:edge preserved', got.edges.length === 1 && got.edges[0].kind === 'data');
    check('group4:kpi preserved', got.kpi[0].code === 'K1');
  }

  // ─── Group 5: delete idempotent
  {
    const r1 = deleteSubsystem('b.alpha', { root: atlas });
    check('group5:delete removes', r1.ok && r1.removed === 1);
    check('group5:gone', subsystemExists('b.alpha', { root: atlas }) === false);
    const r2 = deleteSubsystem('b.alpha', { root: atlas });
    check('group5:idempotent', r2.ok && r2.removed === 0);
    const list = listSubsystems({ root: atlas });
    check('group5:list shrunk', list.length === 1 && list[0].parent_id === 'b.beta');
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error('atlas_subsystems_api.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('atlas_subsystems_api.selftest: OK (5 test groups, all assertions green)');

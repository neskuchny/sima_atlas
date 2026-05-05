#!/usr/bin/env node
// Selftest for scripts/atlas_files_api.mjs.
//
// 5 test groups in tmp atlas:
//  1. validation: bad path / status rejected
//  2. markFile add → list returns it
//  3. markFile updates an existing entry; updated_at advances
//  4. dead/archived path filtered out by filterAlive; alive default for unregistered
//  5. md mirror is regenerated; syncFromBlockFilesMd imports flagged entries

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  listFiles, getFile, markFile, removeFile, isAlive, filterAlive, syncFromBlockFilesMd,
} from '../scripts/atlas_files_api.mjs';

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'files-api-'));
const atlas = path.join(tmp, 'atlas');
fs.mkdirSync(atlas, { recursive: true });

try {
  // ─── Group 1: validation
  {
    let threw = false;
    try { markFile({ root: atlas, path: '../etc/passwd', status: 'alive' }); } catch { threw = true; }
    check('group1:path traversal rejected', threw);
    threw = false;
    try { markFile({ root: atlas, path: '/abs/path', status: 'alive' }); } catch { threw = true; }
    check('group1:absolute rejected', threw);
    threw = false;
    try { markFile({ root: atlas, path: 'src/auth.ts', status: 'bogus' }); } catch { threw = true; }
    check('group1:invalid status rejected', threw);
  }

  // ─── Group 2: add + list
  {
    const r = markFile({ root: atlas, path: 'src/auth/login.ts', status: 'alive', block_id: 'b.auth', reason: 'current impl' });
    check('group2:mark ok', r.ok && r.entry.status === 'alive');
    const list = listFiles({ root: atlas });
    check('group2:list has 1', list.length === 1);
    const got = getFile('src/auth/login.ts', { root: atlas });
    check('group2:get returns entry', got?.status === 'alive');
    check('group2:miss returns null', getFile('nope.ts', { root: atlas }) === null);
  }

  // ─── Group 3: update existing
  {
    const before = getFile('src/auth/login.ts', { root: atlas });
    const wait = Date.now(); while (Date.now() - wait < 5) {}
    const r = markFile({ root: atlas, path: 'src/auth/login.ts', status: 'dead', reason: 'replaced 2026-05-05' });
    check('group3:update ok', r.ok && r.entry.status === 'dead');
    check('group3:updated_at advanced', r.entry.updated_at !== before.updated_at);
    check('group3:reason persisted', r.entry.reason === 'replaced 2026-05-05');
    check('group3:block preserved', r.entry.block === 'b.auth');
    check('group3:list still 1', listFiles({ root: atlas }).length === 1);
  }

  // ─── Group 4: alive filtering
  {
    markFile({ root: atlas, path: 'src/auth/login_v2.ts', status: 'alive', block_id: 'b.auth' });
    markFile({ root: atlas, path: 'scripts/migrate_2025.py', status: 'archived', block_id: null });
    const all = ['src/auth/login.ts', 'src/auth/login_v2.ts', 'scripts/migrate_2025.py', 'src/never_registered.ts'];
    const alive = filterAlive(all, { root: atlas });
    check('group4:dead filtered', !alive.includes('src/auth/login.ts'));
    check('group4:archived filtered', !alive.includes('scripts/migrate_2025.py'));
    check('group4:alive kept', alive.includes('src/auth/login_v2.ts'));
    check('group4:unregistered kept (default-alive)', alive.includes('src/never_registered.ts'));
    check('group4:isAlive dead → false', isAlive('src/auth/login.ts', { root: atlas }) === false);
    check('group4:isAlive missing → true', isAlive('what.ts', { root: atlas }) === true);
  }

  // ─── Group 5: md mirror + import from files.md
  {
    const md = fs.readFileSync(path.join(atlas, 'files_registry.md'), 'utf8');
    check('group5:md exists', md.includes('# Files registry'));
    check('group5:md has table', md.includes('| path |'));
    check('group5:md has dead entry', /login\.ts.*dead/.test(md));

    const r = syncFromBlockFilesMd({
      root: atlas, block_id: 'b.docs',
      files_md_text: '- atlas/blocks/b.docs/mission.md [alive]\n- atlas/blocks/b.docs/old_draft.md [archived]\n',
    });
    check('group5:import 2 entries', r.added === 2);
    check('group5:imported has alive', getFile('atlas/blocks/b.docs/mission.md', { root: atlas })?.status === 'alive');
    check('group5:imported has archived', getFile('atlas/blocks/b.docs/old_draft.md', { root: atlas })?.status === 'archived');

    const rm = removeFile('src/auth/login_v2.ts', { root: atlas });
    check('group5:remove works', rm.removed === 1);
    check('group5:remove idempotent', removeFile('src/auth/login_v2.ts', { root: atlas }).removed === 0);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error('atlas_files_api.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('atlas_files_api.selftest: OK (5 test groups, all assertions green)');

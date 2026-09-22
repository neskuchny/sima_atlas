#!/usr/bin/env node
// R-8.11 (b.db) — acceptance A4 as a deterministic check: running
// scripts/migrate_v1_v2.mjs on an old v1 graph.json gives a valid v2 «without
// data loss». This used to be judged by an LLM; it is a property of one
// script on one file, so it is run and compared.
//
//   g1 — every field of every v1 block survives unchanged (ids, titles,
//        statuses, depends_on, custom fields, unknown top-level keys);
//   g2 — the v2 additions are there: version 2, a layers array, and
//        layer/type/mvp on blocks that lacked them — without overwriting a
//        value a block already had;
//   g3 — idempotent: a second run on the v2 result writes nothing.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const failures = [];
const check = (name, cond, detail = '') => { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); };

const v1 = {
  // no `version` → v1
  project: 'legacy-demo',
  custom_top_level: { keep: ['me', 1] },
  blocks: [
    { id: 'b.auth', title: 'Auth', status: 'done', depends_on: [], owner: 'team-a', updated_at: '2025-11-02T10:00:00Z' },
    { id: 'b.pay', title: 'Payments', status: 'wip', depends_on: ['b.auth'], notes: 'stripe', layer: 'data' },
    { id: 'b.ui', title: 'UI', status: 'idea', depends_on: [{ block_id: 'b.pay' }], mvp: true, type: 'screen' },
  ],
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-migrate-'));
const graphPath = path.join(tmp, 'atlas', 'graph.json');
fs.mkdirSync(path.dirname(graphPath), { recursive: true });
fs.writeFileSync(graphPath, JSON.stringify(v1, null, 2) + '\n');
const migrate = () => spawnSync('node', [path.join(ROOT, 'scripts', 'migrate_v1_v2.mjs')], { cwd: tmp, encoding: 'utf8' });

try {
  const r = migrate();
  check('migration exits 0', r.status === 0, (r.stderr || '').slice(0, 200));
  const v2 = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

  // ── g1: nothing from v1 is lost or altered ─────────────────────────────
  for (const [k, val] of Object.entries(v1)) {
    if (k === 'blocks') continue;
    check(`g1: top-level «${k}» kept`, JSON.stringify(v2[k]) === JSON.stringify(val), JSON.stringify(v2[k]));
  }
  check('g1: same blocks, same order', JSON.stringify(v2.blocks.map((b) => b.id)) === JSON.stringify(v1.blocks.map((b) => b.id)));
  for (const old of v1.blocks) {
    const now = v2.blocks.find((b) => b.id === old.id) || {};
    for (const [k, val] of Object.entries(old)) {
      check(`g1: ${old.id}.${k} unchanged`, JSON.stringify(now[k]) === JSON.stringify(val), `${JSON.stringify(val)} → ${JSON.stringify(now[k])}`);
    }
  }

  // ── g2: the v2 shape ───────────────────────────────────────────────────
  check('g2: version 2', v2.version === 2);
  check('g2: layers declared', Array.isArray(v2.layers) && v2.layers.length > 0 && v2.layers.every((l) => l.id && Number.isFinite(l.order)));
  check('g2: every block has layer/type/mvp', v2.blocks.every((b) => b.layer && b.type && typeof b.mvp === 'boolean'));
  check('g2: a layer a block already had is not overwritten', v2.blocks.find((b) => b.id === 'b.pay').layer === 'data');
  check('g2: mvp/type a block already had are not overwritten', (() => { const b = v2.blocks.find((x) => x.id === 'b.ui'); return b.mvp === true && b.type === 'screen'; })());

  // ── g3: idempotent ─────────────────────────────────────────────────────
  const before = fs.readFileSync(graphPath, 'utf8');
  const mtime = fs.statSync(graphPath).mtimeMs;
  const r2 = migrate();
  check('g3: a second run exits 0 and says there is nothing to do', r2.status === 0 && /already v2/.test(r2.stdout), r2.stdout);
  check('g3: …and writes nothing', fs.readFileSync(graphPath, 'utf8') === before && fs.statSync(graphPath).mtimeMs === mtime);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error('migrate_v1_v2.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('migrate_v1_v2.selftest: OK (3 groups, all assertions green)');

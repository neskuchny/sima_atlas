#!/usr/bin/env node
// Selftest for scripts/atlas_blocks_api.mjs (design UI write API).
//
// 8 test groups in tmp atlas:
//  1. createBlock writes graph.json + 8 contract files
//  2. createBlock rejects duplicate id
//  3. patchBlock updates title/status/canvas_x/canvas_y
//  4. patchBlock writes audit line into checks.log
//  5. deleteBlock soft-archives (status=archived) by default
//  6. addEdge appends depends_on + auto-adds capability to target's provides
//  7. deleteEdge removes the entry
//  8. addNote / patchNote / deleteNote round-trip on notes.json

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createBlock, patchBlock, deleteBlock,
  addEdge, deleteEdge,
  addNote, patchNote, deleteNote, listNotes,
} from '../scripts/atlas_blocks_api.mjs';

const __filename = fileURLToPath(import.meta.url);

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blocks-api-'));
const atlas = path.join(tmp, 'atlas');
fs.mkdirSync(atlas, { recursive: true });
fs.writeFileSync(path.join(atlas, 'graph.json'), JSON.stringify({ blocks: [], layers: [] }));

try {
  // ─── Group 1: createBlock seeds 8 contract files
  {
    const r = createBlock({ atlas_root: atlas, body: { id: 'b.synth-x', title: 'Synth X', layer: 'logic', x: 100, y: 200 } });
    check('group1:ok', r.ok);
    const dir = path.join(atlas, 'blocks', 'b.synth-x');
    for (const f of ['mission.md', 'kpi.md', 'acceptance.md', 'tasks.md', 'depends_on.md', 'provides.md', 'files.md', 'checks.log']) {
      check(`group1:${f} exists`, fs.existsSync(path.join(dir, f)));
    }
    const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));
    const blk = graph.blocks.find((b) => b.id === 'b.synth-x');
    check('group1:graph has block', !!blk);
    check('group1:canvas_x stored', blk.canvas_x === 100);
    check('group1:canvas_y stored', blk.canvas_y === 200);
  }

  // ─── Group 2: duplicate id rejected
  {
    let threw = false;
    try { createBlock({ atlas_root: atlas, body: { id: 'b.synth-x' } }); } catch { threw = true; }
    check('group2:duplicate rejected', threw);
  }

  // ─── Group 3: patchBlock updates fields
  {
    const r = patchBlock({
      atlas_root: atlas, block_id: 'b.synth-x',
      body: { title: 'Synth X v2', status: 'wip', x: 150, y: 250, size: 'lg' },
    });
    check('group3:patch ok', r.ok);
    check('group3:changed has title', r.changed.title === 'Synth X v2');
    check('group3:changed has canvas_x=150', r.changed.canvas_x === 150);

    const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));
    const blk = graph.blocks.find((b) => b.id === 'b.synth-x');
    check('group3:title updated', blk.title === 'Synth X v2');
    check('group3:status updated', blk.status === 'wip');
    check('group3:canvas_x updated', blk.canvas_x === 150);
    check('group3:canvas_size lg', blk.canvas_size === 'lg');
  }

  // ─── Group 4: patch audit
  {
    const log = fs.readFileSync(path.join(atlas, 'blocks', 'b.synth-x', 'checks.log'), 'utf8');
    check('group4:audit line present', /design_patch\s+pass/.test(log));
  }

  // ─── Group 5: deleteBlock soft-archives
  {
    const r = deleteBlock({ atlas_root: atlas, block_id: 'b.synth-x' });
    check('group5:archived', r.mode === 'archived');
    const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));
    const blk = graph.blocks.find((b) => b.id === 'b.synth-x');
    check('group5:status=archived', blk && blk.status === 'archived');
    check('group5:files preserved', fs.existsSync(path.join(atlas, 'blocks', 'b.synth-x', 'mission.md')));
  }

  // ─── Group 6: addEdge appends depends_on + provides
  {
    createBlock({ atlas_root: atlas, body: { id: 'b.alpha', title: 'A', layer: 'logic' } });
    createBlock({ atlas_root: atlas, body: { id: 'b.beta',  title: 'B', layer: 'data' } });
    const r = addEdge({ atlas_root: atlas, body: { from: 'b.alpha', to: 'b.beta', capability: 'beta_data' } });
    check('group6:add ok', r.ok);
    check('group6:capability returned', r.edge.capability === 'beta_data');

    const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));
    const alpha = graph.blocks.find((b) => b.id === 'b.alpha');
    check('group6:alpha depends_on has b.beta', (alpha.depends_on || []).some((d) => String(d).startsWith('b.beta')));

    const dpath = path.join(atlas, 'blocks', 'b.alpha', 'depends_on.md');
    check('group6:depends_on.md updated', /b\.beta:\s*beta_data/.test(fs.readFileSync(dpath, 'utf8')));

    const ppath = path.join(atlas, 'blocks', 'b.beta', 'provides.md');
    check('group6:beta provides.md got beta_data', /\bbeta_data\b/.test(fs.readFileSync(ppath, 'utf8')));
  }

  // ─── Group 7: deleteEdge removes it
  {
    const r = deleteEdge({ atlas_root: atlas, body: { from: 'b.alpha', to: 'b.beta' } });
    check('group7:delete ok', r.ok && r.removed === 1);
    const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));
    const alpha = graph.blocks.find((b) => b.id === 'b.alpha');
    check('group7:depends_on cleared', !(alpha.depends_on || []).some((d) => String(d).startsWith('b.beta')));
  }

  // ─── Group 8: notes round-trip
  {
    const a = addNote({ atlas_root: atlas, body: { x: 10, y: 20, w: 200, color: 'yellow', text: 'first' } });
    check('group8:add ok', a.ok && a.note.id);
    const id = a.note.id;
    const p = patchNote({ atlas_root: atlas, note_id: id, body: { text: 'updated', color: 'pink' } });
    check('group8:patch ok', p.ok && p.note.text === 'updated' && p.note.color === 'pink');
    const list = listNotes({ atlas_root: atlas });
    check('group8:list has 1', list.length === 1);
    const d = deleteNote({ atlas_root: atlas, note_id: id });
    check('group8:delete ok', d.ok && d.removed === 1);
    check('group8:list empty', listNotes({ atlas_root: atlas }).length === 0);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error('atlas_blocks_api.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('atlas_blocks_api.selftest: OK (8 test groups, all assertions green)');

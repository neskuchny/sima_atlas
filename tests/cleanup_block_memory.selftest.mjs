#!/usr/bin/env node
// Selftest for scripts/cleanup_block_memory.mjs.
//
// 4 test groups in a tmp atlas:
//   1. invalid block_id rejected; missing block dir handled
//   2. decisions.log: < cap leaves file untouched
//   3. decisions.log: > cap trims to 200 keeping header
//   4. patterns.md: > 30 sections trims oldest, preserves preamble

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  cleanupBlockMemory, cleanupAllBlocks,
} from '../scripts/cleanup_block_memory.mjs';

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-mem-'));
const atlas = path.join(tmp, 'atlas');
fs.mkdirSync(atlas, { recursive: true });

try {
  // Group 1
  {
    let threw = false;
    try { cleanupBlockMemory(); } catch { threw = true; }
    check('group1:no block_id rejected', threw);
    const r = cleanupBlockMemory('b.nope', { root: atlas });
    check('group1:missing block returns error', r.ok === false);
  }

  // Group 2: small decisions.log untouched
  {
    const dir = path.join(atlas, 'blocks', 'b.small');
    fs.mkdirSync(dir, { recursive: true });
    const lines = ['# decisions', ''];
    for (let i = 0; i < 50; i++) lines.push(`2026-05-05T00:00:${String(i).padStart(2, '0')}Z\tnote\trun-${i}\tdecision ${i}`);
    fs.writeFileSync(path.join(dir, 'decisions.log'), lines.join('\n') + '\n');
    const r = cleanupBlockMemory('b.small', { root: atlas });
    check('group2:no trim when under cap', r.decisions_trimmed === 0);
    check('group2:kept all 50', r.decisions_kept === 50);
  }

  // Group 3: large decisions.log trimmed
  {
    const dir = path.join(atlas, 'blocks', 'b.big');
    fs.mkdirSync(dir, { recursive: true });
    const lines = ['# decisions', ''];
    for (let i = 0; i < 350; i++) lines.push(`2026-05-05T00:00:${String(i).padStart(2, '0')}Z\tnote\trun-${i}\tdecision ${i}`);
    fs.writeFileSync(path.join(dir, 'decisions.log'), lines.join('\n') + '\n');
    const r = cleanupBlockMemory('b.big', { root: atlas });
    check('group3:trimmed 150', r.decisions_trimmed === 150);
    check('group3:kept 200', r.decisions_kept === 200);
    const after = fs.readFileSync(path.join(dir, 'decisions.log'), 'utf8');
    check('group3:header preserved', after.startsWith('# decisions'));
    check('group3:newest preserved', after.includes('decision 349'));
    check('group3:oldest dropped', !after.includes('decision 0\n'));
    // Idempotent
    const r2 = cleanupBlockMemory('b.big', { root: atlas });
    check('group3:idempotent', r2.decisions_trimmed === 0);
  }

  // Group 4: patterns.md sections
  {
    const dir = path.join(atlas, 'blocks', 'b.patterns');
    fs.mkdirSync(dir, { recursive: true });
    const parts = [
      '# b.patterns — patterns\n',
      '_(preamble: некоторое описание паттернов)_\n\n',
    ];
    for (let i = 0; i < 50; i++) {
      parts.push(`## b.patterns__run-${i} — Succeeded\n_2026-05-05T00:00:${String(i).padStart(2, '0')}Z_\n\nSummary ${i}\n\n`);
    }
    fs.writeFileSync(path.join(dir, 'patterns.md'), parts.join(''));
    const r = cleanupBlockMemory('b.patterns', { root: atlas });
    check('group4:trimmed 20', r.patterns_trimmed === 20);
    check('group4:kept 30', r.patterns_kept === 30);
    const after = fs.readFileSync(path.join(dir, 'patterns.md'), 'utf8');
    check('group4:preamble preserved', /preamble: некоторое описание/.test(after));
    check('group4:newest section preserved', after.includes('## b.patterns__run-49'));
    check('group4:oldest section dropped', !after.includes('## b.patterns__run-0 '));

    // Test cleanupAllBlocks across the whole tmp atlas
    const all = cleanupAllBlocks({ root: atlas });
    check('group4:all-blocks ok', all.ok === true && all.blocks >= 3);
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error('cleanup_block_memory.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('cleanup_block_memory.selftest: OK (4 test groups, all assertions green)');

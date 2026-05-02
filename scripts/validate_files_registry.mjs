#!/usr/bin/env node
// PR2: validate that every file path mentioned in atlas/blocks/<id>/files.md
// either exists on disk OR is explicitly tagged [archived] / [dead] / [pending].
//
// Format expected in files.md:
//   - <path> [alive]
//   - <path> [alive] (optional comment)
//   - <path> [archived]
//   - <path> [dead] (reason)
//   - <path> [pending] (will appear in PRn)
//
// "alive" entries with non-existent paths are hard errors.
// "archived"/"dead" with existing paths trigger a warning (clean up suggested).
// Lines starting with "(none" are accepted as empty lists.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const blocksRoot = path.join(atlas, 'blocks');
const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));

const errors = [];
const warnings = [];
let totalAlive = 0;
let totalArchived = 0;
let totalDead = 0;

for (const b of graph.blocks || []) {
  const filesPath = path.join(blocksRoot, b.id, 'files.md');
  if (!fs.existsSync(filesPath)) {
    warnings.push(`${b.id}: files.md missing`);
    continue;
  }
  const content = fs.readFileSync(filesPath, 'utf8');

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('- ')) continue;
    if (/^- \(none/i.test(line)) continue;

    // Parse: "- <path> [tag] (optional comment)"
    const m = line.match(/^- (.+?)\s*\[(alive|archived|dead|pending)\]/i);
    if (!m) {
      errors.push(`${b.id}: malformed entry in files.md → "${line}"`);
      continue;
    }
    const filePath = m[1].trim();
    const tag = m[2].toLowerCase();
    const absPath = path.join(root, filePath);
    const exists = fs.existsSync(absPath);

    if (tag === 'alive') {
      totalAlive += 1;
      if (!exists) errors.push(`${b.id}: alive file missing → ${filePath}`);
    } else if (tag === 'archived') {
      totalArchived += 1;
      if (exists) warnings.push(`${b.id}: archived file still on disk → ${filePath} (consider deleting)`);
    } else if (tag === 'dead') {
      totalDead += 1;
      if (exists) warnings.push(`${b.id}: dead file still on disk → ${filePath} (consider deleting)`);
    } else if (tag === 'pending') {
      if (exists) warnings.push(`${b.id}: pending file already exists, switch tag to alive → ${filePath}`);
    }
  }
}

if (warnings.length) {
  console.warn('Files registry warnings:');
  warnings.forEach((w) => console.warn(' ⚠', w));
}

if (errors.length) {
  console.error('Files registry validation FAILED:');
  errors.forEach((e) => console.error(' ✗', e));
  process.exit(1);
}

console.log(
  `Files registry validation: OK (alive=${totalAlive}, archived=${totalArchived}, dead=${totalDead})`
);

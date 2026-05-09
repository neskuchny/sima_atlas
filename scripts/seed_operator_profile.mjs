#!/usr/bin/env node
// R-7.78 — seed missing operator-profile memory files so the read-side
// pipelines (build_context_pack, run_block_implementation, MCP tools)
// have something to load instead of returning empty.
//
// The audit (R-7.X) found that lessons.json / dont_use.json /
// always_use.json don't exist on disk for fresh installs — every reader
// silently returns empty, and the agent never sees architectural
// constraints the operator typed into UI/MCP.
//
// This script creates them with the minimal canonical schema:
//   { version: 1, entries: [...] }
// for dont_use / always_use, and
//   { version: 1, lessons: [...] }
// for lessons. Idempotent: only creates if missing, never overwrites.
//
// Each entry has: { id, block_id?, rule|lesson|text, reason?, ts, severity? }

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const PROFILE_DIR = path.join(ROOT, 'atlas', 'operator_profile');

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function seed(filename, content) {
  const p = path.join(PROFILE_DIR, filename);
  if (fs.existsSync(p)) {
    console.log(`[seed] ${filename} already exists — leaving as-is`);
    return false;
  }
  fs.writeFileSync(p, JSON.stringify(content, null, 2) + '\n', 'utf8');
  console.log(`[seed] created ${filename}`);
  return true;
}

ensureDir(PROFILE_DIR);

const created = [];
if (seed('lessons.json', {
  version: 1,
  schema: 'lessons',
  description: 'Append-only operator-level lessons distilled from runs across blocks. Each lesson is a short EN/RU sentence operators or agents can read at prompt-time. block_id field optional — global lessons (no block_id) apply everywhere.',
  lessons: [],
})) created.push('lessons.json');

if (seed('dont_use.json', {
  version: 1,
  schema: 'dont_use',
  description: 'Operator-locked rules: NEVER do X. Each entry is read by run_block_implementation prompt and by guard_against_drift runtime check. block_id optional. Severity: hard (block run) | soft (warn). Reason mandatory so future operators understand why.',
  entries: [],
})) created.push('dont_use.json');

if (seed('always_use.json', {
  version: 1,
  schema: 'always_use',
  description: 'Operator-locked rules: ALWAYS do Y. Read by run_block_implementation prompt. block_id optional. Reason mandatory.',
  entries: [],
})) created.push('always_use.json');

if (created.length) {
  console.log(`\n✓ seeded ${created.length} files: ${created.join(', ')}`);
  console.log('  These are now visible to:');
  console.log('  - build_context_pack.mjs (loadOperatorMemory)');
  console.log('  - run_block_implementation.mjs (prompt assembly)');
  console.log('  - inject_context_pack.mjs (Cursor host injection)');
  console.log('  - MCP tools: list_lessons / list_dont_use / list_always_use / add_lesson / set_dont_use / set_always_use');
  console.log('\n  Add entries via the canvas UI, MCP tools, or by hand-editing the JSON.');
} else {
  console.log('\n✓ all 3 operator-profile memory files already exist');
}

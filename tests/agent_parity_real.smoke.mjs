#!/usr/bin/env node
// PR4.5: real parity diff — confirm Cursor (MCP) and Claude (CLI --add-dir)
// see the SAME bytes for a given block.
//
// Cursor flow:
//   build_context_pack.mjs <id> → atlas/context_packs/<id>.json
//   that JSON references mission/kpi/acceptance/depends_on/provides/files +
//   the project-level rules/tech_stack/project.md.
//
// Claude Code flow:
//   claude --add-dir atlas/blocks/<id> --add-dir atlas
//   reads the same .md files directly from disk.
//
// So real parity = "the set of bytes in atlas/blocks/<id>/*.md unioned with
// atlas/{project,rules,tech_stack}.md is exactly what context_packs/<id>.json
// contains under known keys, with no extra/missing data."
//
// This smoke walks every block in atlas/graph.json and asserts that.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');
const BLOCKS = path.join(ATLAS, 'blocks');

function read(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }

const failures = [];
const graph = JSON.parse(read(path.join(ATLAS, 'graph.json')));
const projectMd = read(path.join(ATLAS, 'project.md')).trim();
const rulesMd = read(path.join(ATLAS, 'rules.md')).trim();
const techStackMd = read(path.join(ATLAS, 'tech_stack.md')).trim();

for (const b of graph.blocks || []) {
  const blockDir = path.join(BLOCKS, b.id);
  if (!fs.existsSync(blockDir)) {
    failures.push(`${b.id}: block dir missing — Claude CLI --add-dir would 404`);
    continue;
  }
  // Build pack via the same code path Cursor MCP uses.
  execFileSync('node', ['scripts/build_context_pack.mjs', b.id], { cwd: ROOT, stdio: 'pipe' });
  const packPath = path.join(ATLAS, 'context_packs', `${b.id}.json`);
  if (!fs.existsSync(packPath)) {
    failures.push(`${b.id}: context_pack not generated`);
    continue;
  }
  const pack = JSON.parse(read(packPath));

  // Project-level parity
  if ((pack.project?.project || '').trim() !== projectMd) failures.push(`${b.id}: project.md drifted between MCP pack and disk`);
  if ((pack.project?.rules || '').trim() !== rulesMd) failures.push(`${b.id}: rules.md drifted`);
  if ((pack.project?.tech_stack || '').trim() !== techStackMd) failures.push(`${b.id}: tech_stack.md drifted`);

  // Block-level parity (exactly the files Claude --add-dir would surface)
  const expect = {
    mission: read(path.join(blockDir, 'mission.md')).trim(),
    kpi: read(path.join(blockDir, 'kpi.md')).trim(),
    acceptance: read(path.join(blockDir, 'acceptance.md')).trim(),
    tasks: read(path.join(blockDir, 'tasks.md')).trim(),
    files: read(path.join(blockDir, 'files.md')).trim(),
  };
  // Pattern keys may be missing in pack; treat absent === '' for parity.
  for (const [key, expected] of Object.entries(expect)) {
    const got = (pack.block && typeof pack.block[key] === 'string') ? pack.block[key].trim() : '';
    if (got !== expected) {
      failures.push(`${b.id}/${key}: MCP context-pack does NOT match disk — ${expected.length}b vs ${got.length}b`);
    }
  }

  // Patterns: not part of the contract, but include if present
  const patterns = read(path.join(blockDir, 'patterns.md')).trim();
  if (patterns && pack.block && typeof pack.block.patterns === 'string') {
    if (pack.block.patterns.trim() !== patterns) {
      failures.push(`${b.id}/patterns: drift between MCP pack and disk`);
    }
  }
}

if (failures.length) {
  console.error('agent_parity_real.smoke: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log(`agent_parity_real.smoke: OK (${(graph.blocks || []).length} blocks, MCP pack ≡ disk)`);

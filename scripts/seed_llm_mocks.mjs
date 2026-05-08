#!/usr/bin/env node
// PR-Eval: seed tests/llm_mocks/<promptHash>.json from the golden set so
// the eval runner has a deterministic mock answer for every dialog.
//
// For each golden case:
//   - compute prompt-only hash via mockHashForPrompt(dialog)
//   - take expected.blocks[] and lift them to the BLOCK_EXTRACTION_SCHEMA shape
//     (filling in defaults for fields the eval doesn't grade so the mock stays
//     schema-valid)
//   - write tests/llm_mocks/<hash>.json
//
// Idempotent: skips files that already exist with identical content.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockHashForPrompt } from '../scripts/llm_gateway.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const GOLDEN = path.join(ROOT, 'tests', 'fixtures', 'extraction_golden.json');
const MOCK_DIR = path.join(ROOT, 'tests', 'llm_mocks');

const goldens = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
fs.mkdirSync(MOCK_DIR, { recursive: true });

let written = 0;
let unchanged = 0;
for (const g of goldens) {
  const hash = mockHashForPrompt(g.dialog);
  const fixture = {
    blocks: (g.expected.blocks || []).map((b) => ({
      id: b.id,
      title: b.title || b.id,
      mission: b.mission || `${b.title || b.id}: described in dialog`,
      layer: b.layer || 'logic',
      type: 'module',
      mvp: false,
      status: 'idea',
      depends_on: b.depends_on || [],
      provides: b.provides || [],
      tech_stack: b.tech_stack || [],
      confidence: 0.9,
    })),
  };
  const out = path.join(MOCK_DIR, `${hash}.json`);
  const next = JSON.stringify(fixture, null, 2) + '\n';
  if (fs.existsSync(out) && fs.readFileSync(out, 'utf8') === next) {
    unchanged += 1;
    continue;
  }
  fs.writeFileSync(out, next, 'utf8');
  written += 1;
}

console.log(`seed_llm_mocks: ${written} written, ${unchanged} unchanged, ${goldens.length} total`);

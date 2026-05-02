#!/usr/bin/env node
// PR4: beforeSubmitPrompt hook action.
//
// Detects which block the user is talking about and prints a compact context
// pack to stdout so Cursor can prepend it to the agent prompt. The detection
// strategy is local-first (no LLM call):
//   1. Explicit env: CURSOR_BLOCK_ID / SIMA_BLOCK_ID
//   2. Block id mentioned in the user prompt (CURSOR_PROMPT / argv joined),
//      e.g. "продолжи b.payments" → b.payments
//   3. Recent file edit owner: latest atlas/process_runs/cursor_observations/*.json
//      whose `owners` array is non-empty
//   4. Atlas project default (head of graph.blocks)
//
// Output (markdown) is bounded by SIMA_CONTEXT_PACK_MAX_BYTES (default 12000).
// The pack contains: project mission, rules, tech_stack, the block's mission,
// kpi, acceptance, depends_on, and a list of files registered to the block.
// On error — emits a one-line warning to stderr and exits 0 so the user can
// still type their prompt without disruption.
//
// CLI usage (for tests):
//   SIMA_BLOCK_ID=b.docs node scripts/inject_context_pack.mjs
//   node scripts/inject_context_pack.mjs "продолжи b.docs - нужен mermaid"

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');
const BLOCKS = path.join(ATLAS, 'blocks');

const MAX_BYTES = Number(process.env.SIMA_CONTEXT_PACK_MAX_BYTES || 12000);

function readSafe(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }

function getPrompt() {
  const candidates = [
    process.env.CURSOR_PROMPT,
    process.env.CURSOR_BEFORE_SUBMIT_PROMPT_TEXT,
    process.env.CURSOR_HOOK_PROMPT,
  ];
  for (const c of candidates) if (c && c.trim()) return c.trim();
  if (process.argv.length > 2) return process.argv.slice(2).join(' ').trim();
  return '';
}

function detectBlockIdFromPrompt(text, blockIds) {
  if (!text) return null;
  // Look for any registered block id verbatim (b.payments, b.core-sync, etc.).
  for (const id of blockIds) {
    const re = new RegExp(`\\b${id.replace(/\./g, '\\.')}\\b`);
    if (re.test(text)) return id;
  }
  return null;
}

function lastObservedOwner() {
  const dir = path.join(ATLAS, 'process_runs', 'cursor_observations');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse();
  for (const f of files) {
    try {
      const ev = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (Array.isArray(ev.owners) && ev.owners.length) return ev.owners[0];
    } catch {}
  }
  return null;
}

function blockMeta(blockId) {
  const dir = path.join(BLOCKS, blockId);
  if (!fs.existsSync(dir)) return null;
  return {
    mission: readSafe(path.join(dir, 'mission.md')),
    kpi: readSafe(path.join(dir, 'kpi.md')),
    acceptance: readSafe(path.join(dir, 'acceptance.md')),
    tasks: readSafe(path.join(dir, 'tasks.md')),
    depends: readSafe(path.join(dir, 'depends_on.md')),
    provides: readSafe(path.join(dir, 'provides.md')),
    files: readSafe(path.join(dir, 'files.md')),
  };
}

function shorten(s, max) {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n\n…(truncated, ${s.length - max} chars omitted)…\n`;
}

try {
  const graph = JSON.parse(readSafe(path.join(ATLAS, 'graph.json')) || '{}');
  const blockIds = (graph.blocks || []).map((b) => b.id);
  const prompt = getPrompt();
  const blockId =
    process.env.CURSOR_BLOCK_ID ||
    process.env.SIMA_BLOCK_ID ||
    detectBlockIdFromPrompt(prompt, blockIds) ||
    lastObservedOwner() ||
    blockIds[0];

  if (!blockId) {
    process.stderr.write('inject_context_pack: no block id resolvable; nothing to inject\n');
    process.exit(0);
  }

  const meta = blockMeta(blockId);
  if (!meta) {
    process.stderr.write(`inject_context_pack: block dir not found for ${blockId}\n`);
    process.exit(0);
  }

  const project = readSafe(path.join(ATLAS, 'project.md'));
  const rules = readSafe(path.join(ATLAS, 'rules.md'));
  const techStack = readSafe(path.join(ATLAS, 'tech_stack.md'));

  // Tight per-section budgets so we never overshoot MAX_BYTES.
  const SECTION = Math.floor(MAX_BYTES / 9);

  const out = [
    '<!-- ATLAS CONTEXT PACK — auto-injected by .cursor/hooks.json -->',
    `<!-- block: ${blockId} -->`,
    '',
    '## Project',
    shorten(project, SECTION),
    '',
    '## Rules',
    shorten(rules, SECTION),
    '',
    '## Tech stack (forbidden commands enforced via guard_against_drift)',
    shorten(techStack, SECTION),
    '',
    `## Block: ${blockId}`,
    '',
    '### mission',
    shorten(meta.mission, SECTION),
    '',
    '### KPI',
    shorten(meta.kpi, SECTION),
    '',
    '### Acceptance',
    shorten(meta.acceptance, SECTION),
    '',
    '### depends_on',
    shorten(meta.depends, SECTION),
    '',
    '### provides',
    shorten(meta.provides, SECTION),
    '',
    '### files (alive only — agent should edit only these)',
    shorten(meta.files, SECTION),
    '',
    '<!-- /ATLAS CONTEXT PACK -->',
  ].join('\n');

  process.stdout.write(out + '\n');
  process.exit(0);
} catch (e) {
  process.stderr.write(`inject_context_pack: ${e.message}\n`);
  process.exit(0);
}

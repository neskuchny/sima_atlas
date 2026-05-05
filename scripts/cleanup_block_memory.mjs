#!/usr/bin/env node
// Phase Q-4: keep block memory bounded so the agent never re-reads
// thousands of stale lines. Caps applied:
//   decisions.log — keep header (lines starting with #) + last 200 entries
//   patterns.md   — sectioned by `## <run_id> — <verdict>`; keep last
//                   30 sections (newest at end), drop oldest
//
// Idempotent — safe to run repeatedly. Returns {trimmed} counts.
//
// Called automatically from run_block_implementation after reflect/distill
// (so the very next agent run already reads a tidy memory). Also exposed
// via CLI for housekeeping:
//   node scripts/cleanup_block_memory.mjs <block_id> [--json]
//   node scripts/cleanup_block_memory.mjs --all [--json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');

const DECISIONS_KEEP = 200;   // entry lines (header + comments excluded)
const PATTERNS_KEEP  = 30;    // `## <run_id>` sections

function trimDecisions(filePath) {
  if (!fs.existsSync(filePath)) return { trimmed: 0, kept: 0 };
  const lines = fs.readFileSync(filePath, 'utf8').split(/\n/);
  // Separate header (lines starting with `#` at the very top, before the
  // first data row) from data lines.
  const header = [];
  const data = [];
  let inHeader = true;
  for (const ln of lines) {
    if (inHeader && (ln.startsWith('#') || ln === '')) {
      header.push(ln);
      continue;
    }
    inHeader = false;
    if (ln === '') continue; // strip empty
    data.push(ln);
  }
  if (data.length <= DECISIONS_KEEP) return { trimmed: 0, kept: data.length };
  const trimmed = data.length - DECISIONS_KEEP;
  const kept = data.slice(-DECISIONS_KEEP);
  const out = [...header];
  if (out[out.length - 1] !== '') out.push('');
  out.push(...kept);
  out.push(''); // trailing newline
  fs.writeFileSync(filePath, out.join('\n'), 'utf8');
  return { trimmed, kept: kept.length };
}

function trimPatterns(filePath) {
  if (!fs.existsSync(filePath)) return { trimmed: 0, kept: 0 };
  const text = fs.readFileSync(filePath, 'utf8');
  // Sections start with `## ` (we use `## <run_id> — <verdict>` from
  // reflect_after_run). Keep the file's preamble (everything before
  // the first `## ` line) as-is.
  const sectionRe = /^## /m;
  const firstIdx = text.search(sectionRe);
  if (firstIdx < 0) return { trimmed: 0, kept: 0 }; // no sections yet
  const preamble = text.slice(0, firstIdx);
  const tail = text.slice(firstIdx);
  // Split by the start-of-section marker, keeping the marker
  const sections = tail.split(/(?=^## )/m).filter(Boolean);
  if (sections.length <= PATTERNS_KEEP) return { trimmed: 0, kept: sections.length };
  const trimmed = sections.length - PATTERNS_KEEP;
  const kept = sections.slice(-PATTERNS_KEEP);
  fs.writeFileSync(filePath, preamble + kept.join(''), 'utf8');
  return { trimmed, kept: kept.length };
}

export function cleanupBlockMemory(block_id, { root } = {}) {
  if (!block_id) throw new Error('cleanupBlockMemory: block_id required');
  const dir = path.join(root || ATLAS, 'blocks', block_id);
  if (!fs.existsSync(dir)) return { ok: false, error: `block dir missing: ${block_id}` };
  const decisions = trimDecisions(path.join(dir, 'decisions.log'));
  const patterns  = trimPatterns(path.join(dir, 'patterns.md'));
  return {
    ok: true,
    block_id,
    decisions_trimmed: decisions.trimmed,
    decisions_kept:    decisions.kept,
    patterns_trimmed:  patterns.trimmed,
    patterns_kept:     patterns.kept,
  };
}

export function cleanupAllBlocks({ root } = {}) {
  const blocksDir = path.join(root || ATLAS, 'blocks');
  if (!fs.existsSync(blocksDir)) return { ok: false, error: 'blocks dir missing' };
  const ids = fs.readdirSync(blocksDir).filter((f) => fs.statSync(path.join(blocksDir, f)).isDirectory());
  const results = ids.map((id) => cleanupBlockMemory(id, { root }));
  const totalDecTrimmed = results.reduce((s, r) => s + (r.decisions_trimmed || 0), 0);
  const totalPatTrimmed = results.reduce((s, r) => s + (r.patterns_trimmed || 0), 0);
  return {
    ok: true,
    blocks: ids.length,
    decisions_trimmed_total: totalDecTrimmed,
    patterns_trimmed_total:  totalPatTrimmed,
    per_block: results,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const wantJson = args.includes('--json');
  const all = args.includes('--all');
  const bid = args.find((a) => /^b\./.test(a));
  if (!all && !bid) { console.error('usage: cleanup_block_memory.mjs <b.block_id>|--all [--json]'); process.exit(1); }
  const r = all ? cleanupAllBlocks() : cleanupBlockMemory(bid);
  if (wantJson) console.log(JSON.stringify(r, null, 2));
  else if (!r.ok) { console.error('cleanup: FAIL —', r.error); process.exit(1); }
  else if (all) console.log(`cleanup all: ${r.blocks} blocks, decisions trimmed=${r.decisions_trimmed_total}, patterns trimmed=${r.patterns_trimmed_total}`);
  else console.log(`cleanup ${r.block_id}: decisions trimmed=${r.decisions_trimmed} (kept ${r.decisions_kept}), patterns trimmed=${r.patterns_trimmed} (kept ${r.patterns_kept})`);
}

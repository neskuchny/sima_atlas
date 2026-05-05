#!/usr/bin/env node
// Phase Q-2: code_summary.md auto-generator. Closes the gap from
// re-read of ТЗ where the user said: «нам нужно постоянно создавать
// саммари всего блока — на чём он написан, как, зачем — чтобы агент
// не перечитывал весь код в каждой сессии».
//
// Strategy:
//   1. Read the block's files.md → get list of paths
//   2. Filter via files_registry (skip dead/archived)
//   3. Read each alive file (cap at 2 KB tail per file, ~10 files)
//   4. Ask the LLM to summarise: stack, structure, why each piece exists,
//      potential rewrite points
//   5. Write to atlas/blocks/<id>/code_summary.md
//
// Result is short (≤ 500 words) and stays in patterns.md alongside —
// the next agent run reads this summary instead of re-loading the
// full source files.
//
// CLI:
//   node scripts/summarize_block_code.mjs <block_id> [--json] [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filterAlive } from './atlas_files_api.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');

const SCHEMA = {
  type: 'object',
  properties: {
    stack:     { type: 'string', description: 'one line: "TS strict + Fastify + Postgres" style' },
    structure: { type: 'string', description: '2-4 sentences: how the code is organised' },
    rationale: { type: 'string', description: '1-2 sentences: WHY this approach (not what)' },
    risks:     { type: 'array',  items: { type: 'string' }, description: '0-3 short risks the next agent should know' },
    rewrite_hints: { type: 'array', items: { type: 'string' }, description: '0-3 places worth refactoring' },
  },
  required: ['stack', 'structure'],
};

function safeReadCapped(p, max = 2000) {
  try {
    if (!fs.existsSync(p)) return null;
    const stat = fs.statSync(p);
    if (!stat.isFile()) return null;
    const s = fs.readFileSync(p, 'utf8');
    return s.length > max ? `…${s.slice(-max)}` : s;
  } catch { return null; }
}

function listFrom(md) {
  return md.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith('- ')).map((l) => l.slice(2).split('[')[0].trim()).filter(Boolean);
}

async function callSummarise({ block_id, mission, snippets }) {
  const { callLLM } = await import('./llm_gateway.mjs');
  const sys = [
    'You are SIMA Atlas. Summarise the code of one block so future agents',
    'can read THIS summary instead of re-loading every file (saves tokens).',
    '',
    'Style: factual, short, name concrete files / functions.',
    'Match the input language (Russian → Russian, English → English).',
    'Do not invent functionality not visible in the snippets.',
    'Reply ONLY structured JSON.',
  ].join('\n');
  const prompt = [
    `Block: ${block_id}`,
    '',
    `mission.md (зачем блок):\n${(mission || '(empty)').slice(0, 1500)}`,
    '',
    '== code snippets (alive files only) ==',
    snippets.length === 0 ? '(no code yet)' : snippets.map((s) => `--- ${s.path} ---\n${s.content}`).join('\n\n'),
    '',
    'Now summarise.',
  ].join('\n');
  const r = await callLLM({
    system: sys, prompt, schema: SCHEMA,
    max_tokens: 700, temperature: 0.25, op: 'summarize_block_code',
  });
  const v = r.value || {};
  return {
    stack: String(v.stack || '').trim(),
    structure: String(v.structure || '').trim(),
    rationale: String(v.rationale || '').trim(),
    risks: Array.isArray(v.risks) ? v.risks.filter(Boolean).map(String).slice(0, 3) : [],
    rewrite_hints: Array.isArray(v.rewrite_hints) ? v.rewrite_hints.filter(Boolean).map(String).slice(0, 3) : [],
    provider: r.trace?.provider || null,
    mock: r.trace?.provider === 'mock',
  };
}

function renderMd(block_id, s) {
  const ts = new Date().toISOString();
  const lines = [
    `# ${block_id} — code summary`,
    '',
    `_(Auto-generated ${ts}${s.mock ? ' · demo mode' : ''} · regenerated after each run via reflect chain)_`,
    '',
    '## Stack',
    s.stack || '_unknown_',
    '',
    '## Structure',
    s.structure || '_no code yet_',
    '',
  ];
  if (s.rationale) lines.push('## Rationale', s.rationale, '');
  if (s.risks.length) {
    lines.push('## Risks');
    for (const r of s.risks) lines.push(`- ⚠ ${r}`);
    lines.push('');
  }
  if (s.rewrite_hints.length) {
    lines.push('## Rewrite hints');
    for (const r of s.rewrite_hints) lines.push(`- 🔧 ${r}`);
    lines.push('');
  }
  return lines.join('\n');
}

export async function summarizeBlockCode(block_id, { dryRun = false, maxFiles = 10 } = {}) {
  if (!block_id) throw new Error('summarizeBlockCode: block_id required');
  const blkDir = path.join(ATLAS, 'blocks', block_id);
  if (!fs.existsSync(blkDir)) return { ok: false, error: `block dir missing: ${block_id}` };

  const filesMd = (() => {
    try { return fs.readFileSync(path.join(blkDir, 'files.md'), 'utf8'); } catch { return ''; }
  })();
  const allPaths = listFrom(filesMd);
  const alive = filterAlive(allPaths).slice(0, maxFiles);
  const snippets = alive.map((p) => {
    const full = path.isAbsolute(p) ? p : path.join(ROOT, p);
    const content = safeReadCapped(full);
    return content ? { path: p, content } : null;
  }).filter(Boolean);

  const mission = (() => {
    try { return fs.readFileSync(path.join(blkDir, 'mission.md'), 'utf8'); } catch { return ''; }
  })();

  const summary = await callSummarise({ block_id, mission, snippets });
  const md = renderMd(block_id, summary);

  if (dryRun) {
    return { ok: true, dry_run: true, block_id, files_considered: allPaths.length, files_alive: alive.length, files_read: snippets.length, summary, preview: md };
  }

  // Phase P-1.2 history snapshot is automatically applied by patchBlockFile,
  // but we write directly here to avoid the etag check (this is a fresh
  // auto-generation, not an operator edit). Snapshot manually.
  const target = path.join(blkDir, 'code_summary.md');
  if (fs.existsSync(target)) {
    const histDir = path.join(blkDir, 'history');
    fs.mkdirSync(histDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    try { fs.copyFileSync(target, path.join(histDir, `code_summary.md.${stamp}.md`)); } catch {}
  }
  fs.writeFileSync(target, md, 'utf8');
  // Audit
  const log = path.join(blkDir, 'checks.log');
  fs.appendFileSync(log, `${new Date().toISOString()}\tcode_summary\t${summary.mock ? 'demo' : 'pass'}\tcode_summary.md regenerated (${snippets.length} files)\n`);
  return { ok: true, block_id, files_read: snippets.length, summary };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const wantJson = args.includes('--json');
  const dry = args.includes('--dry-run');
  const bid = args.find((a) => /^b\./.test(a));
  if (!bid) { console.error('usage: summarize_block_code.mjs <b.block_id> [--json] [--dry-run]'); process.exit(1); }
  summarizeBlockCode(bid, { dryRun: dry }).then((r) => {
    if (wantJson) console.log(JSON.stringify(r, null, 2));
    else if (!r.ok) { console.error('summarize: FAIL —', r.error); process.exit(1); }
    else console.log(`code_summary ${r.block_id}: ${r.files_read} files, stack="${r.summary.stack || '-'}" [${r.summary.mock ? 'demo' : 'real'}]`);
  });
}

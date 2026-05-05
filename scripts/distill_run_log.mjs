#!/usr/bin/env node
// Phase O-2: distill agent's run log into structured ADR-style decisions
// and append them to the block's decisions.log.
//
// Different from reflect_after_run.mjs (Phase O-5):
//   reflect → short reflection (worked / failed / next time) → patterns.md
//   distill → 3-8 atomic decisions extracted from the actual transcript
//             → decisions.log (each row = one decision)
//
// Why both:
//   patterns.md is "what to keep in mind for next run" (advice)
//   decisions.log is "what was decided/done in this run" (history)
// The next agent run reads BOTH from the context-pack.
//
// Inputs from disk:
//   atlas/run_state/<run_id>.json   — block_id, agent
//   atlas/run_logs/<run_id>.log     — captured stdout/stderr (the "chat")
//
// Writes:
//   atlas/blocks/<block>/decisions.log
//
// Idempotent: every distillation prefixes the line with the run_id, so
// a second invocation on the same run won't double-write (we skip when
// the run_id already appears at column "context").
//
// CLI:
//   node scripts/distill_run_log.mjs <run_id> [--json] [--dry-run]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');

const SCHEMA = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind:    { type: 'string', enum: ['choice', 'switch', 'add', 'remove', 'fix', 'discover', 'block'] },
          summary: { type: 'string', description: '≤ 18 words; subject + verb + object' },
          why:     { type: 'string', description: 'one short sentence (or empty)' },
          file:    { type: 'string', description: 'file path if directly tied to one (optional)' },
        },
        required: ['kind', 'summary'],
      },
    },
  },
  required: ['decisions'],
};

function readJson(p) { try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; } catch { return null; } }
function readLog(p, max = 12000) {
  try {
    if (!fs.existsSync(p)) return '';
    const s = fs.readFileSync(p, 'utf8');
    return s.length > max ? s.slice(-max) : s;
  } catch { return ''; }
}

async function callDistill(text) {
  const { callLLM } = await import('./llm_gateway.mjs');
  const sys = [
    'You are SIMA Atlas. Read the captured agent log (a coding-agent ran',
    'on a block; this is its stdout/stderr). Extract 3-8 atomic decisions',
    'or facts that future agents would need to know about THIS run.',
    '',
    'Each decision is one short sentence: subject + verb + object (≤ 18 words).',
    'If unclear, skip — DO NOT pad with generic statements.',
    'Match the input language (Russian if Russian, English if English).',
    '',
    'kinds:',
    '  choice    — picked one of several options (e.g. "switched to passport.js")',
    '  switch    — replaced one approach with another',
    '  add       — added a file / capability / dependency',
    '  remove    — removed / deprecated something',
    '  fix       — fixed a specific bug',
    '  discover  — discovered a fact that affects future decisions',
    '  block     — encountered a blocker that needs human / next-run attention',
    '',
    'Reply ONLY structured JSON.',
  ].join('\n');
  const prompt = [
    'Agent log (most recent at end):',
    '',
    text || '(empty)',
  ].join('\n');
  const r = await callLLM({
    system: sys, prompt, schema: SCHEMA,
    max_tokens: 1000, temperature: 0.2, op: 'distill_run_log',
  });
  const v = r.value || {};
  const list = Array.isArray(v.decisions) ? v.decisions : [];
  const cleaned = list
    .filter((d) => d && d.summary && d.kind)
    .map((d) => ({
      kind: ['choice', 'switch', 'add', 'remove', 'fix', 'discover', 'block'].includes(d.kind) ? d.kind : 'discover',
      summary: String(d.summary).trim().slice(0, 200),
      why: d.why ? String(d.why).trim().slice(0, 200) : '',
      file: d.file ? String(d.file).trim().slice(0, 200) : '',
    }))
    .slice(0, 8);
  return { decisions: cleaned, provider: r.trace?.provider || null, mock: r.trace?.provider === 'mock' };
}

function alreadyApplied(decisionsLogPath, run_id) {
  if (!fs.existsSync(decisionsLogPath)) return false;
  try {
    const txt = fs.readFileSync(decisionsLogPath, 'utf8');
    return txt.split(/\n/).some((ln) => ln.includes(`distill\t${run_id}\t`));
  } catch { return false; }
}

export async function distillRunLog(run_id, { dryRun = false } = {}) {
  if (!run_id) throw new Error('distillRunLog: run_id required');
  const run = readJson(path.join(ATLAS, 'run_state', `${run_id}.json`));
  if (!run) return { ok: false, error: `run_state not found: ${run_id}` };
  const block_id = run.block_id;
  if (!block_id) return { ok: false, error: 'run has no block_id' };
  const blockDir = path.join(ATLAS, 'blocks', block_id);
  if (!fs.existsSync(blockDir)) return { ok: false, error: `block dir missing: ${block_id}` };
  const decisionsLog = path.join(blockDir, 'decisions.log');

  if (alreadyApplied(decisionsLog, run_id) && !dryRun) {
    return { ok: true, skipped: 'already_distilled', run_id, block_id };
  }

  const logText = readLog(path.join(ATLAS, 'run_logs', `${run_id}.log`));
  if (!logText.trim()) return { ok: false, error: 'log empty / missing' };

  const out = await callDistill(logText);

  if (dryRun) {
    return { ok: true, dry_run: true, run_id, block_id, decisions: out.decisions, provider: out.provider, mock: out.mock };
  }

  // Append each decision as a tab-separated line. Format:
  //   <ISO_ts>\tdistill\t<run_id>\t<kind>\t<summary>[\twhy: ...][\tfile: ...]
  const ts = new Date().toISOString();
  const lines = out.decisions.map((d) => {
    const parts = [ts, 'distill', run_id, d.kind, d.summary.replace(/\t/g, ' ')];
    if (d.why)  parts.push(`why: ${d.why.replace(/\t/g, ' ')}`);
    if (d.file) parts.push(`file: ${d.file.replace(/\t/g, ' ')}`);
    return parts.join('\t');
  });
  if (lines.length) {
    if (!fs.existsSync(decisionsLog)) fs.writeFileSync(decisionsLog, '# decisions\n', 'utf8');
    fs.appendFileSync(decisionsLog, lines.join('\n') + '\n', 'utf8');
  }
  return { ok: true, run_id, block_id, written: lines.length, mock: out.mock };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const wantJson = args.includes('--json');
  const dry = args.includes('--dry-run');
  const rid = args.find((a) => /__/.test(a));
  if (!rid) { console.error('usage: distill_run_log.mjs <run_id> [--json] [--dry-run]'); process.exit(1); }
  distillRunLog(rid, { dryRun: dry }).then((r) => {
    if (wantJson) console.log(JSON.stringify(r, null, 2));
    else if (!r.ok) { console.error('distill: FAIL —', r.error); process.exit(1); }
    else if (r.skipped) console.log(`distill ${r.block_id}: ${r.skipped}`);
    else console.log(`distill ${r.block_id}: appended ${r.written} decisions [${r.mock ? 'demo' : 'real'}]`);
  });
}

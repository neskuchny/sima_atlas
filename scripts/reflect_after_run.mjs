#!/usr/bin/env node
// Phase O-5: after a run reaches a terminal state (Succeeded/Failed/
// Stalled/Canceled), Sima reflects on what happened and appends a
// distilled lesson to the block's patterns.md + a short ADR-style
// entry to its decisions.log.
//
// Inputs come from disk:
//   atlas/run_state/<run_id>.json               — FSM trace + final state
//   atlas/run_logs/<run_id>.log                 — captured stdout/stderr
//   atlas/acceptance_runs/<block>/_latest.json  — verdict after run
//   atlas/validations/<block>/_latest.json      — LLM-judge verdict (if any)
//
// Writes:
//   atlas/blocks/<block>/patterns.md  — appends a markdown block under
//     `## <run_id> — <verdict>` with summary, what worked, what didn't,
//     suggestion for next time
//   atlas/blocks/<block>/decisions.log — short tab-separated row
//
// CLI:
//   node scripts/reflect_after_run.mjs <run_id> [--json] [--dry-run]
//
// The /runs/start endpoint can wire this in by spawning it after the
// child process emits a terminal state (handled separately).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');

const TERMINAL = new Set(['Succeeded', 'Failed', 'Stalled', 'Canceled']);

function safeReadJson(p) {
  try { return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; } catch { return null; }
}
function safeRead(p, max = 6000) {
  try {
    if (!fs.existsSync(p)) return '';
    const s = fs.readFileSync(p, 'utf8');
    return s.length > max ? s.slice(-max) : s;
  } catch { return ''; }
}

const REFLECT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    what_worked:    { type: 'array', items: { type: 'string' } },
    what_failed:    { type: 'array', items: { type: 'string' } },
    next_time:      { type: 'array', items: { type: 'string' } },
    decision_line:  { type: 'string', description: 'one tab-separated short ADR line: WHY/WHAT/RESULT' },
  },
  required: ['summary'],
};

async function reflectWithLlm({ run_id, run, log_tail, acceptance, validation, mission }) {
  const { callLLM } = await import('./llm_gateway.mjs');
  const sys = [
    'You are SIMA Atlas. A coding-agent run just finished.',
    'Read the run trace + log tail + acceptance verdict + LLM-judge verdict + the block mission,',
    'and produce a SHORT, durable reflection that future agents will read in patterns.md before',
    'touching this block again.',
    '',
    'Goal: surface what worked, what failed, and what to do differently next time.',
    'Be concrete: name a file / a command / a pattern, not generic advice.',
    'Match the input language. ≤ 6 short bullets per list.',
    'Reply ONLY structured JSON.',
  ].join('\n');
  const prompt = [
    `Run: ${run_id}`,
    `Final state: ${run?.current_state || 'unknown'}`,
    `Agent: ${run?.agent || 'unknown'}`,
    '',
    `== MISSION ==\n${(mission || '').slice(0, 1500)}`,
    '',
    `== LAST RUN LOG (tail) ==\n${(log_tail || '(empty)').slice(0, 4000)}`,
    '',
    `== ACCEPTANCE ==\n${acceptance ? `verdict=${acceptance.verdict}; counts=${JSON.stringify(acceptance.counts || {})}` : 'not run'}`,
    '',
    `== LLM-JUDGE ==\n${validation ? `verdict=${validation.verdict}; ${validation.summary || ''}\nviolations: ${(validation.violations || []).slice(0, 5).map((v) => `[${v.kind}] ${v.evidence}`).join(' | ')}` : 'not run'}`,
    '',
    'Now reflect.',
  ].join('\n');
  const r = await callLLM({
    system: sys, prompt, schema: REFLECT_SCHEMA,
    max_tokens: 700, temperature: 0.3, op: 'reflect_after_run',
  });
  const v = r.value || {};
  return {
    summary: String(v.summary || '').trim(),
    what_worked: Array.isArray(v.what_worked) ? v.what_worked.filter(Boolean).slice(0, 6) : [],
    what_failed: Array.isArray(v.what_failed) ? v.what_failed.filter(Boolean).slice(0, 6) : [],
    next_time:   Array.isArray(v.next_time)   ? v.next_time.filter(Boolean).slice(0, 6)   : [],
    decision_line: String(v.decision_line || '').trim(),
    provider: r.trace?.provider || null,
    mock: r.trace?.provider === 'mock',
  };
}

function appendPatterns(blockDir, run_id, verdict, reflection) {
  const file = path.join(blockDir, 'patterns.md');
  const ts = new Date().toISOString();
  const lines = [
    '',
    `## ${run_id} — ${verdict}${reflection.mock ? ' [demo]' : ''}`,
    `_${ts}_`,
    '',
    reflection.summary || '_no summary_',
    '',
  ];
  if (reflection.what_worked?.length) {
    lines.push('**Что сработало:**');
    for (const x of reflection.what_worked) lines.push(`- ${x}`);
    lines.push('');
  }
  if (reflection.what_failed?.length) {
    lines.push('**Что не сработало:**');
    for (const x of reflection.what_failed) lines.push(`- ${x}`);
    lines.push('');
  }
  if (reflection.next_time?.length) {
    lines.push('**В следующий раз:**');
    for (const x of reflection.next_time) lines.push(`- ${x}`);
    lines.push('');
  }
  // Touch the file if it doesn't exist
  if (!fs.existsSync(file)) fs.writeFileSync(file, `# ${path.basename(blockDir)} — patterns\n`, 'utf8');
  fs.appendFileSync(file, lines.join('\n'), 'utf8');
}

function appendDecision(blockDir, run_id, verdict, reflection) {
  const file = path.join(blockDir, 'decisions.log');
  const ts = new Date().toISOString();
  const note = reflection.decision_line || `${verdict} run; see patterns.md#${run_id}`;
  fs.appendFileSync(file, `${ts}\treflect_after_run\t${run_id}\t${verdict}\t${note.replace(/\t/g, ' ')}\n`, 'utf8');
}

export async function reflectAfterRun(run_id, { dryRun = false } = {}) {
  if (!run_id) throw new Error('reflectAfterRun: run_id required');
  const runStatePath = path.join(ATLAS, 'run_state', `${run_id}.json`);
  const run = safeReadJson(runStatePath);
  if (!run) return { ok: false, error: `run_state not found: ${run_id}` };
  if (!TERMINAL.has(run.current_state)) {
    return { ok: false, error: `run not terminal yet: ${run.current_state}` };
  }
  const block_id = run.block_id;
  if (!block_id) return { ok: false, error: 'run has no block_id' };
  const blockDir = path.join(ATLAS, 'blocks', block_id);
  if (!fs.existsSync(blockDir)) return { ok: false, error: `block dir missing: ${block_id}` };

  const log_tail   = safeRead(path.join(ATLAS, 'run_logs', `${run_id}.log`), 6000);
  const acceptance = safeReadJson(path.join(ATLAS, 'acceptance_runs', block_id, '_latest.json'));
  const validation = safeReadJson(path.join(ATLAS, 'validations', block_id, '_latest.json'));
  const mission    = safeRead(path.join(blockDir, 'mission.md'), 2000);

  const reflection = await reflectWithLlm({
    run_id, run, log_tail, acceptance, validation, mission,
  });

  if (dryRun) {
    return { ok: true, dry_run: true, run_id, block_id, verdict: run.current_state, reflection };
  }
  appendPatterns(blockDir, run_id, run.current_state, reflection);
  appendDecision(blockDir, run_id, run.current_state, reflection);
  return { ok: true, run_id, block_id, verdict: run.current_state, reflection };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const wantJson = args.includes('--json');
  const dry = args.includes('--dry-run');
  const rid = args.find((a) => /__/.test(a));
  if (!rid) { console.error('usage: reflect_after_run.mjs <run_id> [--json] [--dry-run]'); process.exit(1); }
  reflectAfterRun(rid, { dryRun: dry }).then((r) => {
    if (wantJson) console.log(JSON.stringify(r, null, 2));
    else if (!r.ok) { console.error('reflect: FAIL —', r.error); process.exit(1); }
    else console.log(`reflect ${r.block_id} (${r.verdict}): ${r.reflection.summary || '(no summary)'} [${r.reflection.mock ? 'demo' : 'real'}]`);
  });
}

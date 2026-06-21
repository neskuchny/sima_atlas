#!/usr/bin/env node
// R-8.01 (b.diff-review) — the fourth V-1 arbiter: an independent LLM review
// of the git diff for BLOCKING problems.
//
// The three existing arbiters answer different questions:
//   deterministic verifier → «did acceptance pass?»
//   cascade + green-guard  → «did we break neighbours?»
//   semantic judge         → «does the implementation match the mission?»
// This one answers the missing fourth: «is there a bug / security hole /
// regression / pathological regex / type-error in THIS CHANGE itself?» —
// reading ONLY the diff, not the whole file (User Story 4). Imported from
// loop-engineer-template's ship-change.js Review stage.
//
// Tri-state, honest: no live LLM → `inconclusive`, never a false `pass`
// (schema enum is [inconclusive, pass, fail] so the mock/empty fallback is
// safe). `fail` iff ≥1 finding with severity `blocking`; warnings surface
// but pass. Empty diff → `inconclusive` (nothing to review).
//
// Sources of the diff (first match wins):
//   --since <ref>        working-tree diff vs a git ref (default for in-place V-1)
//   --workspace <path>   captureDiff() from a sandboxed agent workspace
//   --block <id>         the block's latest agent_run_diff proposal
//   (stdin)              a raw unified diff piped in
//
// Usage:
//   node scripts/review_diff.mjs --since HEAD --block b.docs --json
//   node scripts/review_diff.mjs --workspace /tmp/ws-x --block b.docs
//   git diff | node scripts/review_diff.mjs --block b.docs
//
// Library:
//   import { reviewDiff } from './review_diff.mjs';
//   const r = await reviewDiff({ diff_text, block_id, context });

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { callLLM } from './llm_gateway.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');

const DIFF_BUDGET = 24000; // chars sent to the judge

// Tri-state, inconclusive FIRST so the deterministic-empty mock fallback
// yields a safe `inconclusive`, never a silent `pass`. (Same discipline as
// judge_assertion.mjs + semantic_verify.mjs.)
const VERDICT_ENUM = ['inconclusive', 'pass', 'fail'];
const CATEGORY_ENUM = ['correctness', 'runtime_env', 'security', 'regression', 'perf_regex', 'type_error', 'other'];
const SEVERITY_ENUM = ['blocking', 'warning'];

// Flat schema (Gemini Flash chokes on deep nesting — same lesson as
// semantic_verify). Findings are a flat array of objects.
const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: VERDICT_ENUM },
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: CATEGORY_ENUM },
          severity: { type: 'string', enum: SEVERITY_ENUM },
          file: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['category', 'severity', 'file', 'why'],
      },
    },
  },
  required: ['verdict', 'summary', 'findings'],
};

// ── diff acquisition ────────────────────────────────────────────────────────

function diffSinceRef(ref, files = []) {
  if (!fs.existsSync(path.join(ROOT, '.git'))) {
    return { diff_text: '', changed_files: [], note: 'not a git repo' };
  }
  // Working-tree changes (staged + unstaged) vs the ref. This is exactly the
  // agent's in-place change when V-1 runs without a sandbox workspace.
  // `files` (optional) scopes the diff to just those paths — V-1 passes the
  // block's owned alive files so the review judges THIS block's change, not
  // the whole working tree's accumulated churn.
  const pathspec = files.length ? ['--', ...files] : [];
  const names = spawnSync('git', ['diff', '--name-only', ref, ...pathspec], { cwd: ROOT, encoding: 'utf8' });
  if (names.status !== 0) {
    return { diff_text: '', changed_files: [], note: `git diff failed: ${(names.stderr || '').slice(0, 200)}` };
  }
  const changed_files = (names.stdout || '').split(/\r?\n/).filter(Boolean);
  const full = spawnSync('git', ['diff', ref, ...pathspec], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return { diff_text: full.stdout || '', changed_files, note: null };
}

async function diffFromWorkspace(workspacePath) {
  const { captureDiff } = await import('./agent_workspace.mjs');
  const r = captureDiff({ workspace_path: workspacePath });
  return {
    diff_text: r.diff_text || '',
    changed_files: (r.changed_files || []).map((c) => c.path),
    note: null,
  };
}

function diffFromBlockProposal(blockId) {
  // The latest agent_run_diff proposal for this block, written by
  // run_block_implementation when ATLAS_USE_WORKSPACE=1.
  const dir = path.join(ATLAS, 'proposals');
  if (!fs.existsSync(dir)) return { diff_text: '', changed_files: [], note: 'no proposals dir' };
  const matches = fs.readdirSync(dir)
    .filter((f) => f.endsWith(`__${blockId}__agent_run_diff.json`))
    .sort();
  if (!matches.length) return { diff_text: '', changed_files: [], note: 'no diff proposal for block' };
  try {
    const p = JSON.parse(fs.readFileSync(path.join(dir, matches[matches.length - 1]), 'utf8'));
    const diff = p.diff || {};
    return {
      diff_text: diff.diff_text || '',
      changed_files: (diff.changed_files || []).map((c) => (typeof c === 'string' ? c : c.path)),
      note: null,
    };
  } catch (e) {
    return { diff_text: '', changed_files: [], note: `proposal parse failed: ${e.message}` };
  }
}

function readStdin() {
  try {
    const data = fs.readFileSync(0, 'utf8'); // fd 0
    return data;
  } catch { return ''; }
}

// ── pure helpers (deterministic — the unit-testable core) ───────────────────

// Clean + filter raw judge findings. Drops findings whose file isn't among the
// changed set (KPI-2) — unless we have no inventory, then we trust the judge.
export function normalizeFindings(rawFindings, changedFiles = []) {
  const files = Array.isArray(changedFiles) ? changedFiles : [];
  const fileSet = new Set(files);
  return (Array.isArray(rawFindings) ? rawFindings : [])
    .filter((f) => f && f.category && f.severity)
    .map((f) => ({
      category: CATEGORY_ENUM.includes(f.category) ? f.category : 'other',
      severity: SEVERITY_ENUM.includes(f.severity) ? f.severity : 'warning',
      file: String(f.file || '').trim(),
      why: String(f.why || '').slice(0, 400),
    }))
    .filter((f) => !files.length || !f.file || fileSet.has(f.file) || files.some((cf) => cf.endsWith(f.file) || f.file.endsWith(cf)));
}

// Derive the tri-state verdict from findings + judge opinion + mock flag.
// THE rule (KPI-4): fail iff ≥1 blocking; pass if safe; inconclusive if mock
// (never trust a mock to say pass) or the judge genuinely couldn't tell.
export function aggregateVerdict({ findings = [], mock = false, judgeVerdict = null } = {}) {
  const blocking = findings.filter((f) => f.severity === 'blocking');
  if (mock) return 'inconclusive';
  if (blocking.length) return 'fail';
  if (judgeVerdict === 'inconclusive') return 'inconclusive';
  return 'pass';
}

// ── core review ─────────────────────────────────────────────────────────────

export async function reviewDiff({ diff_text, block_id, changed_files, context } = {}) {
  const files = Array.isArray(changed_files) ? changed_files : [];
  const trimmed = (diff_text || '').trim();
  if (!trimmed) {
    return {
      ok: true,
      verdict: 'inconclusive',
      summary: 'empty diff — nothing to review',
      findings: [],
      mock: false,
      reason: 'empty_diff',
      checked_at: new Date().toISOString(),
    };
  }

  // Budget the diff but ALWAYS send the full changed-file inventory first, so
  // the judge never declares a file «not touched» because the budget cut its
  // hunk (mirrors semantic_verify's FILE INVENTORY lesson). KPI-6.
  let body = trimmed;
  let truncated = false;
  if (body.length > DIFF_BUDGET) {
    body = body.slice(0, DIFF_BUDGET) + '\n\n(… diff truncated to fit; the CHANGED FILES list above is complete — do NOT report inventory files as untouched)\n';
    truncated = true;
  }
  const inventory = files.length
    ? `CHANGED FILES (complete list, even if a hunk below is truncated):\n${files.map((f) => `  - ${f}`).join('\n')}\n\n`
    : '';

  const system = [
    'You are an independent senior code reviewer giving a SECOND OPINION on a git diff.',
    'You review ONLY THE CHANGE shown in the diff — not the pre-existing code, not style, not formatting.',
    'Find BLOCKING problems: things that would break production or fail review:',
    '  - correctness: logic wrong on an edge case, off-by-one, wrong condition;',
    '  - runtime_env: calls an API/method that does not exist in the project\'s runtime/deps;',
    '  - security: injection, path traversal, secret leak, missing input validation, unsafe eval/exec;',
    '  - regression: a working branch/behaviour removed or broken;',
    '  - perf_regex: catastrophic-backtracking regex, O(n^2) on a hot path, unbounded loop;',
    '  - type_error: wrong signature, undefined property, type mismatch.',
    'Each finding: { category, severity (blocking|warning), file, why }. file MUST be one of the changed files.',
    'verdict = "fail" iff there is at least one finding with severity "blocking".',
    'verdict = "pass" iff the change is safe to ship (only warnings, or no findings).',
    'verdict = "inconclusive" ONLY if you genuinely cannot tell from the diff alone.',
    'Be specific in `why` (cite the construct). Do NOT bikeshed. Do NOT suggest rewrites of untouched code.',
    'Return strict JSON matching the schema.',
  ].join('\n');

  const ctxLines = [];
  if (context?.mission_excerpt) ctxLines.push(`### Block mission (for intent context)\n${String(context.mission_excerpt).slice(0, 1200)}`);
  if (context?.tech_stack) ctxLines.push(`### tech_stack (runtime/deps in play)\n${String(context.tech_stack).slice(0, 600)}`);

  const prompt = [
    block_id ? `Block under review: ${block_id}` : '',
    ...ctxLines,
    '',
    inventory + '### DIFF',
    '```diff',
    body,
    '```',
  ].filter(Boolean).join('\n');

  let value = null, trace = null;
  try {
    const r = await callLLM({ system, prompt, schema: SCHEMA, max_tokens: 4000, op: 'diff_review' });
    value = r.value;
    trace = r.trace;
  } catch (e) {
    return {
      ok: true,
      verdict: 'inconclusive',
      summary: `diff review could not run: ${e.message}`,
      findings: [],
      mock: true,
      reason: 'llm_error',
      checked_at: new Date().toISOString(),
    };
  }

  const isMock = !trace || trace.provider === 'mock' || trace.provider === 'error';

  const findings = normalizeFindings(value?.findings, files);
  const blocking = findings.filter((f) => f.severity === 'blocking');
  const verdict = aggregateVerdict({ findings, mock: isMock, judgeVerdict: value?.verdict });

  return {
    ok: true,
    verdict,
    summary: String(value?.summary || '').slice(0, 600) || (isMock ? 'no live reviewer (mock / no key)' : ''),
    findings,
    blocking_count: blocking.length,
    warning_count: findings.length - blocking.length,
    truncated,
    mock: isMock,
    provider: trace?.provider || null,
    model: trace?.model || null,
    cost_usd: trace?.cost_usd ?? 0,
    checked_at: new Date().toISOString(),
  };
}

// ── persistence ──────────────────────────────────────────────────────────────

function persist(blockId, result) {
  if (!blockId) return;
  const dir = path.join(ATLAS, 'blocks', blockId);
  if (!fs.existsSync(dir)) return;
  try {
    fs.writeFileSync(path.join(dir, 'diff_review.json'), JSON.stringify(result, null, 2) + '\n', 'utf8');
  } catch {}
}

// ── CLI ───────────────────────────────────────────────────────────────────────

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const json = argv.includes('--json');
  const since = arg('--since', null);
  const workspace = arg('--workspace', null);
  const blockId = arg('--block', null);
  // --files a.mjs --files b.mjs  → scope the --since diff to these paths.
  const files = [];
  for (let i = 0; i < argv.length; i++) if (argv[i] === '--files' && argv[i + 1]) files.push(argv[i + 1]);

  let src;
  if (workspace) src = await diffFromWorkspace(workspace);
  else if (since) src = diffSinceRef(since, files);
  else if (blockId && !process.stdin.isTTY) {
    const stdin = readStdin();
    src = stdin.trim() ? { diff_text: stdin, changed_files: [], note: null } : diffFromBlockProposal(blockId);
  } else if (blockId) src = diffFromBlockProposal(blockId);
  else if (!process.stdin.isTTY) src = { diff_text: readStdin(), changed_files: [], note: null };
  else src = { diff_text: '', changed_files: [], note: 'no diff source given (use --since / --workspace / --block / stdin)' };

  // Block context for intent (best-effort).
  let context = {};
  if (blockId) {
    const dir = path.join(ATLAS, 'blocks', blockId);
    try { context.mission_excerpt = fs.readFileSync(path.join(dir, 'mission.md'), 'utf8'); } catch {}
  }

  const result = await reviewDiff({ diff_text: src.diff_text, changed_files: src.changed_files, block_id: blockId, context });
  if (src.note) result.source_note = src.note;
  persist(blockId, result);

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    const tick = result.verdict === 'pass' ? '✓' : result.verdict === 'fail' ? '✗' : '·';
    console.log(`review_diff ${blockId || ''}: ${tick} ${result.verdict.toUpperCase()}${result.mock ? ' (mock / no live reviewer)' : ` (${result.provider})`}`);
    if (result.summary) console.log(`  ${result.summary}`);
    for (const f of result.findings) {
      console.log(`  ${f.severity === 'blocking' ? '✗' : '~'} [${f.category}] ${f.file}: ${f.why}`);
    }
  }
  // Exit code mirrors verdict for shell gating: 0 pass/inconclusive, 1 fail.
  process.exit(result.verdict === 'fail' ? 1 : 0);
}

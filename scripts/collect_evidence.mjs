#!/usr/bin/env node
// PR-2 (b.acceptance-verifier-loop): deterministic evidence collectors.
//
// Diespatcher + 5 collectors:
//   exit_code     — run a shell command, pass iff exit 0
//                   spec: { cmd: string, expect_in_stdout?: regex_string }
//   fs_glob       — count files matching glob, pass iff >= min_count and (no max_age_min or all newer)
//                   spec: { pattern: string, min_count?: number, max_age_min?: number }
//   file_diff     — git diff filenames since ref, pass iff all must_touch present and no must_not_touch
//                   spec: { since_ref?: string (default HEAD~1), must_touch?: [string], must_not_touch?: [string] }
//   log_grep      — read file, search for regex; pass iff >= 1 match (and after since_time if provided)
//                   spec: { file: string, pattern: string, since_time?: ISO }
//   selftest_run  — like exit_code, with stricter defaults (always require exit 0, encourage expect_in_stdout)
//                   spec: { cmd: string, expect_in_stdout?: regex_string }
//
// Result shape (unified):
//   { verdict: 'pass'|'fail'|'skipped', evidence_kind, evidence: string,
//     reasoning: string, raw: object, duration_ms: number }
//
// llm_judge — returns { verdict: 'skipped', reasoning: 'requires PR-3 LLM-judge' }.
// Unknown kind — { verdict: 'fail', reasoning: 'unknown kind <x>' }.
//
// Top-level `verifyBlock(blockId)` parses acceptance.md and collects evidence
// for each assertion → returns { block_id, assertions: [{...assertion, ...result}],
// verdict (pass iff all assertions pass), counts: {pass, fail, skipped} }.
//
// CLI:
//   node scripts/collect_evidence.mjs --kind exit_code --spec '{"cmd":"node -e \"process.exit(0)\""}'
//   node scripts/collect_evidence.mjs --block b.llm-gateway [--json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseAcceptance } from './parse_acceptance.mjs';
import { judgeAssertion } from './judge_assertion.mjs';
import { lookupVerifyCache } from './verify_cache.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const STDOUT_CAP_BYTES = 4096;
const DEFAULT_TIMEOUT_MS = 30000;

function truncate(s, n) {
  if (typeof s !== 'string') return '';
  if (s.length <= n) return s;
  return s.slice(0, n) + '… [truncated]';
}

function firstLine(s) {
  return String(s || '').split(/\r?\n/)[0];
}

// ─────────────────────────────────────────── exit_code / selftest_run
function runShellCmd(cmd, { cwd = ROOT, timeout_ms = DEFAULT_TIMEOUT_MS } = {}) {
  // Use shell mode so users can write `cd x && node y` etc. spawnSync inherits no
  // shell features without `shell: true`. Capture stdout+stderr separately.
  const started = Date.now();
  const r = spawnSync(cmd, {
    cwd, shell: true, encoding: 'utf8',
    timeout: timeout_ms,
    maxBuffer: 8 * 1024 * 1024,
  });
  return {
    exit_code: r.status,
    signal: r.signal,
    timed_out: r.error?.code === 'ETIMEDOUT' || r.signal === 'SIGTERM',
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    duration_ms: Date.now() - started,
  };
}

function collectExitCode(spec, opts = {}) {
  if (!spec || typeof spec.cmd !== 'string' || !spec.cmd.trim()) {
    return { verdict: 'fail', evidence: 'no cmd in spec', reasoning: 'evidence_spec.cmd is required for exit_code', raw: { spec } };
  }
  // R-8.05 — an `expect_in_stdout` key present but empty silently disabled the
  // stdout check, so the assertion degraded to «exit 0» without saying so.
  // A declared-but-empty expectation is a contract bug, not a weaker check.
  if ('expect_in_stdout' in spec && !String(spec.expect_in_stdout ?? '').trim()) {
    return {
      verdict: 'fail',
      evidence: 'empty expect_in_stdout',
      reasoning: 'evidence_spec.expect_in_stdout is present but empty — give a real expected substring, or remove the key to assert on the exit code alone',
      raw: { spec },
    };
  }
  const r = runShellCmd(spec.cmd, opts);
  let verdict = r.exit_code === 0 ? 'pass' : 'fail';
  let extraNote = '';
  if (verdict === 'pass' && spec.expect_in_stdout) {
    let re; try { re = new RegExp(spec.expect_in_stdout); } catch { re = null; }
    if (!re) {
      verdict = 'fail';
      extraNote = `; invalid expect_in_stdout regex`;
    } else if (!re.test(r.stdout)) {
      verdict = 'fail';
      extraNote = `; expect_in_stdout "${spec.expect_in_stdout}" not matched`;
    }
  }
  if (r.timed_out) {
    verdict = 'fail';
    extraNote = `; timed out after ${opts.timeout_ms || DEFAULT_TIMEOUT_MS}ms`;
  }
  const evidenceLine = verdict === 'pass'
    ? `${spec.cmd} → exit 0 (${r.duration_ms}ms); first line: "${firstLine(r.stdout).slice(0, 200)}"`
    : `${spec.cmd} → exit ${r.exit_code}${extraNote}; stderr: "${truncate(firstLine(r.stderr), 200)}"`;
  const reasoning = verdict === 'pass'
    ? 'shell exit code 0' + (spec.expect_in_stdout ? ` and stdout matches /${spec.expect_in_stdout}/` : '')
    : `shell exit ${r.exit_code}${extraNote || ''}`;
  return {
    verdict,
    evidence: evidenceLine,
    reasoning,
    raw: {
      cmd: spec.cmd,
      exit_code: r.exit_code,
      stdout: truncate(r.stdout, STDOUT_CAP_BYTES),
      stderr: truncate(r.stderr, STDOUT_CAP_BYTES),
      duration_ms: r.duration_ms,
      timed_out: r.timed_out,
    },
    duration_ms: r.duration_ms,
  };
}

// ─────────────────────────────────────────── fs_glob
function simpleGlob(pattern, { cwd = ROOT } = {}) {
  // Supports the common shapes we need:
  //   path/to/dir/*.ext
  //   path/to/dir/*
  //   path/to/dir/file.ext (no wildcards — exact match)
  //   path/to/**/*.ext (recursive)
  // Anything weirder → falls back to fs.globSync if available.
  const abs = path.resolve(cwd, pattern);
  if (!pattern.includes('*')) {
    return fs.existsSync(abs) ? [abs] : [];
  }
  if (typeof fs.globSync === 'function') {
    try {
      const out = [];
      for (const p of fs.globSync(pattern, { cwd })) {
        out.push(path.resolve(cwd, p));
      }
      return out;
    } catch { /* fall through */ }
  }
  // Manual fallback (no recursion): only handles dir/*.ext or dir/* shape.
  const lastSep = pattern.lastIndexOf('/');
  const dir = lastSep >= 0 ? path.resolve(cwd, pattern.slice(0, lastSep)) : cwd;
  const rest = lastSep >= 0 ? pattern.slice(lastSep + 1) : pattern;
  if (rest.includes('**')) return [];
  if (!fs.existsSync(dir)) return [];
  const re = new RegExp('^' + rest.split('*').map(escapeRe).join('.*') + '$');
  return fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => path.join(dir, f));
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function collectFsGlob(spec) {
  if (!spec || typeof spec.pattern !== 'string') {
    return { verdict: 'fail', evidence: 'no pattern in spec', reasoning: 'evidence_spec.pattern is required for fs_glob', raw: { spec } };
  }
  const minCount = Number(spec.min_count ?? 1);
  // R-8.05 — `min_count: 0` passes on zero matching files, i.e. it proves
  // nothing. Kanon §3.1: no evidence must never read as pass.
  if (!Number.isFinite(minCount) || minCount < 1) {
    return {
      verdict: 'fail',
      evidence: `min_count=${spec.min_count}`,
      reasoning: 'evidence_spec.min_count must be ≥ 1 — a glob that tolerates zero files is not evidence',
      raw: { spec },
    };
  }
  const maxAgeMin = spec.max_age_min !== undefined ? Number(spec.max_age_min) : null;
  const t0 = Date.now();
  const files = simpleGlob(spec.pattern);
  const stats = files.map((p) => {
    try { return { p, mtime_ms: fs.statSync(p).mtimeMs }; } catch { return null; }
  }).filter(Boolean);
  const newest = stats.length ? Math.max(...stats.map((s) => s.mtime_ms)) : 0;
  const oldest = stats.length ? Math.min(...stats.map((s) => s.mtime_ms)) : 0;
  let verdict = stats.length >= minCount ? 'pass' : 'fail';
  let extraNote = '';
  if (verdict === 'pass' && maxAgeMin !== null) {
    const cutoff = Date.now() - maxAgeMin * 60 * 1000;
    const stale = stats.filter((s) => s.mtime_ms < cutoff);
    if (stale.length) {
      verdict = 'fail';
      extraNote = `; ${stale.length}/${stats.length} older than ${maxAgeMin}min (oldest ${Math.round((Date.now() - oldest) / 60000)}min ago)`;
    }
  }
  const evidence = `glob ${spec.pattern} → ${stats.length} files (min=${minCount}${maxAgeMin !== null ? `, max_age=${maxAgeMin}min` : ''})${stats.length ? `; newest ${Math.round((Date.now() - newest) / 60000)}min ago` : ''}${extraNote}`;
  const reasoning = verdict === 'pass'
    ? `${stats.length} files match (≥${minCount})${maxAgeMin !== null ? ` and all within ${maxAgeMin}min` : ''}`
    : `${stats.length} files match; need ≥${minCount}${extraNote}`;
  return {
    verdict,
    evidence,
    reasoning,
    raw: { pattern: spec.pattern, count: stats.length, min_count: minCount, max_age_min: maxAgeMin, newest_minutes_ago: stats.length ? Math.round((Date.now() - newest) / 60000) : null, sample: stats.slice(0, 5).map((s) => s.p) },
    duration_ms: Date.now() - t0,
  };
}

// ─────────────────────────────────────────── file_diff
function collectFileDiff(spec, opts = {}) {
  const sinceRef = String(spec?.since_ref || 'HEAD~1');
  const t0 = Date.now();
  // R-8.05 — with neither must_touch nor must_not_touch this collector asserted
  // nothing and returned pass for any diff (including an empty one). A
  // deterministic kind that cannot fail is a silent green, which Kanon V
  // forbids — and because non-llm_judge kinds carry the block-level verdict,
  // one such assertion was enough to promote a block.
  const mustTouchPre = Array.isArray(spec?.must_touch) ? spec.must_touch : [];
  const mustNotTouchPre = Array.isArray(spec?.must_not_touch) ? spec.must_not_touch : [];
  if (!mustTouchPre.length && !mustNotTouchPre.length) {
    return {
      verdict: 'fail',
      evidence: 'empty spec: no must_touch / must_not_touch',
      reasoning: 'file_diff requires a non-empty must_touch or must_not_touch list — otherwise the assertion cannot fail and proves nothing',
      raw: { spec },
      duration_ms: Date.now() - t0,
    };
  }
  // First check whether we're in a git repo at all (graceful skip otherwise).
  const gitCheck = runShellCmd('git rev-parse --is-inside-work-tree', { cwd: opts.cwd || ROOT, timeout_ms: 5000 });
  if (gitCheck.exit_code !== 0) {
    return { verdict: 'skipped', evidence: 'not a git repo', reasoning: 'file_diff requires git', raw: { gitCheck }, duration_ms: Date.now() - t0 };
  }
  const r = runShellCmd(`git diff --name-only ${sinceRef}`, { cwd: opts.cwd || ROOT, timeout_ms: opts.timeout_ms || 10000 });
  if (r.exit_code !== 0) {
    return { verdict: 'fail', evidence: `git diff ${sinceRef} → exit ${r.exit_code}`, reasoning: `git diff failed: ${truncate(firstLine(r.stderr), 200)}`, raw: { stderr: r.stderr }, duration_ms: Date.now() - t0 };
  }
  const touched = new Set(r.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  const mustTouch = Array.isArray(spec?.must_touch) ? spec.must_touch : [];
  const mustNotTouch = Array.isArray(spec?.must_not_touch) ? spec.must_not_touch : [];
  const missing = mustTouch.filter((p) => !touched.has(p));
  const forbidden = mustNotTouch.filter((p) => touched.has(p));
  let verdict = 'pass';
  if (missing.length || forbidden.length) verdict = 'fail';
  const evidence = `git diff ${sinceRef} → ${touched.size} files; must_touch missing: [${missing.join(', ')}]; forbidden touched: [${forbidden.join(', ')}]`;
  const reasoning = verdict === 'pass'
    ? `all must_touch present (${mustTouch.length}); no forbidden paths touched (${mustNotTouch.length})`
    : `missing ${missing.length} must_touch and/or ${forbidden.length} forbidden touched`;
  return {
    verdict,
    evidence,
    reasoning,
    raw: { since_ref: sinceRef, touched_count: touched.size, missing, forbidden, sample_touched: Array.from(touched).slice(0, 10) },
    duration_ms: Date.now() - t0,
  };
}

// ─────────────────────────────────────────── log_grep
function collectLogGrep(spec) {
  if (!spec || typeof spec.file !== 'string' || typeof spec.pattern !== 'string') {
    return { verdict: 'fail', evidence: 'spec.file and spec.pattern required', reasoning: 'log_grep requires file + pattern', raw: { spec } };
  }
  // R-8.05 — an empty pattern matches every line, so the assertion passes on
  // any non-empty file regardless of what it contains.
  if (!spec.pattern.trim()) {
    return { verdict: 'fail', evidence: 'empty pattern', reasoning: 'evidence_spec.pattern is empty — an empty regex matches every line and proves nothing', raw: { spec } };
  }
  const t0 = Date.now();
  const filePath = path.resolve(ROOT, spec.file);
  if (!fs.existsSync(filePath)) {
    return { verdict: 'fail', evidence: `${spec.file} does not exist`, reasoning: 'target log file missing', raw: { file: filePath }, duration_ms: Date.now() - t0 };
  }
  let re; try { re = new RegExp(spec.pattern); }
  catch { return { verdict: 'fail', evidence: `invalid regex /${spec.pattern}/`, reasoning: 'pattern is not a valid RegExp', raw: { spec }, duration_ms: Date.now() - t0 }; }
  const sinceMs = spec.since_time ? Date.parse(spec.since_time) : 0;
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split(/\r?\n/);
  const matches = [];
  for (const line of lines) {
    if (!re.test(line)) continue;
    if (sinceMs) {
      const ts = (line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/) || [])[1];
      if (ts && Date.parse(ts) < sinceMs) continue;
    }
    matches.push(line);
  }
  const verdict = matches.length >= 1 ? 'pass' : 'fail';
  const evidence = `grep /${spec.pattern}/ ${spec.file} → ${matches.length} matches${spec.since_time ? ` (since ${spec.since_time})` : ''}${matches.length ? `; first: "${truncate(matches[0], 200)}"` : ''}`;
  const reasoning = verdict === 'pass' ? `${matches.length} matching lines found` : 'no matches';
  return {
    verdict, evidence, reasoning,
    raw: { file: filePath, pattern: spec.pattern, since_time: spec.since_time || null, match_count: matches.length, sample: matches.slice(0, 3) },
    duration_ms: Date.now() - t0,
  };
}

// ─────────────────────────────────────────── llm_judge (PR-3)
async function collectLlmJudge(spec, { block_id, assertion } = {}) {
  // The dispatcher passes the whole assertion object via `_judge_input` so the
  // judge can build a context-aware prompt without re-parsing acceptance.md.
  if (!assertion || !assertion.id) {
    return { verdict: 'skipped', evidence: 'llm_judge requires assertion context', reasoning: 'collectEvidence({evidence_kind:"llm_judge"}) called without {assertion, block_id} context — only verifyBlock() supplies it', raw: { spec }, duration_ms: 0 };
  }
  const t0 = Date.now();
  let r;
  try {
    r = await judgeAssertion({ assertion, block_id });
  } catch (e) {
    // R-7.99 (Kanon spec §3.1) — a crashed judge PRODUCED NO EVIDENCE; that
    // is inconclusive (skipped), never fail. The old `fail` here caused
    // false «regressions» in verify_done_blocks_still_green whenever the
    // claude_cli provider hiccuped: blocks that pass 8/0 under a working
    // judge were reported 5/3 red purely because the judge process died.
    return { verdict: 'skipped', evidence: `judge_assertion threw: ${e.message}`, reasoning: 'LLM-judge unavailable/crashed — no evidence either way (inconclusive per spec §3.1)', raw: { error: e.message }, duration_ms: Date.now() - t0 };
  }
  // Map judge verdict → collector verdict. inconclusive → skipped (so the
  // overall block verdict logic stays unchanged: skipped doesn't block, fail
  // does).
  const verdict = r.verdict === 'inconclusive' ? 'skipped' : r.verdict;
  const tail = r.evidence_quote ? `; quote: "${r.evidence_quote.slice(0, 200)}"` : '';
  return {
    verdict,
    evidence: `LLM judge → ${r.verdict} via ${r.provider}/${r.model || '?'} (${r.cost_usd ? '$' + r.cost_usd.toFixed(5) : '$0'})${tail}`,
    reasoning: r.reasoning,
    raw: {
      judge_verdict: r.verdict,
      provider: r.provider,
      model: r.model,
      prompt_hash: r.prompt_hash,
      cost_usd: r.cost_usd,
      cost_capped: r.cost_capped,
      evidence_quote: r.evidence_quote,
    },
    duration_ms: r.duration_ms,
  };
}

// ─────────────────────────────────────────── dispatcher
export async function collectEvidence({ evidence_kind, evidence_spec, cwd, timeout_ms, block_id, assertion } = {}) {
  const opts = { cwd, timeout_ms };
  switch (evidence_kind) {
    case 'exit_code':
    case 'selftest_run':
      return { evidence_kind, ...collectExitCode(evidence_spec, opts) };
    case 'fs_glob':
      return { evidence_kind, ...collectFsGlob(evidence_spec) };
    case 'file_diff':
      return { evidence_kind, ...collectFileDiff(evidence_spec, opts) };
    case 'log_grep':
      return { evidence_kind, ...collectLogGrep(evidence_spec) };
    case 'llm_judge':
      return { evidence_kind, ...(await collectLlmJudge(evidence_spec, { block_id, assertion })) };
    default:
      return { evidence_kind, verdict: 'fail', evidence: `unknown evidence_kind: ${evidence_kind}`, reasoning: `evidence_kind must be one of: exit_code, fs_glob, file_diff, log_grep, selftest_run, llm_judge`, raw: { evidence_kind }, duration_ms: 0 };
  }
}

// ─────────────────────────────────────────── verifyBlock (parser + collectors)
export async function verifyBlock(blockId, opts = {}) {
  const parsed = parseAcceptance(blockId, opts.atlas_root);
  // R-8.11 (KPI-6) — a cached pass when nothing the verdict depends on has
  // changed (see verify_cache.mjs for what the key covers and why). Callers
  // store a fresh pass after their own writes (storeVerifyCache). `cache:
  // false` / ATLAS_VERIFY_CACHE=0 always verify.
  let cacheMiss = null;
  if (opts.cache !== false) {
    const atlasRoot = opts.atlas_root || process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');
    const c = lookupVerifyCache({ blockId, atlasRoot, parsed, glob: (p) => simpleGlob(p) });
    if (c.hit) return c.result;
    cacheMiss = { hit: false, reason: c.reason, lookup_ms: c.lookup_ms };
  }
  const t0 = Date.now();
  const enriched = [];
  for (const a of parsed.assertions) {
    const result = await collectEvidence({
      evidence_kind: a.evidence_kind,
      evidence_spec: a.evidence_spec,
      cwd: opts.cwd,
      timeout_ms: opts.timeout_ms,
      block_id: blockId,
      assertion: a,
    });
    enriched.push({ ...a, ...result });
  }
  const counts = { pass: 0, fail: 0, skipped: 0 };
  for (const a of enriched) counts[a.verdict] = (counts[a.verdict] || 0) + 1;
  // Block verdict: fail iff ANY fail; pass iff ≥1 DETERMINISTIC pass and 0
  // fails; otherwise inconclusive.
  //
  // Kanon spec §3.2: «An LLM-as-judge result alone is INSUFFICIENT for pass —
  // it MAY contribute to a verdict but MUST be paired with at least one
  // deterministic collector.» So passes that come exclusively from llm_judge
  // assertions do NOT promote the block to pass — they leave it inconclusive,
  // surfaced via `llm_judge_only: true` so the UI can explain why.
  const deterministicPass = enriched.some((a) => a.verdict === 'pass' && a.evidence_kind !== 'llm_judge');
  const llmJudgeOnlyPass = !deterministicPass && enriched.some((a) => a.verdict === 'pass' && a.evidence_kind === 'llm_judge');
  let verdict = counts.fail > 0 ? 'fail' : (deterministicPass ? 'pass' : 'inconclusive');

  // R-7.98 (Kanon spec §2.4) — inconclusive_if preconditions. Each condition
  // with a deterministic spec is a PRECONDITION for conclusive verification:
  // if its check FAILS, the declared circumstance holds and the verdict is
  // forced to inconclusive. A deterministic assertion FAIL still wins —
  // refutation beats unknown. Declarative-only conditions (no spec) are
  // surfaced but not evaluated.
  let inconclusiveTriggered = null;
  const incConditions = Array.isArray(parsed.inconclusive_if) ? parsed.inconclusive_if : [];
  if (verdict === 'pass') {
    for (const cond of incConditions) {
      if (!cond.evidence_kind || cond.evidence_kind === 'llm_judge' || !cond.evidence_spec) continue;
      const r = await collectEvidence({
        evidence_kind: cond.evidence_kind,
        evidence_spec: cond.evidence_spec,
        cwd: opts.cwd,
        timeout_ms: opts.timeout_ms,
        block_id: blockId,
      });
      if (r.verdict === 'fail') {
        verdict = 'inconclusive';
        inconclusiveTriggered = { id: cond.id, text: cond.text, evidence: r.evidence };
        break;
      }
    }
  }
  return {
    block_id: blockId,
    source_path: parsed.source_path,
    parsed_warnings: parsed.warnings,
    assertions: enriched,
    counts,
    verdict,
    llm_judge_only: llmJudgeOnlyPass || undefined,
    inconclusive_if_triggered: inconclusiveTriggered || undefined,
    inconclusive_if_declared: incConditions.length || undefined,
    duration_ms: Date.now() - t0,
    checked_at: new Date().toISOString(),
    cache: cacheMiss || { hit: false, reason: 'cache not consulted (cache: false)' },
  };
}

/** The glob fs_glob uses — shared with the cache key so both see the same files. */
export function globForCache(pattern) { return simpleGlob(pattern); }

// ─────────────────────────────────────────── CLI
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  if (argv.includes('--block')) {
    const blockId = argv[argv.indexOf('--block') + 1];
    if (!blockId) { console.error('--block requires a block_id'); process.exit(1); }
    const r = await verifyBlock(blockId);
    if (json) { console.log(JSON.stringify(r, null, 2)); }
    else {
      const tick = (v) => v === 'pass' ? '✓' : v === 'fail' ? '✗' : v === 'skipped' ? '·' : '?';
      console.log(`${blockId}: ${r.verdict} (pass=${r.counts.pass} fail=${r.counts.fail} skipped=${r.counts.skipped})`);
      for (const a of r.assertions) {
        console.log(`  ${tick(a.verdict)} ${a.id} [${a.evidence_kind}] ${a.text.slice(0, 60)}${a.text.length > 60 ? '…' : ''}`);
        if (a.verdict !== 'pass') console.log(`     → ${a.evidence}`);
      }
    }
  } else if (argv.includes('--kind')) {
    const kind = argv[argv.indexOf('--kind') + 1];
    const specRaw = argv.includes('--spec') ? argv[argv.indexOf('--spec') + 1] : '{}';
    let spec; try { spec = JSON.parse(specRaw); } catch (e) { console.error('--spec must be JSON:', e.message); process.exit(1); }
    const r = await collectEvidence({ evidence_kind: kind, evidence_spec: spec });
    if (json) { console.log(JSON.stringify(r, null, 2)); }
    else { console.log(`[${kind}] ${r.verdict}: ${r.evidence}`); }
  } else {
    console.error('Usage:');
    console.error('  node scripts/collect_evidence.mjs --block <id> [--json]');
    console.error('  node scripts/collect_evidence.mjs --kind <evidence_kind> --spec \'{"...":"..."}\' [--json]');
    process.exit(1);
  }
}

#!/usr/bin/env node
// R-7.82 (S-3) — post-run content drift scanner.
//
// Existing `guard_against_drift.mjs` is a SHELL-COMMAND check (Cursor
// hook). It can block "npm install vue" before execution. But the
// operator's classic failure mode — «agent wrote a math formula
// instead of an LLM call» — is a CONTENT violation, not a shell one.
// Math doesn't show up as a forbidden command; it shows up as
// `import math` or `Math.sqrt(...)` in the file the agent just wrote.
//
// This scanner runs AFTER `run_block_implementation` finishes (or
// inside its post-spawn step). It walks files the agent touched
// during this run and matches them against the operator's
// dont_use.json + always_use.json content rules. Violations get:
//   1. Logged to <block>/checks.log as `drift_content fail | <rule>`
//   2. Appended to <block>/narrative.md as «### What failed and why»
//   3. Returned to the orchestrator with exit code 1 so the FSM
//      can mark the run Failed with a clear reason
//
// Usage:
//   node scripts/scan_run_for_drift.mjs <block_id> [--since-iso <ts>]
//
// --since-iso defaults to the timestamp of the most recent
// `agent_run started` entry in checks.log; files modified after that
// are scanned.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');

const blockId = process.argv[2];
if (!blockId) {
  console.error('Usage: node scripts/scan_run_for_drift.mjs <block_id> [--since-iso <ISO>]');
  process.exit(2);
}

const sinceIdx = process.argv.indexOf('--since-iso');
const sinceIso = sinceIdx >= 0 ? process.argv[sinceIdx + 1] : null;
const sinceMs = sinceIso ? new Date(sinceIso).getTime() : (Date.now() - 60 * 60 * 1000); // default: last hour

const blockDir = path.join(ATLAS, 'blocks', blockId);
if (!fs.existsSync(blockDir)) {
  // Try clients/<id>/blocks/<id>/
  const clients = fs.existsSync(path.join(ATLAS, 'clients'))
    ? fs.readdirSync(path.join(ATLAS, 'clients')).filter(d => fs.statSync(path.join(ATLAS, 'clients', d)).isDirectory())
    : [];
  let resolved = null;
  for (const c of clients) {
    const p = path.join(ATLAS, 'clients', c, 'blocks', blockId);
    if (fs.existsSync(p)) { resolved = p; break; }
  }
  if (!resolved) {
    console.error(`block not found: ${blockId}`);
    process.exit(2);
  }
}
const dir = fs.existsSync(blockDir) ? blockDir : (() => {
  const clients = fs.readdirSync(path.join(ATLAS, 'clients'));
  for (const c of clients) {
    const p = path.join(ATLAS, 'clients', c, 'blocks', blockId);
    if (fs.existsSync(p)) return p;
  }
  return null;
})();

// ─────────────────────────────────────────── load rules
function readJsonSafe(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
const profileDir = path.join(ATLAS, 'operator_profile');
const dontUse = readJsonSafe(path.join(profileDir, 'dont_use.json'))?.entries || [];
const alwaysUse = readJsonSafe(path.join(profileDir, 'always_use.json'))?.entries || [];

// Filter to entries relevant to this block (block_id match or global)
const relevant = (arr) => arr.filter(e => !e.block_id || e.block_id === blockId);
const blockDontUse = relevant(dontUse);
const blockAlwaysUse = relevant(alwaysUse);

if (!blockDontUse.length && !blockAlwaysUse.length) {
  console.log(`[scan] no relevant content rules for ${blockId} — skip`);
  process.exit(0);
}

// ─────────────────────────────────────────── collect files agent touched
// Strategy: read files.md (alive list) and check mtime > sinceMs
function listFromMd(md) {
  return md.split(/\r?\n/).map(s => s.trim()).filter(s => s.startsWith('- '))
    .map(s => s.slice(2)).map(s => s.split('[')[0].trim()).filter(Boolean);
}
const filesMdContent = fs.existsSync(path.join(dir, 'files.md'))
  ? fs.readFileSync(path.join(dir, 'files.md'), 'utf8')
  : '';
const aliveFiles = listFromMd(filesMdContent);

const touched = aliveFiles.filter(f => {
  const abs = path.isAbsolute(f) ? f : path.join(ROOT, f);
  if (!fs.existsSync(abs)) return false;
  try { return fs.statSync(abs).mtimeMs >= sinceMs; } catch { return false; }
});

if (!touched.length) {
  console.log(`[scan] no files modified since ${new Date(sinceMs).toISOString()} — skip`);
  process.exit(0);
}

console.log(`[scan] scanning ${touched.length} file(s) against ${blockDontUse.length} dont_use + ${blockAlwaysUse.length} always_use rules`);

// ─────────────────────────────────────────── matcher
// Each rule has { rule, reason, severity?, pattern? }. If pattern is
// provided we use it as regex; else we substring-match `rule` lower-cased.
function ruleMatches(rule, content) {
  if (rule.pattern) {
    try { return new RegExp(rule.pattern, 'i').test(content); } catch { /* fall through */ }
  }
  if (rule.rule) {
    return content.toLowerCase().includes(String(rule.rule).toLowerCase());
  }
  return false;
}

const violations = [];
for (const f of touched) {
  const abs = path.isAbsolute(f) ? f : path.join(ROOT, f);
  let content = '';
  try { content = fs.readFileSync(abs, 'utf8'); } catch { continue; }
  // Skip binaries
  if (/\0/.test(content.slice(0, 1024))) continue;

  for (const r of blockDontUse) {
    if (ruleMatches(r, content)) {
      violations.push({ kind: 'dont_use', file: f, rule: r.rule || r.pattern, reason: r.reason || '', severity: r.severity || 'soft' });
    }
  }
  // always_use: violation iff the rule is NOT present in content (the rule says "always include X" — X must appear)
  for (const r of blockAlwaysUse) {
    if (!ruleMatches(r, content)) {
      // Only flag if the file is in scope of this always_use entry — for now scope by filename glob if pattern specifies it
      // Default: only flag for the "primary" file mentioned in always_use.entries[].applies_to
      if (r.applies_to && !f.includes(r.applies_to)) continue;
      if (!r.applies_to) continue; // global always_use: skip per-file enforcement, leave to LLM judge
      violations.push({ kind: 'always_use', file: f, rule: r.rule || r.pattern, reason: r.reason || '', severity: r.severity || 'soft' });
    }
  }
}

// ─────────────────────────────────────────── report + log
if (!violations.length) {
  console.log(`[scan] ✓ no violations · ${touched.length} files clean`);
  // Append a passive line to checks.log so we can see the scan ran
  const ts = new Date().toISOString();
  fs.appendFileSync(path.join(dir, 'checks.log'),
    `${ts}\tdrift_content\tpass\tscanned ${touched.length} files vs ${blockDontUse.length + blockAlwaysUse.length} rules\n`);
  process.exit(0);
}

const ts = new Date().toISOString();
const checksLines = violations.map(v =>
  `${ts}\tdrift_content\tfail\t${v.kind} violation: "${v.rule}" in ${v.file} — ${v.reason || 'no reason given'}`
).join('\n') + '\n';
fs.appendFileSync(path.join(dir, 'checks.log'), checksLines);

// Append narrative entry so future agents (and operators) see it
const narrativePath = path.join(dir, 'narrative.md');
const narrativeEntry = [
  '',
  `## ${ts} · drift detected during run`,
  '',
  '### What failed and why',
  ...violations.map(v => `- **${v.kind}** rule «${v.rule}» triggered in \`${v.file}\` — ${v.reason || 'no reason given'} (severity: ${v.severity})`),
  '',
  '### Recommended action',
  '- The agent introduced content that violates an operator-locked rule. Either:',
  '  1. Revert the violating change manually, or',
  '  2. Update the rule (via MCP `set_dont_use clear ...`) if the operator changed their mind.',
  '- Future runs will keep flagging this until one of the above happens.',
  '',
].join('\n');
try { fs.appendFileSync(narrativePath, narrativeEntry); } catch {}

console.error(`[scan] ✗ ${violations.length} violation(s) found:`);
for (const v of violations) {
  console.error(`  - ${v.kind} «${v.rule}» in ${v.file} (severity: ${v.severity})`);
  if (v.reason) console.error(`    reason: ${v.reason}`);
}

const hardViolations = violations.filter(v => v.severity === 'hard');
process.exit(hardViolations.length > 0 ? 1 : 0);

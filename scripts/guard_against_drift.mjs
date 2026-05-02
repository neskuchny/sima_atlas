#!/usr/bin/env node
// PR4: beforeShellExecution hook action.
//
// Reads the proposed shell command from env (CURSOR_COMMAND /
// CURSOR_BEFORE_SHELL_EXECUTION_COMMAND / CURSOR_HOOK_COMMAND) or argv (joined),
// then matches it against:
//   * `forbidden` regex block in atlas/tech_stack.md
//   * `forbidden_substrings` block in atlas/tech_stack.md
//
// On mismatch — exit code 1 (Cursor blocks the command) AND log a `drift_blocked`
// line into b.agent-orchestrator/checks.log AND a daily summary line into
// atlas/transitions.log so the visual UI sees rejected drift attempts.
//
// On match — exit 0, no log spam (we don't want noise).
//
// CLI usage (for tests):
//   node scripts/guard_against_drift.mjs "pip install neo4j"
//   node scripts/guard_against_drift.mjs "npm install react"

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');
const BLOCKS = path.join(ATLAS, 'blocks');

function readSafe(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }

function getCommand() {
  const candidates = [
    process.env.CURSOR_COMMAND,
    process.env.CURSOR_BEFORE_SHELL_EXECUTION_COMMAND,
    process.env.CURSOR_HOOK_COMMAND,
  ];
  for (const c of candidates) if (c && c.trim()) return c.trim();
  if (process.argv.length > 2) return process.argv.slice(2).join(' ').trim();
  return '';
}

function parseFencedSection(md, fenceTag) {
  const re = new RegExp('```' + fenceTag + '\\s*([\\s\\S]*?)```');
  const m = md.match(re);
  if (!m) return [];
  return m[1]
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function matchesForbidden(cmd, regexes, substrings) {
  for (const r of regexes) {
    let re;
    try { re = new RegExp(r, 'i'); } catch { continue; }
    if (re.test(cmd)) return { kind: 'regex', pattern: r };
  }
  const lc = cmd.toLowerCase();
  for (const s of substrings) {
    if (lc.includes(s.toLowerCase())) return { kind: 'substring', pattern: s };
  }
  return null;
}

const cmd = getCommand();
if (!cmd) {
  // No command supplied — neither Cursor nor CLI passed one. Approve by default.
  process.stdout.write('guard_against_drift: no command supplied; approving\n');
  process.exit(0);
}

const techStack = readSafe(path.join(ATLAS, 'tech_stack.md'));
const forbiddenRegexes = parseFencedSection(techStack, 'forbidden');
const forbiddenSubstrings = parseFencedSection(techStack, 'forbidden_substrings');

const hit = matchesForbidden(cmd, forbiddenRegexes, forbiddenSubstrings);
const ts = new Date().toISOString();

if (hit) {
  const reason = `drift_blocked: command "${cmd}" matched ${hit.kind} "${hit.pattern}" in tech_stack.md`;
  const orch = path.join(BLOCKS, 'b.agent-orchestrator', 'checks.log');
  if (fs.existsSync(path.dirname(orch))) {
    fs.appendFileSync(orch, `${ts}\tdrift_guard\tfail\t${reason}\n`, 'utf8');
  }
  const transitions = path.join(ATLAS, 'transitions.log');
  fs.appendFileSync(transitions, `${ts}\tdrift_guard\tfail\t${reason}\n`, 'utf8');
  process.stderr.write(`✗ guard_against_drift: ${reason}\n`);
  process.stderr.write(`  Edit atlas/tech_stack.md if you want to allow this command.\n`);
  process.exit(1);
}

process.stdout.write(`guard_against_drift: OK — "${cmd.slice(0, 80)}${cmd.length > 80 ? '…' : ''}"\n`);
process.exit(0);

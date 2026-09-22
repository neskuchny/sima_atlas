#!/usr/bin/env node
// R-8.11 (b.operator-profile-learner) — acceptance A7 (privacy gate) as a
// deterministic check instead of an LLM judgment:
//   g1 — .gitignore keeps the raw history out of git;
//   g2 — atlas/rules.md explains it (this rule was missing: the assertion
//        claimed it and nobody had checked);
//   g3 — no e-mail addresses, API keys or tokens in any committed profile
//        file (profile.json, patterns/*.json, templates, always_use);
//   g4 — the scanner itself catches each kind (so g3 green means something).
// Personal names are not machine-checkable and are not claimed here.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const failures = [];
const check = (name, cond, detail = '') => { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); };

const PII = [
  ['e-mail', /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/],
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{10,}/],
  ['OpenAI key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/],
  ['Google key', /AIza[0-9A-Za-z_-]{30,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{30,}/],
  ['AWS key', /\bAKIA[0-9A-Z]{16}\b/],
  ['bearer token', /Bearer\s+[A-Za-z0-9._~+/-]{20,}/],
];
const scan = (text) => PII.filter(([, re]) => re.test(text)).map(([k]) => k);

// ── g1 ─────────────────────────────────────────────────────────────────────
const gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
check('g1: .gitignore excludes atlas/operator_profile/history', /^atlas\/operator_profile\/history\/\*$/m.test(gitignore));

// ── g2 ─────────────────────────────────────────────────────────────────────
const rules = fs.readFileSync(path.join(ROOT, 'atlas', 'rules.md'), 'utf8');
const rule = rules.split(/\r?\n/).find((l) => l.includes('atlas/operator_profile/')) || '';
check('g2: rules.md has a rule about atlas/operator_profile/', Boolean(rule));
check('g2: …saying why history is not committed and that profile files carry no PII',
  /history/.test(rule) && /gitignore/.test(rule) && /(e-mail|API)/i.test(rule), rule);

// ── g3 ─────────────────────────────────────────────────────────────────────
let files = [];
try {
  files = execFileSync('git', ['ls-files', 'atlas/operator_profile'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
} catch {
  // No git (an installed copy): scan what is on disk, minus the history.
  const walk = (d) => fs.readdirSync(path.join(ROOT, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === 'history' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
  files = walk('atlas/operator_profile');
}
files = files.filter((f) => !f.includes('/history/') && /\.(json|md|txt)$/.test(f));
check('g3: there are profile files to scan', files.length > 0);
for (const f of files) {
  const hits = scan(fs.readFileSync(path.join(ROOT, f), 'utf8'));
  check(`g3: ${f} carries no PII`, hits.length === 0, hits.join(', '));
}

// ── g4: the scanner is not blind ───────────────────────────────────────────
const samples = {
  'e-mail': 'contact: someone@example.org',
  'Anthropic key': 'sk-ant-api03-abcdefghijklmnop',
  'OpenAI key': 'sk-proj-abcdefghijklmnopqrstuvwx',
  'Google key': 'AIzaSyA1234567890abcdefghijklmnopqrstu',
  'GitHub token': 'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
  'AWS key': 'AKIAABCDEFGHIJKLMNOP',
  'bearer token': 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
};
for (const [kind, text] of Object.entries(samples)) check(`g4: the scanner catches a ${kind}`, scan(text).includes(kind), scan(text).join(','));
check('g4: …and does not flag ordinary profile text', scan('{"prefers":"small PRs","stack":["node","sqlite"]}').length === 0);

if (failures.length) {
  console.error('operator_profile_privacy.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log(`operator_profile_privacy.selftest: OK (4 groups, ${files.length} profile files scanned)`);

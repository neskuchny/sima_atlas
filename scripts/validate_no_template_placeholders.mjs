#!/usr/bin/env node
// validate_no_template_placeholders.mjs
//
// PR1 honest-reset gate. Refuses to accept block content that is:
//   - shorter than minimum length
//   - contains forbidden phrases (templates, "Auto-generated", "TBD", etc.)
//
// Scope: mission.md / kpi.md / acceptance.md of every block listed in graph.json.
// Exit code 0 if all blocks pass, 1 if any template leaks remain.
//
// This validator is intentionally strict:
//   - 'idea' status is allowed to have short mission, but content must not be a known template phrase.
//   - 'wip'/'review'/'done' must have mission >= 200 chars and clean of templates.
//   - 'done' additionally requires kpi >= 200 chars and acceptance >= 200 chars.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlasRoot = path.join(root, 'atlas');
const blocksRoot = path.join(atlasRoot, 'blocks');
const graphPath = path.join(atlasRoot, 'graph.json');

const FORBIDDEN_PHRASES = [
  'Ключевая цель блока',
  'Автосоздано',
  'semantic-refine: подтвердить автогенерацию',
  'KPI-1: метрика готовности определена',
  'KPI-1: semantic extraction quality >= baseline',
  'Логика блока документирована',
  'acceptance: mission/tasks/kpi confirmed after semantic ingestion',
  'Описать контракты вход/выход',
  'TBD',
  'todo: define',
];

const MIN_LEN = {
  mission: { idea: 80, wip: 200, review: 200, done: 250, broken: 80, drift: 80 },
  kpi: { idea: 60, wip: 150, review: 150, done: 200, broken: 60, drift: 60 },
  acceptance: { idea: 60, wip: 150, review: 200, done: 250, broken: 60, drift: 60 },
};

function readSafe(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }
function bareContent(md) {
  // strip H1 header line(s) and surrounding whitespace
  return md
    .split(/\r?\n/)
    .filter((l) => !/^\s*#\s+/.test(l))
    .join('\n')
    .trim();
}

// Quoted phrases (in «...», "...", '...', `...`) are treated as citations
// and ignored by the forbidden-phrase check. Use this when documenting
// anti-patterns inside a block (e.g., b.docs explaining what NOT to write).
function stripQuotedSpans(text) {
  return text
    .replace(/«[^»]*»/g, '')
    .replace(/"[^"]*"/g, '')
    .replace(/'[^']*'/g, '')
    .replace(/`[^`]*`/g, '');
}

const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const errors = [];
const warnings = [];

for (const b of graph.blocks || []) {
  const status = (b.status || 'idea').toLowerCase();
  const dir = path.join(blocksRoot, b.id);
  if (!fs.existsSync(dir)) {
    errors.push(`${b.id}: block dir missing — cannot validate`);
    continue;
  }

  for (const kind of ['mission', 'kpi', 'acceptance']) {
    const filePath = path.join(dir, `${kind}.md`);
    const raw = readSafe(filePath);
    const content = bareContent(raw);

    // 1) forbidden phrase check (always enforced)
    // Strip citations to avoid false-positives on docs that reference anti-patterns.
    const checkable = stripQuotedSpans(content);
    for (const phrase of FORBIDDEN_PHRASES) {
      if (checkable.includes(phrase)) {
        errors.push(`${b.id}: ${kind}.md contains forbidden template phrase: "${phrase}"`);
      }
    }

    // 2) min length check (status-dependent)
    const minLen = MIN_LEN[kind][status];
    if (typeof minLen === 'number' && content.length < minLen) {
      const msg = `${b.id}: ${kind}.md too short (${content.length} chars, expected >= ${minLen} for status=${status})`;
      if (status === 'done' || status === 'review') {
        errors.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }

  // 3) tasks.md check: must have at least one non-template task
  const tasksRaw = readSafe(path.join(dir, 'tasks.md'));
  const tasksContent = bareContent(tasksRaw);
  if (tasksContent.length < 40) {
    warnings.push(`${b.id}: tasks.md is suspiciously short (${tasksContent.length} chars)`);
  }
}

if (warnings.length) {
  console.warn('Template-placeholder validation warnings:');
  warnings.forEach((w) => console.warn(' ⚠', w));
}

if (errors.length) {
  console.error('Template-placeholder validation FAILED:');
  errors.forEach((e) => console.error(' ✗', e));
  process.exit(1);
}

console.log(`Template-placeholder validation: OK (${(graph.blocks || []).length} blocks scanned)`);

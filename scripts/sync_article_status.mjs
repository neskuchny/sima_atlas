#!/usr/bin/env node
// R-7.98 (Kanon principle VII — «documentation is a projection of the
// graph») — the article's Part 9 block table is a PROJECTION of graph.json,
// regenerated from it, never hand-edited. The audit found the article
// claiming `done` for blocks that graph.json honestly holds at `idea` —
// exactly the drift the canon forbids. This script removes the human from
// that loop.
//
// What it does: replaces the block-status table between the markers
//   <!-- BLOCK-STATUS:BEGIN --> … <!-- BLOCK-STATUS:END -->
// in docs/article.en.md and docs/article.ru.md with a table generated from
// graph.json (id, live status, title). Blocks in `archived` are skipped.
// The «capability rows» (memory layer, drift scanner, …) below the marker
// block are narrative, not graph state — they stay hand-written.
//
// Wired into generate_full_bundle + nightly so the article can no longer
// silently drift from the graph.
//
// Usage: node scripts/sync_article_status.mjs [--check]
//   --check  exit 1 if the table is stale (CI guard), write nothing.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const graph = JSON.parse(fs.readFileSync(path.join(ROOT, 'atlas', 'graph.json'), 'utf8'));

const CHECK = process.argv.includes('--check');
const BEGIN = '<!-- BLOCK-STATUS:BEGIN (auto-generated from graph.json — edit via scripts/sync_article_status.mjs, not by hand) -->';
const END = '<!-- BLOCK-STATUS:END -->';

const summaries = {
  en: {
    'b.core-sync': 'contract consistency, drift detection, validator passes',
    'b.db': '`atlas/` as a file-based DB with migrations',
    'b.llm-gateway': 'provider cascade (claude_cli/anthropic/google/ollama/mock), trace, schema-retry',
    'b.acceptance-verifier-loop': 'parsing acceptance.md, 5 evidence kinds + inconclusive_if, llm-judge fallback',
    'b.operator-profile-learner': 'archetype, lessons, dont_use, always_use, profile-compliance badges',
    'b.agent-orchestrator': 'per-block agent invocations, run_state tracking, stalled detection',
    'b.docs': 'WIKI.md, wiki.html, auto_tz.md, roadmap.md auto-generation (template-gated)',
    'b.user-docs-generator': 'end-user tutorials from JSX introspection',
    'b.ui-control': 'visual canvas, composer, proposals panel',
    'b.smoke-sandbox': 'end-to-end smoke test for regression',
  },
  ru: {
    'b.core-sync': 'контрактная согласованность, drift-detection, valid-проходы',
    'b.db': 'atlas/ как файловая БД с migrations',
    'b.llm-gateway': 'каскад провайдеров (claude_cli/anthropic/google/ollama/mock), trace, schema-retry',
    'b.acceptance-verifier-loop': 'парсинг acceptance.md, 5 типов evidence + inconclusive_if, llm-judge fallback',
    'b.operator-profile-learner': 'archetype, lessons, dont_use, always_use, бейджи соответствия профилю',
    'b.agent-orchestrator': 'per-block agent invocations, run_state tracking, stalled detection',
    'b.docs': 'WIKI.md, wiki.html, auto_tz.md, roadmap.md auto-generation (гейт против шаблонов)',
    'b.user-docs-generator': 'пользовательские туториалы из JSX-интроспекции',
    'b.ui-control': 'визуальный canvas, composer, proposals panel',
    'b.smoke-sandbox': 'end-to-end smoke test для регрессии',
  },
};

function table(lang) {
  const head = lang === 'ru'
    ? '| Блок | Статус (live из graph.json) | Что делает |\n|------|--------|------------|'
    : '| Block | Status (live from graph.json) | What it does |\n|-------|--------|--------------|';
  const note = lang === 'ru'
    ? '_Статусы — честные, из `graph.json` на момент генерации: `idea` значит «контракт есть, acceptance ещё не доведён до done через гейты», а не «не работает». Код блока может полноценно работать и в `idea` — см. колонку «Что делает»._'
    : '_Statuses are honest, from `graph.json` at generation time: `idea` means «contract exists, acceptance not yet walked through the gates to done» — not «doesn\'t work». A block\'s code can be fully operational at `idea` — see the «What it does» column._';
  const rows = (graph.blocks || [])
    .filter((b) => b.status !== 'archived' && summaries[lang][b.id])
    .map((b) => `| \`${b.id}\` | ${b.status} | ${summaries[lang][b.id]} |`);
  return `${note}\n\n${head}\n${rows.join('\n')}`;
}

let anyStale = false;
for (const [lang, file] of [['en', 'docs/article.en.md'], ['ru', 'docs/article.ru.md']]) {
  const p = path.join(ROOT, file);
  let text = fs.readFileSync(p, 'utf8');
  const block = `${BEGIN}\n${table(lang)}\n${END}`;
  const re = new RegExp(`${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  if (!re.test(text)) {
    console.error(`${file}: BLOCK-STATUS markers not found — insert them around the Part 9 table first`);
    process.exitCode = 2;
    continue;
  }
  const next = text.replace(re, block);
  const fileStale = next !== text;
  if (fileStale) {
    anyStale = true;
    if (!CHECK) fs.writeFileSync(p, next, 'utf8');
  }
  console.log(`${file}: ${fileStale ? (CHECK ? 'STALE' : 'regenerated') : 'up to date'}`);
}
if (CHECK && anyStale) process.exit(1);

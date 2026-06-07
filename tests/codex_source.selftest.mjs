#!/usr/bin/env node
// R-7.97 — selftest for the Codex chat-source adapter.
//
// Exercises:
//   1. Newer message shape:  {role, content:[{type:"text", text}]}  → kept
//   2. Flat shape:           {role, content:"raw string"}            → kept
//   3. Stream shape:         input_text / output_text chunks         → merged
//   4. Noise:                tool-prompt-style content                → dropped
//   5. Cursor:               second pass on same file → no new turns
//   6. Rotation:             file shrunk → cursor reset → re-harvest
//
// No real ~/.codex/ touched: synthetic dir.

process.env.ATLAS_FORCE_MOCK_LLM = '1';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';

const { harvestAll } = await import('../scripts/chat_sources/codex.mjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-codex-'));
const sessionFile = path.join(tmp, 'rollout-2026-06-06-abc.jsonl');

function jl(obj) { return JSON.stringify(obj) + '\n'; }

const lines = [
  // Shape 1 — block content
  jl({ role: 'user', content: [{ type: 'text', text: 'Codex, добавь блок биллинга со Stripe-подписками и retry для failed charges. KPI: churn < 5%.' }], timestamp: '2026-06-06T10:00:00Z' }),
  jl({ role: 'assistant', content: [{ type: 'text', text: 'Понял — блок b.billing со Stripe webhook handlers и backoff retry. Сейчас сгенерирую mission и KPI.' }] }),
  // Shape 2 — flat string
  jl({ role: 'user', content: 'И ещё блок analytics — события юзера через Mixpanel, dashboards в Metabase. KPI: события доставлены < 1s p95.' }),
  // Noise (should be dropped)
  jl({ role: 'user', content: 'You are extracting product blocks from a transcript. Return JSON.' }),
  jl({ role: 'assistant', content: '{"blocks":[{"id":"x"}]}' }),
  // Shape 3 — streaming chunks
  jl({ type: 'input_text', text: 'Ещё нам нужен ' }),
  jl({ type: 'input_text', text: 'observability-блок — ' }),
  jl({ type: 'input_text', text: 'Prometheus + Grafana, алёрты в Slack. SLO 99.9% uptime.' }),
  jl({ type: 'output_text', text: 'Добавляю b.observability — ' }),
  jl({ type: 'output_text', text: 'Prometheus, Grafana, Slack-webhook alerts. SLO 99.9% / месяц.' }),
];
fs.writeFileSync(sessionFile, lines.join(''), 'utf8');

// Pass 1
const r1 = await harvestAll({ root: tmp, cursor: {} });
assert.equal(r1.source, 'codex');
assert.equal(r1.files_total, 1, 'should see the one rollout file');
assert.equal(r1.files_with_new, 1);
assert.ok(r1.turns.length >= 5, `expected ≥5 turns after noise filter + stream merge, got ${r1.turns.length}: ${JSON.stringify(r1.turns.map((t) => `${t.role}:${t.text.slice(0, 30)}`))}`);
// Stream chunks merged into one turn per role
const streamUserTurn = r1.turns.find((t) => t.role === 'user' && t.text.includes('observability'));
assert.ok(streamUserTurn, 'streaming user chunks should have merged into one turn');
assert.ok(streamUserTurn.text.includes('Prometheus'), 'merged user turn should include all chunks');
const streamAsstTurn = r1.turns.find((t) => t.role === 'assistant' && t.text.includes('Grafana'));
assert.ok(streamAsstTurn, 'streaming assistant chunks should have merged into one turn');
// Noise filtered
assert.ok(!r1.turns.some((t) => /^You are\b/.test(t.text)), 'tool-prompt noise must be dropped');
assert.ok(!r1.turns.some((t) => t.text.trim().startsWith('{') && t.text.trim().endsWith('}')), 'JSON-tool-output noise must be dropped');
// Source tagged
assert.ok(r1.turns.every((t) => t.source === 'codex'), 'all turns must carry source=codex');

// Pass 2 — same cursor, no new content
const r2 = await harvestAll({ root: tmp, cursor: r1.cursor });
assert.equal(r2.turns.length, 0, 'second pass should see no new turns');
assert.equal(r2.files_with_new, 0);

// Pass 3 — append more conversation
fs.appendFileSync(sessionFile, jl({ role: 'user', content: 'Финально — блок секретов через Vault, ротация раз в 90 дней.' }), 'utf8');
const r3 = await harvestAll({ root: tmp, cursor: r2.cursor });
assert.equal(r3.turns.length, 1, `should pick up the appended turn (got ${r3.turns.length})`);

// Pass 4 — rotated/truncated file
fs.writeFileSync(sessionFile, jl({ role: 'user', content: 'Перезапуск сессии — теперь обсуждаем фронт: React + Tailwind, темная тема.' }), 'utf8');
const r4 = await harvestAll({ root: tmp, cursor: r3.cursor });
assert.ok(r4.turns.length >= 1, `rotated file should re-read from 0 (got ${r4.turns.length})`);

console.log('codex_source.selftest: OK (4 passes, 3 line shapes, stream merge, noise filtered, cursor + rotation handled)');

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

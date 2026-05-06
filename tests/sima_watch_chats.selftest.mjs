#!/usr/bin/env node
// Phase R-3 — selftest for the chat-session watcher.
//
// Exercises the slice without touching the real ~/.claude/projects:
//   1. Builds a synthetic project dir with one jsonl containing a mix of
//      genuine human↔assistant turns and noise (Sima's own LLM prompts,
//      Stop-hook feedback, JSON tool outputs).
//   2. First pass: watcher should harvest the conversational turns past
//      the noise threshold and produce a plan (in mock mode → mock=true).
//   3. Second pass: cursor advanced, no new content → skipped_reason set.
//   4. Append more genuine content → third pass picks it up again.
//
// CI determinism is guaranteed by ATLAS_FORCE_MOCK_LLM=1.

process.env.ATLAS_FORCE_MOCK_LLM = '1';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const { watchOnce } = await import('../scripts/sima_watch_chats.mjs');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-watch-'));
const proj = path.join(tmp, '-fake-project');
fs.mkdirSync(proj, { recursive: true });
const sessionFile = path.join(proj, 'session-1.jsonl');

function jl(obj) { return JSON.stringify(obj) + '\n'; }

const realConvo = [
  jl({ type: 'user', timestamp: '2026-05-06T10:00:00Z', message: { role: 'user', content: 'Sima, давай добавим блок аутентификации с JWT и refresh-токенами. Нужно чтобы пользователь мог войти через email и пароль, а ещё через Google OAuth.' } }),
  jl({ type: 'assistant', timestamp: '2026-05-06T10:00:05Z', message: { role: 'assistant', content: [{ type: 'text', text: 'Понял. Авторизация через email/password и Google OAuth с JWT и refresh-токенами. Добавляю блок b.auth с зависимостями на b.user и b.api-gateway.' }] } }),
  jl({ type: 'user', timestamp: '2026-05-06T10:01:00Z', message: { role: 'user', content: 'И ещё нам нужен блок уведомлений: email через SendGrid и push через Firebase. KPI — доставка > 99% за минуту.' } }),
];

const noise = [
  jl({ type: 'queue-operation', operation: 'enqueue', content: 'You extract product-block descriptions from a user/AI dialog. Rules: ...' }),
  jl({ type: 'user', message: { role: 'user', content: 'Stop hook feedback: There are uncommitted changes' } }),
  jl({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '{"blocks":[{"id":"b.auth","title":"Auth"}]}' }] } }),
  jl({ type: 'user', message: { role: 'user', content: 'You are writing an end-user tutorial. Output language: russian. # Block: b.todo' } }),
];

fs.writeFileSync(sessionFile, [...realConvo, ...noise].join(''), 'utf8');

// Run 1: should harvest the real convo, ignore noise, produce a plan.
const r1 = await watchOnce({ root: tmp, mode: 'propose', minNewChars: 50 });
assert.ok(r1.files_total >= 1, 'should see synthetic jsonl');
assert.ok(r1.new_turns >= 3, `expected ≥3 conversational turns, got ${r1.new_turns}`);
assert.ok(r1.new_chars >= 100, `expected meaningful new chars, got ${r1.new_chars}`);
assert.equal(r1.skipped_reason, null, `should not skip when there is content (${r1.skipped_reason})`);
assert.ok(r1.plan && r1.plan.id, 'plan must be produced');
assert.ok(r1.plan.mock === true, 'in mock mode plan should be flagged mock');

// Run 2: same file, cursor advanced → nothing new.
const r2 = await watchOnce({ root: tmp, mode: 'propose', minNewChars: 50 });
assert.equal(r2.new_turns, 0, 'second pass should see no new turns');
assert.ok(r2.skipped_reason, 'second pass should record skipped_reason');
assert.equal(r2.plan, null, 'no plan on a no-op pass');

// Run 3: append more conversation → picked up.
fs.appendFileSync(sessionFile, jl({ type: 'user', timestamp: '2026-05-06T11:00:00Z', message: { role: 'user', content: 'А ещё надо блок биллинга — Stripe-подписки, retry для failed charges, и KPI churn < 5% в месяц.' } }), 'utf8');
const r3 = await watchOnce({ root: tmp, mode: 'propose', minNewChars: 50 });
assert.equal(r3.new_turns, 1, `third pass should pick up the appended turn (got ${r3.new_turns})`);
assert.ok(r3.plan && r3.plan.id, 'third pass should produce a plan');

// Run 4: file truncated (rotated) — cursor should reset and re-read.
fs.writeFileSync(sessionFile, realConvo[0], 'utf8');
const r4 = await watchOnce({ root: tmp, mode: 'propose', minNewChars: 50 });
assert.ok(r4.new_turns >= 1, `rotated file should be re-read from 0 (got new_turns=${r4.new_turns}, skipped=${r4.skipped_reason})`);

console.log('sima_watch_chats.selftest: OK (4 passes, mock provider, noise filtered, cursor + rotation handled)');

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

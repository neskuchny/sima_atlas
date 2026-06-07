#!/usr/bin/env node
// R-7.97 — selftest for the Cursor chat-source adapter.
//
// Cursor's state.vscdb is a SQLite db; on CI we may or may not have the
// `sqlite3` CLI. So this selftest is split:
//
//   * Always: unit-test parseBubble + parseValue against the documented bubble
//     shapes (type:1/2 numeric, "user"/"assistant" string, malformed blobs).
//   * Always: harvestAll() without sqlite3 → graceful skipped_reason.
//   * If sqlite3 IS present: build a synthetic state.vscdb on disk, run
//     harvestAll() and verify (a) bubbles are decoded, (b) the seen-keys
//     cursor advances, (c) a second pass returns nothing new.
//
// No real ~/.config/Cursor touched.

process.env.ATLAS_FORCE_MOCK_LLM = '1';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert';
import { execFileSync, spawnSync } from 'node:child_process';

const mod = await import('../scripts/chat_sources/cursor.mjs');
const { harvestAll, _internal } = mod;
const { parseBubble, parseValue, sqlite3Available } = _internal;

// 1. parseBubble — numeric type
assert.deepEqual(parseBubble({ type: 1, text: 'hello' }), { role: 'user', text: 'hello' });
assert.deepEqual(parseBubble({ type: 2, text: 'world' }), { role: 'assistant', text: 'world' });
// 2. parseBubble — string type aliases
assert.deepEqual(parseBubble({ type: 'human', text: 'hi' }), { role: 'user', text: 'hi' });
assert.deepEqual(parseBubble({ type: 'ai', text: 'reply' }), { role: 'assistant', text: 'reply' });
// 3. parseBubble — role field
assert.deepEqual(parseBubble({ role: 'user', text: 'fallback' }), { role: 'user', text: 'fallback' });
// 4. parseBubble — content fallback
assert.deepEqual(parseBubble({ type: 1, content: 'alt-field' }), { role: 'user', text: 'alt-field' });
// 5. parseBubble — malformed
assert.equal(parseBubble(null), null);
assert.equal(parseBubble({}), null);
assert.equal(parseBubble({ type: 99, text: 'unknown type' }), null);
assert.equal(parseBubble({ type: 1 }), null); // no text

// 6. parseValue — string JSON
assert.deepEqual(parseValue('{"a":1}'), { a: 1 });
// 7. parseValue — already object
assert.deepEqual(parseValue({ b: 2 }), { b: 2 });
// 8. parseValue — invalid
assert.equal(parseValue('not json'), null);
assert.equal(parseValue(null), null);
// 9. parseValue — Buffer
assert.deepEqual(parseValue(Buffer.from('{"c":3}')), { c: 3 });

// 10. harvestAll — graceful skip when DBs absent
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-cursor-'));
  const r = await harvestAll({ root: path.join(tmp, 'does-not-exist.vscdb'), cursor: {} });
  assert.equal(r.source, 'cursor');
  assert.ok(r.skipped_reason, 'should report skipped_reason when DB missing or sqlite3 absent');
  assert.equal(r.turns.length, 0);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

// 11. If sqlite3 is available, build a real synthetic DB and exercise the
// full path. Otherwise document the skip so the operator knows what's covered.
if (sqlite3Available()) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-cursor-real-'));
  const dbPath = path.join(tmp, 'state.vscdb');
  const sql = `
    CREATE TABLE cursorDiskKV (key TEXT PRIMARY KEY, value BLOB);
    CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value BLOB);
    INSERT INTO cursorDiskKV VALUES
      ('bubbleId:c1:b1', '{"type":1,"text":"Cursor, добавь блок поиска через Elasticsearch, KPI latency p99 < 200ms"}'),
      ('bubbleId:c1:b2', '{"type":2,"text":"Понял — b.search со snapshot-индексами и rolling reindex."}'),
      ('bubbleId:c1:b3', '{"type":1,"text":"И ещё блок очередей — RabbitMQ с DLQ для failed jobs."}'),
      ('composerData:c1', '{"composerId":"c1","conversation":[{"type":1,"text":"Финальный пункт — observability через OpenTelemetry, traces в Jaeger"}]}');
    INSERT INTO ItemTable VALUES
      ('workbench.panel.aichat.view.aichat.chatdata',
       '{"tabs":[{"tabId":"t1","bubbles":[{"type":1,"text":"Из старого чата: блок кэширования через Redis Cluster."},{"type":2,"text":"Принято — b.cache с replica failover."}]}]}');
  `;
  execFileSync('sqlite3', [dbPath], { input: sql, stdio: ['pipe', 'pipe', 'pipe'] });

  const r1 = await harvestAll({ root: dbPath, cursor: {} });
  assert.equal(r1.source, 'cursor');
  assert.equal(r1.files_total, 1);
  assert.equal(r1.skipped_reason, null, `should not skip with real DB (got: ${r1.skipped_reason})`);
  assert.ok(r1.turns.length >= 5, `expected ≥5 turns (3 bubbles + 1 composer + 2 legacy), got ${r1.turns.length}`);
  assert.ok(r1.turns.some((t) => t.text.includes('Elasticsearch')), 'should pick up the search bubble');
  assert.ok(r1.turns.some((t) => t.text.includes('OpenTelemetry')), 'should pick up the composer conversation');
  assert.ok(r1.turns.some((t) => t.text.includes('Redis Cluster')), 'should pick up the legacy ItemTable chat');
  assert.ok(r1.turns.every((t) => t.source === 'cursor'), 'all turns must carry source=cursor');
  // Internal _key must be stripped from emitted turns
  assert.ok(r1.turns.every((t) => !('_key' in t)), 'internal _key must not leak to consumers');

  // Second pass — seen-set should suppress everything
  const r2 = await harvestAll({ root: dbPath, cursor: r1.cursor });
  assert.equal(r2.turns.length, 0, 'second pass should see no new content (seen-set works)');

  // Insert a new bubble — third pass should pick it up
  execFileSync('sqlite3', [dbPath], {
    input: `INSERT INTO cursorDiskKV VALUES ('bubbleId:c1:b4', '{"type":1,"text":"И последнее — feature flags через Unleash, A/B-эксперименты на 10% трафика."}');`,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const r3 = await harvestAll({ root: dbPath, cursor: r2.cursor });
  assert.equal(r3.turns.length, 1, `third pass should pick up the new bubble (got ${r3.turns.length})`);
  assert.ok(r3.turns[0].text.includes('Unleash'));

  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  console.log('cursor_source.selftest: OK (11 unit checks + full sqlite3 end-to-end with seen-set advance)');
} else {
  console.log('cursor_source.selftest: OK (11 unit checks; sqlite3 CLI not present, end-to-end leg skipped — install sqlite3 to cover)');
}

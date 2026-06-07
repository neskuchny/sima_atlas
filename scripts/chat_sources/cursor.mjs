// R-7.97 (Gap #15) — Cursor chat-source adapter.
//
// Cursor (VS Code fork) keeps chat history in a SQLite db at:
//   Linux:   ~/.config/Cursor/User/globalStorage/state.vscdb
//   macOS:   ~/Library/Application Support/Cursor/User/globalStorage/state.vscdb
//   Windows: %APPDATA%/Cursor/User/globalStorage/state.vscdb
//
// Schema (reverse-engineered, stable across recent versions):
//   - table `cursorDiskKV(key TEXT, value BLOB)` — newer composer chat:
//       key = "composerData:<uuid>"  → JSON { conversation: [{type:1|2,text}] }
//             or { messages: [{role, text}] } in some builds
//       key = "bubbleId:<composerId>:<uuid>"  → JSON { type: 1|2, text }
//             (type 1 = user, type 2 = ai)
//   - table `ItemTable(key, value)` — legacy AI chat panel:
//       key = "workbench.panel.aichat.view.aichat.chatdata"
//             → JSON { tabs: [{ bubbles: [{type:1|2,text}] }] }
//
// Cursor model: we don't have byte offsets. We persist a *Set* of seen-keys
// (bubbleId, composerData id, or "legacy:<tab>:<index>"). Each tick only
// emits turns whose key is NEW. The set is bounded by Cursor's own GC.
//
// Cursor's DB is locked while the app is running. We shell out to the
// `sqlite3` CLI with `-readonly` to avoid lock contention. If `sqlite3` is
// not on PATH, the adapter degrades to skipped with a clear hint — Cursor
// support is opt-in by environment.
//
// Output `cursor` shape:
//   { seen: { [dbPath]: { [key]: 1 } }, version: 1 }

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { isNoise } from './_shared.mjs';

export const SOURCE_ID = 'cursor';

function defaultDbPaths() {
  if (process.env.CURSOR_STATE_DB) return [process.env.CURSOR_STATE_DB];
  const home = os.homedir();
  return [
    path.join(home, '.config', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
    path.join(home, 'Library', 'Application Support', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
    path.join(home, 'AppData', 'Roaming', 'Cursor', 'User', 'globalStorage', 'state.vscdb'),
  ];
}

let _sqlite3Available = null;
function sqlite3Available() {
  if (_sqlite3Available !== null) return _sqlite3Available;
  try {
    const r = spawnSync('sqlite3', ['-version'], { stdio: 'pipe' });
    _sqlite3Available = r.status === 0;
  } catch { _sqlite3Available = false; }
  return _sqlite3Available;
}

// Run a sqlite query on a read-only copy. -readonly + immutable=1 avoids lock
// contention with a running Cursor process. Output is JSON via `.mode json`.
function querySqlite(dbPath, sql) {
  if (!sqlite3Available()) throw new Error('sqlite3 CLI not available');
  const out = execFileSync('sqlite3', [
    `file:${dbPath}?immutable=1&mode=ro`,
    '-readonly',
    '-json',
    sql,
  ], { stdio: 'pipe', maxBuffer: 64 * 1024 * 1024 });
  const text = out.toString('utf8').trim();
  if (!text) return [];
  try { return JSON.parse(text); } catch { return []; }
}

// Parse a single bubble blob. Cursor builds wobble between shapes — be lenient.
//   type 1 / "user" / "human"      → user
//   type 2 / "ai" / "assistant"    → assistant
function parseBubble(blob) {
  if (!blob || typeof blob !== 'object') return null;
  const t = blob.type;
  let role = null;
  if (t === 1 || t === '1' || t === 'user' || t === 'human') role = 'user';
  else if (t === 2 || t === '2' || t === 'ai' || t === 'assistant' || t === 'bot') role = 'assistant';
  else if (blob.role === 'user' || blob.role === 'assistant') role = blob.role;
  if (!role) return null;
  const text = (typeof blob.text === 'string' && blob.text)
    || (typeof blob.content === 'string' && blob.content)
    || '';
  if (!text) return null;
  return { role, text };
}

function parseValue(raw) {
  if (raw == null) return null;
  if (Buffer.isBuffer(raw)) raw = raw.toString('utf8');
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function harvestDb(dbPath, seenSet) {
  const newSeen = { ...seenSet };
  const turns = [];
  let errors = [];

  // Newer schema: cursorDiskKV — composers (full conversations) + bubbles.
  try {
    const rows = querySqlite(dbPath, "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%' OR key LIKE 'bubbleId:%';");
    for (const row of rows) {
      const key = row.key;
      if (seenSet[key]) continue;
      const v = parseValue(row.value);
      if (!v) { newSeen[key] = 1; continue; }
      if (key.startsWith('bubbleId:')) {
        const t = parseBubble(v);
        if (t && !isNoise(t.text)) turns.push({ ...t, timestamp: null, source: SOURCE_ID, _key: key });
      } else if (key.startsWith('composerData:')) {
        // composerData blobs sometimes have a `conversation` array; sometimes
        // they only have metadata and the real text lives in separate
        // bubbleId rows. Both branches are correct.
        const convo = Array.isArray(v.conversation) ? v.conversation
                    : Array.isArray(v.messages) ? v.messages
                    : null;
        if (convo) {
          for (const b of convo) {
            const t = parseBubble(b);
            if (t && !isNoise(t.text)) turns.push({ ...t, timestamp: v.lastUpdatedAt || null, source: SOURCE_ID, _key: key });
          }
        }
      }
      newSeen[key] = 1;
    }
  } catch (e) {
    errors.push({ table: 'cursorDiskKV', error: String(e.message || e) });
  }

  // Legacy schema: ItemTable → workbench.panel.aichat.view.aichat.chatdata
  try {
    const rows = querySqlite(dbPath, "SELECT key, value FROM ItemTable WHERE key='workbench.panel.aichat.view.aichat.chatdata';");
    for (const row of rows) {
      const v = parseValue(row.value);
      if (!v || !Array.isArray(v.tabs)) continue;
      for (let ti = 0; ti < v.tabs.length; ti++) {
        const tab = v.tabs[ti];
        if (!tab || !Array.isArray(tab.bubbles)) continue;
        for (let bi = 0; bi < tab.bubbles.length; bi++) {
          const key = `legacy:${tab.tabId || ti}:${bi}`;
          if (seenSet[key]) continue;
          const t = parseBubble(tab.bubbles[bi]);
          if (t && !isNoise(t.text)) turns.push({ ...t, timestamp: null, source: SOURCE_ID, _key: key });
          newSeen[key] = 1;
        }
      }
    }
  } catch (e) {
    errors.push({ table: 'ItemTable', error: String(e.message || e) });
  }

  return { turns, seen: newSeen, errors };
}

// Exported for the selftest (we can't shell out to sqlite3 in every CI env).
export const _internal = { parseBubble, parseValue, sqlite3Available };

export async function harvestAll({ root, cursor } = {}) {
  const dbs = root ? [root] : defaultDbPaths();
  const seen = (cursor && cursor.seen) || {};
  const out = {
    source: SOURCE_ID,
    sessions_dir: dbs.join(' | '),
    files_total: 0,
    files_with_new: 0,
    turns: [],
    errors: [],
    cursor: { seen: { ...seen }, version: 1 },
    skipped_reason: null,
  };
  if (!sqlite3Available()) {
    out.skipped_reason = 'sqlite3 CLI not on PATH — install sqlite3 to enable Cursor ingestion (apt/brew install sqlite3)';
    return out;
  }
  const existing = dbs.filter((p) => fs.existsSync(p));
  out.files_total = existing.length;
  if (!existing.length) {
    out.skipped_reason = `no Cursor state.vscdb found (looked: ${dbs.join(', ')})`;
    return out;
  }
  for (const dbPath of existing) {
    try {
      const dbSeen = seen[dbPath] || {};
      const { turns, seen: newSeen, errors } = harvestDb(dbPath, dbSeen);
      out.cursor.seen[dbPath] = newSeen;
      if (turns.length) {
        out.files_with_new += 1;
        // Drop the internal _key before exposing turns.
        for (const t of turns) {
          const { _key, ...rest } = t;
          out.turns.push(rest);
        }
      }
      if (errors.length) out.errors.push(...errors.map((e) => ({ db: dbPath, ...e })));
    } catch (e) {
      out.errors.push({ db: dbPath, error: String(e.message || e) });
    }
  }
  return out;
}

// R-7.97 (Gap #15) — Codex CLI chat-source adapter.
//
// OpenAI Codex CLI (@openai/codex) writes session transcripts as JSONL under
// `~/.codex/sessions/<rollout>.jsonl` (newer builds) or `~/.codex/history/`.
// Same byte-offset cursor model as Claude — each line is a JSON message.
//
// Line shapes seen in the wild (we handle all three):
//   1. {type: "message", role: "user"|"assistant", content: [{type:"text", text:"..."}]}
//   2. {role: "user"|"assistant", content: "raw string"}
//   3. {type: "input_text"|"output_text", text: "..."} (older streaming format)
//
// Output `cursor` shape: { byFile: { [absPath]: byteOffset } }

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isNoise, extractTextFromContent } from './_shared.mjs';

export const SOURCE_ID = 'codex';

function defaultDirs() {
  if (process.env.CODEX_SESSIONS_DIR) return [process.env.CODEX_SESSIONS_DIR];
  const home = os.homedir();
  return [
    path.join(home, '.codex', 'sessions'),
    path.join(home, '.codex', 'history'),
  ];
}

function listJsonl(rootDirs) {
  const out = [];
  for (const dir of rootDirs) {
    if (!fs.existsSync(dir)) continue;
    const stack = [dir];
    while (stack.length) {
      const d = stack.pop();
      let entries; try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.isFile() && (e.name.endsWith('.jsonl') || e.name.endsWith('.ndjson'))) out.push(p);
      }
    }
  }
  return out;
}

function harvestSession(filePath, fromOffset) {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  let offset = Math.max(0, fromOffset || 0);
  if (size < offset) offset = 0;
  if (size === offset) return { turns: [], offset };
  const fd = fs.openSync(filePath, 'r');
  try {
    const len = size - offset;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, offset);
    // Byte-space last-newline; UTF-8 \n (0x0A) never appears mid-multibyte.
    // See claude.mjs for the rationale — same fix.
    let lastNlByte = -1;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i] === 0x0A) { lastNlByte = i; break; }
    }
    const consumed = lastNlByte >= 0 ? lastNlByte + 1 : 0;
    if (consumed === 0) return { turns: [], offset };
    const lines = buf.subarray(0, consumed).toString('utf8').split('\n').filter(Boolean);
    const turns = [];
    let streamRole = null;
    let streamChunks = [];
    for (const ln of lines) {
      let o; try { o = JSON.parse(ln); } catch { continue; }
      // Shape 3 (streaming chunk format): {type: "input_text"/"output_text", text}
      if (o.type === 'input_text' || o.type === 'output_text') {
        const r = o.type === 'input_text' ? 'user' : 'assistant';
        if (streamRole && streamRole !== r) {
          const merged = streamChunks.join('').trim();
          if (merged && !isNoise(merged)) {
            turns.push({ role: streamRole, text: merged, timestamp: o.timestamp || null, source: SOURCE_ID });
          }
          streamChunks = [];
        }
        streamRole = r;
        if (typeof o.text === 'string') streamChunks.push(o.text);
        continue;
      }
      // Shapes 1 & 2: explicit role + content.
      const role = o.role || (o.type === 'user' || o.type === 'assistant' ? o.type : null);
      if (role !== 'user' && role !== 'assistant') continue;
      const txt = extractTextFromContent(o.content);
      if (!txt || isNoise(txt)) continue;
      turns.push({ role, text: txt, timestamp: o.timestamp || o.created_at || null, source: SOURCE_ID });
    }
    // Flush any pending stream buffer.
    if (streamRole && streamChunks.length) {
      const merged = streamChunks.join('').trim();
      if (merged && !isNoise(merged)) {
        turns.push({ role: streamRole, text: merged, timestamp: null, source: SOURCE_ID });
      }
    }
    return { turns, offset: offset + consumed };
  } finally {
    fs.closeSync(fd);
  }
}

export async function harvestAll({ root, cursor } = {}) {
  const dirs = root ? [root] : defaultDirs();
  const byFile = (cursor && cursor.byFile) || {};
  const out = {
    source: SOURCE_ID,
    sessions_dir: dirs.join(' | '),
    files_total: 0,
    files_with_new: 0,
    turns: [],
    errors: [],
    cursor: { byFile: { ...byFile } },
    skipped_reason: null,
  };
  const existing = dirs.filter((d) => fs.existsSync(d));
  if (!existing.length) {
    out.skipped_reason = `no codex dirs found (looked: ${dirs.join(', ')})`;
    return out;
  }
  const files = listJsonl(existing);
  out.files_total = files.length;
  for (const f of files) {
    try {
      const prev = byFile[f] || 0;
      const { turns, offset } = harvestSession(f, prev);
      out.cursor.byFile[f] = offset;
      if (turns.length) {
        out.files_with_new += 1;
        out.turns.push(...turns);
      }
    } catch (e) {
      out.errors.push({ file: f, error: String(e.message || e) });
    }
  }
  return out;
}

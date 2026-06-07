// R-7.97 (Gap #15) — Claude Code chat-source adapter.
//
// Reads `~/.claude/projects/<projectDir>/*.jsonl` session files. Per-file
// byte-offset cursor lives in the shared chat_watch_cursor under
// `cursor.byFile`. File rotation/truncation → reset to 0 for that file.
//
// Output `cursor` shape: { byFile: { [absPath]: byteOffset } }

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { isNoise, extractTextFromContent } from './_shared.mjs';

export const SOURCE_ID = 'claude';

function defaultDir() {
  if (process.env.CLAUDE_PROJECTS_DIR) return process.env.CLAUDE_PROJECTS_DIR;
  return path.join(os.homedir(), '.claude', 'projects');
}

function listJsonl(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const out = [];
  for (const project of fs.readdirSync(rootDir)) {
    const projDir = path.join(rootDir, project);
    let st; try { st = fs.statSync(projDir); } catch { continue; }
    if (!st.isDirectory()) continue;
    for (const f of fs.readdirSync(projDir)) {
      if (!f.endsWith('.jsonl')) continue;
      out.push(path.join(projDir, f));
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
    // Find the last newline in BYTE space, not string space. UTF-8 \n is
    // 0x0A and never appears inside a multi-byte sequence, so this is safe;
    // using text.lastIndexOf('\n') on the decoded string mixed up byte
    // offsets with UTF-16 code units and made the cursor under-advance on
    // multi-byte content (Cyrillic, emoji), causing duplicate harvests on
    // the next pass. R-7.97.
    let lastNlByte = -1;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i] === 0x0A) { lastNlByte = i; break; }
    }
    const consumed = lastNlByte >= 0 ? lastNlByte + 1 : 0;
    if (consumed === 0) return { turns: [], offset };
    const usable = buf.subarray(0, consumed).toString('utf8');
    const lines = usable.split('\n').filter(Boolean);
    const turns = [];
    for (const ln of lines) {
      let o; try { o = JSON.parse(ln); } catch { continue; }
      const role = o.message?.role || (o.type === 'user' || o.type === 'assistant' ? o.type : null);
      if (role !== 'user' && role !== 'assistant') continue;
      const txt = extractTextFromContent(o.message?.content);
      if (!txt || isNoise(txt)) continue;
      turns.push({ role, text: txt, timestamp: o.timestamp || null, source: SOURCE_ID });
    }
    return { turns, offset: offset + consumed };
  } finally {
    fs.closeSync(fd);
  }
}

export async function harvestAll({ root, cursor } = {}) {
  const dir = root || defaultDir();
  const byFile = (cursor && cursor.byFile) || {};
  const out = {
    source: SOURCE_ID,
    sessions_dir: dir,
    files_total: 0,
    files_with_new: 0,
    turns: [],
    errors: [],
    cursor: { byFile: { ...byFile } },
    skipped_reason: null,
  };
  if (!fs.existsSync(dir)) {
    out.skipped_reason = `directory not found: ${dir}`;
    return out;
  }
  const files = listJsonl(dir);
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

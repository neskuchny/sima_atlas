#!/usr/bin/env node
// Phase R-3 — chat-session watcher.
//
// Periodically scans Claude Code session jsonl files (~/.claude/projects/*/),
// detects newly-appended human↔assistant turns since the last run, and either:
//   - mode=propose (default) → calls sima_fill_from_chat in dry-run, so a
//     plan lands in atlas/proposals/<ts>__chat_fill.json without touching
//     blocks. The operator opens the «✦ Предложения» panel and decides.
//   - mode=auto              → calls sima_fill_from_chat for-real, applying
//     filled fields and saving the plan. For users who trust the loop.
//
// Cursor offsets live in atlas/run_state/chat_watch_cursor.json so the
// watcher only feeds genuinely-new content; on file rotation/truncation we
// reset to 0 for that file.
//
// CLI:
//   node scripts/sima_watch_chats.mjs --once                # one pass, exit
//   node scripts/sima_watch_chats.mjs --once --mode=auto    # apply now
//   node scripts/sima_watch_chats.mjs --daemon --interval-sec=60
//   node scripts/sima_watch_chats.mjs --once --json
//   node scripts/sima_watch_chats.mjs --once --root=<dir>   # session dir override (tests)
//
// The script is also wrapped as MCP tool sima_watch_chats so an agent
// (Claude Code / Cursor) can trigger a check inside its own session and
// surface the result back to the user.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const CURSOR_PATH = path.join(ROOT, 'atlas', 'run_state', 'chat_watch_cursor.json');
const STATUS_PATH = path.join(ROOT, 'atlas', 'run_state', 'chat_watch_status.json');

// Skip messages that look like Sima's own LLM-extraction prompts or
// Stop-hook feedback — feeding those to sima_fill_from_chat would burn
// tokens on duplicates and produce nonsense plans.
const NOISE_OPENINGS = [
  /^You are\b/i,
  /^You extract\b/i,
  /^Return JSON\b/i,
  /^Reply ONLY\b/i,
  /^Stop hook feedback:/i,
  /^\[~?\/\.claude\/[^\]]+\]:/,
  /^<command-name>/,
  /^<system-reminder>/,
];

function isNoise(text) {
  const head = String(text || '').trim().slice(0, 200);
  if (!head) return true;
  if (head.length < 20) return true;
  for (const re of NOISE_OPENINGS) if (re.test(head)) return true;
  // Pure-JSON assistant tool outputs.
  if (/^[{\[]/.test(head)) {
    const t = head.trim();
    if (t.startsWith('{') && t.endsWith('}')) try { JSON.parse(t); return true; } catch {}
  }
  return false;
}

function defaultSessionsDir() {
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

function readCursor() {
  try { return JSON.parse(fs.readFileSync(CURSOR_PATH, 'utf8')); } catch { return {}; }
}
function writeCursor(map) {
  fs.mkdirSync(path.dirname(CURSOR_PATH), { recursive: true });
  fs.writeFileSync(CURSOR_PATH, JSON.stringify(map, null, 2) + '\n', 'utf8');
}
function writeStatus(obj) {
  fs.mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
  fs.writeFileSync(STATUS_PATH, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function extractTextFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const b of content) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text);
    // Skip tool_use / tool_result / image / thinking — those are not the
    // "what the human and Sima discussed" signal we care about.
  }
  return parts.join('\n').trim();
}

// Read one jsonl file from byte offset `from` to current EOF, returning a
// list of {role, text, timestamp} for non-noise turns plus the new offset.
function harvestSession(filePath, fromOffset) {
  const stat = fs.statSync(filePath);
  const size = stat.size;
  let offset = Math.max(0, fromOffset || 0);
  // File rotated/truncated: reset cursor BEFORE clamping.
  if (size < offset) offset = 0;
  if (size === offset) return { turns: [], offset };
  const fd = fs.openSync(filePath, 'r');
  try {
    const len = size - offset;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, offset);
    const text = buf.toString('utf8');
    // Only consume up to the last newline (the tail may be a partial line
    // still being written); leave the trailing fragment for the next pass.
    const lastNl = text.lastIndexOf('\n');
    const consumed = lastNl >= 0 ? lastNl + 1 : 0;
    if (consumed === 0) return { turns: [], offset };
    const usable = text.slice(0, consumed);
    const lines = usable.split('\n').filter(Boolean);
    const turns = [];
    for (const ln of lines) {
      let o; try { o = JSON.parse(ln); } catch { continue; }
      const role = o.message?.role || (o.type === 'user' || o.type === 'assistant' ? o.type : null);
      if (role !== 'user' && role !== 'assistant') continue;
      const txt = extractTextFromContent(o.message?.content);
      if (!txt || isNoise(txt)) continue;
      turns.push({ role, text: txt, timestamp: o.timestamp || null });
    }
    return { turns, offset: offset + consumed };
  } finally {
    fs.closeSync(fd);
  }
}

function buildTranscript(turns, maxChars) {
  // Keep most recent turns first; build until we hit the budget.
  const ordered = [...turns].sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
  const blocks = ordered.map((t) => `**${t.role}:** ${t.text.trim()}`);
  let joined = blocks.join('\n\n');
  if (joined.length <= maxChars) return joined;
  // Trim oldest first.
  let kept = [];
  let total = 0;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (total + blocks[i].length + 2 > maxChars) break;
    kept.unshift(blocks[i]);
    total += blocks[i].length + 2;
  }
  return kept.join('\n\n');
}

export async function watchOnce({ root, mode = 'propose', minNewChars = 600, maxChars = 16000, jsonOut = false } = {}) {
  const dir = root || defaultSessionsDir();
  const cursor = readCursor();
  const files = listJsonl(dir);
  const summary = {
    mode,
    sessions_dir: dir,
    files_total: files.length,
    files_with_new: 0,
    new_turns: 0,
    new_chars: 0,
    plan: null,
    skipped_reason: null,
    errors: [],
  };
  const allTurns = [];
  const newOffsets = { ...cursor };
  for (const f of files) {
    try {
      const prev = cursor[f] || 0;
      const { turns, offset } = harvestSession(f, prev);
      newOffsets[f] = offset;
      if (turns.length) {
        summary.files_with_new += 1;
        summary.new_turns += turns.length;
        for (const t of turns) {
          summary.new_chars += t.text.length;
          allTurns.push(t);
        }
      }
    } catch (e) {
      summary.errors.push({ file: f, error: String(e.message || e) });
    }
  }
  summary.transcript_chars = 0;
  if (summary.new_chars < minNewChars) {
    summary.skipped_reason = `not enough new content (${summary.new_chars} < ${minNewChars})`;
    // Still advance cursor so we don't keep re-checking the same bytes.
    writeCursor(newOffsets);
    writeStatus({ last_run_at: new Date().toISOString(), ...summary });
    return summary;
  }
  const transcript = buildTranscript(allTurns, maxChars);
  summary.transcript_chars = transcript.length;
  if (transcript.length < 30) {
    summary.skipped_reason = 'transcript too short after filtering';
    writeCursor(newOffsets);
    writeStatus({ last_run_at: new Date().toISOString(), ...summary });
    return summary;
  }
  // Hand off to the existing orchestrator. dryRun=true for propose mode
  // means a plan lands in atlas/proposals/ but blocks are not patched —
  // the operator reviews in «✦ Предложения» before accepting.
  const { simaFillFromChat } = await import('./sima_fill_from_chat.mjs');
  let r;
  try {
    r = await simaFillFromChat({ transcript, dryRun: mode !== 'auto', proposeNew: true });
  } catch (e) {
    summary.errors.push({ stage: 'sima_fill_from_chat', error: String(e.message || e) });
    // Don't advance cursor — the operator can retry next tick.
    writeStatus({ last_run_at: new Date().toISOString(), ...summary });
    return summary;
  }
  summary.plan = r.plan ? {
    id: r.plan.id,
    target_blocks: r.plan.summary?.target_blocks_count ?? null,
    filled_blocks: r.plan.summary?.filled_blocks_count ?? null,
    fields_filled: r.plan.summary?.total_fields_filled ?? null,
    new_proposals: r.plan.summary?.proposed_new_blocks ?? null,
    ambiguities: r.plan.summary?.ambiguities ?? null,
    mock: !!r.mock,
  } : null;
  writeCursor(newOffsets);
  writeStatus({ last_run_at: new Date().toISOString(), ...summary });
  return summary;
}

function fmtSummary(s) {
  if (s.skipped_reason) {
    return `sima_watch_chats: skipped — ${s.skipped_reason} (files=${s.files_total}, new_turns=${s.new_turns})`;
  }
  if (!s.plan) {
    return `sima_watch_chats: no plan produced (errors=${s.errors.length})`;
  }
  const p = s.plan;
  const tag = s.mode === 'auto' ? 'applied' : 'proposed';
  return `sima_watch_chats: ${tag} plan ${p.id} — filled ${p.filled_blocks}/${p.target_blocks} blocks (${p.fields_filled} fields), new=${p.new_proposals}, ambig=${p.ambiguities}${p.mock ? ' (mock)' : ''}`;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const arg = (k, def) => {
    const e = argv.find((a) => a === `--${k}` || a.startsWith(`--${k}=`));
    if (!e) return def;
    if (e.includes('=')) return e.slice(e.indexOf('=') + 1);
    const i = argv.indexOf(e);
    return argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
  };
  const wantJson = argv.includes('--json');
  const daemon = argv.includes('--daemon');
  const once = argv.includes('--once') || !daemon;
  const mode = String(arg('mode', 'propose'));
  const intervalSec = Number(arg('interval-sec', 60));
  const minNewChars = Number(arg('min-new-chars', 600));
  const root = arg('root', undefined) || undefined;

  const tick = async () => {
    try {
      const s = await watchOnce({ root, mode, minNewChars, jsonOut: wantJson });
      if (wantJson) console.log(JSON.stringify(s, null, 2));
      else console.log(fmtSummary(s));
      return s;
    } catch (e) {
      console.error('sima_watch_chats: error —', e.message);
      return { errors: [{ error: String(e.message || e) }] };
    }
  };

  if (once) {
    tick().then((s) => process.exit(s && s.errors && s.errors.length ? 1 : 0));
  } else {
    let stop = false;
    process.on('SIGINT', () => { stop = true; });
    process.on('SIGTERM', () => { stop = true; });
    const loop = async () => {
      while (!stop) {
        await tick();
        await new Promise((r) => setTimeout(r, intervalSec * 1000));
      }
    };
    loop();
  }
}

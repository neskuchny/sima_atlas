#!/usr/bin/env node
// Phase R-3 — chat-session watcher (R-7.97: multi-source).
//
// Periodically harvests new human↔assistant turns from one or more agent
// transcripts and feeds them into sima_fill_from_chat. Sources:
//
//   claude — `~/.claude/projects/<project>/*.jsonl` (Claude Code) — original
//   cursor — `~/.config/Cursor/.../state.vscdb` (or platform equivalent),
//            read via `sqlite3 -readonly`; skipped gracefully if sqlite3 CLI
//            isn't installed
//   codex  — `~/.codex/sessions/*.jsonl` (OpenAI Codex CLI), incl. older
//            streaming `input_text`/`output_text` shape
//
// Output:
//   - mode=propose (default): dry-run plan in atlas/proposals/<ts>__chat_fill.json
//   - mode=auto             : applies fills + saves plan
//
// Cursor state for all sources lives in atlas/run_state/chat_watch_cursor.json
// under per-source keys (`claude`, `cursor`, `codex`). The old single-source
// shape `{ "<filePath>": <offset>, ... }` is auto-migrated to
// `{ claude: { byFile: { "<filePath>": <offset> } } }` on first read so
// existing installs don't lose their bookmarks.
//
// CLI:
//   node scripts/sima_watch_chats.mjs --once                    # all sources
//   node scripts/sima_watch_chats.mjs --once --source claude    # one source
//   node scripts/sima_watch_chats.mjs --once --source claude,codex
//   node scripts/sima_watch_chats.mjs --once --mode=auto
//   node scripts/sima_watch_chats.mjs --daemon --interval-sec=60
//   node scripts/sima_watch_chats.mjs --once --root=<dir>       # source-1 root override (tests)
//   node scripts/sima_watch_chats.mjs --once --json
//
// MCP wrapper sima_watch_chats exposes the same surface to agents.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const CURSOR_PATH = path.join(ROOT, 'atlas', 'run_state', 'chat_watch_cursor.json');
const STATUS_PATH = path.join(ROOT, 'atlas', 'run_state', 'chat_watch_status.json');

const ALL_SOURCES = ['claude', 'cursor', 'codex'];

function readCursor() {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(CURSOR_PATH, 'utf8')); } catch { return {}; }
  // Migration from pre-R-7.97 shape: top-level keys were absolute file paths.
  // If we don't see any per-source key but see what look like file paths,
  // assume the whole map was claude bookmarks.
  if (raw && typeof raw === 'object' && !raw.claude && !raw.cursor && !raw.codex) {
    const looksLikePaths = Object.keys(raw).some((k) => k.startsWith('/') || /^[A-Z]:\\/.test(k));
    if (looksLikePaths) return { claude: { byFile: raw } };
  }
  return raw || {};
}
function writeCursor(map) {
  fs.mkdirSync(path.dirname(CURSOR_PATH), { recursive: true });
  fs.writeFileSync(CURSOR_PATH, JSON.stringify(map, null, 2) + '\n', 'utf8');
}
function writeStatus(obj) {
  fs.mkdirSync(path.dirname(STATUS_PATH), { recursive: true });
  fs.writeFileSync(STATUS_PATH, JSON.stringify(obj, null, 2) + '\n', 'utf8');
}

function buildTranscript(turns, maxChars) {
  // Stable-sort by timestamp; turns without a timestamp keep arrival order.
  const indexed = turns.map((t, i) => ({ ...t, _i: i }));
  indexed.sort((a, b) => {
    const ta = String(a.timestamp || ''); const tb = String(b.timestamp || '');
    if (ta && tb && ta !== tb) return ta.localeCompare(tb);
    if (ta && !tb) return -1;
    if (!ta && tb) return 1;
    return a._i - b._i;
  });
  const blocks = indexed.map((t) => {
    const tag = t.source && t.source !== 'claude' ? ` (${t.source})` : '';
    return `**${t.role}${tag}:** ${t.text.trim()}`;
  });
  const joined = blocks.join('\n\n');
  if (joined.length <= maxChars) return joined;
  let kept = [];
  let total = 0;
  for (let i = blocks.length - 1; i >= 0; i--) {
    if (total + blocks[i].length + 2 > maxChars) break;
    kept.unshift(blocks[i]);
    total += blocks[i].length + 2;
  }
  return kept.join('\n\n');
}

export async function watchOnce({ root, mode = 'propose', minNewChars = 600, maxChars = 16000, sources = ALL_SOURCES } = {}) {
  const sourcesArr = Array.isArray(sources) ? sources : String(sources || '').split(',').map((s) => s.trim()).filter(Boolean);
  const enabled = sourcesArr.length ? sourcesArr : ALL_SOURCES;
  const cursorMap = readCursor();
  const summary = {
    mode,
    sources_enabled: enabled,
    per_source: {},
    files_total: 0,
    files_with_new: 0,
    new_turns: 0,
    new_chars: 0,
    transcript_chars: 0,
    plan: null,
    skipped_reason: null,
    errors: [],
  };
  const allTurns = [];
  const nextCursor = { ...cursorMap };

  for (const src of enabled) {
    if (!ALL_SOURCES.includes(src)) {
      summary.errors.push({ source: src, error: `unknown source (known: ${ALL_SOURCES.join(', ')})` });
      continue;
    }
    let mod;
    try { mod = await import(`./chat_sources/${src}.mjs`); }
    catch (e) { summary.errors.push({ source: src, error: `load failed: ${e.message}` }); continue; }
    let result;
    try {
      result = await mod.harvestAll({ root: enabled.length === 1 ? root : undefined, cursor: cursorMap[src] || {} });
    } catch (e) {
      summary.errors.push({ source: src, error: `harvest failed: ${e.message}` });
      continue;
    }
    nextCursor[src] = result.cursor;
    summary.per_source[src] = {
      sessions_dir: result.sessions_dir,
      files_total: result.files_total,
      files_with_new: result.files_with_new,
      new_turns: result.turns.length,
      skipped_reason: result.skipped_reason || null,
      errors: result.errors,
    };
    summary.files_total += result.files_total;
    summary.files_with_new += result.files_with_new;
    summary.new_turns += result.turns.length;
    for (const t of result.turns) {
      summary.new_chars += t.text.length;
      allTurns.push(t);
    }
    if (result.errors.length) summary.errors.push(...result.errors.map((e) => ({ source: src, ...e })));
  }

  if (summary.new_chars < minNewChars) {
    summary.skipped_reason = `not enough new content (${summary.new_chars} < ${minNewChars})`;
    writeCursor(nextCursor);
    writeStatus({ last_run_at: new Date().toISOString(), ...summary });
    return summary;
  }
  const transcript = buildTranscript(allTurns, maxChars);
  summary.transcript_chars = transcript.length;
  if (transcript.length < 30) {
    summary.skipped_reason = 'transcript too short after filtering';
    writeCursor(nextCursor);
    writeStatus({ last_run_at: new Date().toISOString(), ...summary });
    return summary;
  }
  const { simaFillFromChat } = await import('./sima_fill_from_chat.mjs');
  let r;
  try {
    r = await simaFillFromChat({ transcript, dryRun: mode !== 'auto', proposeNew: true });
  } catch (e) {
    summary.errors.push({ stage: 'sima_fill_from_chat', error: String(e.message || e) });
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
  writeCursor(nextCursor);
  writeStatus({ last_run_at: new Date().toISOString(), ...summary });
  return summary;
}

function fmtSummary(s) {
  const srcSummary = Object.entries(s.per_source || {}).map(([k, v]) => {
    if (v.skipped_reason) return `${k}:skip`;
    return `${k}:${v.new_turns}t`;
  }).join(' ');
  if (s.skipped_reason) {
    return `sima_watch_chats[${srcSummary}]: skipped — ${s.skipped_reason} (files=${s.files_total}, new_turns=${s.new_turns})`;
  }
  if (!s.plan) {
    return `sima_watch_chats[${srcSummary}]: no plan produced (errors=${s.errors.length})`;
  }
  const p = s.plan;
  const tag = s.mode === 'auto' ? 'applied' : 'proposed';
  return `sima_watch_chats[${srcSummary}]: ${tag} plan ${p.id} — filled ${p.filled_blocks}/${p.target_blocks} blocks (${p.fields_filled} fields), new=${p.new_proposals}, ambig=${p.ambiguities}${p.mock ? ' (mock)' : ''}`;
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
  const sourcesArg = arg('source', undefined);
  const sources = sourcesArg ? String(sourcesArg).split(',').map((s) => s.trim()).filter(Boolean) : ALL_SOURCES;

  const tick = async () => {
    try {
      const s = await watchOnce({ root, mode, minNewChars, sources });
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

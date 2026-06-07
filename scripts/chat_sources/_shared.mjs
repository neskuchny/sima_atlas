// R-7.97 (Gap #15) — shared utilities for chat-source adapters.
//
// Each adapter (claude / cursor / codex) exposes a single function
// `harvestAll({ root, cursor })` returning
// `{ turns, cursor, files_total, files_with_new, errors, skipped_reason }`.
// The watcher merges turns from all enabled sources into one transcript.
//
// Noise filter + content extractor are identical across sources because what
// makes a turn "real" doesn't depend on the storage format.

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

export function isNoise(text) {
  const head = String(text || '').trim().slice(0, 200);
  if (!head) return true;
  if (head.length < 20) return true;
  for (const re of NOISE_OPENINGS) if (re.test(head)) return true;
  if (/^[{\[]/.test(head)) {
    const t = head.trim();
    if (t.startsWith('{') && t.endsWith('}')) try { JSON.parse(t); return true; } catch {}
  }
  return false;
}

// Anthropic/Codex content shape: array of typed blocks. Cursor/Codex flat
// strings are handled here too. We only keep human-readable text — tool_use
// / tool_result / images / thinking blocks are signal-noise for ingestion.
export function extractTextFromContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const b of content) {
    if (!b || typeof b !== 'object') continue;
    if (b.type === 'text' && typeof b.text === 'string') parts.push(b.text);
    // codex sometimes uses {type: "input_text", text: "..."}
    if (b.type === 'input_text' && typeof b.text === 'string') parts.push(b.text);
    if (b.type === 'output_text' && typeof b.text === 'string') parts.push(b.text);
  }
  return parts.join('\n').trim();
}

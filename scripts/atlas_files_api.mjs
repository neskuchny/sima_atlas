#!/usr/bin/env node
// Atlas Files API — единый реестр файлов проекта со статусами
// alive / dead / archived. Обязательное требование из ТЗ:
//   «должна быть база рабочий код vs не нужный» (описание.md)
//   «files_registry.md alive | dead | archived + причина» (новое_тз §5)
//
// Storage:
//   atlas/files_registry.json   — machine-readable [{path, status, block, reason, updated_at}]
//   atlas/files_registry.md     — human-readable mirror (auto-generated from JSON)
//
// Public functions:
//   listFiles({ root, block_id, status }) → entries
//   getFile(path, { root }) → entry | null
//   markFile({ root, path, status, block_id, reason }) → updated entry
//   removeFile(path, { root }) → { removed }
//   isAlive(path, { root }) → boolean
//   filterAlive(paths, { root }) → only alive paths (used by build_context_pack)
//
// status:
//   alive    — actively part of the project, agents may read/edit
//   dead     — replaced/broken; agents must NOT read it
//   archived — historical (migrations, removed features); preserved but skipped

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS_DEFAULT = path.join(ROOT, 'atlas');

const STATUSES = new Set(['alive', 'dead', 'archived']);

function jsonPath(root) { return path.join(root || ATLAS_DEFAULT, 'files_registry.json'); }
function mdPath(root)   { return path.join(root || ATLAS_DEFAULT, 'files_registry.md'); }

function readRegistry(root) {
  const p = jsonPath(root);
  if (!fs.existsSync(p)) return [];
  try {
    const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function writeRegistry(entries, root) {
  const p = jsonPath(root);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(entries, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
  // Mirror to markdown for humans / git diff readability.
  const mdLines = [
    '# Files registry',
    '',
    '_Auto-generated from `files_registry.json` by `atlas_files_api`. Edit through UI / MCP — do not hand-edit._',
    '',
    '| path | status | block | reason | updated |',
    '|---|---|---|---|---|',
    ...entries.map((e) => `| \`${e.path}\` | ${e.status} | ${e.block || ''} | ${(e.reason || '').replace(/\|/g, '\\|').slice(0, 80)} | ${(e.updated_at || '').slice(0, 16).replace('T', ' ')} |`),
  ];
  fs.writeFileSync(mdPath(root), mdLines.join('\n') + '\n', 'utf8');
}

function safePath(p) {
  const s = String(p || '').trim();
  if (!s) throw new Error('files: path required');
  if (s.includes('..') || s.startsWith('/')) throw new Error('files: invalid path');
  return s;
}

export function listFiles({ root, block_id, status } = {}) {
  let out = readRegistry(root);
  if (block_id) out = out.filter((e) => e.block === block_id);
  if (status)   out = out.filter((e) => e.status === status);
  return out.sort((a, b) => String(a.path).localeCompare(String(b.path)));
}

export function getFile(p, { root } = {}) {
  const sp = safePath(p);
  return readRegistry(root).find((e) => e.path === sp) || null;
}

export function markFile({ root, path: filePath, status, block_id, reason } = {}) {
  const sp = safePath(filePath);
  if (!STATUSES.has(status)) throw new Error(`files: invalid status "${status}" (allowed: ${[...STATUSES].join(', ')})`);
  const reg = readRegistry(root);
  const now = new Date().toISOString();
  const idx = reg.findIndex((e) => e.path === sp);
  const entry = {
    path: sp,
    status,
    block: block_id ? String(block_id) : (idx >= 0 ? reg[idx].block : null),
    reason: reason ? String(reason).slice(0, 200) : (idx >= 0 ? reg[idx].reason : ''),
    updated_at: now,
  };
  if (idx >= 0) reg[idx] = entry; else reg.push(entry);
  writeRegistry(reg, root);
  return { ok: true, entry };
}

export function removeFile(p, { root } = {}) {
  const sp = safePath(p);
  const reg = readRegistry(root);
  const idx = reg.findIndex((e) => e.path === sp);
  if (idx < 0) return { ok: true, removed: 0 };
  reg.splice(idx, 1);
  writeRegistry(reg, root);
  return { ok: true, removed: 1 };
}

export function isAlive(p, { root } = {}) {
  const e = getFile(p, { root });
  // Default-alive: a file not in the registry is treated as alive (back-compat).
  // Only explicit dead/archived removes it from agent context.
  if (!e) return true;
  return e.status === 'alive';
}

export function filterAlive(paths, { root } = {}) {
  const reg = readRegistry(root);
  const dead = new Set(reg.filter((e) => e.status !== 'alive').map((e) => e.path));
  return (paths || []).filter((p) => !dead.has(String(p)));
}

// Convenience: parse a block's files.md and bulk-register entries (or
// at least surface them so the operator can mark dead). Idempotent.
export function syncFromBlockFilesMd({ root, block_id, files_md_text } = {}) {
  if (!block_id || typeof files_md_text !== 'string') throw new Error('syncFromBlockFilesMd: block_id + text required');
  // Parse lines like: `- atlas/blocks/b.docs/mission.md [alive]`
  const lines = files_md_text.split(/\n/).map((l) => l.trim()).filter((l) => l.startsWith('-'));
  const reg = readRegistry(root);
  const now = new Date().toISOString();
  let added = 0;
  for (const ln of lines) {
    const m = ln.match(/^-\s+([^\s[]+)(?:\s+\[(\w+)\])?/);
    if (!m) continue;
    const sp = m[1];
    const status = STATUSES.has(m[2]) ? m[2] : 'alive';
    if (reg.find((e) => e.path === sp)) continue;
    reg.push({ path: sp, status, block: block_id, reason: 'imported from files.md', updated_at: now });
    added++;
  }
  if (added) writeRegistry(reg, root);
  return { ok: true, added };
}

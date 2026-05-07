#!/usr/bin/env node
// PR-3 (b.operator-profile-learner): personal hard-constraints management.
//
// Two persistent lists, both append-only by default:
//   atlas/operator_profile/dont_use.json
//     [{ value: 'mongo', reason: 'too heavy for MVP', added_at: '...' }]
//   atlas/operator_profile/always_use.json
//     [{ category: 'language', value: 'typescript', reason: '...', added_at: '...' }]
//
// Consumers (already wired in earlier PRs):
//   * scripts/inject_context_pack.mjs (PR-5) — surfaces dont_use in the
//     `## Operator profile` section of agent prompts
//   * scripts/guard_against_drift.mjs (this PR-3) — extends
//     forbidden_substrings with operator-specific bans
//   * Sima (Remix)/proposals_panel.jsx (PR-6) — turns conflicts into
//     `⛔ противоречит профилю` badge
//   * Sima (Remix)/arch_canvas.jsx ProfileHintsSection (PR-6) — renders
//     dont_use list with «🔓 Снять запрет» button
//
// API:
//   import { setDontUse, clearDontUse, listDontUse,
//            setAlwaysUse, clearAlwaysUse, listAlwaysUse } from './manage_dont_use.mjs';
//
//   setDontUse({ value: 'mongo', reason: 'too heavy' })
//   clearDontUse({ value: 'mongo' })
//   listDontUse()  // → [{value, reason, added_at}, ...]
//   setAlwaysUse({ category: 'language', value: 'typescript' })
//   clearAlwaysUse({ category, value })
//   listAlwaysUse()
//
// CLI:
//   node scripts/manage_dont_use.mjs add mongo "too heavy for MVP"
//   node scripts/manage_dont_use.mjs clear mongo
//   node scripts/manage_dont_use.mjs list
//   node scripts/manage_dont_use.mjs always add language typescript
//   node scripts/manage_dont_use.mjs always clear language typescript
//   node scripts/manage_dont_use.mjs always list

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');

function profileDir(atlasRoot) {
  return path.join(atlasRoot || ATLAS, 'operator_profile');
}

function readList(p) {
  if (!fs.existsSync(p)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(j) ? j : (Array.isArray(j.items) ? j.items : []);
  } catch { return []; }
}

function writeList(p, items) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(items, null, 2) + '\n', 'utf8');
}

function normalizeDontUseEntry(entry) {
  // Accept legacy bare-string entries (just "mongo") and normalize to object.
  if (typeof entry === 'string') return { value: entry, reason: '', added_at: null };
  return entry || {};
}

export function listDontUse({ atlas_root } = {}) {
  const p = path.join(profileDir(atlas_root), 'dont_use.json');
  return readList(p).map(normalizeDontUseEntry);
}

export function setDontUse({ atlas_root, value, reason = '' } = {}) {
  if (!value || typeof value !== 'string') throw new Error('setDontUse: value (string) required');
  const p = path.join(profileDir(atlas_root), 'dont_use.json');
  const items = readList(p).map(normalizeDontUseEntry);
  const existing = items.find((it) => it.value === value);
  if (existing) {
    if (reason && existing.reason !== reason) {
      existing.reason = reason;
      existing.updated_at = new Date().toISOString();
    }
    writeList(p, items);
    return { value, reason: existing.reason, status: 'updated' };
  }
  const entry = { value, reason, added_at: new Date().toISOString() };
  items.push(entry);
  writeList(p, items);
  return { ...entry, status: 'added' };
}

export function clearDontUse({ atlas_root, value } = {}) {
  if (!value) throw new Error('clearDontUse: value required');
  const p = path.join(profileDir(atlas_root), 'dont_use.json');
  const items = readList(p).map(normalizeDontUseEntry);
  const idx = items.findIndex((it) => it.value === value);
  if (idx < 0) return { cleared: false, reason: 'not_found' };
  const removed = items.splice(idx, 1)[0];
  writeList(p, items);
  return { cleared: true, removed };
}

export function listAlwaysUse({ atlas_root } = {}) {
  const p = path.join(profileDir(atlas_root), 'always_use.json');
  return readList(p);
}

export function setAlwaysUse({ atlas_root, category, value, reason = '' } = {}) {
  if (!category || !value) throw new Error('setAlwaysUse: category + value required');
  const p = path.join(profileDir(atlas_root), 'always_use.json');
  const items = readList(p);
  const existing = items.find((it) => it.category === category && it.value === value);
  if (existing) {
    if (reason && existing.reason !== reason) {
      existing.reason = reason;
      existing.updated_at = new Date().toISOString();
    }
    writeList(p, items);
    return { category, value, status: 'updated' };
  }
  const entry = { category, value, reason, added_at: new Date().toISOString() };
  items.push(entry);
  writeList(p, items);
  return { ...entry, status: 'added' };
}

export function clearAlwaysUse({ atlas_root, category, value } = {}) {
  if (!category || !value) throw new Error('clearAlwaysUse: category + value required');
  const p = path.join(profileDir(atlas_root), 'always_use.json');
  const items = readList(p);
  const idx = items.findIndex((it) => it.category === category && it.value === value);
  if (idx < 0) return { cleared: false, reason: 'not_found' };
  const removed = items.splice(idx, 1)[0];
  writeList(p, items);
  return { cleared: true, removed };
}

// Convenience: flat list of dont_use values (used by inject_context_pack +
// guard_against_drift). Includes both manual entries from dont_use.json
// AND profile.dont_use (LLM-aggregated) when available.
export function effectiveDontUseValues({ atlas_root } = {}) {
  const root = atlas_root || ATLAS;
  const set = new Set();
  for (const it of listDontUse({ atlas_root: root })) {
    if (it.value) set.add(it.value);
  }
  // Merge with profile.dont_use if the aggregator wrote any
  const profilePath = path.join(profileDir(root), 'profile.json');
  if (fs.existsSync(profilePath)) {
    try {
      const j = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
      if (Array.isArray(j.dont_use)) for (const v of j.dont_use) if (v) set.add(v);
    } catch {}
  }
  return Array.from(set);
}

// ──────────────────────────── CLI ────────────────────────────
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const cmd = argv[0];
  if (!cmd) {
    console.error('Usage:');
    console.error('  node scripts/manage_dont_use.mjs add <value> [reason]');
    console.error('  node scripts/manage_dont_use.mjs clear <value>');
    console.error('  node scripts/manage_dont_use.mjs list [--json]');
    console.error('  node scripts/manage_dont_use.mjs always add <category> <value> [reason]');
    console.error('  node scripts/manage_dont_use.mjs always clear <category> <value>');
    console.error('  node scripts/manage_dont_use.mjs always list [--json]');
    process.exit(1);
  }
  try {
    if (cmd === 'add') {
      const value = argv[1];
      const reason = argv.slice(2).filter((a) => !a.startsWith('--')).join(' ');
      const r = setDontUse({ value, reason });
      console.log(json ? JSON.stringify(r) : `dont_use ${r.status}: ${value}${reason ? ' — ' + reason : ''}`);
    } else if (cmd === 'clear') {
      const r = clearDontUse({ value: argv[1] });
      console.log(json ? JSON.stringify(r) : (r.cleared ? `dont_use cleared: ${argv[1]}` : `dont_use not found: ${argv[1]}`));
      process.exit(r.cleared ? 0 : 2);
    } else if (cmd === 'list') {
      const items = listDontUse();
      console.log(json ? JSON.stringify(items, null, 2)
        : (items.length ? items.map((it) => `- ${it.value}${it.reason ? ' — ' + it.reason : ''}`).join('\n') : '(empty)'));
    } else if (cmd === 'always') {
      const sub = argv[1];
      if (sub === 'add') {
        const r = setAlwaysUse({ category: argv[2], value: argv[3], reason: argv.slice(4).filter((a) => !a.startsWith('--')).join(' ') });
        console.log(json ? JSON.stringify(r) : `always_use ${r.status}: ${argv[2]}=${argv[3]}`);
      } else if (sub === 'clear') {
        const r = clearAlwaysUse({ category: argv[2], value: argv[3] });
        console.log(json ? JSON.stringify(r) : (r.cleared ? `always_use cleared: ${argv[2]}=${argv[3]}` : `always_use not found`));
        process.exit(r.cleared ? 0 : 2);
      } else if (sub === 'list') {
        const items = listAlwaysUse();
        console.log(json ? JSON.stringify(items, null, 2)
          : (items.length ? items.map((it) => `- ${it.category}=${it.value}${it.reason ? ' — ' + it.reason : ''}`).join('\n') : '(empty)'));
      } else { console.error('always sub-command: add | clear | list'); process.exit(1); }
    } else if (cmd === 'effective') {
      console.log(json ? JSON.stringify(effectiveDontUseValues()) : effectiveDontUseValues().join('\n'));
    } else {
      console.error(`unknown command: ${cmd}`);
      process.exit(1);
    }
  } catch (e) { console.error(e.message); process.exit(2); }
}

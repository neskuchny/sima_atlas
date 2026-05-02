#!/usr/bin/env node
// PR4: afterFileEdit hook action.
//
// When the coding agent edits a file, this script:
//   1. Reads the file path from env (CURSOR_FILE_PATH / CURSOR_AFTER_FILE_EDIT_PATH /
//      CURSOR_HOOK_FILE_PATH) or argv[2] (for CLI tests).
//   2. Walks atlas/blocks/<id>/files.md and finds every block that owns this path
//      (alive entries). Files marked [archived] / [dead] are ignored.
//   3. Computes a small `git diff --stat` snippet (best-effort; no failure if git is absent).
//   4. Appends a `cursor_edit pass <relpath> :: <diff-stat>` line to checks.log
//      of every owning block.
//   5. Writes a JSON event into atlas/process_runs/cursor_observations/<UTC>.json
//      so PR5+ UI can show recent agent activity in real time.
//
// If the path matches no block:
//   * If it sits under a "documented but unowned" path (atlas/, scripts/, …) —
//     log a warning trace into b.agent-orchestrator/checks.log.
//   * Otherwise — silently skip; not every file in the repo belongs to a block yet.
//
// CLI usage (for tests):
//   node scripts/observe_file_edit.mjs <file_path>
//
// Exit code: always 0 on observe — we never want a hook to break the session
// because the registry is incomplete.

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');
const BLOCKS = path.join(ATLAS, 'blocks');
const OBS_DIR = path.join(ATLAS, 'process_runs', 'cursor_observations');

function readSafe(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }
function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function getEditedPath() {
  const candidates = [
    process.env.CURSOR_FILE_PATH,
    process.env.CURSOR_AFTER_FILE_EDIT_PATH,
    process.env.CURSOR_HOOK_FILE_PATH,
    process.argv[2],
  ];
  for (const c of candidates) if (c && c.trim()) return c.trim();
  return null;
}

function relToRoot(absOrRel) {
  if (!absOrRel) return null;
  if (path.isAbsolute(absOrRel)) {
    if (absOrRel.startsWith(ROOT)) return path.relative(ROOT, absOrRel);
    return absOrRel; // outside the repo — leave as-is
  }
  return absOrRel;
}

function listFilesMd(blockId) {
  const filesMd = readSafe(path.join(BLOCKS, blockId, 'files.md'));
  return filesMd
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((line) => {
      const m = line.match(/^- (.+?)\s*\[(alive|archived|dead|pending)\]/i);
      if (!m) return null;
      return { path: m[1].trim(), tag: m[2].toLowerCase() };
    })
    .filter(Boolean);
}

function findOwnerBlocks(rel) {
  const owners = [];
  if (!fs.existsSync(BLOCKS)) return owners;
  for (const id of fs.readdirSync(BLOCKS)) {
    const blockDir = path.join(BLOCKS, id);
    if (!fs.statSync(blockDir).isDirectory()) continue;
    const entries = listFilesMd(id);
    for (const e of entries) {
      if (e.tag === 'alive' && e.path === rel) {
        owners.push(id);
        break;
      }
    }
  }
  return owners;
}

function gitDiffStat(rel) {
  try {
    const out = execSync(`git diff --stat -- ${JSON.stringify(rel)}`, {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 4000,
    }).toString().trim();
    return out.split('\n').slice(0, 1).join(' ').replace(/\s+/g, ' ').slice(0, 160);
  } catch {
    return '(git diff unavailable)';
  }
}

const editedRaw = getEditedPath();
if (!editedRaw) {
  // No path passed — nothing to observe. Don't fail the hook.
  process.stdout.write('observe_file_edit: no path supplied; skipping\n');
  process.exit(0);
}

const rel = relToRoot(editedRaw);
const owners = findOwnerBlocks(rel);
const ts = new Date().toISOString();
const stat = gitDiffStat(rel);

ensureDir(OBS_DIR);
const eventPath = path.join(OBS_DIR, `${ts.replace(/[:.]/g, '-')}__${owners.join('+') || 'unowned'}.json`);
fs.writeFileSync(eventPath, JSON.stringify({ at: ts, file: rel, owners, diff_stat: stat }, null, 2) + '\n', 'utf8');

if (owners.length) {
  for (const owner of owners) {
    const log = path.join(BLOCKS, owner, 'checks.log');
    fs.appendFileSync(log, `${ts}\tcursor_edit\tpass\t${rel} :: ${stat}\n`, 'utf8');
  }
  process.stdout.write(`observe_file_edit: ${rel} → ${owners.join(', ')}\n`);
  process.exit(0);
}

// Path under repo but not claimed by any block → audit warning to orchestrator.
const orchLog = path.join(BLOCKS, 'b.agent-orchestrator', 'checks.log');
if (fs.existsSync(path.dirname(orchLog))) {
  fs.appendFileSync(orchLog, `${ts}\tcursor_edit\twarn\tunowned file: ${rel} (consider adding to a block files.md)\n`, 'utf8');
}
process.stdout.write(`observe_file_edit: ${rel} unowned (warned)\n`);
process.exit(0);

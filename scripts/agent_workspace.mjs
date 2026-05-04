#!/usr/bin/env node
// PR-8 (b.agent-orchestrator, Symphony-inspired): per-block sandboxed workspace.
//
// Every agent run gets a deterministic isolated copy of the repo under
// ~/.atlas_workspaces/<block_id>__<UTC>/ instead of mutating the operator's
// working tree directly. Two reasons:
//   1. Multiple blocks can be implemented in parallel (different workspaces
//      = no merge conflicts mid-flight).
//   2. The agent's diff is captured BEFORE it touches the real repo, which
//      lets b.acceptance-verifier-loop run inside the workspace and BLOCK
//      Accept on verdict !== pass (PR-9).
//
// We avoid `git worktree add` (which requires a fully-tracking branch and
// pollutes the source repo's metadata). Instead we use `cp -a` (or
// `Node.cpSync`) for a flat copy + a manifest of original file mtimes for
// the diff comparison.
//
// API:
//   import { createWorkspace, captureDiff, cleanupWorkspace, listWorkspaces,
//            applyDiffProposal } from './agent_workspace.mjs';
//
//   createWorkspace({ block_id, run_id })
//       → { workspace_path, run_id, started_at }
//   captureDiff({ workspace_path })
//       → { changed_files: [...], diff_text, total_lines, write_proposal }
//   cleanupWorkspace({ workspace_path, force? })
//   applyDiffProposal({ proposal_id })  — Operator-driven Accept; copies diff
//                                         from workspace into real repo
//
// CLI:
//   node scripts/agent_workspace.mjs create <block_id>
//   node scripts/agent_workspace.mjs diff <workspace_path>
//   node scripts/agent_workspace.mjs cleanup <workspace_path>
//   node scripts/agent_workspace.mjs list

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');
const WORKSPACES_ROOT = process.env.ATLAS_WORKSPACES_ROOT
  || path.join(os.homedir(), '.atlas_workspaces');
const PROPOSALS = path.join(ATLAS, 'proposals');

// Files / dirs that we DON'T copy into the workspace — they bloat the diff
// and are typically derived. Operators can override via .atlasignore later.
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.cache', '.next', 'tmp', 'tests/llm_mocks',
  // Atlas runtime artefacts that change every run
  'atlas/llm_traces', 'atlas/process_runs', 'atlas/run_state',
  'atlas/operator_profile/history', 'atlas/acceptance_runs',
  'atlas/eval_history',
]);

function shouldSkip(rel) {
  for (const s of SKIP_DIRS) if (rel === s || rel.startsWith(s + '/')) return true;
  return false;
}

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    const absSrc = path.join(src, rel);
    const absDst = path.join(dst, rel);
    const stat = fs.statSync(absSrc);
    if (stat.isDirectory()) {
      if (rel && shouldSkip(rel)) continue;
      fs.mkdirSync(absDst, { recursive: true });
      for (const entry of fs.readdirSync(absSrc)) {
        const next = rel ? path.join(rel, entry) : entry;
        if (shouldSkip(next)) continue;
        stack.push(next);
      }
    } else if (stat.isFile()) {
      fs.mkdirSync(path.dirname(absDst), { recursive: true });
      fs.copyFileSync(absSrc, absDst);
    }
  }
}

export function createWorkspace({ block_id, run_id, source_root } = {}) {
  if (!block_id) throw new Error('createWorkspace: block_id required');
  fs.mkdirSync(WORKSPACES_ROOT, { recursive: true });
  const ts = new Date().toISOString();
  const id = run_id || `${block_id}__${ts.replace(/[:.]/g, '-')}`;
  const workspace_path = path.join(WORKSPACES_ROOT, id);
  if (fs.existsSync(workspace_path)) {
    throw new Error(`createWorkspace: ${workspace_path} already exists`);
  }
  const src = source_root || ROOT;
  copyTree(src, workspace_path);
  // Marker so we know who owns this directory
  fs.writeFileSync(path.join(workspace_path, '.atlas_workspace.json'), JSON.stringify({
    run_id: id, block_id, source_root: src, created_at: ts,
  }, null, 2), 'utf8');
  return { workspace_path, run_id: id, started_at: ts };
}

function hashFile(p) {
  if (!fs.existsSync(p)) return null;
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(p));
  return h.digest('hex').slice(0, 16);
}

function walkFiles(root, rel = '', out = []) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs)) {
    const next = rel ? path.join(rel, entry) : entry;
    if (shouldSkip(next)) continue;
    // Workspace-only marker — never compare it against the source repo
    if (next === '.atlas_workspace.json') continue;
    const stat = fs.statSync(path.join(abs, entry));
    if (stat.isDirectory()) walkFiles(root, next, out);
    else if (stat.isFile()) out.push(next);
  }
  return out;
}

export function captureDiff({ workspace_path, source_root }) {
  if (!workspace_path || !fs.existsSync(workspace_path)) {
    throw new Error(`captureDiff: workspace not found: ${workspace_path}`);
  }
  const src = source_root || ROOT;
  const wsFiles = new Set(walkFiles(workspace_path));
  const srcFiles = new Set(walkFiles(src));
  const all = new Set([...wsFiles, ...srcFiles]);

  const changed = [];
  for (const f of all) {
    const wsHash = hashFile(path.join(workspace_path, f));
    const srcHash = hashFile(path.join(src, f));
    if (wsHash === srcHash) continue;
    let kind;
    if (wsHash && !srcHash) kind = 'added';
    else if (!wsHash && srcHash) kind = 'removed';
    else kind = 'modified';
    changed.push({ path: f, kind });
  }

  // Use git diff --no-index for the textual diff (best human readability)
  let diff_text = '';
  if (changed.length) {
    // Use diff(1) which is more reliably available than git diff --no-index
    // outside a git repo. Still produces unified diff.
    const r = spawnSync('diff', ['-urN',
      '--exclude=.git', '--exclude=node_modules', '--exclude=llm_traces',
      '--exclude=run_state', '--exclude=acceptance_runs', '--exclude=history',
      '--exclude=process_runs', '--exclude=eval_history',
      src, workspace_path,
    ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
    // diff exit codes: 0 = same, 1 = differ, 2 = error. We accept 0 and 1.
    diff_text = (r.stdout || '');
    if ((r.status === 2) && r.stderr) {
      diff_text += `\n# diff error: ${(r.stderr || '').slice(0, 500)}\n`;
    }
  }
  const total_lines = diff_text.split(/\r?\n/).length;
  return { changed_files: changed, diff_text, total_lines };
}

export function writeDiffProposal({ run_id, block_id, workspace_path, diff }) {
  fs.mkdirSync(PROPOSALS, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const id = `${ts}__${block_id}__agent_run_diff`;
  fs.writeFileSync(path.join(PROPOSALS, `${id}.json`), JSON.stringify({
    id, block_id,
    kind: 'agent_run_diff',
    created_at: new Date().toISOString(),
    source: { detector: 'agent_workspace', run_id },
    workspace_path,
    changed_files: diff.changed_files,
    total_lines: diff.total_lines,
    diff_preview: diff.diff_text.slice(0, 4000),
    diff_truncated: diff.diff_text.length > 4000,
    verdict: 'pending',
  }, null, 2) + '\n', 'utf8');
  return id;
}

export function cleanupWorkspace({ workspace_path, force = false } = {}) {
  if (!workspace_path) return { cleaned: false, reason: 'no path' };
  // Safety: only remove paths under WORKSPACES_ROOT
  const abs = path.resolve(workspace_path);
  if (!abs.startsWith(WORKSPACES_ROOT)) {
    return { cleaned: false, reason: 'path outside WORKSPACES_ROOT — refusing to delete' };
  }
  if (!fs.existsSync(abs)) return { cleaned: false, reason: 'not_found' };
  if (!force) {
    const marker = path.join(abs, '.atlas_workspace.json');
    if (!fs.existsSync(marker)) {
      return { cleaned: false, reason: 'missing .atlas_workspace.json marker — refusing to delete' };
    }
  }
  fs.rmSync(abs, { recursive: true, force: true });
  return { cleaned: true, removed: abs };
}

export function listWorkspaces() {
  if (!fs.existsSync(WORKSPACES_ROOT)) return [];
  const out = [];
  for (const f of fs.readdirSync(WORKSPACES_ROOT)) {
    const dir = path.join(WORKSPACES_ROOT, f);
    if (!fs.statSync(dir).isDirectory()) continue;
    const marker = path.join(dir, '.atlas_workspace.json');
    if (!fs.existsSync(marker)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(marker, 'utf8'));
      out.push({ ...j, workspace_path: dir });
    } catch {}
  }
  return out.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (cmd === 'create') {
    const blockId = argv[1];
    if (!blockId) { console.error('Usage: ... create <block_id>'); process.exit(1); }
    const r = createWorkspace({ block_id: blockId });
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === 'diff') {
    const ws = argv[1];
    if (!ws) { console.error('Usage: ... diff <workspace_path>'); process.exit(1); }
    const r = captureDiff({ workspace_path: ws });
    console.log(`changed: ${r.changed_files.length}, diff_lines=${r.total_lines}`);
    if (argv.includes('--full')) console.log(r.diff_text);
  } else if (cmd === 'cleanup') {
    const ws = argv[1];
    const force = argv.includes('--force');
    const r = cleanupWorkspace({ workspace_path: ws, force });
    console.log(JSON.stringify(r, null, 2));
  } else if (cmd === 'list') {
    const items = listWorkspaces();
    if (argv.includes('--json')) console.log(JSON.stringify(items, null, 2));
    else for (const w of items) console.log(`  ${w.run_id}  ${w.workspace_path}`);
  } else {
    console.error('Usage: create|diff|cleanup|list');
    process.exit(1);
  }
}

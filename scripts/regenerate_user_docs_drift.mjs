#!/usr/bin/env node
// PR-4 (b.user-docs-generator): nightly drift-check.
//
// Walks every user-facing block (layer ∈ {user, front} OR explicit
// frontmatter user_facing: true) and:
//   * if no _meta entry yet → calls generateUserDocs to seed
//   * if meta hash matches current sources → skip (no LLM call)
//   * if hash drifted AND meta.locked === true → writes proposal of
//     kind=user_docs_locked so the operator can either unlock+regen or
//     reject the change
//   * if hash drifted AND meta.locked !== true → calls generateUserDocs
//     to refresh
//
// Output:
//   atlas/docs/end-user/_drift_summary.json — { generated_at, checked,
//     refreshed, locked_drift, skipped_unchanged, skipped_no_ui }
// Plus per-block proposals for the locked-drift case.
//
// Exit code 0 always (info-only). PR-7 may turn this into a gate.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateUserDocs } from './generate_user_docs.mjs';
import { introspectBlock } from './introspect_block_ui.mjs';
import crypto from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');
const DOCS_ROOT = path.join(ATLAS, 'docs', 'end-user');
const META_DIR = path.join(DOCS_ROOT, '_meta');
const PROPOSALS = path.join(ATLAS, 'proposals');

const USER_FACING_LAYERS = new Set(['user', 'front']);

function isUserFacing(block) {
  if (block && block.user_facing === true) return true;
  if (block && USER_FACING_LAYERS.has(block.layer)) return true;
  return false;
}

function readUserFacingBlocks() {
  const out = [];
  const main = path.join(ATLAS, 'graph.json');
  if (fs.existsSync(main)) {
    try {
      const j = JSON.parse(fs.readFileSync(main, 'utf8'));
      for (const b of (j.blocks || [])) if (b.id && isUserFacing(b)) out.push({ ...b, _project: null });
    } catch {}
  }
  const projDir = path.join(ATLAS, 'projects');
  if (fs.existsSync(projDir)) {
    for (const proj of fs.readdirSync(projDir)) {
      const g = path.join(projDir, proj, 'graph.json');
      if (!fs.existsSync(g)) continue;
      try {
        const j = JSON.parse(fs.readFileSync(g, 'utf8'));
        for (const b of (j.blocks || [])) if (b.id && isUserFacing(b)) out.push({ ...b, _project: proj });
      } catch {}
    }
  }
  return out;
}

function readMeta(blockId) {
  const p = path.join(META_DIR, `${blockId}.json`);
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return null; }
}

function compactIntrospection(intro) {
  // Mirror generate_user_docs.compactIntrospection so the hash matches
  return {
    buttons: (intro.buttons || []).map((b) => b.label).filter(Boolean).slice(0, 60),
    inputs: (intro.inputs || []).map((i) => ({
      type: i.type, name: i.name, placeholder: i.placeholder, required: !!i.required,
    })).slice(0, 40),
    textareas: (intro.textareas || []).map((t) => ({ name: t.name, placeholder: t.placeholder })).slice(0, 10),
    forms: (intro.forms || []).map((f) => ({ action: f.action, method: f.method })).slice(0, 10),
    routes: (intro.routes || []).map((r) => r.path).slice(0, 30),
    links: (intro.links || []).map((l) => ({ kind: l.kind, target: l.target, label: l.label })).slice(0, 30),
    fetches: (intro.fetches || []).map((f) => ({ method: f.method, url: f.url })).slice(0, 20),
  };
}

function readMission(blockId) {
  const p = path.join(ATLAS, 'blocks', blockId, 'mission.md');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
}

function currentHash(blockId) {
  const mission = readMission(blockId);
  const introspection = compactIntrospection(introspectBlock(blockId, { atlas_root: ATLAS }));
  const h = crypto.createHash('sha256');
  h.update(mission); h.update('\0'); h.update(JSON.stringify(introspection));
  return h.digest('hex').slice(0, 16);
}

function writeLockedProposal(blockId, oldHash, newHash) {
  fs.mkdirSync(PROPOSALS, { recursive: true });
  // Dedup: skip if a pending user_docs_locked proposal for this block AND
  // this newHash already exists.
  const existing = fs.readdirSync(PROPOSALS).find((f) =>
    f.endsWith('__user_docs_locked.json') && f.includes(`__${blockId}__`));
  if (existing) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(PROPOSALS, existing), 'utf8'));
      if (j.verdict === 'pending' && j.new_hash === newHash) return existing;
    } catch {}
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const id = `${ts}__${blockId}__user_docs_locked`;
  fs.writeFileSync(path.join(PROPOSALS, `${id}.json`), JSON.stringify({
    id,
    block_id: blockId,
    kind: 'user_docs_locked',
    created_at: new Date().toISOString(),
    source: { detector: 'regenerate_user_docs_drift' },
    current: { hash: oldHash, locked: true },
    new_hash: newHash,
    retry_prompt_hint: `End-user docs for ${blockId} are locked but JSX/mission changed (hash ${oldHash}→${newHash}). Either: (1) unlock via meta.locked=false and re-run \`node scripts/regenerate_user_docs_drift.mjs\`, or (2) hand-edit the markdown to reflect the change and refresh meta.hash to ${newHash}.`,
    verdict: 'pending',
  }, null, 2) + '\n', 'utf8');
  return id;
}

export async function runDriftCheck({ dry_run = false } = {}) {
  const blocks = readUserFacingBlocks();
  const summary = {
    generated_at: new Date().toISOString(),
    checked: blocks.length,
    refreshed: [],
    locked_drift: [],
    skipped_unchanged: [],
    skipped_no_ui: [],
    seeded: [],
    failed: [],
  };
  for (const b of blocks) {
    const meta = readMeta(b.id);
    let curHash;
    try { curHash = currentHash(b.id); }
    catch (e) { summary.failed.push({ block_id: b.id, error: e.message }); continue; }

    // No meta yet → seed (generate fresh)
    if (!meta) {
      if (dry_run) { summary.seeded.push(b.id); continue; }
      try {
        const r = await generateUserDocs({ block_id: b.id });
        if (r.status === 'written') summary.seeded.push(b.id);
        else if (r.status === 'no_ui') summary.skipped_no_ui.push(b.id);
        else summary.failed.push({ block_id: b.id, status: r.status });
      } catch (e) { summary.failed.push({ block_id: b.id, error: e.message }); }
      continue;
    }

    // Hash matches → skip
    if (meta.hash === curHash) { summary.skipped_unchanged.push(b.id); continue; }

    // Drifted: locked → proposal; unlocked → regen
    if (meta.locked === true) {
      if (!dry_run) {
        const id = writeLockedProposal(b.id, meta.hash, curHash);
        summary.locked_drift.push({ block_id: b.id, proposal: id, old_hash: meta.hash, new_hash: curHash });
      } else {
        summary.locked_drift.push({ block_id: b.id, old_hash: meta.hash, new_hash: curHash });
      }
      continue;
    }

    // Unlocked drift → regen
    if (dry_run) { summary.refreshed.push(b.id); continue; }
    try {
      const r = await generateUserDocs({ block_id: b.id });
      if (r.status === 'written') summary.refreshed.push(b.id);
      else summary.failed.push({ block_id: b.id, status: r.status });
    } catch (e) { summary.failed.push({ block_id: b.id, error: e.message }); }
  }

  if (!dry_run) {
    fs.mkdirSync(DOCS_ROOT, { recursive: true });
    fs.writeFileSync(path.join(DOCS_ROOT, '_drift_summary.json'),
      JSON.stringify(summary, null, 2) + '\n', 'utf8');
  }
  return summary;
}

export function listUserDocs() {
  if (!fs.existsSync(META_DIR)) return [];
  const out = [];
  for (const f of fs.readdirSync(META_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const j = JSON.parse(fs.readFileSync(path.join(META_DIR, f), 'utf8'));
      out.push({
        block_id: j.block_id,
        file: path.join(DOCS_ROOT, `${j.block_id}.md`),
        hash: j.hash,
        locked: !!j.locked,
        generated_at: j.generated_at,
        lang: j.lang,
        source_files: j.source_files || [],
      });
    } catch {}
  }
  return out.sort((a, b) => a.block_id.localeCompare(b.block_id));
}

export function readUserDocs({ block_id }) {
  if (!block_id) throw new Error('readUserDocs: block_id required');
  const md = path.join(DOCS_ROOT, `${block_id}.md`);
  if (!fs.existsSync(md)) return { block_id, status: 'no_doc', file: md };
  return {
    block_id, status: 'ok', file: md,
    markdown: fs.readFileSync(md, 'utf8'),
    meta: readMeta(block_id),
  };
}

export function lockUserDocs({ block_id, locked = true, reason = '' }) {
  if (!block_id) throw new Error('lockUserDocs: block_id required');
  const metaPath = path.join(META_DIR, `${block_id}.json`);
  const meta = readMeta(block_id);
  if (!meta) return { block_id, status: 'no_meta' };
  meta.locked = !!locked;
  if (reason) meta.lock_reason = reason;
  meta.locked_at = new Date().toISOString();
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  return { block_id, status: 'updated', locked: meta.locked };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry-run');
  const json = argv.includes('--json');
  const r = await runDriftCheck({ dry_run: dry });
  if (json) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`regenerate_user_docs_drift: checked=${r.checked} refreshed=${r.refreshed.length} locked_drift=${r.locked_drift.length} skipped_unchanged=${r.skipped_unchanged.length} seeded=${r.seeded.length} failed=${r.failed.length}`);
    for (const f of r.failed) console.warn(` ⚠ ${f.block_id}: ${f.error || f.status}`);
    for (const ld of r.locked_drift) console.warn(` ⚠ ${ld.block_id}: locked but sources drifted (${ld.old_hash}→${ld.new_hash}) — proposal ${ld.proposal || '(dry-run)'}`);
  }
}

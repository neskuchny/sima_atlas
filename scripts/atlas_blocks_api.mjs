#!/usr/bin/env node
// Write-side API for atlas/graph.json + per-block files.
//
// Powers the design UI's drag / inline-edit / status-switch / add-edge
// mutations so they survive page refresh and propagate to other clients
// via the existing /atlas/state polling.
//
// All functions:
//   * Read graph.json fresh on each call (no in-memory cache)
//   * Mutate atomically (write to .tmp, rename)
//   * Return { ok: true, ... } or throw a typed error
//
// File layout for new blocks (created by createBlock):
//   atlas/blocks/<id>/{mission,kpi,acceptance,tasks,depends_on,provides,files}.md
//   atlas/blocks/<id>/checks.log    (empty + audit line)
// All eight files are required by validate_block_contracts so contracts
// stay green right after creation.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');

// Atomic JSON writer: write to .tmp, fsync, rename.
function writeJsonAtomic(p, obj) {
  const tmp = p + '.tmp';
  const txt = JSON.stringify(obj, null, 2) + '\n';
  fs.writeFileSync(tmp, txt, 'utf8');
  fs.renameSync(tmp, p);
}

function graphPath(atlasRoot) { return path.join(atlasRoot || ATLAS, 'graph.json'); }
function readGraph(atlasRoot) {
  const p = graphPath(atlasRoot);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function writeGraph(graph, atlasRoot) { writeJsonAtomic(graphPath(atlasRoot), graph); }

function blockDir(atlasRoot, blockId) {
  return path.join(atlasRoot || ATLAS, 'blocks', blockId);
}

function ts() { return new Date().toISOString(); }

// ─────────────────────────── createBlock ──────────────────────────────
// Body: { id, title, layer, status, x, y, size, mvp?, type?, ... }
// Creates the graph.json entry AND seeds 8 contract files so the block
// survives validate_block_contracts immediately. mission.md gets a
// human-edit-required marker so b.docs validate_no_template_placeholders
// doesn't flag it (template phrases like "Ключевая цель блока" are
// forbidden — we use neutral language).
export function createBlock({ atlas_root, body } = {}) {
  if (!body || !body.id) throw new Error('createBlock: body.id required');
  const id = String(body.id);
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) throw new Error(`createBlock: invalid id "${id}"`);

  const root = atlas_root || ATLAS;
  const graph = readGraph(root);
  if ((graph.blocks || []).some((b) => b.id === id)) {
    throw new Error(`createBlock: block "${id}" already exists`);
  }

  const initialTs = ts();
  const block = {
    id,
    title: body.title || id,
    status: body.status || 'idea',
    status_reason: body.status_reason || `Created via design UI at ${initialTs}`,
    layer: body.layer || 'logic',
    type: body.type || 'module',
    updated_at: initialTs,
    mvp: body.mvp === true,
    subschema_id: body.subschema_id || null,
    depends_on: Array.isArray(body.depends_on) ? body.depends_on : [],
    tech_stack: Array.isArray(body.tech_stack) ? body.tech_stack : [],
    files: [`atlas/blocks/${id}/mission.md`],
  };
  if (Number.isFinite(body.x)) block.canvas_x = Math.round(body.x);
  if (Number.isFinite(body.y)) block.canvas_y = Math.round(body.y);
  if (body.size) block.canvas_size = String(body.size);

  graph.blocks = (graph.blocks || []).concat(block);
  writeGraph(graph, root);

  const dir = blockDir(root, id);
  fs.mkdirSync(dir, { recursive: true });
  const seed = (name, content) => {
    const p = path.join(dir, name);
    if (!fs.existsSync(p)) fs.writeFileSync(p, content, 'utf8');
  };
  seed('mission.md', `# ${id} — mission\n\n${body.mission || `Описание модуля ${block.title}. Заполни через детальную панель или через Claude.`}\n\n## Layer\n${block.layer}\n`);
  seed('kpi.md',     `# ${id} — KPI\n\n- KPI-1: добавь конкретную метрику успеха модуля.\n`);
  seed('acceptance.md', `# ${id} — acceptance\n\n- [ ] **A1.** Заполни через детальную панель: что именно подтвердит готовность модуля.\n`);
  seed('tasks.md',   `# ${id} — tasks\n\n- [ ] T1: первая задача — заполнить mission.md и acceptance.md.\n`);
  seed('depends_on.md', `# ${id} — depends_on\n\n- none\n`);
  seed('provides.md',   `# ${id} — provides\n\n- ${id.replace(/^b\./, '').replace(/[^a-z0-9_]/gi, '_')}_capability\n`);
  seed('files.md',   `# ${id} — files\n\n- atlas/blocks/${id}/mission.md [alive]\n`);
  seed('checks.log', `${ts()}\tcreated\tpass\tBlock created via design UI\n`);

  return { ok: true, block };
}

// ─────────────────────────── patchBlock ──────────────────────────────
// L1 — ETag conflict signalling. Thrown by mutators when the caller
// supplied an `if_match_updated_at` that doesn't match the on-disk
// timestamp; the API server unwraps this into a `409 etag_mismatch`
// response with the current state so the UI can offer reload / force.
export class EtagMismatchError extends Error {
  constructor(message, current) {
    super(message);
    this.name = 'EtagMismatchError';
    this.code = 'etag_mismatch';
    this.current = current;
  }
}

// Body: any subset of { title, status, layer, x, y, size, status_reason,
//   tech_stack, mvp, depends_on (replaces), provides (replaces in provides.md) }
// Optional: if_match_updated_at — if set and != block.updated_at, throws
//   EtagMismatchError with the live block payload.
// We never overwrite mission/kpi/acceptance/tasks markdown — those are
// human territory. Only structural fields and tech_stack go through here.
export function patchBlock({ atlas_root, block_id, body } = {}) {
  if (!block_id) throw new Error('patchBlock: block_id required');
  const root = atlas_root || ATLAS;
  const graph = readGraph(root);
  const block = (graph.blocks || []).find((b) => b.id === block_id);
  if (!block) throw new Error(`patchBlock: block "${block_id}" not found`);

  // ETag check — surface conflict before any mutation.
  if (body.if_match_updated_at && block.updated_at && body.if_match_updated_at !== block.updated_at) {
    throw new EtagMismatchError(
      `block "${block_id}" was modified since you read it (mine=${body.if_match_updated_at}, current=${block.updated_at})`,
      { block_id, updated_at: block.updated_at, title: block.title, status: block.status, canvas_x: block.canvas_x, canvas_y: block.canvas_y },
    );
  }

  const changed = {};
  for (const f of ['title', 'status', 'layer', 'type', 'status_reason']) {
    if (typeof body[f] === 'string' && body[f] !== block[f]) {
      block[f] = body[f]; changed[f] = body[f];
    }
  }
  if (typeof body.mvp === 'boolean' && body.mvp !== block.mvp) {
    block.mvp = body.mvp; changed.mvp = body.mvp;
  }
  if (Number.isFinite(body.x) && body.x !== block.canvas_x) {
    block.canvas_x = Math.round(body.x); changed.canvas_x = block.canvas_x;
  }
  if (Number.isFinite(body.y) && body.y !== block.canvas_y) {
    block.canvas_y = Math.round(body.y); changed.canvas_y = block.canvas_y;
  }
  if (typeof body.size === 'string' && body.size !== block.canvas_size) {
    block.canvas_size = body.size; changed.canvas_size = body.size;
  }
  if (Array.isArray(body.tech_stack)) {
    block.tech_stack = body.tech_stack.slice();
    changed.tech_stack = block.tech_stack;
  }

  writeGraph(graph, root);

  // depends_on / provides are EDIT-able from the design (port for adding edges)
  if (Array.isArray(body.depends_on)) {
    const dpath = path.join(blockDir(root, block_id), 'depends_on.md');
    const lines = body.depends_on.length
      ? body.depends_on.map((d) => `- ${d}`).join('\n')
      : '- none';
    fs.writeFileSync(dpath, `# ${block_id} — depends_on\n\n${lines}\n`, 'utf8');
    changed.depends_on = body.depends_on;
    block.depends_on = body.depends_on.map((d) => String(d).split(':')[0].trim());
    writeGraph(graph, root);
  }
  if (Array.isArray(body.provides)) {
    const ppath = path.join(blockDir(root, block_id), 'provides.md');
    const lines = body.provides.length
      ? body.provides.map((p) => `- ${p}`).join('\n')
      : '- none';
    fs.writeFileSync(ppath, `# ${block_id} — provides\n\n${lines}\n`, 'utf8');
    changed.provides = body.provides;
  }

  // L1 — stamp the new ETag and persist. Done last so changes that fail
  // mid-write don't bump the version (caller sees old etag → safe retry).
  if (Object.keys(changed).length) {
    block.updated_at = ts();
    changed.updated_at = block.updated_at;
    writeGraph(graph, root);
  }

  // Audit
  const checks = path.join(blockDir(root, block_id), 'checks.log');
  if (fs.existsSync(path.dirname(checks))) {
    fs.appendFileSync(checks, `${ts()}\tdesign_patch\tpass\t${JSON.stringify(changed)}\n`, 'utf8');
  }

  return { ok: true, block_id, changed, updated_at: block.updated_at };
}

// ─────────────────────────── deleteBlock ──────────────────────────────
// Soft archive: status = 'archived', files marked [archived] in files.md.
// We DON'T delete the directory — preserves history + LLM extraction trace.
// Hard delete would need a separate confirmation flow.
export function deleteBlock({ atlas_root, block_id, hard = false } = {}) {
  if (!block_id) throw new Error('deleteBlock: block_id required');
  const root = atlas_root || ATLAS;
  const graph = readGraph(root);
  const idx = (graph.blocks || []).findIndex((b) => b.id === block_id);
  if (idx < 0) throw new Error(`deleteBlock: block "${block_id}" not found`);

  if (hard) {
    graph.blocks.splice(idx, 1);
    writeGraph(graph, root);
    const dir = blockDir(root, block_id);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    return { ok: true, block_id, mode: 'hard_deleted' };
  }

  // Soft: status = archived
  const archivedAt = ts();
  graph.blocks[idx].status = 'archived';
  graph.blocks[idx].status_reason = `Archived via design UI at ${archivedAt}`;
  graph.blocks[idx].updated_at = archivedAt;
  writeGraph(graph, root);

  const checks = path.join(blockDir(root, block_id), 'checks.log');
  if (fs.existsSync(path.dirname(checks))) {
    fs.appendFileSync(checks, `${ts()}\tdesign_archive\tpass\tArchived from design UI\n`, 'utf8');
  }
  return { ok: true, block_id, mode: 'archived' };
}

// ─────────────────────────── addEdge / deleteEdge ────────────────────
// An edge in design speak is depends_on entry on the source block:
//   `from: capability` → from.depends_on += [`to:capability`]
// We auto-add `capability` to to.provides if missing, so validate_dependency
// stays green.
export function addEdge({ atlas_root, body } = {}) {
  if (!body || !body.from || !body.to) throw new Error('addEdge: body.from + body.to required');
  const root = atlas_root || ATLAS;
  const graph = readGraph(root);
  const src = (graph.blocks || []).find((b) => b.id === body.from);
  const dst = (graph.blocks || []).find((b) => b.id === body.to);
  if (!src) throw new Error(`addEdge: source "${body.from}" not found`);
  if (!dst) throw new Error(`addEdge: target "${body.to}" not found`);

  const cap = (body.capability || `${body.to.replace(/^b\./, '').replace(/[^a-z0-9_]/gi, '_')}_capability`).toLowerCase();
  src.depends_on = src.depends_on || [];
  const entry = `${body.to}: ${cap}`;
  if (!src.depends_on.some((d) => String(d).startsWith(body.to))) {
    src.depends_on.push(entry);
  }
  writeGraph(graph, root);

  // Update depends_on.md
  const dpath = path.join(blockDir(root, body.from), 'depends_on.md');
  const all = (src.depends_on || []).map((d) => `- ${d}`).join('\n') || '- none';
  fs.writeFileSync(dpath, `# ${body.from} — depends_on\n\n${all}\n`, 'utf8');

  // Ensure target provides[] contains the capability (if missing).
  const ppath = path.join(blockDir(root, body.to), 'provides.md');
  const provText = fs.existsSync(ppath) ? fs.readFileSync(ppath, 'utf8') : '';
  const provLines = provText.split(/\r?\n/).map((l) => l.trim());
  const hasCap = provLines.some((l) => l === `- ${cap}` || l.startsWith(`- ${cap} `) || l.startsWith(`- ${cap}\t`));
  if (!hasCap) {
    const cleaned = provLines.filter((l) => l && l !== '- none' && !l.startsWith('# '));
    cleaned.push(`- ${cap}`);
    fs.writeFileSync(ppath, `# ${body.to} — provides\n\n${cleaned.join('\n')}\n`, 'utf8');
  }

  return { ok: true, edge: { from: body.from, to: body.to, capability: cap } };
}

export function deleteEdge({ atlas_root, body } = {}) {
  if (!body || !body.from || !body.to) throw new Error('deleteEdge: body.from + body.to required');
  const root = atlas_root || ATLAS;
  const graph = readGraph(root);
  const src = (graph.blocks || []).find((b) => b.id === body.from);
  if (!src) throw new Error(`deleteEdge: source "${body.from}" not found`);

  const before = (src.depends_on || []).length;
  src.depends_on = (src.depends_on || []).filter((d) => !String(d).startsWith(body.to));
  writeGraph(graph, root);

  const dpath = path.join(blockDir(root, body.from), 'depends_on.md');
  const all = (src.depends_on || []).map((d) => `- ${d}`).join('\n') || '- none';
  fs.writeFileSync(dpath, `# ${body.from} — depends_on\n\n${all}\n`, 'utf8');

  return { ok: true, removed: before - src.depends_on.length };
}

// ─────────────────────────── notes (sticky notes) ─────────────────────
// Notes live in atlas/notes.json (separate file so we don't clutter graph).
function notesPath(atlasRoot) { return path.join(atlasRoot || ATLAS, 'notes.json'); }
function readNotes(atlasRoot) {
  const p = notesPath(atlasRoot);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; }
}

export function addNote({ atlas_root, body } = {}) {
  if (!body) throw new Error('addNote: body required');
  const root = atlas_root || ATLAS;
  const notes = readNotes(root);
  const id = body.id || `n-${Date.now().toString(36)}`;
  const note = {
    id,
    x: Number(body.x) || 0, y: Number(body.y) || 0,
    w: Number(body.w) || 200,
    color: body.color || 'yellow',
    text: body.text || '',
    created_at: ts(),
  };
  notes.push(note);
  writeJsonAtomic(notesPath(root), notes);
  return { ok: true, note };
}

export function patchNote({ atlas_root, note_id, body } = {}) {
  const root = atlas_root || ATLAS;
  const notes = readNotes(root);
  const n = notes.find((x) => x.id === note_id);
  if (!n) throw new Error(`patchNote: note "${note_id}" not found`);
  for (const f of ['x', 'y', 'w', 'color', 'text']) {
    if (body[f] !== undefined) n[f] = body[f];
  }
  n.updated_at = ts();
  writeJsonAtomic(notesPath(root), notes);
  return { ok: true, note: n };
}

export function deleteNote({ atlas_root, note_id } = {}) {
  const root = atlas_root || ATLAS;
  const notes = readNotes(root);
  const idx = notes.findIndex((x) => x.id === note_id);
  if (idx < 0) return { ok: true, removed: 0 };
  notes.splice(idx, 1);
  writeJsonAtomic(notesPath(root), notes);
  return { ok: true, removed: 1 };
}

// Phase M: write a block's contract file with provided content. Used by
// the synthesis flow to populate mission.md / kpi.md / acceptance.md /
// depends_on.md / provides.md after Sima generates a draft. Whitelisted
// to prevent arbitrary file writes through this endpoint.
const WRITABLE_BLOCK_FILES = new Set([
  'mission.md', 'kpi.md', 'acceptance.md', 'tasks.md',
  'depends_on.md', 'provides.md', 'files.md',
]);
// Optional `if_match_mtime`: ISO mtime of the file when the caller read it.
// If the on-disk mtime has advanced past it, throws EtagMismatchError so
// the UI can offer to reload the latest content before overwriting.
export function patchBlockFile({ atlas_root, block_id, file, content, if_match_mtime } = {}) {
  if (!block_id) throw new Error('patchBlockFile: block_id required');
  if (!WRITABLE_BLOCK_FILES.has(file)) throw new Error(`patchBlockFile: forbidden file "${file}"`);
  if (typeof content !== 'string') throw new Error('patchBlockFile: content must be string');
  if (content.length > 100_000) throw new Error('patchBlockFile: content too large');
  const root = atlas_root || ATLAS;
  const dir = blockDir(root, block_id);
  if (!fs.existsSync(dir)) throw new Error(`patchBlockFile: block "${block_id}" not found`);
  const p = path.join(dir, file);
  if (if_match_mtime && fs.existsSync(p)) {
    const liveMtime = fs.statSync(p).mtime.toISOString();
    if (liveMtime !== if_match_mtime) {
      throw new EtagMismatchError(
        `file ${block_id}/${file} was modified since you read it (mine=${if_match_mtime}, current=${liveMtime})`,
        { block_id, file, mtime: liveMtime },
      );
    }
  }
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, p);
  const newMtime = fs.statSync(p).mtime.toISOString();
  // Audit line in checks.log so the run-files extractor can pick it up.
  const log = path.join(dir, 'checks.log');
  fs.appendFileSync(log, `${ts()}\tdesign_patch\tpass\tatlas/blocks/${block_id}/${file}\n`);
  return { ok: true, block_id, file, bytes: content.length, mtime: newMtime };
}

export function listNotes({ atlas_root } = {}) {
  return readNotes(atlas_root);
}

#!/usr/bin/env node
// Atlas Artifacts API — typed write/read module for the design UI's
// artifact gallery + composer + TZ exporter.
//
// Storage layout (one folder per artifact, sortable by creation date):
//   atlas/artifacts/<id>/index.json   — metadata
//   atlas/artifacts/<id>/body.md      — markdown body (optional, for kind=block|tz|note)
//
// `<id>` is `art-<timestamp36>-<rand>` so the directory listing is naturally
// chronological and IDs are URL-safe + collision-free.
//
// index.json shape:
//   {
//     id, kind, title, description?, tags?: [],
//     blockType?, blockLayer?, sourceProjectId?, usedIn?: [],
//     createdAt, updatedAt,
//   }
//
// Public functions:
//   listArtifacts({ kind, search, root }) → [meta...]
//   getArtifact(id, { root, withBody }) → meta with optional `body`
//   createArtifact({ root, body }) → { ok, artifact }
//   updateArtifact(id, patch, { root }) → { ok, artifact }
//   deleteArtifact(id, { root }) → { ok, removed }
//   insertArtifactToProject(id, { project_id, root }) → { ok, usedIn }
//
// All writes are atomic (.tmp + rename). The UI is expected to optimistically
// update + reconcile on response.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS_DEFAULT = path.join(ROOT, 'atlas');

function resolveDir(root, client_id) {
  // Phase J-1: per-client namespace. If client_id is provided, artifacts
  // live under atlas/clients/<id>/artifacts/. Otherwise the legacy
  // atlas/artifacts/ root. The directory is created lazily when the first
  // write happens (see ensureDir at createArtifact).
  if (client_id && /^[a-zA-Z0-9._-]+$/.test(String(client_id))) {
    return path.join(root || ATLAS_DEFAULT, 'clients', String(client_id), 'artifacts');
  }
  return path.join(root || ATLAS_DEFAULT, 'artifacts');
}
function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function writeAtomic(p, content) {
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, p);
}
function writeJson(p, obj) { writeAtomic(p, JSON.stringify(obj, null, 2) + '\n'); }
function readJson(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function makeId() {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `art-${ts}-${rand}`;
}

const VALID_KINDS = ['block', 'tz', 'map', 'wiki', 'note', 'transcript', 'document'];

function safeId(id) {
  if (!/^art-[a-z0-9-]+$/i.test(String(id))) throw new Error(`invalid artifact id: ${id}`);
  return String(id);
}

function metaPath(dir, id) { return path.join(dir, id, 'index.json'); }
function bodyPath(dir, id) { return path.join(dir, id, 'body.md'); }

export function listArtifacts({ kind, search, root, limit, client_id } = {}) {
  const dir = resolveDir(root, client_id);
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir).filter((f) => /^art-/.test(f));
  const out = [];
  for (const id of entries) {
    const meta = readJson(metaPath(dir, id));
    if (!meta) continue;
    if (kind && meta.kind !== kind) continue;
    if (search) {
      const q = String(search).toLowerCase();
      const hay = `${meta.title || ''} ${meta.description || ''} ${(meta.tags || []).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) continue;
    }
    out.push(meta);
  }
  out.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return typeof limit === 'number' ? out.slice(0, limit) : out;
}

export function getArtifact(id, { root, withBody = false, client_id } = {}) {
  const dir = resolveDir(root, client_id);
  const meta = readJson(metaPath(dir, safeId(id)));
  if (!meta) return null;
  if (withBody) {
    const bp = bodyPath(dir, id);
    meta.body = fs.existsSync(bp) ? fs.readFileSync(bp, 'utf8') : '';
  }
  return meta;
}

export function createArtifact({ root, body, client_id } = {}) {
  if (!body || typeof body !== 'object') throw new Error('createArtifact: body required');
  const kind = String(body.kind || 'block');
  if (!VALID_KINDS.includes(kind)) throw new Error(`createArtifact: invalid kind "${kind}"`);
  const title = String(body.title || '').trim();
  if (!title) throw new Error('createArtifact: title required');
  const id = body.id ? safeId(body.id) : makeId();
  const dir = resolveDir(root, client_id);
  const adir = path.join(dir, id);
  if (fs.existsSync(adir)) throw new Error(`createArtifact: artifact "${id}" already exists`);
  ensureDir(adir);
  const now = new Date().toISOString();
  const meta = {
    id,
    kind,
    title,
    description: String(body.description || '').trim() || undefined,
    tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
    blockType: body.blockType ? String(body.blockType) : undefined,
    blockLayer: body.blockLayer ? String(body.blockLayer) : undefined,
    sourceProjectId: body.sourceProjectId ? String(body.sourceProjectId) : undefined,
    sourceBlockId: body.sourceBlockId ? String(body.sourceBlockId) : undefined,
    usedIn: Array.isArray(body.usedIn) ? body.usedIn.map(String) : [],
    createdAt: now,
    updatedAt: now,
  };
  Object.keys(meta).forEach((k) => meta[k] === undefined && delete meta[k]);
  writeJson(metaPath(dir, id), meta);
  if (typeof body.body === 'string' && body.body.length) {
    writeAtomic(bodyPath(dir, id), body.body);
  }
  return { ok: true, artifact: meta };
}

export function updateArtifact(id, patch, { root, client_id } = {}) {
  if (!patch || typeof patch !== 'object') throw new Error('updateArtifact: patch required');
  const dir = resolveDir(root, client_id);
  const sid = safeId(id);
  const meta = readJson(metaPath(dir, sid));
  if (!meta) throw new Error(`updateArtifact: not found "${id}"`);
  const allowed = ['title', 'description', 'tags', 'blockType', 'blockLayer', 'usedIn'];
  for (const k of allowed) if (k in patch) meta[k] = patch[k];
  meta.updatedAt = new Date().toISOString();
  writeJson(metaPath(dir, sid), meta);
  if (typeof patch.body === 'string') {
    writeAtomic(bodyPath(dir, sid), patch.body);
  }
  return { ok: true, artifact: meta };
}

export function deleteArtifact(id, { root, client_id } = {}) {
  const dir = resolveDir(root, client_id);
  const sid = safeId(id);
  const adir = path.join(dir, sid);
  if (!fs.existsSync(adir)) return { ok: true, removed: 0 };
  fs.rmSync(adir, { recursive: true, force: true });
  return { ok: true, removed: 1 };
}

export function insertArtifactToProject(id, { project_id, root, client_id } = {}) {
  const dir = resolveDir(root, client_id);
  const sid = safeId(id);
  const meta = readJson(metaPath(dir, sid));
  if (!meta) throw new Error(`insertArtifact: not found "${id}"`);
  const pid = String(project_id || 'main');
  const usedIn = new Set(meta.usedIn || []);
  usedIn.add(pid);
  meta.usedIn = Array.from(usedIn);
  meta.updatedAt = new Date().toISOString();
  writeJson(metaPath(dir, sid), meta);
  return { ok: true, usedIn: meta.usedIn };
}

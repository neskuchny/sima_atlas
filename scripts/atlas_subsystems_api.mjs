#!/usr/bin/env node
// Atlas Subsystems API — read/write `atlas/subsystems/<parent_id>.json`.
//
// «Drill into block» in the design UI exposes a parent block's internal
// graph: own modules, edges, lanes, notes, codename, title, subtitle, KPI.
// Until now this state was synthetic (baked into atlas_bootstrap.js for
// demo blocks). With this module, edits persist to disk and survive reload.
//
// Storage shape (atlas/subsystems/<parent_id>.json):
//   {
//     parent_id, codename, title, subtitle,
//     kpi: [{code, label}],
//     modules: [{id, title, tag, layer, status, x, y, size, priority}],
//     edges:   [{from, to, kind, label, biz}],
//     lanes:   [{id, title, y, height}],
//     notes:   [{id, x, y, w, color, text}],
//     updated_at,
//   }
//
// Public functions:
//   listSubsystems({ root }) → [{parent_id, title, codename, modules_count}]
//   getSubsystem(parent_id, { root }) → full json | null
//   saveSubsystem(parent_id, body, { root }) → { ok, subsystem }
//   deleteSubsystem(parent_id, { root }) → { ok, removed }
//   subsystemExists(parent_id, { root }) → boolean
//
// All writes are atomic (.tmp + rename).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS_DEFAULT = path.join(ROOT, 'atlas');

function dir(root) { return path.join(root || ATLAS_DEFAULT, 'subsystems'); }
function pathFor(root, parent_id) { return path.join(dir(root), `${parent_id}.json`); }

function safeParentId(id) {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9._-]+$/.test(id)) {
    throw new Error(`invalid parent_id: ${id}`);
  }
  return id;
}
function writeAtomic(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
}
function readJson(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

export function subsystemExists(parent_id, { root } = {}) {
  return fs.existsSync(pathFor(root, safeParentId(parent_id)));
}

export function getSubsystem(parent_id, { root } = {}) {
  return readJson(pathFor(root, safeParentId(parent_id)));
}

export function listSubsystems({ root } = {}) {
  const d = dir(root);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const r = readJson(path.join(d, f));
      if (!r) return null;
      return {
        parent_id: r.parent_id || f.replace(/\.json$/, ''),
        codename: r.codename || null,
        title: r.title || null,
        modules_count: Array.isArray(r.modules) ? r.modules.length : 0,
        edges_count:   Array.isArray(r.edges)   ? r.edges.length   : 0,
        updated_at: r.updated_at || null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
}

// Saves are full-document — the UI sends the whole subsystem state. This
// keeps the contract simple (no merge logic) and matches how the UI
// already manages local subState.
export function saveSubsystem(parent_id, body, { root } = {}) {
  const pid = safeParentId(parent_id);
  if (!body || typeof body !== 'object') throw new Error('saveSubsystem: body required');
  const fresh = {
    parent_id: pid,
    codename: body.codename ? String(body.codename) : pid.replace(/^b\./, ''),
    title:    body.title    ? String(body.title)    : pid,
    subtitle: body.subtitle ? String(body.subtitle) : '',
    kpi:      Array.isArray(body.kpi)     ? body.kpi.map((k) => ({ code: String(k.code || ''), label: String(k.label || '') })) : [],
    modules:  Array.isArray(body.modules) ? body.modules.map((m) => ({
      id: String(m.id), title: String(m.title || m.id), tag: m.tag ? String(m.tag) : String(m.id).replace(/^b\./, ''),
      layer: m.layer || 'logic', status: m.status || 'todo',
      x: Number(m.x) || 0, y: Number(m.y) || 0,
      size: m.size || 'md', priority: Number(m.priority) || 3,
    })) : [],
    edges:    Array.isArray(body.edges) ? body.edges.map((e) => ({
      from: String(e.from), to: String(e.to),
      kind: e.kind || 'contract', label: e.label ? String(e.label) : '', biz: e.biz ? String(e.biz) : '',
    })) : [],
    lanes:    Array.isArray(body.lanes) ? body.lanes.map((l) => ({
      id: String(l.id), title: String(l.title || ''),
      y: Number(l.y) || 0, height: Number(l.height) || 200,
    })) : [],
    notes:    Array.isArray(body.notes) ? body.notes.map((n) => ({
      id: String(n.id || `n${Date.now()}`),
      x: Number(n.x) || 0, y: Number(n.y) || 0,
      w: Number(n.w) || 200, color: String(n.color || 'yellow'),
      text: String(n.text || ''),
    })) : [],
    updated_at: new Date().toISOString(),
  };
  writeAtomic(pathFor(root, pid), fresh);
  return { ok: true, subsystem: fresh };
}

export function deleteSubsystem(parent_id, { root } = {}) {
  const p = pathFor(root, safeParentId(parent_id));
  if (!fs.existsSync(p)) return { ok: true, removed: 0 };
  fs.unlinkSync(p);
  return { ok: true, removed: 1 };
}

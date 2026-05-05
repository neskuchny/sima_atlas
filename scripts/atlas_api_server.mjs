#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as blocksApi from './atlas_blocks_api.mjs';
import * as artifactsApi from './atlas_artifacts_api.mjs';
import * as runsApi from './atlas_runs_api.mjs';
import * as synthApi from './atlas_synthesis_api.mjs';
import * as subsApi from './atlas_subsystems_api.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');

const port = Number(process.env.ATLAS_API_PORT || 8787);

function runNode(args) {
  return execFileSync('node', args, { stdio: 'pipe' }).toString().trim();
}

// PR-Live: cheap content hash over the files that drive the UI. We do NOT walk
// the whole atlas/ tree (that would include llm_traces and runtime checks.log
// noise that triggers spurious reloads). We hash exactly the artefacts the
// bootstrap generator reads.
function computeAtlasStateHash() {
  const h = crypto.createHash('sha256');
  function add(p) {
    if (!fs.existsSync(p)) return;
    const stat = fs.statSync(p);
    if (stat.isFile()) {
      h.update(p);
      h.update(fs.readFileSync(p));
      return;
    }
    if (stat.isDirectory()) {
      for (const f of fs.readdirSync(p).sort()) add(path.join(p, f));
    }
  }
  // Top-level project files
  for (const f of ['graph.json', 'project.md', 'rules.md', 'tech_stack.md']) add(path.join(ATLAS, f));
  // All blocks under the main atlas
  add(path.join(ATLAS, 'blocks'));
  // User projects
  add(path.join(ATLAS, 'projects'));
  // Pending proposals (for the Proposals UI panel)
  if (fs.existsSync(path.join(ATLAS, 'proposals'))) {
    for (const f of fs.readdirSync(path.join(ATLAS, 'proposals')).sort()) {
      if (f.endsWith('.json')) add(path.join(ATLAS, 'proposals', f));
    }
  }
  return h.digest('hex').slice(0, 16);
}

function json(res, code, body) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    // PR3.5: simple CORS so the UI page (served by python -m http.server)
    // can call accept/reject endpoints from the browser.
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, GET, DELETE, OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
    return res.end();
  }
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { ok: true, service: 'atlas-api' });
  }
  // PR-Live: cheap polling endpoint. UI fetches /atlas/state every few seconds;
  // when `hash` differs from the last value the UI knew, it pulls /atlas/payload
  // (full bootstrap content) and re-renders. Hash-only path keeps the request
  // tiny so polling is essentially free.
  if (req.method === 'GET' && req.url === '/atlas/state') {
    try {
      const hash = computeAtlasStateHash();
      return json(res, 200, { ok: true, hash, at: new Date().toISOString() });
    } catch (e) {
      return json(res, 500, { ok: false, error: String(e) });
    }
  }
  // /api/artifacts — real artifact storage backed by atlas/artifacts/.
  // GET /api/artifacts?kind=&search=&with_body=1[&id=<id>]
  // DELETE /api/artifacts?id=<id>
  // POST /api/artifacts/<id>/insert  body: { project_id }
  // POST /api/artifacts (create)     body: { kind, title, body?, tags?, ... }
  // POST /api/artifacts/<id>          body: { ...patch }
  if (req.method === 'GET' && req.url.startsWith('/api/artifacts')) {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const id = u.searchParams.get('id') || '';
      const client_id = u.searchParams.get('client') || undefined;
      if (id) {
        const a = artifactsApi.getArtifact(id, { withBody: u.searchParams.get('with_body') === '1', client_id });
        if (!a) return json(res, 200, { ok: false, error: 'not_found' });
        return json(res, 200, { ok: true, artifact: a });
      }
      const list = artifactsApi.listArtifacts({
        kind: u.searchParams.get('kind') || undefined,
        search: u.searchParams.get('search') || undefined,
        client_id,
      });
      return json(res, 200, { ok: true, artifacts: list, total: list.length, client: client_id || null });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }
  // /runs/list?block_id=&active=1   /runs/get?run_id=
  // /acceptance/get?block_id=
  if (req.method === 'GET' && req.url.startsWith('/runs/list')) {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const runs = runsApi.listRunsByBlock({
        block_id: u.searchParams.get('block_id') || undefined,
        active_only: u.searchParams.get('active') === '1',
        limit: Number(u.searchParams.get('limit') || 20),
        enriched: u.searchParams.get('enriched') === '1',
      });
      return json(res, 200, { ok: true, runs });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }
  if (req.method === 'GET' && req.url.startsWith('/runs/get')) {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const run = runsApi.getRun(u.searchParams.get('run_id') || '');
      return json(res, 200, run ? { ok: true, run } : { ok: false, error: 'not_found' });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }
  if (req.method === 'GET' && req.url.startsWith('/runs/log')) {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      return json(res, 200, runsApi.readRunLog({
        run_id: u.searchParams.get('run_id') || '',
        since:  Number(u.searchParams.get('since') || 0),
      }));
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }
  if (req.method === 'GET' && req.url.startsWith('/runs/files')) {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const files = runsApi.listRunFiles({ run_id: u.searchParams.get('run_id') || '' });
      return json(res, 200, { ok: true, files });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }

  // /atlas/meta?file=<allowed>     read whitelisted top-level meta files
  // /atlas/user-docs/list          list atlas/docs/end-user/*.md
  // /atlas/user-docs/get?block_id= read a generated user-doc by block id
  // /atlas/blocks/<id>/file?name=  read a file from a block folder
  //                                  (decisions.log / patterns.md / lessons.md / etc.)
  const META_WHITELIST = new Set([
    'project.md', 'rules.md', 'tech_stack.md', 'roadmap.md', 'wiki.html',
    'WIKI.md', 'BACKLOG.md',
  ]);
  if (req.method === 'GET' && req.url.startsWith('/atlas/meta')) {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const file = u.searchParams.get('file') || '';
      if (!META_WHITELIST.has(file)) return json(res, 200, { ok: false, error: 'forbidden' });
      const p = path.join(ATLAS, file);
      if (!fs.existsSync(p)) return json(res, 200, { ok: false, error: 'not_found' });
      const content = fs.readFileSync(p, 'utf8');
      const mime = file.endsWith('.html') ? 'text/html' : 'text/markdown';
      return json(res, 200, { ok: true, file, content, mime, mtime: fs.statSync(p).mtime.toISOString() });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }
  // Phase L-3 — persistent activity log. Append-only JSONL file.
  // GET /atlas/activity-log/tail?limit=200 returns last N entries.
  if (req.method === 'GET' && req.url.startsWith('/atlas/activity-log/tail')) {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const limit = Math.max(1, Math.min(500, Number(u.searchParams.get('limit') || 100)));
      const p = path.join(ATLAS, 'activity_log.jsonl');
      if (!fs.existsSync(p)) return json(res, 200, { ok: true, entries: [] });
      const lines = fs.readFileSync(p, 'utf8').split(/\n/).filter(Boolean);
      const entries = lines.slice(-limit).map((ln) => { try { return JSON.parse(ln); } catch { return null; } }).filter(Boolean);
      return json(res, 200, { ok: true, entries });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }

  // Phase J-3 — list available client namespaces (folders under
  // atlas/clients/). Always include 'main' (default namespace).
  if (req.method === 'GET' && req.url === '/atlas/clients/list') {
    try {
      const dir = path.join(ATLAS, 'clients');
      const clients = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter((f) => fs.statSync(path.join(dir, f)).isDirectory())
        : [];
      return json(res, 200, { ok: true, clients: ['main', ...clients] });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }

  // Phase F-5 — schema templates (atlas/schema_templates/<id>.json)
  if (req.method === 'GET' && req.url === '/atlas/schema-templates/list') {
    try {
      const dir = path.join(ATLAS, 'schema_templates');
      if (!fs.existsSync(dir)) return json(res, 200, { ok: true, templates: [] });
      const templates = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
        try {
          const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          return { id: t.id || f.replace(/\.json$/, ''), title: t.title || f, description: t.description || '', blocks_count: (t.blocks || []).length };
        } catch { return null; }
      }).filter(Boolean);
      return json(res, 200, { ok: true, templates });
    } catch (e) { return json(res, 200, { ok: false, error: String(e.message || e) }); }
  }
  if (req.method === 'GET' && req.url.startsWith('/atlas/schema-templates/get')) {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const id = u.searchParams.get('id') || '';
      if (!/^[a-zA-Z0-9._-]+$/.test(id)) return json(res, 200, { ok: false, error: 'invalid id' });
      const p = path.join(ATLAS, 'schema_templates', `${id}.json`);
      if (!fs.existsSync(p)) return json(res, 200, { ok: false, error: 'not_found' });
      return json(res, 200, { ok: true, template: JSON.parse(fs.readFileSync(p, 'utf8')) });
    } catch (e) { return json(res, 200, { ok: false, error: String(e.message || e) }); }
  }

  // Phase F — subsystem (drill-into-block) persistence
  if (req.method === 'GET' && req.url === '/atlas/subsystems/list') {
    try {
      return json(res, 200, { ok: true, subsystems: subsApi.listSubsystems() });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }
  if (req.method === 'GET' && req.url.startsWith('/atlas/subsystems/get')) {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const pid = u.searchParams.get('block_id') || '';
      const r = subsApi.getSubsystem(pid);
      return json(res, 200, r ? { ok: true, subsystem: r } : { ok: false, error: 'not_found' });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }
  if (req.method === 'DELETE' && req.url.startsWith('/atlas/subsystems/delete')) {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const pid = u.searchParams.get('block_id') || '';
      return json(res, 200, subsApi.deleteSubsystem(pid));
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }

  if (req.method === 'GET' && req.url === '/atlas/proposals/list') {
    try {
      const out = execFileSync('node', ['scripts/list_proposals.mjs', '--json'], { cwd: ROOT, stdio: 'pipe' }).toString();
      const items = JSON.parse(out);
      return json(res, 200, { ok: true, items });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }
  if (req.method === 'GET' && req.url === '/atlas/cursor-hooks/status') {
    try {
      const out = execFileSync('node', ['scripts/validate_cursor_hooks.mjs', '--json'], { cwd: ROOT, stdio: 'pipe' }).toString();
      let parsed = {}; try { parsed = JSON.parse(out); } catch {}
      return json(res, 200, { ok: true, status: parsed });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e), stderr: (e.stderr || '').toString().slice(0, 500) });
    }
  }
  if (req.method === 'GET' && req.url === '/atlas/user-docs/list') {
    try {
      const dir = path.join(ATLAS, 'docs', 'end-user');
      if (!fs.existsSync(dir)) return json(res, 200, { ok: true, docs: [] });
      const docs = fs.readdirSync(dir)
        .filter((f) => f.endsWith('.md'))
        .map((f) => {
          const block_id = f.replace(/\.md$/, '');
          const stat = fs.statSync(path.join(dir, f));
          return { block_id, mtime: stat.mtime.toISOString(), bytes: stat.size };
        })
        .sort((a, b) => b.mtime.localeCompare(a.mtime));
      return json(res, 200, { ok: true, docs });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }
  if (req.method === 'GET' && req.url.startsWith('/atlas/user-docs/get')) {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const block_id = u.searchParams.get('block_id') || '';
      if (!/^[a-zA-Z0-9._-]+$/.test(block_id)) return json(res, 200, { ok: false, error: 'invalid block_id' });
      const p = path.join(ATLAS, 'docs', 'end-user', `${block_id}.md`);
      if (!fs.existsSync(p)) return json(res, 200, { ok: false, error: 'not_found' });
      return json(res, 200, { ok: true, block_id, content: fs.readFileSync(p, 'utf8'), mtime: fs.statSync(p).mtime.toISOString() });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }
  // Read a single file from a block folder. Whitelist of trace files only —
  // never serves arbitrary files even from inside the block dir.
  const BLOCK_FILE_WHITELIST = new Set([
    'mission.md', 'kpi.md', 'acceptance.md', 'tasks.md', 'depends_on.md',
    'provides.md', 'files.md', 'checks.log', 'decisions.log', 'patterns.md',
    'lessons.md',
  ]);
  {
    const m = req.method === 'GET' && req.url.match(/^\/atlas\/blocks\/([a-zA-Z0-9._-]+)\/file\?(.*)$/);
    if (m) {
      try {
        const block_id = m[1];
        const u = new URLSearchParams(m[2]);
        const name = u.get('name') || '';
        if (!BLOCK_FILE_WHITELIST.has(name)) return json(res, 200, { ok: false, error: 'forbidden' });
        const p = path.join(ATLAS, 'blocks', block_id, name);
        if (!fs.existsSync(p)) return json(res, 200, { ok: false, error: 'not_found' });
        return json(res, 200, { ok: true, block_id, name, content: fs.readFileSync(p, 'utf8'), mtime: fs.statSync(p).mtime.toISOString() });
      } catch (e) {
        return json(res, 200, { ok: false, error: String(e.message || e) });
      }
    }
  }
  if (req.method === 'GET' && req.url.startsWith('/acceptance/get')) {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const r = runsApi.getLatestAcceptance({ block_id: u.searchParams.get('block_id') || '' });
      return json(res, 200, r ? { ok: true, ...r } : { ok: false, error: 'not_found' });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }
  if (req.method === 'GET' && req.url.startsWith('/acceptance/diff')) {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const r = runsApi.getAcceptanceDiff({ block_id: u.searchParams.get('block_id') || '' });
      return json(res, 200, r ? { ok: true, ...r } : { ok: false, error: 'not_found' });
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }

  if (req.method === 'DELETE' && req.url.startsWith('/api/artifacts')) {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const id = u.searchParams.get('id') || '';
      const client_id = u.searchParams.get('client') || undefined;
      if (!id) return json(res, 200, { ok: false, error: 'id required' });
      return json(res, 200, artifactsApi.deleteArtifact(id, { client_id }));
    } catch (e) {
      return json(res, 200, { ok: false, error: String(e.message || e) });
    }
  }

  // PR — SIMA Atlas Design integration (sima_atlas_design folder).
  // /atlas/design-payload[?client=<id>] returns SIMA_DATA-shaped JSON
  // adapted from atlas/graph.json. Per-client multi-tenancy: ?client=acme
  // reads from atlas/clients/acme/ if it exists, else falls back to the
  // main atlas/. Kept hot — regenerated on each request so edits in the
  // graph show up immediately.
  if (req.method === 'GET' && req.url.startsWith('/atlas/design-payload')) {
    try {
      const u = new URL(req.url, `http://localhost:${port}`);
      const client = u.searchParams.get('client') || '';
      const args = ['scripts/build_sima_design_payload.mjs', '--stdout'];
      if (client) args.push('--client', client);
      const out = execFileSync('node', args, { cwd: ROOT }).toString();
      const data = JSON.parse(out);
      return json(res, 200, { ok: true, data });
    } catch (e) {
      return json(res, 500, { ok: false, error: String(e.message || e), stderr: (e.stderr || '').toString().slice(0, 500) });
    }
  }
  if (req.method === 'GET' && req.url === '/atlas/payload') {
    try {
      // Re-run the bootstrap generator on demand so /atlas/payload always
      // reflects on-disk truth (including newly created blocks / subschemas).
      runNode(['scripts/generate_atlas_bootstrap_js.mjs']);
      const bootstrapPath = path.join(ROOT, 'Sima (Remix)', 'atlas_bootstrap.js');
      const src = fs.readFileSync(bootstrapPath, 'utf8');
      const m = src.match(/window\.SIMA_BOOTSTRAP\s*=\s*(\{[\s\S]*?\});\s*\n\n\/\/ Inject/);
      if (!m) return json(res, 500, { ok: false, error: 'bootstrap payload not parseable' });
      const payload = JSON.parse(m[1]);
      const hash = computeAtlasStateHash();
      return json(res, 200, { ok: true, hash, payload });
    } catch (e) {
      return json(res, 500, { ok: false, error: String(e) });
    }
  }
  if (req.method !== 'POST') return json(res, 404, { ok: false, error: 'not found' });

  let raw = '';
  req.on('data', d => raw += d);
  req.on('end', () => {
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return json(res, 400, { ok: false, error: 'invalid json' }); }
    try {
      if (req.url === '/finalize') {
        const blockId = String(body.block_id || 'b.docs');
        const transcriptPath = String(body.transcript_path || '');
        const out = runNode(['scripts/finalize_cursor_iteration.mjs', blockId, transcriptPath]);
        return json(res, 200, { ok: true, out });
      }
      if (req.url === '/run-process') {
        const blockId = String(body.block_id || 'b.docs');
        const process = String(body.process || 'sync_audit_context');
        const out = runNode(['scripts/run_block_process.mjs', blockId, process]);
        return json(res, 200, { ok: true, out });
      }
      if (req.url === '/generate-docs') {
        const wiki = runNode(['scripts/generate_wiki.mjs']);
        const tz = runNode(['scripts/generate_tz_from_atlas.mjs']);
        return json(res, 200, { ok: true, wiki, tz });
      }
      if (req.url === '/ingest-chat-batches') {
        const transcriptPath = String(body.transcript_path || '');
        const blockId = String(body.block_id || 'b.docs');
        const batch = String(body.batch_size || 6);
        if (!transcriptPath) return json(res, 400, { ok: false, error: 'transcript_path required' });
        const out = runNode(['scripts/ingest_chat_batches.mjs', transcriptPath, blockId, batch]);
        return json(res, 200, { ok: true, out });
      }
      // PR3.5: proposals Accept/Reject UI flow
      if (req.url === '/proposals/accept') {
        const pid = String(body.proposal_id || '');
        if (!pid) return json(res, 400, { ok: false, error: 'proposal_id required' });
        const out = runNode(['scripts/accept_proposal.mjs', pid]);
        runNode(['scripts/list_proposals.mjs', '--write-index', '--json']);
        return json(res, 200, { ok: true, out });
      }
      if (req.url === '/proposals/reject') {
        const pid = String(body.proposal_id || '');
        if (!pid) return json(res, 400, { ok: false, error: 'proposal_id required' });
        const reason = String(body.reason || '');
        const out = runNode(['scripts/reject_proposal.mjs', pid, reason]);
        runNode(['scripts/list_proposals.mjs', '--write-index', '--json']);
        return json(res, 200, { ok: true, out });
      }
      if (req.url === '/proposals/refresh') {
        const out = runNode(['scripts/list_proposals.mjs', '--write-index', '--json']);
        return json(res, 200, { ok: true, out });
      }
      // PR-3 (b.operator-profile-learner): UI-friendly mutation endpoints
      // matching the Inspector ProfileHintsSection buttons.
      if (req.url === '/profile/forget') {
        const kind = String(body.kind || '');
        if (kind === 'dont_use') {
          const items = Array.isArray(body.items) ? body.items : (body.value ? [body.value] : []);
          if (!items.length) return json(res, 400, { ok: false, error: 'items or value required' });
          const cleared = [];
          for (const v of items) {
            try {
              const out = execFileSync('node', ['scripts/manage_dont_use.mjs', 'clear', String(v), '--json'], { cwd: ROOT, stdio: 'pipe' }).toString().trim();
              cleared.push({ value: v, result: out });
            } catch {
              cleared.push({ value: v, result: 'not_found' });
            }
          }
          return json(res, 200, { ok: true, kind, cleared });
        }
        if (kind === 'pattern') {
          // tech_stack_history is derived; "forget" is a UI hint for next
          // recompute. We log it but don't mutate state.
          const note = `forget_pattern: scope=${body.scope} items=${(body.items || []).join(',')}`;
          return json(res, 200, { ok: true, kind, note });
        }
        return json(res, 400, { ok: false, error: 'unknown kind: ' + kind });
      }
      if (req.url === '/lessons/revoke') {
        const lid = String(body.lesson_id || '');
        if (!lid) return json(res, 400, { ok: false, error: 'lesson_id required' });
        try {
          const out = execFileSync('node', ['scripts/analyze_lessons_from_history.mjs', 'revoke', lid], { cwd: ROOT, stdio: 'pipe' }).toString().trim();
          return json(res, 200, { ok: true, out });
        } catch (e) {
          return json(res, 200, { ok: false, error: 'not_found', stderr: (e.stderr || '').toString().slice(0, 500) });
        }
      }
      // PR-4 (b.user-docs-generator): UI buttons for end-user tutorial
      // management (Inspector + ProposalsPanel)
      if (req.url === '/user-docs/regenerate') {
        const bid = String(body.block_id || '');
        if (!bid) return json(res, 400, { ok: false, error: 'block_id required' });
        try {
          const out = execFileSync('node', ['scripts/generate_user_docs.mjs', bid, '--json'], { cwd: ROOT, stdio: 'pipe' }).toString().trim();
          return json(res, 200, { ok: true, out });
        } catch (e) {
          return json(res, 200, { ok: false, error: String(e.message || e), stderr: (e.stderr || '').toString().slice(0, 500) });
        }
      }
      if (req.url === '/user-docs/lock') {
        const bid = String(body.block_id || '');
        const locked = body.locked === false ? false : true;
        if (!bid) return json(res, 400, { ok: false, error: 'block_id required' });
        try {
          const code = `import('./scripts/regenerate_user_docs_drift.mjs').then(m=>console.log(JSON.stringify(m.lockUserDocs({block_id:${JSON.stringify(bid)},locked:${locked}}),null,2)))`;
          const out = execFileSync('node', ['-e', code], { cwd: ROOT, stdio: 'pipe' }).toString().trim();
          return json(res, 200, { ok: true, out });
        } catch (e) {
          return json(res, 200, { ok: false, error: String(e.message || e) });
        }
      }
      if (req.url === '/user-docs/unlock-and-regen') {
        const bid = String(body.block_id || '');
        if (!bid) return json(res, 400, { ok: false, error: 'block_id required' });
        try {
          const code = `import('./scripts/regenerate_user_docs_drift.mjs').then(m=>m.lockUserDocs({block_id:${JSON.stringify(bid)},locked:false}))`;
          execFileSync('node', ['-e', code], { cwd: ROOT, stdio: 'pipe' });
          const out = execFileSync('node', ['scripts/generate_user_docs.mjs', bid, '--json'], { cwd: ROOT, stdio: 'pipe' }).toString().trim();
          return json(res, 200, { ok: true, out });
        } catch (e) {
          return json(res, 200, { ok: false, error: String(e.message || e) });
        }
      }
      // PR-7 (b.agent-orchestrator): UI-friendly run-state mutations.
      if (req.url === '/runs/cancel') {
        const rid = String(body.run_id || '');
        if (!rid) return json(res, 400, { ok: false, error: 'run_id required' });
        const reason = String(body.reason || '');
        try {
          const out = execFileSync('node', ['scripts/run_state.mjs', 'cancel', rid, reason], { cwd: ROOT, stdio: 'pipe' }).toString().trim();
          return json(res, 200, { ok: true, out });
        } catch (e) {
          return json(res, 200, { ok: false, error: String(e.message || e) });
        }
      }
      if (req.url === '/dont-use/add') {
        const value = String(body.value || '');
        const reason = String(body.reason || '');
        if (!value) return json(res, 400, { ok: false, error: 'value required' });
        const args = ['scripts/manage_dont_use.mjs', 'add', value];
        if (reason) args.push(reason);
        args.push('--json');
        const out = execFileSync('node', args, { cwd: ROOT, stdio: 'pipe' }).toString().trim();
        return json(res, 200, { ok: true, out });
      }
      // PR — design UI write API. Routes delegate to atlas_blocks_api.mjs.
      // Errors come back as 200 {ok:false, error} so the UI shows them
      // inline (rather than CORS-mangled 4xx).
      const tryFn = (fn) => {
        try { return json(res, 200, fn()); }
        catch (e) { return json(res, 200, { ok: false, error: String(e.message || e) }); }
      };
      if (req.url === '/atlas/blocks/create') return tryFn(() => blocksApi.createBlock({ body }));
      if (req.url === '/atlas/blocks/patch') {
        const id = String(body.block_id || body.id || '');
        if (!id) return json(res, 400, { ok: false, error: 'block_id required' });
        return tryFn(() => blocksApi.patchBlock({ block_id: id, body }));
      }
      if (req.url === '/atlas/blocks/delete') {
        const id = String(body.block_id || body.id || '');
        if (!id) return json(res, 400, { ok: false, error: 'block_id required' });
        return tryFn(() => blocksApi.deleteBlock({ block_id: id, hard: !!body.hard }));
      }
      if (req.url === '/atlas/edges/add')    return tryFn(() => blocksApi.addEdge({ body }));
      if (req.url === '/atlas/edges/delete') return tryFn(() => blocksApi.deleteEdge({ body }));
      if (req.url === '/atlas/notes/add')    return tryFn(() => blocksApi.addNote({ body }));
      if (req.url === '/atlas/notes/patch') {
        const id = String(body.note_id || body.id || '');
        if (!id) return json(res, 400, { ok: false, error: 'note_id required' });
        return tryFn(() => blocksApi.patchNote({ note_id: id, body }));
      }
      if (req.url === '/atlas/notes/delete') {
        const id = String(body.note_id || body.id || '');
        if (!id) return json(res, 400, { ok: false, error: 'note_id required' });
        return tryFn(() => blocksApi.deleteNote({ note_id: id }));
      }

      // /api/artifacts POST routes (create, patch, insert).
      // client_id is taken from body._client (data_loader's withClient
      // helper attaches it on every mutating call).
      const artClient = body._client ? String(body._client) : undefined;
      if (req.url === '/api/artifacts') {
        return tryFn(() => artifactsApi.createArtifact({ body, client_id: artClient }));
      }
      const artInsertM = req.url.match(/^\/api\/artifacts\/(art-[a-z0-9-]+)\/insert$/i);
      if (artInsertM) {
        return tryFn(() => artifactsApi.insertArtifactToProject(artInsertM[1], { project_id: body.project_id || body.projectId || 'main', client_id: artClient }));
      }
      const artPatchM = req.url.match(/^\/api\/artifacts\/(art-[a-z0-9-]+)$/i);
      if (artPatchM) {
        return tryFn(() => artifactsApi.updateArtifact(artPatchM[1], body, { client_id: artClient }));
      }

      // /atlas/meta/save — write a whitelisted top-level meta file.
      if (req.url === '/atlas/meta/save') {
        const META_W = new Set(['project.md', 'rules.md', 'tech_stack.md']);
        const file = String(body.file || '');
        if (!META_W.has(file)) return json(res, 200, { ok: false, error: 'forbidden' });
        const content = String(body.content ?? '');
        if (content.length > 500_000) return json(res, 200, { ok: false, error: 'too large' });
        try {
          const p = path.join(ATLAS, file);
          const tmp = p + '.tmp';
          fs.writeFileSync(tmp, content);
          fs.renameSync(tmp, p);
          return json(res, 200, { ok: true, file, bytes: content.length, mtime: fs.statSync(p).mtime.toISOString() });
        } catch (e) {
          return json(res, 200, { ok: false, error: String(e.message || e) });
        }
      }

      // /atlas/schema-templates/snapshot — capture the CURRENT graph
      // (or current ?client= namespace) as a reusable template.
      // Body: {template_id, title?, description?, client?}
      // Reads atlas/[clients/<c>/]graph.json + per-block mission/kpi/
      // acceptance, derives id_suffix from block.id, drops common prefix
      // when blocks share one (b.lensa-auth + b.lensa-ingest → suffix=auth/ingest).
      if (req.url === '/atlas/schema-templates/snapshot') {
        const tid = String(body.template_id || '').toLowerCase().replace(/[^a-z0-9._-]/g, '-');
        if (!/^[a-z0-9._-]{2,48}$/.test(tid)) return json(res, 200, { ok: false, error: 'template_id required (lowercase, ≤48 chars)' });
        try {
          const clientId = body.client && /^[a-zA-Z0-9._-]+$/.test(body.client) ? String(body.client) : null;
          const root = clientId ? path.join(ATLAS, 'clients', clientId) : ATLAS;
          const graphPath = path.join(root, 'graph.json');
          if (!fs.existsSync(graphPath)) return json(res, 200, { ok: false, error: `graph.json not found in ${clientId ? 'client/' + clientId : 'main'}` });
          const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
          const blocksDir = path.join(root, 'blocks');
          const liveBlocks = (graph.blocks || []).filter((b) => b.status !== 'archived');
          if (!liveBlocks.length) return json(res, 200, { ok: false, error: 'no live blocks to snapshot' });
          // Determine common prefix to strip from b.* ids → cleaner suffixes
          const ids = liveBlocks.map((b) => b.id.replace(/^b\./, ''));
          let common = ids[0] || '';
          for (const id of ids) {
            while (common && !id.startsWith(common + '-')) common = common.slice(0, -1);
            if (!common) break;
          }
          const stripPrefix = common ? `${common}-` : '';
          const suffixOf = (id) => id.replace(/^b\./, '').replace(stripPrefix ? new RegExp('^' + stripPrefix.replace(/[.-]/g, '\\$&')) : /^$/, '');
          // Read per-block mission/kpi/acceptance from disk
          const blocks = liveBlocks.map((b) => {
            const dir = path.join(blocksDir, b.id);
            const safe = (f) => {
              try { return fs.existsSync(path.join(dir, f)) ? fs.readFileSync(path.join(dir, f), 'utf8').replace(/^#[^\n]*\n+/, '').trim() : ''; } catch { return ''; }
            };
            const kpiText = safe('kpi.md');
            const accText = safe('acceptance.md');
            // Parse kpi/acceptance lines: strip leading bullets / checkboxes
            const lines = (s) => s.split(/\n/).map((l) => l.replace(/^\s*[-*]\s*\[[ xX]\]\s*\**[A-Z]?\d*\.?\**\s*/, '').replace(/^\s*[-*]\s*/, '').trim()).filter(Boolean);
            return {
              id_suffix: suffixOf(b.id) || b.id.replace(/^b\./, ''),
              title: b.title || b.id,
              layer: b.layer || 'logic',
              mission: safe('mission.md'),
              kpi: lines(kpiText).slice(0, 8),
              acceptance: lines(accText).slice(0, 8),
            };
          });
          // Build edge list using suffixes
          const idToSuffix = Object.fromEntries(liveBlocks.map((b) => [b.id, suffixOf(b.id) || b.id.replace(/^b\./, '')]));
          const edges = [];
          for (const b of liveBlocks) {
            for (const dep of (b.depends_on || [])) {
              const m = String(dep).match(/^([^:]+)(?::(.+))?$/);
              if (!m) continue;
              const target = idToSuffix[m[1]];
              if (!target) continue;
              edges.push({ from: idToSuffix[b.id], to: target, kind: 'contract', capability: m[2] || undefined });
            }
          }
          const template = {
            id: tid,
            title: String(body.title || tid),
            description: String(body.description || `Snapshot graph from ${clientId || 'main'} taken at ${new Date().toISOString().slice(0, 10)}`),
            default_layer: 'logic',
            blocks,
            edges,
          };
          const tpath = path.join(ATLAS, 'schema_templates', `${tid}.json`);
          fs.mkdirSync(path.dirname(tpath), { recursive: true });
          if (fs.existsSync(tpath) && !body.overwrite) return json(res, 200, { ok: false, error: 'template_id exists; pass overwrite=true to replace' });
          const tmp = tpath + '.tmp';
          fs.writeFileSync(tmp, JSON.stringify(template, null, 2) + '\n', 'utf8');
          fs.renameSync(tmp, tpath);
          return json(res, 200, { ok: true, template_id: tid, file: path.relative(ROOT, tpath), blocks_count: blocks.length, edges_count: edges.length });
        } catch (e) {
          return json(res, 200, { ok: false, error: String(e.message || e) });
        }
      }

      // /atlas/schema-templates/apply — instantiate all blocks + edges
      // from a template at a given prefix. Idempotent: skips blocks that
      // already exist by id, but logs them in the response.
      if (req.url === '/atlas/schema-templates/apply') {
        const tid = String(body.template_id || '');
        const prefix = String(body.prefix || tid);
        if (!tid) return json(res, 400, { ok: false, error: 'template_id required' });
        try {
          const tpath = path.join(ATLAS, 'schema_templates', `${tid}.json`);
          if (!fs.existsSync(tpath)) return json(res, 200, { ok: false, error: 'template not found' });
          const tpl = JSON.parse(fs.readFileSync(tpath, 'utf8'));
          const created = []; const skipped = []; const errors = [];
          // Map suffix → real block id (b.<prefix>-<suffix>)
          const ids = {};
          let cx = 200, cy = 200;
          for (const b of (tpl.blocks || [])) {
            const id = `b.${prefix}-${b.id_suffix}`.replace(/[^a-z0-9._-]/g, '-');
            ids[b.id_suffix] = id;
            try {
              blocksApi.createBlock({ body: { id, title: b.title, layer: b.layer || tpl.default_layer || 'logic', x: cx, y: cy } });
              if (b.mission)         blocksApi.patchBlockFile({ block_id: id, file: 'mission.md',    content: `# ${id} — mission\n\n${b.mission}\n` });
              if (b.kpi?.length)     blocksApi.patchBlockFile({ block_id: id, file: 'kpi.md',        content: `# ${id} — KPI\n\n${b.kpi.map((k) => `- ${k}`).join('\n')}\n` });
              if (b.acceptance?.length) blocksApi.patchBlockFile({ block_id: id, file: 'acceptance.md', content: `# ${id} — acceptance\n\n${b.acceptance.map((a, i) => `- [ ] **A${i+1}.** ${a}`).join('\n')}\n` });
              created.push(id);
            } catch (e) {
              if (/already exists/.test(String(e.message || e))) skipped.push(id);
              else errors.push({ id, error: String(e.message || e) });
            }
            cx += 220; if (cx > 1200) { cx = 200; cy += 200; }
          }
          for (const e of (tpl.edges || [])) {
            const from = ids[e.from], to = ids[e.to];
            if (!from || !to) continue;
            try { blocksApi.addEdge({ body: { from, to, kind: e.kind || 'contract', capability: e.capability } }); }
            catch (err) { errors.push({ from, to, error: String(err.message || err) }); }
          }
          return json(res, 200, { ok: true, template_id: tid, prefix, created, skipped, errors });
        } catch (e) {
          return json(res, 200, { ok: false, error: String(e.message || e) });
        }
      }

      // /atlas/subsystems/save — persist a drill-into-block subsystem.
      if (req.url === '/atlas/subsystems/save') {
        const pid = String(body.parent_id || body.block_id || '');
        if (!pid) return json(res, 400, { ok: false, error: 'parent_id required' });
        return tryFn(() => subsApi.saveSubsystem(pid, body));
      }

      // /atlas/activity-log/append — append a single JSON entry.
      if (req.url === '/atlas/activity-log/append') {
        try {
          const entry = {
            ts: body.ts || new Date().toISOString(),
            agent: body.agent || 'unknown',
            kind: body.kind || 'note',
            msg: String(body.msg || '').slice(0, 1000),
          };
          const p = path.join(ATLAS, 'activity_log.jsonl');
          fs.appendFileSync(p, JSON.stringify(entry) + '\n', 'utf8');
          // Cap at ~5000 lines to keep file manageable; rotate when bigger.
          const stat = fs.statSync(p);
          if (stat.size > 1_000_000) {
            const lines = fs.readFileSync(p, 'utf8').split(/\n/).filter(Boolean);
            fs.writeFileSync(p, lines.slice(-3000).join('\n') + '\n', 'utf8');
          }
          return json(res, 200, { ok: true });
        } catch (e) {
          return json(res, 200, { ok: false, error: String(e.message || e) });
        }
      }

      // /atlas/build-context-pack — wraps scripts/build_context_pack.mjs.
      // Returns the path to the freshly written JSON so the UI can deep-link.
      if (req.url === '/atlas/build-context-pack') {
        const bid = String(body.block_id || '');
        if (!bid) return json(res, 400, { ok: false, error: 'block_id required' });
        try {
          const out = execFileSync('node', ['scripts/build_context_pack.mjs', bid], { cwd: ROOT, stdio: 'pipe' }).toString();
          const fp = path.join('atlas', 'context_packs', `${bid}.json`);
          return json(res, 200, { ok: true, file: fp, out: out.trim() });
        } catch (e) {
          return json(res, 200, { ok: false, error: String(e.message || e), stderr: (e.stderr || '').toString().slice(0, 500) });
        }
      }
      // /atlas/sync-check — runs sync_audit_context for a block (or for
      // the whole atlas via b.core-sync). Real replacement for the mock
      // "1 рассинхрон" topbar pill.
      if (req.url === '/atlas/sync-check') {
        const bid = String(body.block_id || 'b.core-sync');
        try {
          const out = execFileSync('node', ['scripts/run_block_process.mjs', bid, 'sync_audit_context'], { cwd: ROOT, stdio: 'pipe' }).toString();
          return json(res, 200, { ok: true, block_id: bid, out: out.slice(-2000) });
        } catch (e) {
          return json(res, 200, { ok: false, error: String(e.message || e), stderr: (e.stderr || '').toString().slice(-2000) });
        }
      }

      // /runs/start — non-blocking variant of /run-block. Spawns the
      // implementation script detached and returns immediately. The UI
      // polls /runs/list?block_id=...&active=1 to track FSM progression.
      if (req.url === '/runs/start') {
        return tryFn(() => runsApi.startRunAsync({
          block_id: String(body.block_id || ''),
          agent:    body.agent ? String(body.agent) : undefined,
          prompt:   body.prompt ? String(body.prompt) : undefined,
        }));
      }
      // /llm/advice — bridge to b.llm-gateway. Returns ok:true with
      // advice text on success, ok:false with mock fallback if no
      // provider is configured (callLLM degrades gracefully).
      if (req.url === '/llm/advice') {
        return runsApi.callAdvice({
          block_id:     body.block_id ? String(body.block_id) : undefined,
          prompt:       body.prompt   ? String(body.prompt)   : undefined,
          context:      body.context,
          context_kind: body.context_kind ? String(body.context_kind) : undefined,
        }).then((r) => json(res, 200, r), (e) => json(res, 200, { ok: false, error: String(e.message || e) }));
      }

      // ─── Phase M — Sima synthesis (block / edges / tasks) ──────────
      if (req.url === '/llm/synthesize-block') {
        return synthApi.synthesizeBlock({
          source_text:     String(body.source_text || body.text || ''),
          product_context: body.product_context || null,
          count:           body.count,
          intent:          body.intent ? String(body.intent) : undefined,
        }).then((r) => json(res, 200, r), (e) => json(res, 200, { ok: false, error: String(e.message || e) }));
      }
      if (req.url === '/llm/suggest-edges') {
        return synthApi.suggestEdges({
          focal_block_id: String(body.focal_block_id || body.block_id || ''),
          modules:        Array.isArray(body.modules) ? body.modules : [],
          edges:          Array.isArray(body.edges)   ? body.edges   : [],
        }).then((r) => json(res, 200, r), (e) => json(res, 200, { ok: false, error: String(e.message || e) }));
      }
      if (req.url === '/llm/decompose-tasks') {
        return synthApi.decomposeTasks({
          block_id: String(body.block_id || ''),
          title:    body.title ? String(body.title) : undefined,
          mission:  body.mission ? String(body.mission) : undefined,
          layer:    body.layer ? String(body.layer) : undefined,
        }).then((r) => json(res, 200, r), (e) => json(res, 200, { ok: false, error: String(e.message || e) }));
      }
      if (req.url === '/llm/fill-field') {
        return synthApi.fillField({
          block_id: String(body.block_id || ''),
          field:    String(body.field || ''),
          mission_context: body.mission_context ? String(body.mission_context) : undefined,
          layer:    body.layer ? String(body.layer) : undefined,
          neighbors: body.neighbors || undefined,
        }).then((r) => json(res, 200, r), (e) => json(res, 200, { ok: false, error: String(e.message || e) }));
      }
      if (req.url === '/llm/rewrite-field') {
        return synthApi.rewriteField({
          block_id: String(body.block_id || ''),
          field:    String(body.field || ''),
          current_content: body.current_content ? String(body.current_content) : undefined,
          mission_context: body.mission_context ? String(body.mission_context) : undefined,
        }).then((r) => json(res, 200, r), (e) => json(res, 200, { ok: false, error: String(e.message || e) }));
      }

      // Phase G — Composer intake helpers.
      // /api/intake/extract — pull structured insights (goals/constraints/
      //                       ideas/risks/terms) from any source text.
      if (req.url === '/api/intake/extract') {
        return synthApi.extractInsights({
          text: String(body.text || ''),
          kind: body.kind ? String(body.kind) : undefined,
        }).then((r) => json(res, 200, r), (e) => json(res, 200, { ok: false, error: String(e.message || e) }));
      }
      // /api/intake/transcribe — graceful stub. The actual whisper call
      // requires a separate provider integration (OpenAI / local whisper.cpp)
      // — wired here as a deliberate no-op with a clear hint so the UI
      // can switch to "paste transcript text" mode.
      if (req.url === '/api/intake/transcribe') {
        return json(res, 200, {
          ok: false,
          error: 'transcription not configured',
          hint: 'Установите WHISPER_API_KEY и реализуйте provider в scripts/atlas_synthesis_api.mjs::transcribe(). Пока что вставьте транскрипт в поле «Текст».',
        });
      }
      // /atlas/blocks/patch-file — write a block's mission.md/kpi.md/etc.
      if (req.url === '/atlas/blocks/patch-file') {
        const id = String(body.block_id || body.id || '');
        if (!id) return json(res, 400, { ok: false, error: 'block_id required' });
        return tryFn(() => blocksApi.patchBlockFile({
          block_id: id, file: String(body.file || ''), content: String(body.content || ''),
        }));
      }

      // PR4.5: run the configured coding agent on a block
      if (req.url === '/run-block') {
        const blockId = String(body.block_id || '');
        if (!blockId) return json(res, 400, { ok: false, error: 'block_id required' });
        const userPrompt = String(body.prompt || '');
        const agentEnv = body.agent ? { ATLAS_AGENT: String(body.agent) } : {};
        const args = ['scripts/run_block_implementation.mjs', blockId];
        if (userPrompt) args.push('--', userPrompt);
        try {
          const out = execFileSync('node', args, { stdio: 'pipe', env: { ...process.env, ...agentEnv } }).toString();
          return json(res, 200, { ok: true, out });
        } catch (e) {
          return json(res, 200, { ok: false, error: String(e.message || e), stderr: (e.stderr || '').toString().slice(0, 2000) });
        }
      }
      return json(res, 404, { ok: false, error: 'unknown endpoint' });
    } catch (e) {
      return json(res, 500, { ok: false, error: String(e) });
    }
  });
});

server.listen(port, () => {
  console.log(`atlas_api_server listening on http://localhost:${port}`);
});

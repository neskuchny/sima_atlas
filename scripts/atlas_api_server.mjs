#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as blocksApi from './atlas_blocks_api.mjs';

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
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'POST, GET, OPTIONS',
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
  // PR — graceful empty stubs for the legacy /api/artifacts endpoints
  // gallery_v2.jsx and layer1_canvas.jsx call. They were never wired to a
  // real backend; the UI handled 404 silently but the network panel
  // showed scary red lines. Now we return empty lists / no-op responses
  // so the UI stays clean.
  if (req.method === 'GET' && req.url.startsWith('/api/artifacts')) {
    return json(res, 200, { artifacts: [], total: 0, source: 'stub' });
  }
  if (req.method === 'POST' && req.url.startsWith('/api/artifacts/') && req.url.endsWith('/insert')) {
    return json(res, 200, { ok: true, source: 'stub', note: 'artifact insert is a no-op until a real artifact backend lands' });
  }
  if (req.method === 'DELETE' && req.url.startsWith('/api/artifacts')) {
    return json(res, 200, { ok: true, source: 'stub' });
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

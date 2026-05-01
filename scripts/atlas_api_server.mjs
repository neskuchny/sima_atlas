#!/usr/bin/env node
import http from 'node:http';
import { execFileSync } from 'node:child_process';

const port = Number(process.env.ATLAS_API_PORT || 8787);

function runNode(args) {
  return execFileSync('node', args, { stdio: 'pipe' }).toString().trim();
}

function json(res, code, body) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { ok: true, service: 'atlas-api' });
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
      return json(res, 404, { ok: false, error: 'unknown endpoint' });
    } catch (e) {
      return json(res, 500, { ok: false, error: String(e) });
    }
  });
});

server.listen(port, () => {
  console.log(`atlas_api_server listening on http://localhost:${port}`);
});

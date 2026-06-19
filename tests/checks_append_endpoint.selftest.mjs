#!/usr/bin/env node
// R-7.99 (b.core-sync T8) — selftest for POST /atlas/checks/append.
//
// Spawns the API server on an ephemeral port pointed at a synthetic atlas,
// then hits the endpoint with: (1) a valid append, (2) missing required
// fields, (3) an unknown block, (4) a note with embedded tabs/newlines
// (must be sanitised so the TSV format stays intact), (5) two concurrent
// appends to verify both lines land.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const failures = [];
const check = (n, c, d = '') => { if (!c) failures.push(`${n}${d ? ' — ' + d : ''}`); };

// ── synthetic atlas
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-checks-ep-'));
const atlas = path.join(tmp, 'atlas');
fs.mkdirSync(path.join(atlas, 'blocks', 'b.alpha'), { recursive: true });
fs.writeFileSync(path.join(atlas, 'graph.json'), JSON.stringify({ blocks: [{ id: 'b.alpha', status: 'wip' }] }, null, 2));
const checksLog = path.join(atlas, 'blocks', 'b.alpha', 'checks.log');
fs.writeFileSync(checksLog, ''); // start empty

// ── spawn the API server on a random port
const port = 50000 + Math.floor(Math.random() * 5000);
const env = { ...process.env, ATLAS_ROOT: atlas, ATLAS_API_PORT: String(port), PORT: String(port) };
const server = spawn('node', ['scripts/atlas_api_server.mjs'], { cwd: ROOT, env, stdio: 'pipe' });
let serverStderr = '';
server.stderr.on('data', (d) => { serverStderr += String(d); });

const waitForServer = () => new Promise((resolve, reject) => {
  const start = Date.now();
  const tick = () => {
    const r = http.request({ host: '127.0.0.1', port, path: '/atlas/state', method: 'GET', timeout: 1000 }, (res) => { res.resume(); resolve(); });
    r.on('error', () => {
      if (Date.now() - start > 8000) return reject(new Error(`server did not start within 8s. stderr: ${serverStderr.slice(0, 400)}`));
      setTimeout(tick, 100);
    });
    r.end();
  };
  tick();
});

const post = (url, body) => new Promise((resolve, reject) => {
  const raw = body ? JSON.stringify(body) : '';
  const req = http.request({
    host: '127.0.0.1', port, path: url, method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(raw) },
    timeout: 4000,
  }, (res) => {
    let buf = ''; res.setEncoding('utf8');
    res.on('data', (c) => buf += c);
    res.on('end', () => {
      try { resolve({ status: res.statusCode, json: JSON.parse(buf || '{}') }); }
      catch { resolve({ status: res.statusCode, raw: buf }); }
    });
  });
  req.on('error', reject);
  req.write(raw);
  req.end();
});

try {
  await waitForServer();

  // ── Group 1: valid append → 200, line in checks.log
  {
    const r = await post('/atlas/checks/append', { block_id: 'b.alpha', kind: 'ui', result: 'pass', note: 'first one' });
    check('g1:200', r.status === 200, JSON.stringify(r.json || r));
    check('g1:ok=true', r.json?.ok === true);
    const log = fs.readFileSync(checksLog, 'utf8');
    check('g1:line landed', log.split('\n').filter(Boolean).length === 1, `log=${JSON.stringify(log)}`);
    check('g1:line is TSV', /^\S+\tui\tpass\tfirst one$/m.test(log));
  }

  // ── Group 2: missing required fields
  {
    const r = await post('/atlas/checks/append', { block_id: 'b.alpha', kind: 'ui' /* no result */ });
    check('g2:400 missing result', r.status === 400);
    check('g2:error mentions result', /result/i.test(r.json?.error || ''));
  }

  // ── Group 3: unknown block
  {
    const r = await post('/atlas/checks/append', { block_id: 'b.nope', kind: 'ui', result: 'pass' });
    check('g3:404 unknown block', r.status === 404);
    check('g3:error mentions block', /block not found/i.test(r.json?.error || ''));
  }

  // ── Group 4: note with embedded tabs / newlines must be sanitised
  {
    const r = await post('/atlas/checks/append', { block_id: 'b.alpha', kind: 'ui', result: 'pass', note: "has\ttab\nand\rnewline" });
    check('g4:200', r.status === 200);
    const log = fs.readFileSync(checksLog, 'utf8').split('\n').filter(Boolean);
    const lastLine = log[log.length - 1];
    // No raw tab/newline inside the note column (the only tabs allowed are the
    // three TSV column separators).
    const tabs = (lastLine.match(/\t/g) || []).length;
    check('g4:exactly 3 tabs (TSV separators)', tabs === 3, `tabs=${tabs} line=${JSON.stringify(lastLine)}`);
    check('g4:no raw newline', !/\n|\r/.test(lastLine));
  }

  // ── Group 5: 5 concurrent appends, all 5 land
  {
    const before = fs.readFileSync(checksLog, 'utf8').split('\n').filter(Boolean).length;
    await Promise.all([0, 1, 2, 3, 4].map((i) =>
      post('/atlas/checks/append', { block_id: 'b.alpha', kind: 'race', result: 'pass', note: `concurrent ${i}` })
    ));
    const after = fs.readFileSync(checksLog, 'utf8').split('\n').filter(Boolean).length;
    check('g5:5 new lines', after - before === 5, `before=${before} after=${after}`);
  }

  // ── Group 6: rejects path-traversal-y block_id
  {
    const r = await post('/atlas/checks/append', { block_id: '../etc/passwd', kind: 'ui', result: 'pass' });
    check('g6:400 path-traversal-y id rejected', r.status === 400, JSON.stringify(r.json));
  }

} finally {
  server.kill();
  // Give the OS a moment to release the port; tmp cleanup safe.
  await new Promise((r) => setTimeout(r, 100));
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error('checks_append_endpoint.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('checks_append_endpoint.selftest: OK (6 test groups, all assertions green)');

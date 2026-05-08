#!/usr/bin/env node
// One-command dev environment for Sima Atlas.
//
//   npm run dev
//
// Starts:
//   1. atlas_api_server.mjs on :8787 (proposals, run cancel, design payload)
//   2. Node http static server on :8000 serving frontend/
//   3. Optionally opens the design UI in the default browser pointed at
//      the demo client (skip via --no-browser; URL configurable via --url)
//   4. Detects which agent CLIs are installed (claude / cursor-agent /
//      codex) and prints status so users know what's wired vs. fallback-only
//
// R-7.50 — replaced Python http.server with a pure-Node static server so
// `npm install && npm run dev` works on a clean machine without Python
// prerequisites. Also: default landing now `?client=example` (populated
// 5-block habit tracker) instead of `?client=main` (Sima describing
// herself, confusing for first-time visitors).

import { spawn, spawnSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const FRONTEND_DIR = path.join(ROOT, 'frontend');

const argv = process.argv.slice(2);
const noBrowser = argv.includes('--no-browser');
const urlIdx = argv.indexOf('--url');
const portUiIdx = argv.indexOf('--ui-port');
const uiPort = portUiIdx >= 0 ? Number(argv[portUiIdx + 1]) : 8000;
const portApiIdx = argv.indexOf('--api-port');
const apiPort = portApiIdx >= 0 ? argv[portApiIdx + 1] : '8787';
const clientIdx = argv.indexOf('--client');
const defaultClient = clientIdx >= 0 ? argv[clientIdx + 1] : 'example';
const url = urlIdx >= 0
  ? argv[urlIdx + 1]
  : `http://localhost:${uiPort}/atlas_design/index.html?client=${defaultClient}`;

const procs = [];

function startProc(name, cmd, args, opts = {}) {
  console.log(`[dev] spawn ${name}: ${cmd} ${args.join(' ')}`);
  const p = spawn(cmd, args, {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
  p.stdout.on('data', (d) => process.stdout.write(`[${name}] ${d}`));
  p.stderr.on('data', (d) => process.stderr.write(`[${name}] ${d}`));
  p.on('exit', (code) => console.log(`[dev] ${name} exited (${code})`));
  procs.push({ name, p });
  return p;
}

function killAll(signal = 'SIGTERM') {
  for (const { p } of procs) {
    try { p.kill(signal); } catch {}
  }
}

process.on('SIGINT',  () => { console.log('\n[dev] Ctrl-C — shutting down…'); killAll('SIGTERM'); setTimeout(() => process.exit(0), 500); });
process.on('SIGTERM', () => { killAll('SIGTERM'); setTimeout(() => process.exit(0), 500); });
process.on('exit', () => { killAll('SIGKILL'); });

// ──────────────────────────────────────────────────────────────────
// Agent CLI auto-detect — print status of agent CLIs at startup so the
// user knows which buttons in the UI will spawn an agent vs. fall back
// to print-only mode (R-7.X troubleshooting: ENOENT mid-run was confusing).
// ──────────────────────────────────────────────────────────────────
function checkCli(bin) {
  try {
    const r = spawnSync(bin, ['--version'], {
      stdio: 'ignore', timeout: 4000, shell: process.platform === 'win32',
    });
    return r.status === 0;
  } catch { return false; }
}

const cliStatus = {
  claude: checkCli('claude'),
  'cursor-agent': checkCli('cursor-agent'),
  codex: checkCli('codex'),
};
const wired = Object.entries(cliStatus).filter(([, ok]) => ok).map(([n]) => n);
const missing = Object.entries(cliStatus).filter(([, ok]) => !ok).map(([n]) => n);
console.log(`[dev] agent CLIs detected: ${wired.length ? wired.join(', ') : '(none)'}`);
if (missing.length) {
  console.log(`[dev]   missing: ${missing.join(', ')} — those buttons fall back to print-only`);
  console.log(`[dev]   install: claude → 'npm i -g @anthropic-ai/claude-code'  ·  cursor-agent → cursor.com/cli  ·  codex → openai.com/codex`);
}

// ──────────────────────────────────────────────────────────────────
// 1. atlas_api_server
// ──────────────────────────────────────────────────────────────────
startProc('api', 'node', ['scripts/atlas_api_server.mjs'], {
  env: { ...process.env, ATLAS_API_PORT: apiPort },
});

// ──────────────────────────────────────────────────────────────────
// 2. Node static UI server (replaces python3 http.server)
// ──────────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.jsx':  'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
};

const uiServer = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath.endsWith('/')) urlPath += 'index.html';
  // path traversal protection
  const candidate = path.resolve(FRONTEND_DIR, '.' + urlPath);
  if (!candidate.startsWith(FRONTEND_DIR)) {
    res.writeHead(403); res.end('forbidden'); return;
  }
  fs.stat(candidate, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
    const ext = path.extname(candidate).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[ext] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    fs.createReadStream(candidate).pipe(res);
  });
});

uiServer.on('error', (e) => {
  console.error(`[dev] UI server error: ${e.message}`);
  if (e.code === 'EADDRINUSE') console.error(`[dev] port ${uiPort} is busy — pass --ui-port=<other>`);
  process.exit(1);
});

uiServer.listen(uiPort, () => {
  console.log(`[dev] UI static → http://localhost:${uiPort}/  (serving frontend/)`);
});

// ──────────────────────────────────────────────────────────────────
// 3. open the design UI after a short delay so servers have time to bind
// ──────────────────────────────────────────────────────────────────
if (!noBrowser) {
  setTimeout(() => {
    let opener;
    if (process.platform === 'win32') opener = ['cmd', ['/c', 'start', '""', url]];
    else if (process.platform === 'darwin') opener = ['open', [url]];
    else opener = ['xdg-open', [url]];
    console.log(`[dev] opening ${url}`);
    spawn(opener[0], opener[1], { detached: true, stdio: 'ignore' }).unref();
  }, 1500);
}

console.log(`[dev] up: API http://localhost:${apiPort} · UI http://localhost:${uiPort}`);
console.log(`[dev]   demo client → ${url}`);
console.log(`[dev]   switch via ?client=<id> in URL · 'main' = Sima describing herself`);
console.log('[dev] Ctrl-C to stop both.');

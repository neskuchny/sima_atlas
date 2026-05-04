#!/usr/bin/env node
// One-command dev environment for Sima Atlas.
//
//   npm run dev
//
// Starts:
//   1. atlas_api_server.mjs on :8787 (proposals, run cancel, design payload)
//   2. python3 http.server on :8000 serving Sima (Remix)/
//   3. Optionally opens the design UI in the default browser
//      (skip via --no-browser; URL configurable via --url)
//
// Cross-platform — handles Windows PowerShell quirks:
//   * Uses Node's spawn (no shell-builtin oddities)
//   * Browser-launch via `start` (Windows) / `open` (mac) / `xdg-open` (Linux)
//   * Terminates child processes on Ctrl-C and on parent crash (no zombies)

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const argv = process.argv.slice(2);
const noBrowser = argv.includes('--no-browser');
const urlIdx = argv.indexOf('--url');
const url = urlIdx >= 0 ? argv[urlIdx + 1] : 'http://localhost:8000/atlas_design/index.html';
const portUiIdx = argv.indexOf('--ui-port');
const uiPort = portUiIdx >= 0 ? argv[portUiIdx + 1] : '8000';
const portApiIdx = argv.indexOf('--api-port');
const apiPort = portApiIdx >= 0 ? argv[portApiIdx + 1] : '8787';

function pick(cmd, alts) {
  // Resolve the first executable on PATH
  return cmd;
}

function pythonExe() {
  // On Windows the binary is `python` more often than `python3`. Try py launcher first.
  if (process.platform === 'win32') return 'py';
  return 'python3';
}

function pythonArgs() {
  if (process.platform === 'win32') return ['-3', '-m', 'http.server', uiPort, '--directory', 'Sima (Remix)'];
  return ['-m', 'http.server', uiPort, '--directory', 'Sima (Remix)'];
}

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
  for (const { name, p } of procs) {
    try { p.kill(signal); } catch {}
  }
}

process.on('SIGINT',  () => { console.log('\n[dev] Ctrl-C — shutting down…'); killAll('SIGTERM'); setTimeout(() => process.exit(0), 500); });
process.on('SIGTERM', () => { killAll('SIGTERM'); setTimeout(() => process.exit(0), 500); });
process.on('exit', () => { killAll('SIGKILL'); });

// 1. atlas_api_server
startProc('api', 'node', ['scripts/atlas_api_server.mjs'], {
  env: { ...process.env, ATLAS_API_PORT: apiPort },
});

// 2. python http.server (try py launcher on Windows, else python3, else python)
const pyTrial = startProc('ui',  pythonExe(), pythonArgs());
pyTrial.on('error', (e) => {
  console.error(`[dev] ${pythonExe()} failed: ${e.code}; retrying as 'python'`);
  // Fall back to plain `python`
  startProc('ui-fallback', 'python', ['-m', 'http.server', uiPort, '--directory', 'Sima (Remix)']);
});

// 3. open the design UI after a short delay so servers have time to bind
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

console.log('[dev] up: API http://localhost:' + apiPort + ' · UI http://localhost:' + uiPort);
console.log('[dev]   design view → http://localhost:' + uiPort + '/atlas_design/index.html');
console.log('[dev]   classic UI  → http://localhost:' + uiPort + '/index.html');
console.log('[dev] Ctrl-C to stop both.');

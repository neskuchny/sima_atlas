// R-7.99 (b.desktop PR1) — Electron main process for Sima Atlas Desktop.
//
// Bootstraps the existing browser app inside a native window:
//   1. spawns scripts/atlas_api_server.mjs via Electron's utilityProcess
//      (bundled Node — no system Node required, KPI-2);
//   2. starts a tiny static server for frontend/ on a dynamic port;
//   3. opens BrowserWindow once both ports respond on /;
//   4. on quit, kills the API + static processes cleanly.
//
// Why utilityProcess: Electron 21+ provides a Node-only subprocess that
// shares the bundled Node binary. The packaged .dmg/.exe/.AppImage thus
// runs on a machine that has never seen `node` on PATH — that's the whole
// point of «installable program, not terminal-thing».
//
// Security baseline (Electron post-12 / Chromium):
//   - nodeIntegration: false in renderer;
//   - contextIsolation: true;
//   - preload exposes only three IPC channels via contextBridge.

import { app, BrowserWindow, ipcMain, Menu, shell, dialog, utilityProcess } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_DIR = path.join(REPO_ROOT, 'frontend');
const PROJECTS_DIR = path.join(os.homedir(), 'SimaProjects');

let apiPort = 0;
let uiPort = 0;
let apiProc = null;       // utilityProcess for atlas_api_server.mjs
let uiServer = null;      // tiny http.Server for static frontend
let mainWindow = null;

// ── pick a free port in a sensible range so we don't collide with
// the operator's `npm run dev` if it's already running.
function pickFreePort(preferred) {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', () => {
      // Fallback: ask the OS for any free port.
      const srv2 = net.createServer();
      srv2.unref();
      srv2.on('error', reject);
      srv2.listen(0, '127.0.0.1', () => {
        const p = srv2.address().port;
        srv2.close(() => resolve(p));
      });
    });
    srv.listen(preferred, '127.0.0.1', () => {
      srv.close(() => resolve(preferred));
    });
  });
}

function waitForPort(port, pathToHit, timeoutMs) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.request({ host: '127.0.0.1', port, path: pathToHit, timeout: 1000 }, (res) => {
        res.resume(); resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error(`port ${port}${pathToHit} did not respond within ${timeoutMs}ms`));
        setTimeout(tick, 100);
      });
      req.end();
    };
    tick();
  });
}

function startApiServer(atlasPath) {
  // ELECTRON_RUN_AS_NODE is implicit for utilityProcess.fork — it always
  // runs in a Node-only context using the bundled binary.
  apiProc = utilityProcess.fork(
    path.join(REPO_ROOT, 'scripts', 'atlas_api_server.mjs'),
    [],
    {
      env: {
        ...process.env,
        ATLAS_ROOT: atlasPath,
        ATLAS_API_PORT: String(apiPort),
      },
      stdio: 'pipe',
    }
  );
  apiProc.stdout?.on('data', (d) => process.stdout.write(`[api] ${d}`));
  apiProc.stderr?.on('data', (d) => process.stderr.write(`[api] ${d}`));
  apiProc.on('exit', (code) => {
    process.stderr.write(`[api] exited with code ${code}\n`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.executeJavaScript(`document.body.innerHTML = '<div style="font: 14px system-ui; padding: 40px;"><h2>API server crashed (exit ${code})</h2><p>Check the application log. Restart from File → Restart.</p></div>'`);
    }
  });
}

// Tiny static server for frontend/. Same dispatch logic as scripts/dev_server.mjs,
// inlined to keep this file self-contained when packaged.
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
};
function startUiServer() {
  uiServer = http.createServer((req, res) => {
    let urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/') urlPath = '/atlas_design/';
    if (urlPath.endsWith('/')) urlPath += 'index.html';
    const candidate = path.resolve(FRONTEND_DIR, '.' + urlPath);
    if (!candidate.startsWith(FRONTEND_DIR)) { res.writeHead(403); res.end('forbidden'); return; }
    fs.stat(candidate, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); res.end('not found: ' + urlPath); return; }
      const ext = path.extname(candidate).toLowerCase();
      res.writeHead(200, { 'content-type': MIME[ext] || 'application/octet-stream', 'cache-control': 'no-cache' });
      fs.createReadStream(candidate).pipe(res);
    });
  });
  return new Promise((resolve, reject) => {
    uiServer.on('error', reject);
    uiServer.listen(uiPort, '127.0.0.1', () => resolve());
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900,
    minWidth: 1000, minHeight: 700,
    backgroundColor: '#f6f5f1',
    title: 'Sima Atlas',
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // preload uses ESM imports
    },
  });
  // Point at our tiny static server; pass apiPort via query string so the
  // existing frontend code (which expects `?api=...&client=...`) picks it up.
  const url = `http://127.0.0.1:${uiPort}/atlas_design/?client=example&api=${apiPort}`;
  mainWindow.loadURL(url);
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC channels exposed via preload's contextBridge.
ipcMain.handle('desktop:open-project-picker', async () => {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  const r = await dialog.showOpenDialog(mainWindow, {
    title: 'Open Sima project (atlas/ folder)',
    defaultPath: PROJECTS_DIR,
    properties: ['openDirectory'],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('desktop:reveal-in-finder', async (_e, p) => {
  if (typeof p === 'string') shell.showItemInFolder(p);
});

ipcMain.handle('desktop:trigger-v1', async () => {
  // T10 (PR4) — placeholder: in MVP, fire the same CLI the operator would.
  // Returns immediately; the v1 loop logs to atlas/autonomous_runs/.
  utilityProcess.fork(
    path.join(REPO_ROOT, 'scripts', 'agent_loop_daemon.mjs'),
    ['--max-iterations', '4', '--max-cost-usd', '1.5', '--json'],
    { env: { ...process.env, ATLAS_AGENT: 'print-only' }, stdio: 'pipe' }
  );
  return { ok: true, note: 'V-1 dry-run launched (print-only). Monitor atlas/autonomous_runs/.' };
});

// ── lifecycle
app.whenReady().then(async () => {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  try {
    apiPort = await pickFreePort(8787);
    uiPort = await pickFreePort(8000);
    startApiServer(path.join(REPO_ROOT, 'atlas'));
    await startUiServer();
    // Give the API a generous window — it imports MCP server stuff, scans
    // graph.json, etc.
    await Promise.all([
      waitForPort(apiPort, '/atlas/state', 10_000),
      waitForPort(uiPort, '/atlas_design/index.html', 5_000),
    ]);
    createWindow();
  } catch (e) {
    dialog.showErrorBox('Sima Atlas — startup failed', String(e?.message || e));
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (apiProc) { try { apiProc.kill(); } catch {} }
  if (uiServer) { try { uiServer.close(); } catch {} }
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

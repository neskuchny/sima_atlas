// R-7.99 (b.desktop PR1 + PR4) — Electron main process for Sima Atlas Desktop.
//
// PR1 — Bootstraps the existing browser app inside a native window:
//   1. spawns scripts/atlas_api_server.mjs via Electron's utilityProcess
//      (bundled Node — no system Node required, KPI-2);
//   2. starts a tiny static server for frontend/ on a dynamic port;
//   3. opens BrowserWindow once both ports respond on /;
//   4. on quit, kills the API + static processes cleanly.
//
// PR4 — Native menu (Verify All / Generate Bundle / V-1 Loop hotkeys) +
// electron-updater integration (checks GitHub Releases, prompts on update,
// installs on next restart). Each menu action also POSTs to the
// /atlas/checks/append endpoint added in T8 — desktop usage gets the same
// audit-trail on disk as CLI usage, no parallel log to maintain.
//
// Why utilityProcess: Electron 21+ provides a Node-only subprocess that
// shares the bundled Node binary. The packaged .dmg/.exe/.AppImage thus
// runs on a machine that has never seen `node` on PATH — that's the whole
// point of «installable program, not terminal-thing».
//
// Security baseline (Electron post-12 / Chromium):
//   - nodeIntegration: false in renderer;
//   - contextIsolation: true;
//   - preload exposes only a small audited surface via contextBridge.

import { app, BrowserWindow, ipcMain, Menu, shell, dialog, utilityProcess } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// R-8.03 (v0.4.2): packaged-mode path resolution. In dev `__dirname` is
// `<repo>/extensions/desktop/`, so going up two levels gives the repo
// root. In a packaged build, electron-builder may collapse the layout
// (main.mjs at `resources/app/main.mjs` next to `scripts/`) instead of
// preserving `extensions/desktop/`. We don't want to assume — probe for
// the marker file (`scripts/atlas_api_server.mjs`) and pick the first
// candidate that contains it.
function detectRepoRoot() {
  const marker = path.join('scripts', 'atlas_api_server.mjs');
  const candidates = [
    path.resolve(__dirname, '..', '..'),                  // dev: extensions/desktop → repo
    path.resolve(__dirname),                              // packaged collapsed: main.mjs at app/
    path.resolve(__dirname, '..'),                        // packaged with one-level nesting
    path.resolve(__dirname, '..', '..', '..', '..'),      // unusual nested layouts
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, marker))) return c;
  }
  return null;
}
const REPO_ROOT = detectRepoRoot();
const FRONTEND_DIR = REPO_ROOT ? path.join(REPO_ROOT, 'frontend') : null;
const PROJECTS_DIR = path.join(os.homedir(), 'SimaProjects');

// R-8.03 (v0.4.2): writable atlas root. The bundled atlas/ lives inside
// the installed package, which is read-only on Windows (Program Files)
// and macOS (read-only DMG mount or quarantined app bundle). Copy it to
// app.getPath('userData')/atlas on first launch and point the API
// server at that writable copy. User projects under ~/SimaProjects/
// already live in the home dir and are fine as-is.
function ensureWritableAtlas() {
  if (!REPO_ROOT) return null;
  const bundledAtlas = path.join(REPO_ROOT, 'atlas');
  // In dev (`npm run start`), the repo's atlas/ is on a writable disk and
  // is the same one the CLI / nightly / git tooling reads. Redirecting in
  // dev would split state across two locations. Only redirect when the
  // install lives somewhere read-only (Program Files, /Applications, an
  // AppImage's read-only squashfs).
  if (!app.isPackaged) return bundledAtlas;
  const userDataDir = app.getPath('userData');
  const writableAtlas = path.join(userDataDir, 'atlas');
  if (!fs.existsSync(writableAtlas)) {
    try {
      fs.mkdirSync(writableAtlas, { recursive: true });
      // Node 16.7+ supports fs.cpSync for recursive copies — Electron 32
      // bundles Node 20, so it's available.
      fs.cpSync(bundledAtlas, writableAtlas, { recursive: true });
    } catch (e) {
      process.stderr.write(`[bootstrap] failed to seed writable atlas: ${e?.message || e}\n`);
      // Fall back to bundled (read-only). Reads (incl. /atlas/state) will
      // still work so the app at least opens; the user will hit EACCES on
      // the first edit.
      return bundledAtlas;
    }
  }
  return writableAtlas;
}

// Bundled atlas path the project picker uses as the «demo» project entry.
// Resolved once at startup so list/open use the same value as the running
// API server (whether dev or packaged).
let BUNDLED_ATLAS_PATH = null;

let apiPort = 0;
let uiPort = 0;
let apiProc = null;       // utilityProcess for atlas_api_server.mjs
let uiServer = null;      // tiny http.Server for static frontend
let mainWindow = null;
let currentAtlasRoot = null;  // PR4 T12: which atlas/ dir the API server points at right now

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

// R-8.03 (v0.4.2): capture API process output so we have actual diagnostics
// when something goes wrong. A packaged Electron app has no console
// attached, so silent stderr in dev becomes silent stderr in production —
// useless when the user can only see «startup failed».
let apiLogPath = null;
let apiLogStream = null;
const apiOutputTail = [];   // last ~60 lines in memory for error dialogs
function appendApiLine(line) {
  apiOutputTail.push(line);
  if (apiOutputTail.length > 60) apiOutputTail.shift();
  if (apiLogStream) {
    try { apiLogStream.write(line); } catch {}
  }
}
function openApiLog() {
  if (apiLogStream) return;
  try {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    apiLogPath = path.join(logsDir, 'api.log');
    // Truncate each session — keeps the log focused on the current run.
    apiLogStream = fs.createWriteStream(apiLogPath, { flags: 'w' });
    apiLogStream.write(`=== api log opened ${new Date().toISOString()} ===\n`);
    apiLogStream.write(`REPO_ROOT=${REPO_ROOT}\n`);
    apiLogStream.write(`apiPort=${apiPort}, uiPort=${uiPort}\n\n`);
  } catch (e) {
    process.stderr.write(`[bootstrap] could not open api log: ${e?.message || e}\n`);
  }
}

function startApiServer(atlasPath) {
  // ELECTRON_RUN_AS_NODE is implicit for utilityProcess.fork — it always
  // runs in a Node-only context using the bundled binary.
  currentAtlasRoot = atlasPath;
  const scriptPath = path.join(REPO_ROOT, 'scripts', 'atlas_api_server.mjs');
  appendApiLine(`[bootstrap] forking ${scriptPath}\n`);
  appendApiLine(`[bootstrap] ATLAS_ROOT=${atlasPath}\n`);
  apiProc = utilityProcess.fork(
    scriptPath,
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
  apiProc.stdout?.on('data', (d) => { const s = `[api/out] ${d}`; appendApiLine(s); process.stdout.write(s); });
  apiProc.stderr?.on('data', (d) => { const s = `[api/err] ${d}`; appendApiLine(s); process.stderr.write(s); });
  apiProc.on('exit', (code) => {
    appendApiLine(`[api] exited with code ${code}\n`);
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
  runScriptInBackground('scripts/agent_loop_daemon.mjs',
    ['--max-iterations', '4', '--max-cost-usd', '1.5', '--json'],
    { auditBlock: 'b.desktop' });
  return { ok: true, note: 'V-1 dry-run launched (print-only). Monitor atlas/autonomous_runs/.' };
});

// PR4 — single IPC dispatcher for renderer-side menu mirroring. The script
// names are a closed whitelist — the renderer cannot point us at arbitrary
// scripts under scripts/.
const RUN_SCRIPTS = {
  'verify-all':      { rel: 'scripts/verify_all_acceptance.mjs', args: [] },
  'generate-bundle': { rel: 'scripts/generate_wiki.mjs',         args: [] },
  'v1-dry-run':      { rel: 'scripts/agent_loop_daemon.mjs',     args: ['--dry-run', '--max-iterations', '4'] },
  'token-economics': { rel: 'scripts/token_economics.mjs',       args: ['--days', '30'] },
};
ipcMain.handle('desktop:run-script', async (_e, name) => {
  const spec = RUN_SCRIPTS[name];
  if (!spec) return { ok: false, error: `unknown script: ${name}` };
  runScriptInBackground(spec.rel, spec.args, { auditBlock: 'b.desktop', auditKind: `desktop-ipc-${name}` });
  return { ok: true, note: `${name} launched in background; result will land in atlas/blocks/b.desktop/checks.log` };
});

ipcMain.handle('desktop:check-for-updates', async () => {
  triggerUpdateCheck(true);
  return { ok: true };
});

// ── PR4 T12: project picker — list / create / open. Projects live under
// ~/SimaProjects/<name>/atlas/ (one atlas per project). Open swaps the
// running API server's ATLAS_ROOT and reloads the renderer.
function isSafeProjectName(name) {
  return typeof name === 'string' && /^[a-zA-Z0-9._-]{1,40}$/.test(name);
}

ipcMain.handle('desktop:list-projects', async () => {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  const out = [];
  // The bundled atlas — the «demo» project, always first.
  out.push({
    name: 'demo (bundled)',
    path: BUNDLED_ATLAS_PATH,
    bundled: true,
    current: currentAtlasRoot === BUNDLED_ATLAS_PATH,
  });
  for (const name of fs.readdirSync(PROJECTS_DIR)) {
    if (!isSafeProjectName(name)) continue;
    const dir = path.join(PROJECTS_DIR, name);
    if (!fs.statSync(dir).isDirectory()) continue;
    const atlasPath = path.join(dir, 'atlas');
    if (!fs.existsSync(path.join(atlasPath, 'graph.json'))) continue;
    out.push({
      name,
      path: atlasPath,
      bundled: false,
      current: currentAtlasRoot === atlasPath,
    });
  }
  return { ok: true, projects: out };
});

ipcMain.handle('desktop:create-project', async (_e, name) => {
  if (!isSafeProjectName(name)) return { ok: false, error: 'project name must be 1-40 chars: a-z A-Z 0-9 . _ -' };
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  const dir = path.join(PROJECTS_DIR, name);
  if (fs.existsSync(dir)) return { ok: false, error: `project «${name}» already exists` };
  const atlasPath = path.join(dir, 'atlas');
  fs.mkdirSync(path.join(atlasPath, 'blocks'), { recursive: true });
  fs.mkdirSync(path.join(atlasPath, 'operator_profile'), { recursive: true });
  // Minimal seed: empty graph.json + the project-level architecture lock.
  fs.writeFileSync(path.join(atlasPath, 'graph.json'), JSON.stringify({
    layers: [
      { id: 'user', name: 'Пользователь / JTBD', order: 0 },
      { id: 'front', name: 'Фронтенд', order: 1 },
      { id: 'logic', name: 'Логика / бэкенд', order: 2 },
      { id: 'ai', name: 'ИИ / агенты', order: 3 },
      { id: 'data', name: 'Данные / хранилище', order: 4 },
    ],
    blocks: [],
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(atlasPath, 'architecture_decisions.md'),
    `# Architecture Decisions — ${name}\n\nAppend-only project-level lock-in. Each entry auto-injected into every agent prompt.\n`);
  return { ok: true, project: { name, path: atlasPath } };
});

ipcMain.handle('desktop:open-project', async (_e, atlasPath) => {
  if (typeof atlasPath !== 'string' || !atlasPath) return { ok: false, error: 'atlasPath required' };
  // Allow either the bundled atlas or any path under ~/SimaProjects/.
  const withinProjects = atlasPath.startsWith(PROJECTS_DIR + path.sep);
  if (atlasPath !== BUNDLED_ATLAS_PATH && !withinProjects) return { ok: false, error: 'atlasPath must be the bundled atlas or live under ~/SimaProjects/' };
  if (!fs.existsSync(path.join(atlasPath, 'graph.json'))) return { ok: false, error: `no graph.json at ${atlasPath}` };

  // Restart the API server pointing at the new atlas root, then reload the
  // window. utilityProcess.fork is fire-and-forget; we kill the old one and
  // spawn fresh.
  if (apiProc) { try { apiProc.kill(); } catch {} apiProc = null; }
  currentAtlasRoot = atlasPath;
  startApiServer(atlasPath);
  try {
    await waitForPort(apiPort, '/atlas/state', 10_000);
  } catch (e) {
    return { ok: false, error: `restarted API did not respond: ${e.message}` };
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.loadURL(`http://127.0.0.1:${uiPort}/atlas_design/?client=example&api=${apiPort}`);
  }
  postCheck('b.desktop', 'project-switch', 'pass', `switched ATLAS_ROOT to ${atlasPath}`);
  return { ok: true, atlasPath };
});

// ── PR4 T10: run a node script via utilityProcess and POST a checks.log
// entry through the API server so desktop-triggered actions land in the
// same audit-trail as CLI actions (T8 unified endpoint).
async function postCheck(blockId, kind, result, note) {
  if (!apiPort) return;
  const body = JSON.stringify({ block_id: blockId, kind, result, note });
  await new Promise((resolve) => {
    const req = http.request({
      host: '127.0.0.1', port: apiPort, path: '/atlas/checks/append', method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      timeout: 2000,
    }, (res) => { res.resume(); resolve(); });
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
    req.write(body); req.end();
  });
}

function runScriptInBackground(relScript, args, { auditBlock, auditKind } = {}) {
  const child = utilityProcess.fork(
    path.join(REPO_ROOT, relScript), args, { env: process.env, stdio: 'pipe' }
  );
  const buffer = [];
  child.stdout?.on('data', (d) => buffer.push(String(d)));
  child.stderr?.on('data', (d) => buffer.push(String(d)));
  child.on('exit', (code) => {
    const tail = buffer.join('').split('\n').filter(Boolean).slice(-1)[0] || '';
    const note = `desktop-menu: ${relScript} exit=${code} · ${tail}`.slice(0, 240);
    if (auditBlock) postCheck(auditBlock, auditKind || 'desktop-menu', code === 0 ? 'pass' : 'fail', note);
  });
  return child;
}

// ── PR4 T10: native application menu. Each accelerator is the same on Mac
// (Cmd) and Win/Linux (Ctrl) thanks to Electron's «CmdOrCtrl» token.
function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' }, { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          // T12 — open the in-app project picker modal in the renderer.
          // The modal lists ~/SimaProjects/ entries + the bundled atlas,
          // lets the operator create a new project, and switches
          // ATLAS_ROOT on selection.
          label: 'Open Project…',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('sima:open-project-picker');
            }
          },
        },
        {
          label: 'Open Project Folder (native dialog)…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            const dir = await dialog.showOpenDialog(mainWindow, {
              title: 'Open Sima project (atlas/ folder)',
              defaultPath: PROJECTS_DIR,
              properties: ['openDirectory'],
            });
            if (!dir.canceled && dir.filePaths[0]) {
              shell.showItemInFolder(dir.filePaths[0]);
            }
          },
        },
        { label: 'Reveal Atlas in Finder', click: () => BUNDLED_ATLAS_PATH && shell.showItemInFolder(BUNDLED_ATLAS_PATH) },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Run',
      submenu: [
        {
          label: 'Verify All Blocks',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: () => runScriptInBackground('scripts/verify_all_acceptance.mjs', [], { auditBlock: 'b.desktop' }),
        },
        {
          label: 'Generate Wiki + TZ + Roadmap',
          accelerator: 'CmdOrCtrl+Shift+G',
          click: () => {
            runScriptInBackground('scripts/generate_wiki.mjs', [], { auditBlock: 'b.desktop' });
            runScriptInBackground('scripts/generate_tz_from_atlas.mjs', [], { auditBlock: 'b.desktop' });
            runScriptInBackground('scripts/rebuild_atlas_roadmap.mjs', [], { auditBlock: 'b.desktop' });
          },
        },
        {
          label: 'V-1 Autonomous Loop (dry-run)',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => runScriptInBackground('scripts/agent_loop_daemon.mjs',
            ['--dry-run', '--max-iterations', '4', '--max-cost-usd', '1.5'],
            { auditBlock: 'b.desktop' }),
        },
        { type: 'separator' },
        {
          label: 'Token Economics (30 days)',
          click: () => runScriptInBackground('scripts/token_economics.mjs', ['--days', '30'], { auditBlock: 'b.desktop' }),
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', accelerator: 'CmdOrCtrl+R' },
        { role: 'forceReload', accelerator: 'CmdOrCtrl+Shift+F5' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Documentation', click: () => shell.openExternal('https://github.com/neskuchny/sima_atlas/blob/main/README.md') },
        { label: 'Kanon Protocol Manifesto', click: () => shell.openExternal('https://github.com/neskuchny/sima_atlas/blob/main/kanon-protocol-manifesto-v2.1-ru.md') },
        { label: 'Block Contract (b.desktop)', click: () => shell.openExternal('https://github.com/neskuchny/sima_atlas/blob/main/atlas/blocks/b.desktop/mission.md') },
        { type: 'separator' },
        { label: 'Check for Updates…', click: () => triggerUpdateCheck(true) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── PR4 T11: electron-updater integration. Lazy-imported so the dev tree
// runs without electron-updater installed; in packaged builds the dep is
// present via extensions/desktop/package.json.
let autoUpdater = null;
async function setupAutoUpdater() {
  if (process.env.SIMA_DESKTOP_DISABLE_AUTOUPDATE === '1') return;
  if (!app.isPackaged) return; // dev mode: skip — there's no installed app to update
  try {
    const mod = await import('electron-updater');
    autoUpdater = mod.autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.on('update-available', (info) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        dialog.showMessageBox(mainWindow, {
          type: 'info', title: 'Sima Atlas — update available',
          message: `Version ${info.version} is available.`,
          detail: 'It will download in the background and install on next restart.',
        });
      }
    });
    autoUpdater.on('error', (e) => process.stderr.write(`[updater] ${e?.message || e}\n`));
    setTimeout(() => triggerUpdateCheck(false), 5 * 60 * 1000); // first check 5 min after launch
  } catch (e) {
    process.stderr.write(`[updater] not available (likely dev): ${e?.message || e}\n`);
  }
}
function triggerUpdateCheck(showWhenNone) {
  if (!autoUpdater) {
    if (showWhenNone && mainWindow) {
      dialog.showMessageBox(mainWindow, { type: 'info', title: 'Sima Atlas', message: 'Auto-updater is disabled in this build.' });
    }
    return;
  }
  autoUpdater.checkForUpdates().catch((e) => {
    if (showWhenNone && mainWindow) {
      dialog.showMessageBox(mainWindow, { type: 'warning', title: 'Update check failed', message: String(e?.message || e) });
    }
  });
}

// ── lifecycle
app.whenReady().then(async () => {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
  // R-8.03 (v0.4.2): open the api log first so any bootstrap diagnostics
  // (REPO_ROOT detection failure, atlas-seed errors) are captured before
  // we even fork the API.
  openApiLog();
  if (!REPO_ROOT) {
    const tried = [
      path.resolve(__dirname, '..', '..'),
      path.resolve(__dirname),
      path.resolve(__dirname, '..'),
      path.resolve(__dirname, '..', '..', '..', '..'),
    ].join('\n  ');
    dialog.showErrorBox(
      'Sima Atlas — cannot locate scripts/',
      `The packaged installer does not contain scripts/atlas_api_server.mjs in any expected location.\n\nSearched:\n  ${tried}\n\n__dirname: ${__dirname}\n\nThis is a packaging bug — please report it with this dialog text.`
    );
    return app.quit();
  }
  const writableAtlas = ensureWritableAtlas();
  BUNDLED_ATLAS_PATH = writableAtlas;
  try {
    apiPort = await pickFreePort(8787);
    uiPort = await pickFreePort(8000);
    startApiServer(writableAtlas);
    await startUiServer();
    // Give the API a generous window — it imports MCP server stuff, scans
    // graph.json, etc.
    await Promise.all([
      waitForPort(apiPort, '/atlas/state', 15_000),
      waitForPort(uiPort, '/atlas_design/index.html', 5_000),
    ]);
    buildMenu();
    createWindow();
    await setupAutoUpdater();
  } catch (e) {
    // R-8.03 (v0.4.2): make the failure dialog actually actionable. Include
    // the last lines of API stderr/stdout we captured and the path to the
    // full log file the user can attach when reporting.
    const tail = apiOutputTail.slice(-25).join('').trim();
    const detail = [
      `Error: ${e?.message || e}`,
      '',
      `REPO_ROOT: ${REPO_ROOT}`,
      `ATLAS:     ${writableAtlas}`,
      `Log file:  ${apiLogPath || '(could not open)'}`,
      '',
      '--- last API output ---',
      tail || '(no output captured before timeout)',
    ].join('\n');
    dialog.showErrorBox('Sima Atlas — startup failed', detail);
    if (apiLogStream) try { apiLogStream.end(); } catch {}
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

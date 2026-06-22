#!/usr/bin/env node
// R-7.99 (b.desktop A2 + A4 + A5) — structural selftest for the desktop
// extension. Does NOT launch Electron (CI on ubuntu-latest has no display).
// Validates:
//   1. 4 mandatory files exist;
//   2. extensions/desktop/package.json shape (name, version, main, scripts,
//      electron-builder devDep, build.appId);
//   3. main.mjs uses utilityProcess.fork (no system-Node dependency);
//   4. preload.mjs uses contextBridge and NOT nodeIntegration:true;
//   5. root package.json has desktop:dev + desktop:pack scripts;
//   6. .github/workflows/desktop-build.yml builds the three-OS matrix;
//   7. README.md mentions desktop installer / downloads.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const failures = [];
const check = (n, c, d = '') => { if (!c) failures.push(`${n}${d ? ' — ' + d : ''}`); };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const readJson = (rel) => JSON.parse(read(rel));
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

// ── Group 1: mandatory files
const MUST_EXIST = [
  'extensions/desktop/package.json',
  'extensions/desktop/main.mjs',
  'extensions/desktop/preload.mjs',
  'extensions/desktop/README.md',
];
for (const f of MUST_EXIST) check(`g1: ${f} exists`, exists(f));

// ── Group 2: extensions/desktop/package.json shape
{
  const pkg = readJson('extensions/desktop/package.json');
  check('g2: name set', typeof pkg.name === 'string' && pkg.name.length > 0);
  check('g2: version set (semver-ish)', /^\d+\.\d+\.\d+/.test(pkg.version || ''), `version=${pkg.version}`);
  check('g2: main = main.mjs', pkg.main === 'main.mjs');
  check('g2: type = module', pkg.type === 'module');
  check('g2: scripts.start uses electron', /electron/.test(pkg.scripts?.start || ''));
  check('g2: scripts.pack uses electron-builder', /electron-builder/.test(pkg.scripts?.pack || ''));
  check('g2: devDependencies.electron present', !!pkg.devDependencies?.electron);
  check('g2: devDependencies.electron-builder present', !!pkg.devDependencies?.['electron-builder']);
  check('g2: build.appId set (reverse-DNS form)', /^[a-z0-9.-]+\.[a-z0-9]+/.test(pkg.build?.appId || ''), `appId=${pkg.build?.appId}`);
  check('g2: build.mac.target includes dmg', JSON.stringify(pkg.build?.mac || {}).includes('dmg'));
  check('g2: build.win.target includes nsis', JSON.stringify(pkg.build?.win || {}).includes('nsis'));
  check('g2: build.linux.target includes AppImage', JSON.stringify(pkg.build?.linux || {}).includes('AppImage'));
}

// ── Group 3: main.mjs uses utilityProcess (A4 — no system-Node dependency)
{
  const src = read('extensions/desktop/main.mjs');
  check('g3: imports BrowserWindow', /BrowserWindow/.test(src));
  check('g3: uses utilityProcess', /utilityProcess/.test(src),
    'KPI-2: packaged app must not require system Node — use Electron utilityProcess');
  check('g3: spawns atlas_api_server', /atlas_api_server\.mjs/.test(src));
  check('g3: registers app lifecycle (whenReady)', /whenReady/.test(src));
  check('g3: handles window-all-closed', /window-all-closed/.test(src));
}

// ── Group 4: preload.mjs uses contextBridge (A5 — security baseline)
{
  const src = read('extensions/desktop/preload.mjs');
  check('g4: imports contextBridge', /contextBridge/.test(src));
  check('g4: exposes via contextBridge', /contextBridge\s*\.\s*exposeInMainWorld/.test(src));
  check('g4: imports ipcRenderer', /ipcRenderer/.test(src));
  check('g4: does NOT enable nodeIntegration', !/nodeIntegration\s*:\s*true/.test(src),
    'security baseline: nodeIntegration must NOT be true in renderer');
}

// ── Group 5: root package.json scripts
{
  const pkg = readJson('package.json');
  check('g5: desktop:dev script present', typeof pkg.scripts?.['desktop:dev'] === 'string');
  check('g5: desktop:dev points at extensions/desktop',
    /extensions\/desktop/.test(pkg.scripts?.['desktop:dev'] || ''));
  check('g5: desktop:pack script present', typeof pkg.scripts?.['desktop:pack'] === 'string');
}

// ── Group 6: CI workflow builds three OSes (A6)
{
  if (!exists('.github/workflows/desktop-build.yml')) {
    check('g6: workflow file exists', false);
  } else {
    const yml = read('.github/workflows/desktop-build.yml');
    check('g6: macos-latest target', /macos-latest/.test(yml));
    check('g6: windows-latest target', /windows-latest/.test(yml));
    check('g6: ubuntu-latest target', /ubuntu-latest/.test(yml));
    check('g6: triggers on v*.*.* tag push', /v\*\.\*\.\*|tags:/.test(yml));
    check('g6: invokes electron-builder via npm run pack', /npm run pack|electron-builder/.test(yml));
  }
}

// ── Group 7: README mentions desktop installer (A7 — discoverability)
{
  const readme = read('README.md');
  check('g7: README mentions Desktop or installer',
    /Desktop|desktop installer|releases\/latest/.test(readme),
    'A7: README must link/refer to desktop installer for discoverability');
}

// ── Group 8 (PR4 T10): native application menu present
{
  const src = read('extensions/desktop/main.mjs');
  check('g8: Menu.buildFromTemplate or Menu.setApplicationMenu present',
    /Menu\.buildFromTemplate|Menu\.setApplicationMenu/.test(src),
    'PR4 T10: native menu is the whole point of «no terminal needed»');
  check('g8: menu defines File submenu', /label:\s*['"]File['"]/.test(src));
  check('g8: menu defines Run submenu (Verify/Generate/V-1)', /label:\s*['"]Run['"]/.test(src));
  check('g8: at least one hotkey accelerator', /accelerator:\s*['"]CmdOrCtrl/.test(src));
  check('g8: each menu action audited via /atlas/checks/append', /\/atlas\/checks\/append/.test(src),
    'PR4 T10 + T8: desktop actions must land in the same checks.log as CLI');
}

// ── Group 9 (PR4 T11): electron-updater wired up
{
  const src = read('extensions/desktop/main.mjs');
  check('g9: dynamic import of electron-updater', /import\s*\(\s*['"]electron-updater['"]\s*\)/.test(src),
    'PR4 T11: lazy-import so dev tree runs without it installed; packaged tree has it');
  check('g9: autoUpdater handle held', /autoUpdater\s*=/.test(src));
  check('g9: checkForUpdates entry point', /checkForUpdates\(\)/.test(src));
  check('g9: skipped in dev (app.isPackaged guard)', /isPackaged/.test(src),
    'no-op in dev — there is no installed app to update');
}

// ── Group 10: electron-updater is a real (not dev) dependency in package.json
{
  const pkg = readJson('extensions/desktop/package.json');
  check('g10: electron-updater listed under dependencies (runtime, not devDep)',
    !!pkg.dependencies?.['electron-updater'],
    'electron-updater is needed in the packaged tree, so it must be a runtime dep');
  // electron and electron-builder stay as devDeps (build-time only).
}

// ── Group 11 (PR4 T12): project picker IPC surface in main.mjs
{
  const src = read('extensions/desktop/main.mjs');
  check('g11: desktop:list-projects handler',   /ipcMain\.handle\(['"]desktop:list-projects['"]/.test(src));
  check('g11: desktop:create-project handler',  /ipcMain\.handle\(['"]desktop:create-project['"]/.test(src));
  check('g11: desktop:open-project handler',    /ipcMain\.handle\(['"]desktop:open-project['"]/.test(src));
  check('g11: project name validator (whitelist regex)',
    /isSafeProjectName/.test(src) && /\^\[a-zA-Z0-9/.test(src),
    'T12: project name MUST be validated against a tight whitelist — path-traversal safety');
  check('g11: open-project enforces sandbox (bundled OR SimaProjects/)',
    /withinProjects|PROJECTS_DIR/.test(src),
    'T12: open-project must refuse arbitrary filesystem paths');
  check('g11: File menu opens picker via webContents.send', /sima:open-project-picker/.test(src));
}

// ── Group 12 (PR4 T12): preload exposes project picker bridge
{
  const src = read('extensions/desktop/preload.mjs');
  check('g12: listProjects exposed',  /listProjects:/.test(src));
  check('g12: createProject exposed', /createProject:/.test(src));
  check('g12: openProject exposed',   /openProject:/.test(src));
  check('g12: onOpenProjectPicker subscription bridge',
    /onOpenProjectPicker/.test(src) && /removeListener/.test(src),
    'T12: must expose a subscribe + unsubscribe pair so React effects can clean up');
}

// ── Group 14 (release-prep): proper-sized OS-specific icons exist.
// electron-builder is strict about formats — macOS needs ≥1024×1024 square
// PNG (or ICNS), Windows wants a multi-resolution .ico, Linux takes any PNG.
// Without these, the first CI tag-push will fail or ship a stretched/blurry
// app icon.
{
  check('g14: icon.png (mac + linux) exists',  exists('extensions/desktop/assets/icon.png'));
  check('g14: icon.ico (windows) exists',      exists('extensions/desktop/assets/icon.ico'));
  const pkg = readJson('extensions/desktop/package.json');
  check('g14: mac.icon points at assets/icon.png',
    pkg.build?.mac?.icon === 'assets/icon.png',
    `mac.icon=${pkg.build?.mac?.icon}`);
  check('g14: win.icon points at assets/icon.ico',
    pkg.build?.win?.icon === 'assets/icon.ico',
    `win.icon=${pkg.build?.win?.icon}`);
  check('g14: linux.icon points at assets/icon.png',
    pkg.build?.linux?.icon === 'assets/icon.png',
    `linux.icon=${pkg.build?.linux?.icon}`);
}

// ── Group 13 (PR4 T12): renderer-side modal exists + wired into index.html
{
  check('g13: project_picker.jsx exists', exists('frontend/atlas_design/project_picker.jsx'));
  if (exists('frontend/atlas_design/project_picker.jsx')) {
    const src = read('frontend/atlas_design/project_picker.jsx');
    check('g13: exports ProjectPickerModal globally',
      /SIMA_PROJECT_PICKER/.test(src) && /ProjectPickerModal/.test(src));
    check('g13: subscribe helper present', /function subscribe|subscribe:/.test(src));
    check('g13: calls window.sima APIs (Electron-only)',
      /sima\.listProjects|sima\.openProject|sima\.createProject/.test(src),
      'T12 modal must use the Electron preload bridge; silently no-ops in a plain browser');
  }
  const html = read('frontend/atlas_design/index.html');
  check('g13: index.html loads project_picker.jsx', /project_picker\.jsx/.test(html));
  check('g13: App mounts ProjectPickerModal', /SIMA_PROJECT_PICKER\.ProjectPickerModal/.test(html));
}

// ── Group 15 (R-8.04 / v0.4.3): the packaged app MUST ship scripts/,
// frontend/, atlas/. v0.4.2 failed at launch because the old
// `files: ["../../scripts/**"]` glob silently dropped out-of-app-dir
// files, so the installed app had no API server to fork. The fix routes
// them through electron-builder `extraResources` (deterministic
// `process.resourcesPath`). Guard that the payload declarations stay put.
{
  const pkg = readJson('extensions/desktop/package.json');
  const er = pkg.build?.extraResources;
  check('g15: build.extraResources is an array', Array.isArray(er),
    'v0.4.2 regression: packaged app must bundle scripts/frontend/atlas as resources');
  if (Array.isArray(er)) {
    const tos = er.map((e) => (typeof e === 'string' ? e : e.to || e.from || ''));
    const froms = er.map((e) => (typeof e === 'object' ? e.from || '' : ''));
    check('g15: ships scripts/ (from ../../scripts)',
      froms.some((f) => /(^|\/)scripts$/.test(f)) || tos.some((t) => /scripts/.test(t)),
      'API server lives in scripts/ — without it the app cannot boot');
    check('g15: ships frontend/', froms.some((f) => /frontend/.test(f)) || tos.some((t) => /frontend/.test(t)));
    check('g15: ships atlas/',    froms.some((f) => /atlas/.test(f))    || tos.some((t) => /atlas/.test(t)));
  }
  // The `files` array must NOT reuse the broken ../../ out-of-dir globs.
  const filesArr = pkg.build?.files || [];
  check('g15: build.files has no ../../ out-of-app-dir globs',
    !filesArr.some((f) => typeof f === 'string' && f.includes('../../')),
    'out-of-app-dir files belong in extraResources, not files[] (silent-drop bug)');
}

// ── Group 16 (R-8.04 / v0.4.3): main.mjs resolves the repo root robustly
// and seeds a writable atlas — the three things that broke packaged boot.
{
  const src = read('extensions/desktop/main.mjs');
  check('g16: detectRepoRoot probes for marker file', /detectRepoRoot/.test(src) && /atlas_api_server\.mjs/.test(src),
    'must not hardcode ../../ — probe candidates incl. process.resourcesPath');
  check('g16: considers process.resourcesPath', /process\.resourcesPath/.test(src),
    'packaged extraResources land under resourcesPath');
  check('g16: seeds a writable atlas (userData)', /ensureWritableAtlas/.test(src) && /getPath\(['"]userData['"]\)/.test(src),
    'bundled atlas is read-only under Program Files / Applications');
  check('g16: writes an api log for diagnostics', /api\.log/.test(src),
    'packaged Electron has no console — crashes must hit a log file');
}

if (failures.length) {
  console.error('desktop_structure.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('desktop_structure.selftest: OK (16 test groups, all assertions green)');

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

if (failures.length) {
  console.error('desktop_structure.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('desktop_structure.selftest: OK (7 test groups, all assertions green)');

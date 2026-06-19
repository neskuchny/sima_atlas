# Sima Atlas — Desktop App

Electron-based installable wrapper around the Sima Atlas browser UI. Lets
operators install the system as a regular program (.dmg / .exe / .AppImage)
and run it without a terminal.

**Block contract:** [`atlas/blocks/b.desktop/`](../../atlas/blocks/b.desktop/).
Read mission.md and kpi.md first — this README is the developer entry, the
contract is the canon.

## What it does

- Bundles Electron's Node runtime so the installed app has **no system
  Node prerequisite** (KPI-2).
- Spawns `scripts/atlas_api_server.mjs` via Electron's `utilityProcess`,
  picks free ports, opens a native window once both ports respond.
- Exposes a minimal IPC bridge under `window.sima` (project picker, reveal
  in finder, V-1 launcher); everything else stays out of renderer reach
  per Electron security baseline.

## What's NOT in this MVP yet

Per `tasks.md`:

- PR4 — native application menu + global hotkeys + `electron-updater`.
- PR5 — Apple Developer ID notarization + Windows code-signing certs
  (operator responsibility, not code).

The current build runs locally and packages unsigned installers. Users will
click through one Gatekeeper / SmartScreen warning on first launch.

## Run locally (during development)

```bash
# from the REPO ROOT, not extensions/desktop:
npm run desktop:dev
```

That cd's into `extensions/desktop`, runs `npm install` if needed
(downloads Electron — ~80 MB the first time), then `npm start`.

## Build installers locally

```bash
cd extensions/desktop
npm install
npm run pack          # current OS only
npm run pack:mac      # if on macOS
npm run pack:win      # if on Windows (or cross-compile via wine)
npm run pack:linux
```

Output lands in `extensions/desktop/dist/`.

## Build installers via CI

`.github/workflows/desktop-build.yml` runs on every `v*.*.*` tag push and
attaches the three-OS artefacts to the corresponding GitHub Release.

## Security model

Standard Electron post-12 baseline:

- `contextIsolation: true` — renderer's JavaScript world is separated from
  the preload's;
- `nodeIntegration: false` — renderer cannot `require()` Node modules
  directly;
- `sandbox: false` (preload uses ESM imports);
- preload exposes ONLY `window.sima.{openProjectPicker,revealInFinder,triggerV1}`
  via `contextBridge`. Anything else is unavailable to the page.

## Selftest

```bash
node tests/desktop_structure.selftest.mjs
```

Validates structure + `package.json` shape + security defaults. Does NOT
launch Electron — CI on `ubuntu-latest` has no display. Real smoke (window
actually opens, canvas renders) is manual when the operator cuts a release.

## Why Electron, not Tauri

See [`atlas/blocks/b.desktop/narrative.md`](../../atlas/blocks/b.desktop/narrative.md)
for the trade-off log: 80 MB cost accepted for native Node + mature
auto-updater + zero rewrite of the existing browser UI.

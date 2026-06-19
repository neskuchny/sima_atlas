// R-7.99 (b.desktop PR1 + PR4) — preload script for Sima Atlas Desktop.
//
// Security baseline: contextIsolation:true, nodeIntegration:false. The
// renderer (= our existing browser UI) cannot reach Node or Electron APIs
// directly. This preload is the ONLY surface — we expose a tiny, audited
// IPC bridge under window.sima (matched by A5 in atlas/blocks/b.desktop/
// acceptance.md).
//
// PR4 adds menu-mirror IPC channels so the browser-side canvas can trigger
// the same actions the native menu does (Verify All, Generate Bundle, V-1).
// These are pull-only — the renderer asks main, main runs the script via
// utilityProcess and reports back. Audit-trail goes to checks.log via the
// T8 endpoint, not a separate UI log.

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('sima', {
  // PR1 — basic surface
  openProjectPicker: () => ipcRenderer.invoke('desktop:open-project-picker'),
  revealInFinder: (absolutePath) => ipcRenderer.invoke('desktop:reveal-in-finder', absolutePath),
  triggerV1: () => ipcRenderer.invoke('desktop:trigger-v1'),

  // PR4 — menu-mirror IPC: same actions the native menu fires, also
  // available to UI buttons. The main process runs each script via
  // utilityProcess (bundled Node), posts the result to /atlas/checks/append
  // so the desktop session's audit-trail merges with the CLI one.
  verifyAll:       () => ipcRenderer.invoke('desktop:run-script', 'verify-all'),
  generateBundle:  () => ipcRenderer.invoke('desktop:run-script', 'generate-bundle'),
  v1DryRun:        () => ipcRenderer.invoke('desktop:run-script', 'v1-dry-run'),
  tokenEconomics:  () => ipcRenderer.invoke('desktop:run-script', 'token-economics'),

  // PR4 — auto-update controls.
  checkForUpdates: () => ipcRenderer.invoke('desktop:check-for-updates'),

  // PR4 T12 — project picker. List / create / open projects living under
  // ~/SimaProjects/. Open swaps the API server's ATLAS_ROOT and reloads
  // the renderer (which is us — main does the loadURL).
  listProjects:   ()                  => ipcRenderer.invoke('desktop:list-projects'),
  createProject:  (name)              => ipcRenderer.invoke('desktop:create-project', name),
  openProject:    (atlasPath)         => ipcRenderer.invoke('desktop:open-project', atlasPath),

  // PR4 T12 — main pushes a «show project picker» event when the user
  // clicks File → Open Project. The renderer mounts <ProjectPickerModal />
  // in response. Returns an unsubscribe function so React effects can
  // clean up.
  onOpenProjectPicker: (cb) => {
    const handler = () => cb();
    ipcRenderer.on('sima:open-project-picker', handler);
    return () => ipcRenderer.removeListener('sima:open-project-picker', handler);
  },
});

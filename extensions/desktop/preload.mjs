// R-7.99 (b.desktop PR1) — preload script for Sima Atlas Desktop.
//
// Security baseline: contextIsolation:true, nodeIntegration:false. The
// renderer (= our existing browser UI) cannot reach Node or Electron APIs
// directly. This preload is the ONLY surface — we expose a tiny, audited
// IPC bridge under window.sima (matched by A5 in atlas/blocks/b.desktop/
// acceptance.md).

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('sima', {
  // Open a folder picker dialog. Returns the absolute path of the chosen
  // directory or null if the user cancelled. Used by the (future) project
  // picker UI in the renderer.
  openProjectPicker: () => ipcRenderer.invoke('desktop:open-project-picker'),

  // Show a file/dir in the OS file manager (Finder / Explorer / Nautilus).
  revealInFinder: (absolutePath) => ipcRenderer.invoke('desktop:reveal-in-finder', absolutePath),

  // Launch one iteration of the V-1 autonomous loop (print-only by default).
  // PR4 will swap this for a richer settings dialog.
  triggerV1: () => ipcRenderer.invoke('desktop:trigger-v1'),
});

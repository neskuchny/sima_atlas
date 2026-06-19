# b.desktop — narrative

## 2026-06-19T19:30:00Z · block scoped — Electron over Tauri (R-7.99)

### What I tried
Carved the «installable program» surface out of `b.ui-control` into its own
block. Two reasonable runtimes considered: Electron (Chromium + Node bundled)
and Tauri (system webview + Rust shell). Both can wrap our existing browser
UI without rewrites.

### What worked — Electron picked
Electron, for three concrete reasons:

- We already have a Node backend (`atlas_api_server.mjs` + V-1 daemon +
  ~70 MCP scripts). Electron natively holds Node main process — we spawn
  our scripts as utility processes with zero rewrite. Tauri would need a
  Node sidecar binary (via `pkg`/`nexe`), adding a packaging layer and a
  failure mode.
- The UI is plain HTML + React via babel-standalone, no bundler. Electron's
  BrowserWindow loads `http://127.0.0.1:<port>/atlas_design/` — same URL as
  `npm run dev`, no build step needed.
- electron-builder ships battle-tested cross-OS installer pipelines + an
  auto-updater that integrates with GitHub Releases. The Tauri equivalent
  is younger and less documented for our scenario.

Trade-off accepted: Electron is ~80 MB heavier than Tauri (Chromium runtime).
For an «install and forget» power-user tool this is fine; for a consumer
app where size is part of the brand promise it would matter.

### What failed and why
Considered shipping a system-tray helper (Squirrel-style) that just opens a
browser to localhost. Rejected: defeats the whole point — the operator still
sees a browser tab, not a native app. The point of T8 (T1 in this block) is
that the operator never opens a browser themselves.

### Decisions made
- Layer: `ext` (external integrator — wraps our product without modifying
  it). Not `front` — that's reserved for our actual frontend code.
- MVP scope: PR1 (skeleton + working `npm run desktop:dev`) + PR2 (selftest +
  nightly) + PR3 (CI three-OS matrix). PR4 (native menu, auto-update) and
  PR5 (signing) are post-MVP — explicit in tasks.md.
- Use Electron's `utilityProcess.fork` for `atlas_api_server.mjs` rather
  than spawning external Node — packaged app must not depend on system Node
  being installed (KPI-2).
- Selftest must work in headless CI (no display server). Validates structure
  + file shapes, not running app. Real smoke is manual on three OSes when
  the operator cuts a release.

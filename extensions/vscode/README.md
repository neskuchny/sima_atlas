# Sima Atlas — VS Code extension

Embeds the Sima Atlas canvas into a side panel and adds a Blocks tree view
that lists every block in `atlas/graph.json` with one-click navigation to
the block's `mission.md`.

**This is a 0.1 scaffold.** Full features (inline contract editing, status
badges, agent run controls inside VS Code) are roadmap items — see
[CONTRIBUTING.md](../../CONTRIBUTING.md). PRs welcome.

## What you get

- **Activity Bar item** with a graph icon → opens the Sima Atlas side panel
- **Canvas webview** — embeds the running canvas UI (`http://localhost:8000/...`)
  inside a side panel. Same React tree as the browser, just hosted in VS Code
- **Blocks tree** — every top-level block in your active client's
  `graph.json`, with submodules expandable; double-click opens
  `mission.md` in the editor
- **Commands** (⌘⇧P / Ctrl+Shift+P):
  - `Sima Atlas: Open Canvas`
  - `Sima Atlas: Start Dev Server` (runs `npm run dev:nobrowser` in a
    terminal, then refreshes the canvas)
  - `Sima Atlas: Refresh Blocks`
  - `Sima Atlas: Open Block Contract`

## Settings

| Setting | Default | What it does |
|---|---|---|
| `simaAtlas.apiUrl` | `http://localhost:8787` | Sima API server URL |
| `simaAtlas.uiUrl` | `http://localhost:8000/atlas_design/index.html` | Canvas UI URL embedded in the webview |
| `simaAtlas.client` | `example` | Which `?client=<id>` to load (use `main` for Sima describing herself) |
| `simaAtlas.atlasRoot` | _(autodetect)_ | Path to `atlas/` folder; falls back to `<workspace>/atlas/` |

## Usage

1. Open the `sima_atlas` repo as a VS Code workspace.
2. Run `Sima Atlas: Start Dev Server` from the palette (or hit ▶ in the
   canvas view).
3. Click the graph icon in the Activity Bar.
4. Browse blocks in the tree on the left; the canvas appears at the top
   of the side panel. Click any block in the tree to open its `mission.md`.

## Build & install locally

```bash
cd extensions/vscode
npm install -g @vscode/vsce
vsce package           # produces sima-atlas-0.1.0.vsix
code --install-extension sima-atlas-0.1.0.vsix
```

Or use the VS Code "Install from VSIX..." menu.

## Roadmap

- Status badges in the tree (idea / progress / done / broken) with colors
- Inline edit of mission/kpi/acceptance via webview forms (today: edit as
  plain markdown in the editor)
- Run-block button per block in the tree (calls `/runs/start`)
- Live activity-log feed in a separate view (consumes `/atlas/state` polling)
- "Open in Sima" code lens above any file referenced from `files.md`

Contributions welcome — see [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

MIT — same as the parent repo.

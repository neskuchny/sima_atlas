// Sima Atlas — VS Code extension
//
// MVP scaffold (Phase R-7.61). What this gives you:
//   1. "Sima Atlas" view container in the activity bar (graph icon).
//   2. Canvas webview that embeds the running canvas UI (npm run dev) in
//      a side panel — same React tree as the browser, just hosted in
//      VS Code.
//   3. Blocks tree view that lists every block in atlas/graph.json with
//      mission preview; double-click opens the block's mission.md in the
//      editor.
//   4. Commands: Open Canvas / Start Dev Server / Refresh Blocks / Open
//      Block Contract.
//
// What's NOT here yet (left for PRs):
//   - Inline editing of mission/kpi/acceptance via webview forms (today
//     you edit them as plain markdown in the editor).
//   - Status badges in the tree (idea / progress / done) — needs polling
//     /atlas/state.
//   - Direct integration with Claude Code / Cursor inside VS Code — they
//     run side-by-side; Sima provides MCP, IDE-extension provides nav.
//
// To build & install locally:
//   cd extensions/vscode
//   npm install -g @vscode/vsce
//   vsce package
//   code --install-extension sima-atlas-0.1.0.vsix

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

let canvasWebviewProvider;
let blocksTreeProvider;
let devServerTerminal;

function activate(context) {
  canvasWebviewProvider = new CanvasWebviewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('sima-atlas.canvas', canvasWebviewProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  blocksTreeProvider = new BlocksTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('sima-atlas.blocks', blocksTreeProvider),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sima-atlas.openCanvas', () => {
      vscode.commands.executeCommand('workbench.view.extension.sima-atlas');
    }),
    vscode.commands.registerCommand('sima-atlas.refreshBlocks', () => {
      blocksTreeProvider.refresh();
    }),
    vscode.commands.registerCommand('sima-atlas.startDevServer', () => {
      const root = workspaceRoot();
      if (!root) {
        vscode.window.showErrorMessage('Sima Atlas: no workspace folder open. Open the sima_atlas repo first.');
        return;
      }
      if (devServerTerminal && devServerTerminal.exitStatus === undefined) {
        devServerTerminal.show();
        return;
      }
      devServerTerminal = vscode.window.createTerminal({ name: 'Sima Atlas dev', cwd: root });
      devServerTerminal.sendText('npm run dev:nobrowser');
      devServerTerminal.show();
      // Reload canvas after server has time to bind
      setTimeout(() => canvasWebviewProvider?.reload(), 4000);
    }),
    vscode.commands.registerCommand('sima-atlas.openBlockContract', async (item) => {
      if (!item || !item.blockId) return;
      const root = atlasRoot();
      if (!root) return;
      // Try clients/<client>/blocks/<id>/mission.md first, then root blocks/.
      const client = vscode.workspace.getConfiguration('simaAtlas').get('client') || 'example';
      const candidates = [
        path.join(root, 'clients', client, 'blocks', item.blockId, 'mission.md'),
        path.join(root, 'blocks', item.blockId, 'mission.md'),
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const doc = await vscode.workspace.openTextDocument(p);
          await vscode.window.showTextDocument(doc, { preview: false });
          return;
        }
      }
      vscode.window.showWarningMessage(`Sima Atlas: mission.md not found for ${item.blockId}`);
    }),
  );

  // Surface a one-time tip on first install
  const isFirstRun = !context.globalState.get('sima.firstRunDone');
  if (isFirstRun) {
    context.globalState.update('sima.firstRunDone', true);
    vscode.window.showInformationMessage(
      'Sima Atlas extension installed. Click the graph icon in the Activity Bar; if the canvas is blank, run `Sima Atlas: Start Dev Server`.',
      'Open Canvas',
    ).then((choice) => {
      if (choice === 'Open Canvas') vscode.commands.executeCommand('sima-atlas.openCanvas');
    });
  }
}

function deactivate() {
  if (devServerTerminal && devServerTerminal.exitStatus === undefined) {
    devServerTerminal.dispose();
  }
}

// ─────────────────────────────────────────────────────────── helpers

function workspaceRoot() {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || null;
}

function atlasRoot() {
  const cfg = vscode.workspace.getConfiguration('simaAtlas').get('atlasRoot');
  if (cfg) return cfg;
  const root = workspaceRoot();
  if (!root) return null;
  const candidate = path.join(root, 'atlas');
  return fs.existsSync(candidate) ? candidate : null;
}

function readGraph() {
  const root = atlasRoot();
  if (!root) return null;
  const client = vscode.workspace.getConfiguration('simaAtlas').get('client') || 'example';
  const candidates = [
    path.join(root, 'clients', client, 'graph.json'),
    path.join(root, 'graph.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try { return { graph: JSON.parse(fs.readFileSync(p, 'utf8')), source: p, client }; }
      catch { return null; }
    }
  }
  return null;
}

// ─────────────────────────────────────────── canvas webview (embeds UI)

class CanvasWebviewProvider {
  constructor(context) { this.context = context; this._view = null; }

  reload() { if (this._view) this._view.webview.html = this._html(); }

  resolveWebviewView(webviewView) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this._html();
  }

  _html() {
    const cfg = vscode.workspace.getConfiguration('simaAtlas');
    const uiBase = cfg.get('uiUrl') || 'http://localhost:8000/atlas_design/index.html';
    const client = cfg.get('client') || 'example';
    const url = `${uiBase}?client=${encodeURIComponent(client)}`;
    return /* html */ `<!doctype html>
<html><head><meta charset="utf-8" />
<style>
  html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; }
  body { background: #fafaf7; color: #1a1a1a; font-family: -apple-system, system-ui, sans-serif; }
  iframe { width: 100%; height: 100%; border: 0; }
  .empty { padding: 24px; line-height: 1.5; font-size: 13px; }
  .empty code { background: rgba(0,0,0,0.06); padding: 2px 5px; border-radius: 3px; font-family: ui-monospace, monospace; }
  .empty button { margin-top: 12px; padding: 6px 12px; cursor: pointer; }
</style></head>
<body>
  <iframe src="${url}" id="frame"
    onerror="document.getElementById('msg').style.display='block';document.getElementById('frame').style.display='none'"></iframe>
  <div id="msg" class="empty" style="display:none">
    <strong>Canvas not reachable.</strong>
    <p>The dev server isn't running. Open a terminal and start it:</p>
    <p><code>npm run dev:nobrowser</code></p>
    <p>or run command <code>Sima Atlas: Start Dev Server</code> from the palette (⌘⇧P).</p>
  </div>
</body></html>`;
  }
}

// ────────────────────────────────────────────── blocks tree (graph.json)

class BlocksTreeProvider {
  constructor() {
    this._onDidChange = new vscode.EventEmitter();
    this.onDidChangeTreeData = this._onDidChange.event;
  }

  refresh() { this._onDidChange.fire(); }

  getTreeItem(el) {
    const item = new vscode.TreeItem(el.label, el.children?.length ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
    item.description = el.description || '';
    item.tooltip = el.tooltip || '';
    item.contextValue = el.contextValue || '';
    item.blockId = el.blockId;
    if (el.iconId) item.iconPath = new vscode.ThemeIcon(el.iconId);
    if (el.command) item.command = el.command;
    return item;
  }

  getChildren(el) {
    if (!el) {
      const result = readGraph();
      if (!result) return [{ label: 'No atlas/ found', description: 'open the sima_atlas repo as workspace', iconId: 'warning' }];
      const { graph, client } = result;
      const blocks = (graph.blocks || []).filter((b) => !b.parent_block_id);
      if (!blocks.length) return [{ label: `client=${client} · empty`, iconId: 'info' }];
      return blocks.map((b) => this._blockEntry(b, graph));
    }
    if (el.blockId) {
      const result = readGraph();
      if (!result) return [];
      const children = (result.graph.blocks || []).filter((b) => b.parent_block_id === el.blockId);
      return children.map((b) => this._blockEntry(b, result.graph));
    }
    return [];
  }

  _blockEntry(b, graph) {
    const childCount = (graph.blocks || []).filter((c) => c.parent_block_id === b.id).length;
    const layerIcon = ({
      backend: 'database',
      frontend: 'browser',
      logic: 'symbol-method',
      tests: 'beaker',
    })[b.layer] || 'symbol-class';
    return {
      label: b.title || b.id,
      description: `${b.id} · ${b.layer || 'logic'} · ${b.status || 'idea'}`,
      tooltip: `${b.id}\n${b.title || ''}\nLayer: ${b.layer}\nStatus: ${b.status}`,
      iconId: layerIcon,
      contextValue: 'block',
      blockId: b.id,
      children: childCount ? Array(childCount) : [], // length triggers collapse-state
      command: {
        command: 'sima-atlas.openBlockContract',
        title: 'Open contract',
        arguments: [{ blockId: b.id }],
      },
    };
  }
}

module.exports = { activate, deactivate };

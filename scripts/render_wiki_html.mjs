#!/usr/bin/env node
// PR2: HTML wiki renderer with mermaid + code-fence support
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const mdPath = path.join(atlas, 'WIKI.md');
const outPath = path.join(atlas, 'wiki.html');

const md = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : '# Empty Wiki\n';

function esc(s) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function inline(text) {
  // **bold** → <strong>
  let s = esc(text)
    .replaceAll(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replaceAll(/`([^`]+)`/g, '<code>$1</code>')
    .replaceAll(/_([^_]+)_/g, '<em>$1</em>');
  return s;
}

const htmlLines = [];
let inList = false;
let inFence = false;
let fenceLang = '';
let fenceBuf = [];

function flushList() {
  if (inList) { htmlLines.push('</ul>'); inList = false; }
}

const lines = md.split(/\r?\n/);
for (const raw of lines) {
  // Code fence open/close
  if (raw.startsWith('```')) {
    if (!inFence) {
      inFence = true;
      fenceLang = raw.slice(3).trim();
      fenceBuf = [];
    } else {
      // Close fence
      if (fenceLang === 'mermaid') {
        flushList();
        htmlLines.push(`<div class="mermaid">${esc(fenceBuf.join('\n'))}</div>`);
      } else {
        flushList();
        htmlLines.push(`<pre><code class="lang-${esc(fenceLang)}">${esc(fenceBuf.join('\n'))}</code></pre>`);
      }
      inFence = false;
      fenceLang = '';
      fenceBuf = [];
    }
    continue;
  }
  if (inFence) { fenceBuf.push(raw); continue; }

  if (raw.startsWith('---')) { flushList(); htmlLines.push('<hr/>'); continue; }
  if (raw.startsWith('#### ')) { flushList(); htmlLines.push(`<h4>${inline(raw.slice(5))}</h4>`); continue; }
  if (raw.startsWith('### ')) { flushList(); htmlLines.push(`<h3>${inline(raw.slice(4))}</h3>`); continue; }
  if (raw.startsWith('## ')) { flushList(); htmlLines.push(`<h2>${inline(raw.slice(3))}</h2>`); continue; }
  if (raw.startsWith('# ')) { flushList(); htmlLines.push(`<h1>${inline(raw.slice(2))}</h1>`); continue; }
  if (raw.startsWith('- ')) {
    if (!inList) { htmlLines.push('<ul>'); inList = true; }
    htmlLines.push(`<li>${inline(raw.slice(2))}</li>`);
    continue;
  }
  if (raw.startsWith('  - ')) {
    htmlLines.push(`<ul><li>${inline(raw.slice(4))}</li></ul>`);
    continue;
  }
  if (!raw.trim()) { flushList(); continue; }
  htmlLines.push(`<p>${inline(raw)}</p>`);
}
flushList();
if (inFence) htmlLines.push('<pre>' + esc(fenceBuf.join('\n')) + '</pre>');

const page = `<!doctype html>
<html lang="ru"><head>
<meta charset="utf-8"/>
<title>Atlas Wiki</title>
<style>
  body{font-family:Inter,system-ui,sans-serif;max-width:1080px;margin:24px auto;padding:0 16px;line-height:1.55;color:#1f2937}
  h1,h2,h3,h4{line-height:1.25;color:#111827}
  h1{border-bottom:2px solid #e5e7eb;padding-bottom:.4em}
  h2{border-bottom:1px solid #e5e7eb;padding-bottom:.3em;margin-top:2em}
  code{background:#f4f4f5;padding:1px 6px;border-radius:4px;font-size:.92em}
  pre{background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:12px;overflow:auto}
  .mermaid{background:#fff;border:1px solid #e2e8f0;border-radius:6px;padding:16px;margin:1em 0}
  hr{border:0;border-top:1px solid #e5e7eb;margin:2em 0}
  ul{padding-left:1.4em}
</style>
</head><body>
${htmlLines.join('\n')}
<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
<script>
  if (window.mermaid) mermaid.initialize({ startOnLoad: true, theme: 'default', flowchart: { htmlLabels: true } });
</script>
</body></html>
`;

fs.writeFileSync(outPath, page, 'utf8');
console.log(`Rendered ${outPath}`);

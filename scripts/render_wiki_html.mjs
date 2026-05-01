#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const mdPath = path.join(atlas, 'WIKI.md');
const outPath = path.join(atlas, 'wiki.html');

const md = fs.existsSync(mdPath) ? fs.readFileSync(mdPath, 'utf8') : '# Empty Wiki\n';

function esc(s){ return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }
function lineToHtml(line){
  if (line.startsWith('### ')) return `<h3>${esc(line.slice(4))}</h3>`;
  if (line.startsWith('## ')) return `<h2>${esc(line.slice(3))}</h2>`;
  if (line.startsWith('# ')) return `<h1>${esc(line.slice(2))}</h1>`;
  if (line.startsWith('- ')) return `<li>${esc(line.slice(2))}</li>`;
  if (!line.trim()) return '';
  return `<p>${esc(line)}</p>`;
}

const htmlLines = [];
let inList = false;
for (const raw of md.split(/\r?\n/)){
  const h = lineToHtml(raw);
  if (h.startsWith('<li>')) {
    if (!inList){ htmlLines.push('<ul>'); inList = true; }
    htmlLines.push(h);
  } else {
    if (inList){ htmlLines.push('</ul>'); inList = false; }
    if (h) htmlLines.push(h);
  }
}
if (inList) htmlLines.push('</ul>');

const page = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"/><title>Atlas Wiki</title>
<style>body{font-family:Inter,system-ui,sans-serif;max-width:980px;margin:24px auto;padding:0 16px;line-height:1.5}h1,h2,h3{line-height:1.25}code{background:#f4f4f5;padding:1px 4px;border-radius:4px}</style>
</head><body>
${htmlLines.join('\n')}
</body></html>\n`;

fs.writeFileSync(outPath, page, 'utf8');
console.log(`Rendered ${outPath}`);

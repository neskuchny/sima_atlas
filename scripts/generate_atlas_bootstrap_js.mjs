#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));

const projects = [{
  id: 'atlas-live',
  name: 'Atlas Live Project',
  created: new Date().toISOString().slice(0,10),
  owner: 'Cursor/Codex/Claude',
}];

const arch = {
  'atlas-live': {
    blocks: (graph.blocks || []).map((b, i) => ({
      id: b.id,
      title: b.title,
      status: b.status,
      owner: 'atlas',
      x: 120 + (i % 4) * 220,
      y: 120 + Math.floor(i / 4) * 160,
    })),
    links: (graph.blocks || []).flatMap((b) => (b.depends_on || []).map((d) => ({ from: b.id, to: d, type: 'depends' }))),
  }
};

const payload = { data: { projects }, archByProject: arch };
const outPath = path.join(root, 'Sima (Remix)', 'atlas_bootstrap.js');
const text = `window.SIMA_BOOTSTRAP = ${JSON.stringify(payload, null, 2)};\n`;
fs.writeFileSync(outPath, text, 'utf8');
console.log(`Generated ${outPath}`);

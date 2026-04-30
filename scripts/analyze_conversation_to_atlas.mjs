#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const [,, inputPath] = process.argv;
if (!inputPath) {
  console.error('Usage: node scripts/analyze_conversation_to_atlas.mjs <conversation_json_path>');
  process.exit(1);
}

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const graphPath = path.join(atlas, 'graph.json');
const payload = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const text = String(payload.text || '').trim();
if (!text) {
  console.error('Empty conversation text');
  process.exit(2);
}

const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const blocks = graph.blocks || [];

const matches = [...text.matchAll(/(?:block|блок\p{L}*)\s+([a-z0-9._-]+)/giu)].map(m => m[1]);
const inferred = new Set(matches);
if (!inferred.size) {
  console.log('semantic_ingestion: no block ids detected');
  process.exit(0);
}

const statusMap = ['idea','wip','review','done','drift','broken'];
const requestedStatus = statusMap.find(s => new RegExp(`\\b${s}\\b`, 'i').test(text));

function ensureBlock(id) {
  let b = blocks.find(x => x.id === id);
  if (!b) {
    b = { id, title: `Auto: ${id}`, status: 'idea', depends_on: [] };
    blocks.push(b);
  }
  return b;
}

for (const id of inferred) {
  const b = ensureBlock(id);
  if (requestedStatus) b.status = requestedStatus;
  const dir = path.join(atlas, 'blocks', id);
  fs.mkdirSync(dir, { recursive: true });
  const missionPath = path.join(dir, 'mission.md');
  const tasksPath = path.join(dir, 'tasks.md');
  const checksPath = path.join(dir, 'checks.log');
  const now = new Date().toISOString();

  if (!fs.existsSync(missionPath)) {
    fs.writeFileSync(missionPath, `# ${id} — mission\n\nАвтосоздано из смыслов диалога.\n`, 'utf8');
  }
  if (!fs.existsSync(tasksPath)) {
    fs.writeFileSync(tasksPath, `# ${id} — tasks\n\n- [ ] semantic-refine: подтвердить автогенерацию из диалога\n`, 'utf8');
  } else if (!fs.readFileSync(tasksPath, 'utf8').includes('semantic-refine')) {
    fs.appendFileSync(tasksPath, `\n- [ ] semantic-refine: подтвердить автогенерацию из диалога\n`, 'utf8');
  }
  fs.appendFileSync(checksPath, `${now}\tsemantic_ingestion\tpass\tconversation mapped to ${id}\n`, 'utf8');
}

graph.blocks = blocks;
fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2) + '\n', 'utf8');
console.log(`semantic_ingestion: updated ${inferred.size} blocks`);

import fs from 'node:fs';
import path from 'node:path';

const [,, cmd, blockId, ...rest] = process.argv;
if (!cmd || !blockId) {
  console.error('Usage: node scripts/manage_block.mjs <init|set-status|set-mission> <blockId> [args]');
  process.exit(1);
}

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const graphPath = path.join(atlas, 'graph.json');
const blocksDir = path.join(atlas, 'blocks');
const graph = JSON.parse(fs.readFileSync(graphPath,'utf8'));

function ensureBlockInGraph(id){
  let b = graph.blocks.find(x => x.id===id);
  if (!b) {
    b = { id, title:id, status:'idea', depends_on:[] };
    graph.blocks.push(b);
  }
  return b;
}

function write(p, txt){ fs.writeFileSync(p, txt, 'utf8'); }

if (cmd === 'init') {
  const title = rest.join(' ') || blockId;
  const b = ensureBlockInGraph(blockId);
  b.title = title;
  const dir = path.join(blocksDir, blockId);
  fs.mkdirSync(dir, { recursive:true });
  const files = {
    'mission.md': `# ${blockId} — mission\n\n${title}: цель и смысл блока.\n`,
    'kpi.md': `# ${blockId} — KPI\n\n- KPI-1: определить\n`,
    'acceptance.md': `# ${blockId} — acceptance\n\n- [ ] acceptance criteria\n`,
    'tasks.md': `# ${blockId} — tasks\n\n- [ ] task-1\n`,
    'checks.log': '',
    'depends_on.md': `# ${blockId} — depends_on\n\n- none\n`,
    'provides.md': `# ${blockId} — provides\n\n- none\n`,
  };
  Object.entries(files).forEach(([f,t])=>{ const p=path.join(dir,f); if(!fs.existsSync(p)) write(p,t); });
}

if (cmd === 'set-status') {
  const to = rest[0];
  if (!to) throw new Error('status is required');
  const b = ensureBlockInGraph(blockId);
  b.status = to;
}

if (cmd === 'set-mission') {
  const text = rest.join(' ');
  if (!text) throw new Error('mission text is required');
  const dir = path.join(blocksDir, blockId);
  fs.mkdirSync(dir, { recursive:true });
  write(path.join(dir, 'mission.md'), `# ${blockId} — mission\n\n${text}\n`);
}

fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2) + '\n', 'utf8');
console.log(`manage_block: ${cmd} ${blockId} OK`);

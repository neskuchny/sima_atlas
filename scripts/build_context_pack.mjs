#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { filterAlive, listFiles } from './atlas_files_api.mjs';

const [,, blockId] = process.argv;
if (!blockId) {
  console.error('Usage: node scripts/build_context_pack.mjs <blockId>');
  process.exit(1);
}

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));

function read(p){ return fs.existsSync(p) ? fs.readFileSync(p,'utf8') : ''; }
function readJson(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function tail(s, lines) {
  const all = String(s || '').split(/\r?\n/);
  return all.slice(-lines).join('\n');
}
function listFrom(md){ return md.split(/\r?\n/).map(s=>s.trim()).filter(s=>s.startsWith('- ')).map(s=>s.slice(2)); }

// Phase N-2: drop dead/archived files from the pack so the agent never
// reads stale code. files.md may list `path [status]`; we strip the
// suffix and also filter via the global registry.
function aliveFilesFromMd(md) {
  const items = listFrom(md);
  const paths = items.map((it) => String(it).split('[')[0].trim()).filter(Boolean);
  return filterAlive(paths);
}

// R-7.76 — load operator-level memory and filter to entries relevant
// to this block (block_id field) or untagged (global). Empty if files
// don't exist yet (warming-up state).
function loadOperatorMemory(atlas, blockId) {
  const profileDir = path.join(atlas, 'operator_profile');
  const filterByBlock = (arr) => Array.isArray(arr)
    ? arr.filter((e) => !e.block_id || e.block_id === blockId).slice(-25)
    : [];
  return {
    lessons:    filterByBlock(readJson(path.join(profileDir, 'lessons.json'))?.lessons || []),
    dont_use:   filterByBlock(readJson(path.join(profileDir, 'dont_use.json'))?.entries || []),
    always_use: filterByBlock(readJson(path.join(profileDir, 'always_use.json'))?.entries || []),
  };
}

const block = (graph.blocks||[]).find(b => b.id===blockId);
if (!block) {
  console.error(`Block not found: ${blockId}`);
  process.exit(2);
}

const dir = path.join(atlas, 'blocks', blockId);
const dependsRaw = listFrom(read(path.join(dir,'depends_on.md'))).filter(x=>x!=='none');
const depends = dependsRaw.map(x => x.split(':')[0].trim()).filter(Boolean);

const pack = {
  generated_at: new Date().toISOString(),
  block_id: blockId,
  project: {
    project: read(path.join(atlas,'project.md')),
    rules: read(path.join(atlas,'rules.md')),
    tech_stack: read(path.join(atlas,'tech_stack.md')),
  },
  block: {
    meta: block,
    mission: read(path.join(dir,'mission.md')),
    kpi: read(path.join(dir,'kpi.md')),
    acceptance: read(path.join(dir,'acceptance.md')),
    tasks: read(path.join(dir,'tasks.md')),
    patterns: read(path.join(dir,'patterns.md')),
    files: read(path.join(dir,'files.md')),
    // Phase N-2: explicit alive list — the agent should treat this as
    // the only code it may read/edit; ignore the bare files.md.
    files_alive: aliveFilesFromMd(read(path.join(dir,'files.md'))),
    files_dead: listFiles({ block_id: blockId, status: 'dead' }).map((e) => ({ path: e.path, reason: e.reason })),
    files_archived: listFiles({ block_id: blockId, status: 'archived' }).map((e) => ({ path: e.path, reason: e.reason })),
    // R-7.76 — memory layer per block: agents now SEE what was tried,
    // what was rejected, and what reflections accumulated. Without
    // these the agent re-discovers wheels and re-makes mistakes.
    checks_log_tail: tail(read(path.join(dir, 'checks.log')), 50),
    decisions_log: read(path.join(dir, 'decisions.log')),
    code_summary: read(path.join(dir, 'code_summary.md')),
    narrative: read(path.join(dir, 'narrative.md')),  // R-7.80 human-readable run history
  },
  dependencies: depends.map(id => ({
    id,
    mission: read(path.join(atlas,'blocks',id,'mission.md')),
    provides: read(path.join(atlas,'blocks',id,'provides.md')),
  })),
  // R-7.76 — operator-level memory. Filtered to this block or global.
  operator_memory: loadOperatorMemory(atlas, blockId),
};

const outDir = path.join(atlas,'context_packs');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive:true });
const out = path.join(outDir, `${blockId}.json`);
const serialized = JSON.stringify(pack, null, 2);
// Phase R-5 — emit size metadata so agents (and CI) see what they pay for.
// 4 chars ≈ 1 token is the conservative GPT-style estimate; Claude tokenises
// slightly tighter, so this overestimates a bit, which is fine.
const sizeBytes = Buffer.byteLength(serialized, 'utf8');
const estTokens = Math.ceil(sizeBytes / 4);
pack._meta = { size_bytes: sizeBytes, estimated_tokens: estTokens };
fs.writeFileSync(out, JSON.stringify(pack, null, 2) + '\n', 'utf8');
console.log(`Context-pack written: ${out} (${sizeBytes} bytes ≈ ${estTokens} tokens)`);
if (estTokens > 8000) {
  console.warn(`⚠ pack is large (${estTokens} tokens). Consider trimming patterns.md / acceptance.md, or use Phase R-5 compact mode (TODO).`);
}

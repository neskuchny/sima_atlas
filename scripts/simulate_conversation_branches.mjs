#!/usr/bin/env node
// PR3: smoke for the LLM-driven conversation → atlas pipeline.
//
// Replays tests/fixtures/conversation_branches.json (or another fixture) through
// the queue → analyze → extractBlockSchema flow and asserts:
//   1) For a dialog about a NEW block (b.realtime-ingestion) — a block dir is
//      created and the block appears in graph.json with the right layer.
//   2) For a dialog about an EXISTING block (b.core-sync) — its mission/status
//      stay as written by the human; LLM proposal is recorded in checks.log only.
//   3) Every dialog produces a `llm_extraction` trace line in
//      b.agent-orchestrator/checks.log.
//
// This smoke runs against the mock provider when no API key is configured,
// using fixtures in tests/llm_mocks/<promptHash>.json. It does NOT require
// network access in CI.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');
const BLOCKS = path.join(ATLAS, 'blocks');
const fixturePath = process.argv[2] || path.join(ROOT, 'tests', 'fixtures', 'conversation_branches.json');
const fixtures = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

function runNode(args) { return execFileSync('node', args, { cwd: ROOT, stdio: 'pipe' }).toString(); }
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function readSafe(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }

// Snapshot pre-state of every block we touch so we can verify "existing block
// content not overwritten".
const preMission = {};
for (const f of fixtures) {
  const dir = path.join(BLOCKS, f.block_id);
  if (fs.existsSync(dir)) preMission[f.block_id] = readSafe(path.join(dir, 'mission.md'));
}
const orchChecksBefore = readSafe(path.join(BLOCKS, 'b.agent-orchestrator', 'checks.log'));

// Snapshot every file the ingestion queue + analyze script can touch.
const graphPath = path.join(ATLAS, 'graph.json');
const graphBefore = readSafe(graphPath);
const RESTORE_FILES = ['checks.log', 'decisions.log', 'patterns.md'];
const fileSnapshots = new Map();
const preBlockDirs = new Set(fs.readdirSync(BLOCKS));
const touchedBlockIds = new Set([
  'b.agent-orchestrator', // analyze writes here
  'b.core-sync',
  'b.docs',
  ...fixtures.map((f) => f.block_id),
]);
for (const id of touchedBlockIds) {
  const dir = path.join(BLOCKS, id);
  if (!fs.existsSync(dir)) continue;
  for (const f of RESTORE_FILES) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) fileSnapshots.set(p, fs.readFileSync(p, 'utf8'));
  }
}

// Replay through the queue.
for (const branch of fixtures) {
  runNode(['scripts/enqueue_ingestion_item.mjs', branch.block_id, branch.note, 'false', branch.conversation_text]);
}
runNode(['scripts/apply_ingestion_queue.mjs']);

const graph = readJson(path.join(ATLAS, 'graph.json'));
const byId = new Map((graph.blocks || []).map((b) => [b.id, b]));

const checks = [];

// 1) New block detected and created
const realtimeBlock = byId.get('b.realtime-ingestion');
checks.push({
  name: 'created b.realtime-ingestion in graph.json',
  pass: !!realtimeBlock,
});
checks.push({
  name: 'b.realtime-ingestion has layer=logic (LLM classification)',
  pass: realtimeBlock?.layer === 'logic',
});
checks.push({
  name: 'b.realtime-ingestion folder seeded with mission.md',
  pass: fs.existsSync(path.join(BLOCKS, 'b.realtime-ingestion', 'mission.md')),
});

// 2) Existing block (b.core-sync) NOT overwritten
const postMission = readSafe(path.join(BLOCKS, 'b.core-sync', 'mission.md'));
checks.push({
  name: 'b.core-sync mission preserved (LLM proposal is not auto-applied)',
  pass: !!preMission['b.core-sync'] && postMission === preMission['b.core-sync'],
});
const coreSync = byId.get('b.core-sync');
checks.push({
  name: 'b.core-sync status NOT silently flipped to done',
  // Contract: LLM extraction must not change status of a pre-existing
  // block in graph.json — only files appended in checks.log.
  pass: coreSync?.status !== 'done' || coreSync?.status_reason?.includes('done by human'),
});

// 3) Orchestrator received a llm_extraction trace
const orchChecksAfter = readSafe(path.join(BLOCKS, 'b.agent-orchestrator', 'checks.log'));
const newLines = orchChecksAfter.slice(orchChecksBefore.length);
checks.push({
  name: 'b.agent-orchestrator/checks.log has new llm_extraction lines',
  pass: /llm_extraction/.test(newLines),
});

const failed = checks.filter((c) => !c.pass);
for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}: ${c.name}`);

// ─── Cleanup: restore everything we may have changed ─────────────────────
fs.writeFileSync(graphPath, graphBefore);
for (const [p, content] of fileSnapshots) {
  fs.writeFileSync(p, content);
}
{
  // Remove any block dirs that did not exist before this run.
  const postDirs = fs.readdirSync(BLOCKS);
  for (const dir of postDirs) {
    if (!preBlockDirs.has(dir)) {
      fs.rmSync(path.join(BLOCKS, dir), { recursive: true, force: true });
    }
  }
}

if (failed.length) {
  console.error(`simulate_conversation_branches: failed ${failed.length}/${checks.length}`);
  process.exit(2);
}
console.log('simulate_conversation_branches: OK (state restored)');

#!/usr/bin/env node
// PR3: LLM-driven semantic ingestion (replaces the old regex grep).
//
// Reads a JSON envelope { text, block_id?, meta? } from <inputPath> (same shape
// the legacy regex implementation accepted), runs extractBlockSchema() through
// b.llm-gateway and turns the structured response into atlas updates:
//   * upserts blocks into atlas/graph.json (preserving existing fields)
//   * creates folders blocks/<id>/{mission,kpi,acceptance,tasks,checks.log,...}
//     ONLY for newly proposed blocks; never overwrites real content
//   * appends an `llm_extraction` line into checks.log of every block touched,
//     including provider, confidence and trace path
//
// Refuses to write anything when the LLM returns confidence < threshold; in that
// case it logs a `semantic_ingestion skipped` event and exits 0.
//
// Env: see scripts/llm_gateway.mjs (ANTHROPIC_API_KEY / GOOGLE_API_KEY / mock).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractBlockSchema } from './llm_gateway.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');
const BLOCKS_ROOT = path.join(ATLAS, 'blocks');
const GRAPH_PATH = path.join(ATLAS, 'graph.json');
const TRACE_TARGET_BLOCK = 'b.agent-orchestrator';
const MIN_CONFIDENCE = Number(process.env.SIMA_MIN_BLOCK_CONFIDENCE || 0.6);

// Accept input in three forms (Windows-friendly: no need for /tmp temp files):
//   1) JSON file path:                  node analyze_conversation_to_atlas.mjs <path.json>
//   2) Inline text via --text flag:     node analyze_conversation_to_atlas.mjs --text "your dialog"
//   3) STDIN piped JSON or raw text:    echo '{"text":"..."}' | node analyze_conversation_to_atlas.mjs --stdin

let text = '';
const argv = process.argv.slice(2);
const flagIndex = argv.indexOf('--text');
if (flagIndex >= 0) {
  text = String(argv.slice(flagIndex + 1).join(' ') || '').trim();
} else if (argv.includes('--stdin')) {
  const raw = fs.readFileSync(0, 'utf8');
  try {
    const j = JSON.parse(raw);
    text = String(j.text || j.conversation_text || '').trim();
  } catch {
    text = raw.trim();
  }
} else if (argv[0]) {
  // legacy: JSON file path (the simulate_conversation_branches flow uses this).
  // Strip BOM the way Windows-PowerShell `>` redirection sometimes adds (UTF-8/16 LE).
  let raw = fs.readFileSync(argv[0], 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  if (raw.charCodeAt(0) === 0xff && raw.charCodeAt(1) === 0xfe) {
    // UTF-16 LE BOM → re-read as utf16le
    raw = fs.readFileSync(argv[0], 'utf16le');
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  }
  try {
    const payload = JSON.parse(raw);
    text = String(payload.text || payload.conversation_text || '').trim();
  } catch (e) {
    console.error(`Failed to parse JSON from ${argv[0]}: ${e.message}`);
    console.error('Hint: on PowerShell use: node ... --text "your dialog"  (no file needed).');
    process.exit(2);
  }
} else {
  console.error('Usage:');
  console.error('  node scripts/analyze_conversation_to_atlas.mjs <conversation.json>');
  console.error('  node scripts/analyze_conversation_to_atlas.mjs --text "<dialog>"');
  console.error('  echo \'{"text":"…"}\' | node scripts/analyze_conversation_to_atlas.mjs --stdin');
  process.exit(1);
}

if (!text) {
  console.error('Empty conversation text');
  process.exit(2);
}

const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf8'));
const blocks = graph.blocks || [];

let extraction;
try {
  extraction = await extractBlockSchema(text, { provider: process.env.LLM_DEFAULT_PROVIDER });
} catch (err) {
  console.error('llm extraction failed:', err.message);
  process.exit(3);
}

const proposed = (extraction.value?.blocks || []).filter((b) => {
  if (!b || !b.id || !b.mission || !b.layer) return false;
  if (typeof b.confidence === 'number' && b.confidence < MIN_CONFIDENCE) return false;
  return true;
});

if (!proposed.length) {
  console.log(`semantic_ingestion: 0 confident blocks (trace=${extraction.trace?.prompt_hash})`);
  appendOrchestratorTrace('skipped', extraction.trace, 0);
  process.exit(0);
}

let createdNew = 0;
let updatedExisting = 0;
const touched = [];

for (const proposal of proposed) {
  const existing = blocks.find((b) => b.id === proposal.id);
  if (existing) {
    // Only update structured fields if they were missing; never overwrite mission/kpi/etc.
    if (!existing.layer && proposal.layer) existing.layer = proposal.layer;
    if (!existing.type && proposal.type) existing.type = proposal.type;
    if (existing.mvp === undefined && typeof proposal.mvp === 'boolean') existing.mvp = proposal.mvp;
    const newDeps = (proposal.depends_on || []).filter((d) => !(existing.depends_on || []).includes(d));
    if (newDeps.length) existing.depends_on = [...(existing.depends_on || []), ...newDeps];
    if (!existing.tech_stack && proposal.tech_stack) existing.tech_stack = proposal.tech_stack;
    updatedExisting += 1;
  } else {
    blocks.push({
      id: proposal.id,
      title: proposal.title || proposal.id,
      status: proposal.status || 'idea',
      status_reason: 'Created from chat dialog via b.llm-gateway extraction',
      layer: proposal.layer,
      type: proposal.type || 'module',
      mvp: !!proposal.mvp,
      subschema_id: null,
      depends_on: proposal.depends_on || [],
      tech_stack: proposal.tech_stack || [],
      files: [],
    });
    createdNew += 1;
    seedBlockFolder(proposal);
  }
  touched.push(proposal.id);
}

graph.blocks = blocks;
fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2) + '\n', 'utf8');

const ts = new Date().toISOString();
for (const id of touched) {
  const checks = path.join(BLOCKS_ROOT, id, 'checks.log');
  const conf = (proposed.find((p) => p.id === id) || {}).confidence;
  const note = `llm extract via ${extraction.trace?.provider} model=${extraction.trace?.model} confidence=${conf ?? 'n/a'} hash=${extraction.trace?.prompt_hash}`;
  if (fs.existsSync(path.dirname(checks))) {
    fs.appendFileSync(checks, `${ts}\tllm_extraction\tpass\t${note}\n`, 'utf8');
  }
}
appendOrchestratorTrace('applied', extraction.trace, touched.length);

console.log(
  `semantic_ingestion: applied ${touched.length} blocks (new=${createdNew}, updated=${updatedExisting}, provider=${extraction.trace?.provider})`
);

// ─────────────────────────────────────────────────────────── helpers
function seedBlockFolder(proposal) {
  const dir = path.join(BLOCKS_ROOT, proposal.id);
  fs.mkdirSync(dir, { recursive: true });
  const mission = proposal.mission && proposal.mission.length > 40
    ? proposal.mission
    : `${proposal.title || proposal.id}: ${proposal.mission || 'требуется уточнить миссию через UI confidence/diff flow.'}`;

  writeIfMissing(path.join(dir, 'mission.md'), `# ${proposal.id} — mission\n\n${mission}\n\n## Layer\n${proposal.layer}\n\n## Provenance\nCreated by b.llm-gateway extraction (confidence=${proposal.confidence ?? 'n/a'}). Verify in UI before progressing past 'idea'.\n`);

  const kpiBody = (proposal.kpi && Array.isArray(proposal.kpi) && proposal.kpi.length)
    ? proposal.kpi.map((k) => `- ${k}`).join('\n')
    : '- KPI-1: переписать вручную или через UI confidence/diff flow (LLM-extracted block).';
  writeIfMissing(path.join(dir, 'kpi.md'), `# ${proposal.id} — KPI\n\n${kpiBody}\n`);

  writeIfMissing(path.join(dir, 'acceptance.md'), `# ${proposal.id} — acceptance\n\n- [ ] **A1.** Подтвердить миссию и контракт через UI confidence/diff flow (этот блок предложен LLM, не человеком).\n- [ ] **A2.** Заполнить KPI и tasks реальными значениями.\n- [ ] **A3.** Связать блок с реальными файлами через files.md.\n`);

  writeIfMissing(path.join(dir, 'tasks.md'), `# ${proposal.id} — tasks\n\n- [ ] T1: review LLM-extracted mission and accept or reject in UI.\n- [ ] T2: fill kpi/acceptance with concrete values.\n- [ ] T3: list real files in files.md.\n`);

  writeIfMissing(path.join(dir, 'depends_on.md'), `# ${proposal.id} — depends_on\n\n${(proposal.depends_on || []).length ? proposal.depends_on.map((d) => `- ${d}`).join('\n') : '- none'}\n`);

  writeIfMissing(path.join(dir, 'provides.md'), `# ${proposal.id} — provides\n\n${(proposal.provides || []).length ? proposal.provides.map((p) => `- ${p}`).join('\n') : '- none'}\n`);

  writeIfMissing(path.join(dir, 'files.md'), `# ${proposal.id} — files\n\n- (none yet — block was just created from dialog)\n`);

  writeIfMissing(path.join(dir, 'checks.log'), '');
}

function writeIfMissing(p, content) {
  if (!fs.existsSync(p)) fs.writeFileSync(p, content, 'utf8');
}

function appendOrchestratorTrace(verdict, trace, touchedCount) {
  const orchDir = path.join(BLOCKS_ROOT, TRACE_TARGET_BLOCK);
  if (!fs.existsSync(orchDir)) return;
  const checks = path.join(orchDir, 'checks.log');
  const ts = new Date().toISOString();
  const note = `${verdict} touched=${touchedCount} provider=${trace?.provider} model=${trace?.model} cost_usd=${(trace?.cost_usd || 0).toFixed(6)} hash=${trace?.prompt_hash}`;
  fs.appendFileSync(checks, `${ts}\tllm_extraction\t${verdict === 'applied' ? 'pass' : 'pass'}\t${note}\n`, 'utf8');
}

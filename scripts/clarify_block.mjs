#!/usr/bin/env node
// R-8.06 (b.clarify) — the arbiter UPSTREAM of the contract.
//
// Every other arbiter in Sima Atlas stands to the RIGHT of the contract and
// takes it as an axiom:
//   deterministic verifier → «did acceptance pass?»
//   cascade + green-guard  → «did we break neighbours?»
//   semantic judge         → «does the implementation match the mission?»
//   diff-review            → «is there a bug in this change?»
// None of them ever asks the one question the operator actually cares about:
// «does the contract say what the human meant?» An audit found the synthesis
// API had nine functions and not one of them returns a question — they all
// generate on the human's behalf. A model that fills a gap with a plausible
// guess is indistinguishable, from the canvas, from a model that understood.
//
// This script is the missing left half. It does NOT write the contract. It
// reads the contract plus its neighbours and returns QUESTIONS, in a format
// designed for a human who cannot track everything:
//   * one real interrogative per question, ending in «?», answerable from the
//     question line alone — never a topic label like «Acceptance matrix (A3)»;
//   * «why it matters» — the stake, so the interruption justifies itself;
//   * 2-5 named options, each with its CONSEQUENCE, not just its name;
//   * the model's own recommendation with reasoning, so «yes» is a valid answer.
//
// It also returns the two things that make guessing visible:
//   * facts_verified — what it read in the repo, so it never asks what it can
//     already know (an unnecessary question spends the human's attention);
//   * assumptions — what it decided on its own because the gap was minor.
//     An assumption looks like knowledge from the outside, which is exactly
//     what makes it dangerous; recording it turns it into a visible debt.
//
// Ask-vs-assume threshold: ask only when the ambiguity would materially change
// SCOPE, externally observable BEHAVIOUR, COMPATIBILITY, or ACCEPTANCE
// CRITERIA. Anything smaller becomes a recorded assumption instead.
//
// Tri-state, honest: schema enum is [inconclusive, clear, questions] so a
// mock / no-key run degrades to `inconclusive` and NEVER to `clear`. Saying
// «nothing to clarify» without a live model would be the silent green the
// canon forbids, in the one place built to catch misunderstanding.
//
// Usage:
//   node scripts/clarify_block.mjs b.desktop
//   node scripts/clarify_block.mjs b.desktop --json
//   node scripts/clarify_block.mjs b.desktop --answer Q1=A --answer Q2="own words"
//
// Library:
//   import { clarifyBlock, applyAnswers, findMarkers } from './clarify_block.mjs';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callLLM } from './llm_gateway.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');

// Inconclusive FIRST — deterministicEmptyForSchema returns enum[0], so any
// mock/parse failure lands on the safe verdict instead of «clear».
export const VERDICT_ENUM = ['inconclusive', 'clear', 'questions'];

// The four axes on which an ambiguity is worth the human's attention.
// Ordered by how expensive the misunderstanding is to discover late.
export const IMPACT_ENUM = ['scope', 'security_privacy', 'behaviour', 'acceptance'];

// Where ambiguity hides. Used to report coverage, so «we asked 3 questions»
// becomes «these areas are clear, these are still open» — a measurement of
// understanding rather than a count of questions.
export const CATEGORY_ENUM = [
  'purpose_and_scope',      // what is in, what is explicitly out
  'data_and_model',         // entities, identity, lifecycle
  'interaction_and_ux',     // critical paths, empty/error states
  'quality_attributes',     // performance, reliability, security
  'integration',            // neighbours, external systems
  'edge_cases',             // failure handling
  'constraints_tradeoffs',  // rejected alternatives
  'terminology',            // canonical names, forbidden synonyms
  'acceptance_signals',     // how we will know it is done
];

const COVERAGE_ENUM = ['clear', 'partial', 'missing'];

const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: VERDICT_ENUM },
    summary: { type: 'string' },
    facts_verified: {
      type: 'array',
      items: { type: 'string' },
    },
    coverage: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: { type: 'string', enum: CATEGORY_ENUM },
          status: { type: 'string', enum: COVERAGE_ENUM },
          note: { type: 'string' },
        },
        required: ['category', 'status', 'note'],
      },
    },
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          category: { type: 'string', enum: CATEGORY_ENUM },
          impact: { type: 'string', enum: IMPACT_ENUM },
          question: { type: 'string' },
          why_it_matters: { type: 'string' },
          target_file: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                description: { type: 'string' },
                implications: { type: 'string' },
              },
              required: ['label', 'description', 'implications'],
            },
          },
          recommended: { type: 'string' },
          recommended_reasoning: { type: 'string' },
        },
        required: ['id', 'category', 'impact', 'question', 'why_it_matters',
          'target_file', 'options', 'recommended', 'recommended_reasoning'],
      },
    },
    assumptions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          assumption: { type: 'string' },
          because: { type: 'string' },
          target_file: { type: 'string' },
        },
        required: ['assumption', 'because', 'target_file'],
      },
    },
  },
  required: ['verdict', 'summary', 'facts_verified', 'coverage', 'questions', 'assumptions'],
};

// Contract files worth reading, in the order a human would read them.
const CONTRACT_FILES = [
  'user_story.md', 'mission.md', 'kpi.md', 'acceptance.md',
  'tasks.md', 'depends_on.md', 'provides.md', 'files.md',
];

// ── uncertainty markers ─────────────────────────────────────────────────────
// `[NEEDS CLARIFICATION: <question>]` is a first-class state of a contract:
// the contract itself declaring «this part is not settled». Without it, an
// unresolved gap is indistinguishable from a settled decision.
const MARKER_RE = /\[NEEDS CLARIFICATION:\s*([^\]]+)\]/g;

export function findMarkers(text, file = '') {
  const out = [];
  if (typeof text !== 'string') return out;
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const m of line.matchAll(MARKER_RE)) {
      out.push({ file, line: i + 1, question: m[1].trim() });
    }
  });
  return out;
}

/** Every unresolved marker across one block's contract files. */
export function blockMarkers(blockId, atlasRoot = ATLAS) {
  const dir = path.join(atlasRoot, 'blocks', blockId);
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of CONTRACT_FILES) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    out.push(...findMarkers(fs.readFileSync(p, 'utf8'), f));
  }
  return out;
}

function readContract(blockId, atlasRoot) {
  const dir = path.join(atlasRoot, 'blocks', blockId);
  const parts = [];
  for (const f of CONTRACT_FILES) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const body = fs.readFileSync(p, 'utf8').trim();
    if (body) parts.push(`### ${f}\n${body.slice(0, 4000)}`);
  }
  return parts.join('\n\n');
}

function readNeighbours(blockId, atlasRoot) {
  const gpath = path.join(atlasRoot, 'graph.json');
  if (!fs.existsSync(gpath)) return '';
  let graph; try { graph = JSON.parse(fs.readFileSync(gpath, 'utf8')); } catch { return ''; }
  const me = (graph.blocks || []).find((b) => b.id === blockId);
  if (!me) return '';
  const ids = new Set([...(me.depends_on || [])]);
  for (const b of graph.blocks || []) {
    if ((b.depends_on || []).includes(blockId)) ids.add(b.id);
  }
  const parts = [];
  for (const id of ids) {
    const mp = path.join(atlasRoot, 'blocks', id, 'mission.md');
    if (!fs.existsSync(mp)) continue;
    parts.push(`- ${id}: ${fs.readFileSync(mp, 'utf8').replace(/\s+/g, ' ').slice(0, 300)}`);
  }
  return parts.join('\n');
}

function buildSystem() {
  return [
    'You are the Sima Atlas clarification arbiter. You stand BEFORE the contract, not after it.',
    'Your job is NOT to write or improve the contract. Your job is to find the places where the',
    'human\'s intent and the written contract could diverge, and to ask about exactly those.',
    '',
    'ASK vs ASSUME — the threshold, applied strictly:',
    '  ASK only when the ambiguity would materially change one of: SCOPE (what is in or out),',
    '  externally observable BEHAVIOUR, COMPATIBILITY with neighbouring blocks, or the ACCEPTANCE',
    '  CRITERIA. Rank by that order when you must choose.',
    '  For anything smaller: decide it yourself and record it under `assumptions`. Never leave a',
    '  minor gap silent — a recorded assumption is visible debt, a silent one is a future surprise.',
    '',
    'NEVER ask what you can read. Put everything you established from the contract and its',
    'neighbours into `facts_verified`. An unnecessary question spends attention the operator does',
    'not have.',
    '',
    'QUESTION QUALITY — every question must satisfy all of these:',
    '  * It is a real interrogative sentence ending in "?". A topic label is INVALID:',
    '    "Acceptance matrix (A3)" is a label, not a question.',
    '  * A reader who has never seen this project must be able to answer it from the question',
    '    line alone. Terse is fine; cryptic is not.',
    '  * `why_it_matters` states the stake in one plain sentence: what breaks, or what becomes',
    '    unverifiable, if this stays open.',
    '  * 2-5 options. Each carries `implications` — the CONSEQUENCE of choosing it, not a restatement',
    '    of its name. The operator is choosing outcomes, not labels.',
    '  * `recommended` names one option label and `recommended_reasoning` justifies it in 1-2',
    '    sentences, so that answering "yes" is enough.',
    '  * `target_file` names the contract file the answer will change.',
    '',
    'COVERAGE: report every category as clear / partial / missing with a one-line note, including',
    'the ones you did not ask about. Degree of understanding is the measurement, not question count.',
    '',
    'VERDICT:',
    '  "questions"    — at least one material ambiguity found.',
    '  "clear"        — you read the contract and found nothing that meets the threshold.',
    '  "inconclusive" — you could not judge (missing contract, unreadable input).',
    'Never return "clear" to be agreeable. An unexamined contract is "inconclusive", not "clear".',
  ].join('\n');
}

function buildPrompt({ blockId, contract, neighbours, markers }) {
  const s = [];
  s.push(`# Block under clarification: ${blockId}`);
  s.push('');
  s.push('## Its contract');
  s.push(contract || '(contract is empty — that itself is the finding)');
  if (neighbours) {
    s.push('');
    s.push('## Neighbouring blocks (dependencies and dependents)');
    s.push(neighbours);
  }
  if (markers.length) {
    s.push('');
    s.push('## Unresolved uncertainty markers already in this contract');
    s.push('Turn each of these into a proper question with options — the author already flagged them:');
    for (const m of markers) s.push(`- ${m.file}:${m.line} — ${m.question}`);
  }
  s.push('');
  s.push('Return facts_verified, coverage across all categories, the questions that pass the');
  s.push('threshold, and every assumption you made instead of asking. Number questions Q1, Q2, ...');
  return s.join('\n');
}

/**
 * Ask about one block. Returns a tri-state result; never writes the contract.
 */
export async function clarifyBlock({ block_id, atlas_root = ATLAS } = {}) {
  if (!block_id) throw new Error('clarifyBlock: block_id required');
  const dir = path.join(atlas_root, 'blocks', block_id);
  const checkedAt = new Date().toISOString();

  if (!fs.existsSync(dir)) {
    return {
      block_id, verdict: 'inconclusive', checked_at: checkedAt, mock: false,
      summary: `no block directory at ${dir}`,
      facts_verified: [], coverage: [], questions: [], assumptions: [],
    };
  }

  const contract = readContract(block_id, atlas_root);
  const markers = blockMarkers(block_id, atlas_root);

  if (!contract.trim()) {
    return {
      block_id, verdict: 'inconclusive', checked_at: checkedAt, mock: false,
      summary: 'contract files are empty — nothing to clarify against',
      facts_verified: [], coverage: [], questions: [], assumptions: [],
      markers,
    };
  }

  const neighbours = readNeighbours(block_id, atlas_root);
  let value = null, trace = null;
  try {
    const r = await callLLM({
      system: buildSystem(),
      prompt: buildPrompt({ blockId: block_id, contract, neighbours, markers }),
      schema: SCHEMA,
      max_tokens: 4000,
      op: 'clarify_block',
    });
    value = r?.value || null;
    trace = r?.trace || null;
  } catch (e) {
    return {
      block_id, verdict: 'inconclusive', checked_at: checkedAt, mock: true,
      summary: `clarifier unavailable: ${String(e.message || e).slice(0, 200)}`,
      facts_verified: [], coverage: [], questions: [], assumptions: [], markers,
    };
  }

  const isMock = !trace || trace.provider === 'mock' || trace.provider === 'error';
  const questions = normalizeQuestions(value?.questions);
  // A mock run cannot have examined anything. Forcing inconclusive here is the
  // whole point: «nothing to clarify» must never be reachable without a
  // reviewer that actually read the contract.
  let verdict = VERDICT_ENUM.includes(value?.verdict) ? value.verdict : 'inconclusive';
  if (isMock) verdict = 'inconclusive';
  else if (questions.length) verdict = 'questions';

  return {
    block_id,
    verdict,
    checked_at: checkedAt,
    mock: isMock,
    provider: trace?.provider || null,
    model: trace?.model || null,
    summary: isMock
      ? 'no live clarifier (mock / no API key) — cannot judge whether the contract matches intent'
      : String(value?.summary || '').slice(0, 600),
    facts_verified: Array.isArray(value?.facts_verified) ? value.facts_verified : [],
    coverage: Array.isArray(value?.coverage) ? value.coverage : [],
    questions,
    assumptions: Array.isArray(value?.assumptions) ? value.assumptions : [],
    markers,
  };
}

/** Drop malformed questions rather than surfacing a label as if it were a question. */
export function normalizeQuestions(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  raw.forEach((q, i) => {
    const question = String(q?.question || '').trim();
    // The «label, not a question» rule, enforced rather than merely requested.
    if (!question.endsWith('?')) return;
    const options = Array.isArray(q?.options)
      ? q.options.filter((o) => o && o.label && o.description).slice(0, 5)
      : [];
    if (options.length < 2) return;
    out.push({
      id: String(q?.id || `Q${i + 1}`),
      category: CATEGORY_ENUM.includes(q?.category) ? q.category : 'purpose_and_scope',
      impact: IMPACT_ENUM.includes(q?.impact) ? q.impact : 'scope',
      question,
      why_it_matters: String(q?.why_it_matters || '').trim(),
      target_file: String(q?.target_file || '').trim(),
      options: options.map((o) => ({
        label: String(o.label).trim(),
        description: String(o.description).trim(),
        implications: String(o.implications || '').trim(),
      })),
      recommended: String(q?.recommended || '').trim(),
      recommended_reasoning: String(q?.recommended_reasoning || '').trim(),
    });
  });
  // Most expensive-to-discover-late first, so a human who answers only the top
  // one still answers the one that matters most.
  const rank = Object.fromEntries(IMPACT_ENUM.map((k, i) => [k, i]));
  return out.sort((a, b) => (rank[a.impact] ?? 9) - (rank[b.impact] ?? 9));
}

// ── the Q→A log ─────────────────────────────────────────────────────────────
// Append-only record of what the model did not understand and how the human
// corrected it. Over time this is a corpus of THIS operator's divergences with
// the model — the raw material for measuring whether synchronisation improves.
const CLARIFICATIONS_FILE = 'clarifications.md';

export function appendAnswers({ block_id, answers = [], atlas_root = ATLAS, now } = {}) {
  if (!block_id) throw new Error('appendAnswers: block_id required');
  if (!answers.length) return { written: 0 };
  const dir = path.join(atlas_root, 'blocks', block_id);
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, CLARIFICATIONS_FILE);
  const ts = now || new Date().toISOString();
  const day = ts.slice(0, 10);

  let body = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : `# ${block_id} — clarifications\n\nAppend-only log of what the model did not understand and how it was resolved.\n`;
  const heading = `\n## Session ${day}\n`;
  if (!body.includes(heading.trim())) body += heading;
  for (const a of answers) {
    body += `- Q: ${String(a.question || '').trim()} → A: ${String(a.answer || '').trim()}\n`;
  }
  fs.writeFileSync(p, body, 'utf8');
  return { written: answers.length, path: p };
}

/**
 * Resolve a marker in place: the answered text replaces the marker, so no
 * obsolete contradictory wording is left behind next to the resolution.
 */
export function resolveMarker({ block_id, file, question, resolution, atlas_root = ATLAS } = {}) {
  const p = path.join(atlas_root, 'blocks', block_id, file);
  if (!fs.existsSync(p)) return { replaced: 0 };
  const before = fs.readFileSync(p, 'utf8');
  let replaced = 0;
  const after = before.replace(MARKER_RE, (full, q) => {
    if (q.trim() !== String(question).trim()) return full;
    replaced += 1;
    return String(resolution).trim();
  });
  if (replaced) fs.writeFileSync(p, after, 'utf8');
  return { replaced, path: p };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
function render(r) {
  const tick = r.verdict === 'questions' ? '?' : r.verdict === 'clear' ? '✓' : '·';
  console.log(`clarify ${r.block_id}: ${tick} ${r.verdict.toUpperCase()}${r.mock ? ' (mock / no live clarifier)' : ` (${r.provider})`}`);
  if (r.summary) console.log(`  ${r.summary}`);
  if (r.markers?.length) {
    console.log(`\n  unresolved markers in the contract: ${r.markers.length}`);
    for (const m of r.markers) console.log(`    · ${m.file}:${m.line} — ${m.question}`);
  }
  if (r.facts_verified?.length) {
    console.log('\n  facts already verified (not asked about):');
    for (const f of r.facts_verified.slice(0, 8)) console.log(`    · ${f}`);
  }
  if (r.coverage?.length) {
    const open = r.coverage.filter((c) => c.status !== 'clear');
    console.log(`\n  coverage: ${r.coverage.length - open.length}/${r.coverage.length} categories clear`);
    for (const c of open) console.log(`    · ${c.category}: ${c.status} — ${c.note}`);
  }
  for (const q of r.questions || []) {
    console.log(`\n  ${q.id} [${q.impact}] ${q.question}`);
    if (q.why_it_matters) console.log(`     why it matters: ${q.why_it_matters}`);
    for (const o of q.options) {
      const mark = o.label === q.recommended ? '→' : ' ';
      console.log(`    ${mark} ${o.label}. ${o.description}`);
      if (o.implications) console.log(`        ⇒ ${o.implications}`);
    }
    if (q.recommended) console.log(`     recommended: ${q.recommended} — ${q.recommended_reasoning}`);
    if (q.target_file) console.log(`     answer lands in: ${q.target_file}`);
  }
  if (r.assumptions?.length) {
    console.log('\n  assumptions made instead of asking (visible debt):');
    for (const a of r.assumptions) console.log(`    · ${a.assumption} — ${a.because} [${a.target_file}]`);
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const blockId = argv.find((a) => !a.startsWith('--'));
  const json = argv.includes('--json');
  if (!blockId) {
    console.error('Usage: node scripts/clarify_block.mjs <block_id> [--json]');
    process.exit(2);
  }
  const r = await clarifyBlock({ block_id: blockId });
  if (json) console.log(JSON.stringify(r, null, 2));
  else render(r);
  // 0 = clear, 1 = questions outstanding, 2 = inconclusive. Mirrors the
  // verifier's convention: a non-zero exit never means «fine».
  process.exit(r.verdict === 'clear' ? 0 : r.verdict === 'questions' ? 1 : 2);
}

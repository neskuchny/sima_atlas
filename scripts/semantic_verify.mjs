#!/usr/bin/env node
// R-7.94 (Kanon §I «Contract as Arbiter» + §II «Counter-Force to Simplification»)
// — holistic SEMANTIC verifier.
//
// The deterministic acceptance verifier (verify_block_acceptance) proves
// individual assertions with exit codes / globs / diffs. That answers «do the
// checks pass». It does NOT answer the operator's harder question:
//
//   «does what was actually built match the MEANING of the block, its
//    conditions, the methodology — and will it work as described?»
//
// That is the «Contract as Arbiter» judgment, and it is exactly where an
// LLM-judge belongs (Kanon: deterministic first, LLM as the semantic layer on
// top — never a silent pass). This verifier reads the WHOLE contract + the
// real code + the neighbour contracts and returns a structured, tri-state
// verdict across five dimensions, plus a concrete `todo_to_pass` list of what
// must change for the block to genuinely satisfy its own contract.
//
// Five dimensions (the operator's exact ask):
//   1. mission_fulfilled       — does the implementation fulfil the mission (meaning)?
//   2. conditions_met          — does it satisfy KPIs + acceptance INTENT (not just the deterministic checks)?
//   3. methodology_followed    — does it honour architecture_decisions / dont_use / always_use / tech_stack / rules?
//                                (catches «wrote a regex instead of the required LLM», «used a JSON file instead of the locked Postgres», etc — the Counter-Force)
//   4. works_as_described      — reasoning about functional correctness: will it actually do what the mission says?
//   5. connections_consistent  — do `provides` match what dependents need; are `depends_on` satisfied by real upstream `provides`?
//
// Tri-state honesty (Kanon §V): enum order puts `inconclusive` first so that a
// mock / no-API-key run degrades to «we don't know» — never a false pass.
//
// Usage:
//   node scripts/semantic_verify.mjs <block_id> [--client X] [--json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callLLM } from './llm_gateway.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const argv = process.argv.slice(2);
const blockId = argv.find((a) => !a.startsWith('--'));
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const CLIENT = flag('--client', '');
const JSON_OUT = argv.includes('--json');
const ATLAS = CLIENT ? path.join(ROOT, 'atlas', 'clients', CLIENT) : path.join(ROOT, 'atlas');

if (!blockId) { console.error('Usage: node scripts/semantic_verify.mjs <block_id> [--client X] [--json]'); process.exit(2); }

function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function blockDir(id) { return path.join(ATLAS, 'blocks', id); }

const dir = blockDir(blockId);
if (!fs.existsSync(dir)) { console.error(`semantic_verify: block dir not found → ${dir}`); process.exit(2); }

// ── gather the whole contract + reality + neighbours ────────────────────────

function aliveFiles() {
  return read(path.join(dir, 'files.md')).split(/\r?\n/)
    .filter((l) => /^\s*-\s/.test(l) && /\[alive\]/.test(l))
    .map((l) => l.replace(/^\s*-\s+/, '').split(/\s+\[alive\]/)[0].trim())
    .filter(Boolean);
}
function parseDeps() {
  return read(path.join(dir, 'depends_on.md')).split(/\r?\n/)
    .filter((l) => l.trim().startsWith('- '))
    .map((l) => l.trim().slice(2).split(':')[0].trim())
    .filter((d) => d && d !== 'none');
}
function codeExcerpt() {
  // Prefer the LLM-generated code map; fall back to a capped concat of the
  // alive files so the judge sees the real implementation, not just a summary.
  const summary = read(path.join(dir, 'code_summary.md'));
  const files = aliveFiles();
  let body = '';
  const BUDGET = 14000; // chars — keep the judge prompt bounded
  for (const f of files) {
    const c = read(path.join(ROOT, f));
    if (!c) continue;
    const chunk = `\n----- ${f} -----\n${c.slice(0, 4000)}\n`;
    if (body.length + chunk.length > BUDGET) { body += `\n(… ${files.length} files total, truncated to fit)\n`; break; }
    body += chunk;
  }
  return { summary, body, fileCount: files.length };
}

const deps = parseDeps();
const depProvides = deps.map((d) => ({ id: d, provides: read(path.join(blockDir(d), 'provides.md')) }));
const code = codeExcerpt();
const dontUse = readJson(path.join(ATLAS, 'operator_profile', 'dont_use.json'))?.entries || [];
const alwaysUse = readJson(path.join(ATLAS, 'operator_profile', 'always_use.json'))?.entries || [];
const filterByBlock = (arr) => arr.filter((e) => !e.block_id || e.block_id === blockId);

const contract = {
  mission: read(path.join(dir, 'mission.md')),
  // R-7.95 — user_story is the «top layer» (per operator's transcript: «User
  // story у нас тоже должен быть… LLM-валидатор проверяет что код реально
  // решает эту историю»). The judge must see what the USER actually wants,
  // not just the mission's framing.
  user_story: read(path.join(dir, 'user_story.md')),
  kpi: read(path.join(dir, 'kpi.md')),
  acceptance: read(path.join(dir, 'acceptance.md')),
  provides: read(path.join(dir, 'provides.md')),
  depends_on: read(path.join(dir, 'depends_on.md')),
  narrative_tail: read(path.join(dir, 'narrative.md')).split(/\r?\n/).slice(-40).join('\n'),
};
const methodology = {
  rules: read(path.join(ATLAS, 'rules.md')),
  tech_stack: read(path.join(ATLAS, 'tech_stack.md')),
  architecture_decisions: read(path.join(ATLAS, 'architecture_decisions.md')),
  dont_use: filterByBlock(dontUse),
  always_use: filterByBlock(alwaysUse),
};

// ── the judge schema (tri-state per dimension; inconclusive first) ──────────
//
// Schema is intentionally FLAT — Gemini Flash reliably honours response_schema
// when fields are top-level but stumbles on deeply-nested objects (verified by
// direct curl + gateway tests: nested 5-dim schema returns text, flat returns
// strict JSON). We reshape into the nested {verdict, reasoning} structure
// after parsing so the rest of the system sees the friendlier form.

const TRI = { type: 'string', enum: ['inconclusive', 'pass', 'fail'] };
const SCHEMA = { type: 'object', properties: {
  mission_fulfilled: TRI,        mission_reasoning: { type: 'string' },
  conditions_met: TRI,           conditions_reasoning: { type: 'string' },
  methodology_followed: TRI,     methodology_reasoning: { type: 'string' },
  works_as_described: TRI,       works_reasoning: { type: 'string' },
  connections_consistent: TRI,   connections_reasoning: { type: 'string' },
  overall: TRI,
  summary: { type: 'string' },
  todo_to_pass: { type: 'array', items: { type: 'string' } },
}, required: ['mission_fulfilled', 'mission_reasoning', 'conditions_met', 'conditions_reasoning', 'methodology_followed', 'methodology_reasoning', 'works_as_described', 'works_reasoning', 'connections_consistent', 'connections_reasoning', 'overall', 'summary', 'todo_to_pass'] };

function reshapeVerdict(flat) {
  if (!flat || typeof flat !== 'object') return null;
  const pair = (v, r) => ({ verdict: flat[v] || 'inconclusive', reasoning: flat[r] || '', evidence_quote: '' });
  return {
    mission_fulfilled: pair('mission_fulfilled', 'mission_reasoning'),
    conditions_met: pair('conditions_met', 'conditions_reasoning'),
    methodology_followed: pair('methodology_followed', 'methodology_reasoning'),
    works_as_described: pair('works_as_described', 'works_reasoning'),
    connections_consistent: pair('connections_consistent', 'connections_reasoning'),
    overall: flat.overall || 'inconclusive',
    summary: flat.summary || '',
    todo_to_pass: Array.isArray(flat.todo_to_pass) ? flat.todo_to_pass : [],
  };
}

function buildPrompt() {
  const s = [];
  s.push(`You are the Kanon Protocol's «Contract as Arbiter». Judge whether the IMPLEMENTATION of block ${blockId} genuinely satisfies its own contract — semantically, not just whether checks pass. Be a strict, honest reviewer. When the evidence is insufficient to decide a dimension, return "inconclusive" — never guess, never give a false pass.`);
  s.push('');
  s.push('## The block contract (what it is supposed to be)');
  s.push(`### mission (the MEANING)\n${contract.mission || '(empty)'}`);
  // user_story is the TOP layer (as I/who/want/so-that): the user's actual
  // job. The judge must check the implementation against this BEFORE the
  // narrower acceptance — if acceptance passes but the user_story isn't
  // satisfied, that's a mission_fulfilled FAIL.
  if (contract.user_story && contract.user_story.trim().length > 30) {
    s.push(`### user_story (the TOP layer — what the user actually wants)\n${contract.user_story}`);
  }
  s.push(`### kpi (measurable conditions)\n${contract.kpi || '(empty)'}`);
  s.push(`### acceptance (definition of done)\n${contract.acceptance || '(empty)'}`);
  s.push(`### provides (downstream contract)\n${contract.provides || '(none)'}`);
  s.push(`### depends_on\n${contract.depends_on || '(none)'}`);
  s.push('');
  s.push('## Methodology that must be honoured (the Counter-Force to simplification)');
  if (methodology.architecture_decisions) s.push(`### architecture_decisions (project-level, must NOT be silently reversed)\n${methodology.architecture_decisions.slice(0, 3000)}`);
  if (methodology.tech_stack) s.push(`### tech_stack (locked choices)\n${methodology.tech_stack.slice(0, 2000)}`);
  if (methodology.rules) s.push(`### rules\n${methodology.rules.slice(0, 2000)}`);
  if (methodology.dont_use.length) s.push(`### dont_use (hard/soft locks)\n${methodology.dont_use.map((e) => `- [${e.severity || 'soft'}] ${e.rule} — ${e.reason || ''}`).join('\n')}`);
  if (methodology.always_use.length) s.push(`### always_use\n${methodology.always_use.map((e) => `- [${e.severity || 'soft'}] ${e.rule} — ${e.reason || ''}`).join('\n')}`);
  s.push('');
  s.push('## What was ACTUALLY built (the reality to judge)');
  if (code.summary) s.push(`### code_summary\n${code.summary.slice(0, 3000)}`);
  s.push(`### code (alive files, ${code.fileCount} total)\n${code.body || '(no readable code files — judge on summary + contract; lean toward inconclusive on works_as_described)'}`);
  if (contract.narrative_tail) s.push(`### narrative (recent run history)\n${contract.narrative_tail}`);
  s.push('');
  s.push('## Upstream contracts this block depends on (for connection consistency)');
  for (const d of depProvides) s.push(`### ${d.id} provides\n${d.provides || '(empty)'}`);
  s.push('');
  s.push('## Your judgment — five dimensions, each tri-state {pass|fail|inconclusive}');
  s.push('1. mission_fulfilled — does the built code fulfil the mission\'s MEANING and, where given, the USER_STORY (what the user actually wants — As/When/I want/So that)? A locally-simpler substitute that misses the point is a FAIL even if the mission text is loosely satisfied.');
  s.push('2. conditions_met — does it satisfy the KPIs and the INTENT of acceptance (even beyond the literal deterministic checks)?');
  s.push('3. methodology_followed — does it honour architecture_decisions / tech_stack / rules / dont_use / always_use? A violation here (e.g. a regex where an LLM was required, a JSON file where Postgres was locked) is a FAIL even if tests pass.');
  s.push('4. works_as_described — reasoning about functional correctness: given the code, will it actually behave as the mission describes? Name concrete risks.');
  s.push('5. connections_consistent — do this block\'s `provides` match what its dependents need, and are its `depends_on` satisfied by the real upstream `provides` above?');
  s.push('');
  s.push('Then: overall ∈ {pass|fail|inconclusive} (fail if ANY dimension fails on a hard concern; inconclusive if you genuinely cannot tell). summary: 2-3 sentences. todo_to_pass: a concrete, ordered list of what must change for this block to truly satisfy its contract (this drives the next agent iteration). For each dimension, evidence_quote: a short verbatim excerpt (≤200 chars) from the contract or code supporting your verdict.');
  return s.join('\n\n');
}

// ── run + persist ───────────────────────────────────────────────────────────

const COST_CAP = Number(process.env.SEMANTIC_VERIFY_COST_CAP_USD || 0.05);

(async () => {
  const t0 = Date.now();
  let value, trace;
  try {
    const r = await callLLM({ prompt: buildPrompt(), schema: SCHEMA, op: 'semantic_verify', max_tokens: 8000, temperature: 0 });
    value = r.value || {}; trace = r.trace || {};
  } catch (e) {
    value = null; trace = { provider: 'error', cost_usd: 0 };
  }

  // Reshape flat schema → nested {verdict, reasoning} per dimension.
  const reshaped = reshapeVerdict(value);
  const inconclusiveDim = (reason) => ({ verdict: 'inconclusive', reasoning: reason, evidence_quote: '' });
  // A mock / no-key / error run yields a deterministic-empty shape. Treat
  // that — and any genuinely empty summary — as the honest «no live judge»
  // fallback, never a silent pass.
  const isMock = trace.provider === 'mock' || trace.provider === 'error';
  const hasRealVerdict = reshaped && reshaped.overall && reshaped.summary && reshaped.summary.trim().length > 0 && !isMock;
  const safe = hasRealVerdict ? reshaped : {
    mission_fulfilled: inconclusiveDim('no LLM verdict (mock / no key / error) — semantic check could not run'),
    conditions_met: inconclusiveDim('no LLM verdict'),
    methodology_followed: inconclusiveDim('no LLM verdict'),
    works_as_described: inconclusiveDim('no LLM verdict'),
    connections_consistent: inconclusiveDim('no LLM verdict'),
    overall: 'inconclusive',
    summary: 'Semantic verification was inconclusive — no live LLM judge available (mock provider or missing API key). Configure ANTHROPIC_API_KEY / GOOGLE_API_KEY (or claude_cli) to get a real verdict. Per Kanon, «we don\'t know» is never a pass.',
    todo_to_pass: [],
  };
  const cost = Number(trace.cost_usd || 0);
  if (cost > COST_CAP) safe.overall = 'inconclusive', safe.summary = `cost cap exceeded ($${cost.toFixed(4)} > $${COST_CAP}) — verdict withheld`;

  const result = {
    ok: true,
    block_id: blockId,
    checked_at: new Date().toISOString(),
    provider: trace.provider || null,
    model: trace.model || null,
    cost_usd: cost,
    mock: trace.provider === 'mock' || trace.provider === 'error',
    duration_ms: Date.now() - t0,
    ...safe,
  };

  // persist latest + narrative + checks.log
  try { fs.writeFileSync(path.join(dir, 'semantic_review.json'), JSON.stringify(result, null, 2) + '\n', 'utf8'); } catch {}
  try {
    const dims = ['mission_fulfilled', 'conditions_met', 'methodology_followed', 'works_as_described', 'connections_consistent'];
    const line = dims.map((d) => `${d}=${safe[d]?.verdict || '?'}`).join(' ');
    fs.appendFileSync(path.join(dir, 'checks.log'), `${result.checked_at}\tsemantic_verify\t${safe.overall}\t${line}\n`);
    if (safe.overall === 'fail' || (safe.todo_to_pass || []).length) {
      fs.appendFileSync(path.join(dir, 'narrative.md'),
        `\n## ${result.checked_at} · semantic verify · ${safe.overall}\n\n### Contract-as-Arbiter judgment\n- ${safe.summary}\n\n### To genuinely satisfy the contract\n${(safe.todo_to_pass || []).map((t) => `- ${t}`).join('\n') || '- (none)'}\n`);
    }
  } catch {}

  if (JSON_OUT) { process.stdout.write(JSON.stringify(result, null, 2) + '\n'); return; }
  const mark = (v) => v === 'pass' ? '✓' : v === 'fail' ? '✗' : '~';
  console.log(`semantic_verify ${blockId} → ${safe.overall.toUpperCase()} ${result.mock ? '(inconclusive — no live LLM)' : `(${result.provider})`}`);
  for (const d of ['mission_fulfilled', 'conditions_met', 'methodology_followed', 'works_as_described', 'connections_consistent']) {
    console.log(`  ${mark(safe[d]?.verdict)} ${d}: ${safe[d]?.verdict}${safe[d]?.reasoning ? ` — ${safe[d].reasoning.slice(0, 100)}` : ''}`);
  }
  console.log(`  summary: ${safe.summary}`);
  if ((safe.todo_to_pass || []).length) {
    console.log('  todo to pass:');
    for (const todo of safe.todo_to_pass) console.log(`    • ${todo}`);
  }
})();

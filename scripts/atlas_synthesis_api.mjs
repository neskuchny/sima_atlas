#!/usr/bin/env node
// Atlas Synthesis API — LLM-backed block / edge / task generation.
//
// «Sima сама создаёт схему» — the headline promise from the design PDF.
// Three operations:
//   synthesizeBlock — given an artifact body or free text + product context,
//                    propose 1-3 block drafts (id/title/layer/mission/kpi/
//                    acceptance/depends_on capabilities/provides capabilities).
//   suggestEdges   — given the current graph + a focal block, propose
//                    `provides ↔ depends_on` connections that look semantically
//                    consistent.
//   decomposeTasks — given a block's mission, propose a 4-8 task breakdown.
//
// All three call the shared callLLM (anthropic / google / mock) with a
// JSON schema. Mock provider returns deterministicEmpty so the design UI
// degrades to "demo-режим" with a clear label rather than a stack trace.

import { callLLM } from './llm_gateway.mjs';

const VALID_LAYERS = ['logic', 'data', 'front', 'testing'];

// ─── synthesizeBlock ─────────────────────────────────────────────────
const BLOCK_SCHEMA = {
  type: 'object',
  properties: {
    proposals: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:       { type: 'string', description: 'b.<base>-<n> shape; lowercase, hyphens, ≤32 chars after b.' },
          title:    { type: 'string' },
          layer:    { type: 'string', enum: VALID_LAYERS },
          mission:  { type: 'string', description: 'Markdown — 4-8 sentences. Why does this block exist? What problem does it solve?' },
          kpi:      { type: 'array', items: { type: 'string', description: 'one KPI line, e.g. "p95 < 200ms" or "0 lost webhooks"' } },
          acceptance:{type: 'array', items: { type: 'string', description: 'one acceptance criterion line' } },
          depends_on_capabilities: { type: 'array', items: { type: 'string' } },
          provides_capabilities:   { type: 'array', items: { type: 'string' } },
          rationale: { type: 'string' },
        },
        required: ['id', 'title', 'layer', 'mission'],
      },
    },
  },
  required: ['proposals'],
};

function buildBlockSystemPrompt(productContext) {
  const ctx = productContext ? `\nProduct: ${productContext.title || ''}\nGoal: ${productContext.goal || ''}\nMission: ${productContext.mission || ''}` : '';
  return [
    'You are SIMA Atlas, an architect that turns artefacts (meeting transcripts,',
    'documents, ideas) into well-shaped product blocks. A "block" is a folder',
    'in atlas/blocks/<id>/ with mission.md, kpi.md, acceptance.md, depends_on.md',
    'and provides.md (capabilities). Layer is one of:',
    '  logic   — backend/domain code',
    '  data    — storage, schema, warehouse',
    '  front   — UI / client',
    '  testing — verifiers, smoke, integration',
    '',
    'Reply ONLY with structured JSON matching the requested schema. Each',
    'proposal:',
    '  - id starts with "b." then [a-z0-9-]+ (≤32 chars after the prefix)',
    '  - mission: 4-8 sentences in Russian if the input is Russian, English otherwise',
    '  - kpi: 2-5 measurable lines',
    '  - acceptance: 3-6 testable criteria, one per line',
    '  - capabilities are short snake_case identifiers, e.g. "user_events", "audit_log"',
    'Generate 1-3 proposals — only the most useful, do not pad.',
    ctx,
  ].join('\n');
}

export async function synthesizeBlock({ source_text, product_context, count = 3 } = {}) {
  if (!source_text || typeof source_text !== 'string') {
    throw new Error('synthesizeBlock: source_text required');
  }
  const cap = Math.min(Math.max(1, Number(count) || 3), 5);
  const prompt = [
    `Source artefact (count up to ${cap} proposals):`,
    '',
    String(source_text).slice(0, 6000),
    '',
    'Propose blocks that this artefact suggests should exist in the product.',
    'Prefer few high-quality proposals over many shallow ones.',
  ].join('\n');
  const r = await callLLM({
    system: buildBlockSystemPrompt(product_context),
    prompt,
    schema: BLOCK_SCHEMA,
    max_tokens: 1500,
    temperature: 0.4,
    op: 'synthesis_block',
  });
  const proposals = Array.isArray(r.value?.proposals) ? r.value.proposals : [];
  // Sanitize: drop entries that don't validate; coerce ids to b.* form.
  const cleaned = [];
  for (const p of proposals) {
    if (!p || typeof p !== 'object') continue;
    if (!p.title || !p.mission) continue;
    let id = String(p.id || '').toLowerCase().trim();
    if (!id.startsWith('b.')) id = 'b.' + id.replace(/^b\./, '');
    id = id.replace(/[^a-z0-9._-]/g, '-').replace(/-+/g, '-').replace(/^[.-]+|[.-]+$/g, '');
    if (!/^b\.[a-z0-9._-]{1,40}$/.test(id)) id = `b.${String(p.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'idea'}`;
    cleaned.push({
      id,
      title: String(p.title).trim(),
      layer: VALID_LAYERS.includes(p.layer) ? p.layer : 'logic',
      mission: String(p.mission).trim(),
      kpi: Array.isArray(p.kpi) ? p.kpi.filter(Boolean).map(String) : [],
      acceptance: Array.isArray(p.acceptance) ? p.acceptance.filter(Boolean).map(String) : [],
      depends_on_capabilities: Array.isArray(p.depends_on_capabilities) ? p.depends_on_capabilities.filter(Boolean).map(String) : [],
      provides_capabilities:   Array.isArray(p.provides_capabilities)   ? p.provides_capabilities.filter(Boolean).map(String)   : [],
      rationale: String(p.rationale || '').trim() || undefined,
    });
  }
  return {
    ok: true,
    proposals: cleaned,
    provider: r.trace?.provider || null,
    model: r.trace?.model || null,
    mock: r.trace?.provider === 'mock',
  };
}

// ─── suggestEdges ───────────────────────────────────────────────────
const EDGE_SCHEMA = {
  type: 'object',
  properties: {
    edges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string' },
          to:   { type: 'string' },
          capability: { type: 'string' },
          kind: { type: 'string', enum: ['contract', 'data', 'rbac', 'schema', 'event'] },
          rationale: { type: 'string' },
        },
        required: ['from', 'to'],
      },
    },
  },
  required: ['edges'],
};

export async function suggestEdges({ focal_block_id, modules = [], edges = [] } = {}) {
  if (!focal_block_id) throw new Error('suggestEdges: focal_block_id required');
  const focal = modules.find((m) => m.id === focal_block_id);
  if (!focal) throw new Error(`suggestEdges: focal block ${focal_block_id} not in modules`);
  const others = modules.filter((m) => m.id !== focal_block_id).slice(0, 25);
  const existingEdges = edges
    .filter((e) => e.from === focal_block_id || e.to === focal_block_id)
    .map((e) => ({ from: e.from, to: e.to, kind: e.kind, capability: e.label || e.capability }));
  const sys = [
    'You are SIMA Atlas. Propose edges (depends_on) FROM the focal block to other blocks',
    'that supply capabilities the focal block needs. Each edge must reference an existing',
    'block id from the provided list — do not invent new blocks. Use:',
    '  kind=data when one block streams events/rows to another',
    '  kind=schema when one block defines types the other consumes',
    '  kind=rbac when one block authorises calls to another',
    '  kind=contract for plain functional dependencies (default)',
    '  kind=event for fire-and-forget pub/sub',
    'Skip edges that already exist. Reply ONLY structured JSON.',
  ].join('\n');
  const prompt = [
    'Focal block:',
    JSON.stringify({ id: focal.id, title: focal.title, layer: focal.layer, tag: focal.tag }, null, 2),
    '',
    'Candidate blocks (id / title / layer):',
    others.map((m) => `- ${m.id}  ${m.title}  [${m.layer}]`).join('\n'),
    '',
    'Existing edges already on focal block:',
    existingEdges.length ? JSON.stringify(existingEdges, null, 2) : '(none)',
    '',
    'Propose 0-5 NEW edges. Be conservative — only suggest edges that clearly make sense.',
  ].join('\n');
  const r = await callLLM({
    system: sys,
    prompt,
    schema: EDGE_SCHEMA,
    max_tokens: 700,
    temperature: 0.3,
    op: 'synthesis_edges',
  });
  const known = new Set(modules.map((m) => m.id));
  const cleaned = (r.value?.edges || [])
    .filter((e) => e && e.from && e.to && known.has(e.from) && known.has(e.to))
    .filter((e) => !existingEdges.some((x) => x.from === e.from && x.to === e.to))
    .slice(0, 5)
    .map((e) => ({
      from: String(e.from),
      to:   String(e.to),
      capability: e.capability ? String(e.capability) : null,
      kind: ['contract', 'data', 'rbac', 'schema', 'event'].includes(e.kind) ? e.kind : 'contract',
      rationale: e.rationale ? String(e.rationale) : '',
    }));
  return { ok: true, edges: cleaned, provider: r.trace?.provider || null, model: r.trace?.model || null, mock: r.trace?.provider === 'mock' };
}

// ─── decomposeTasks ─────────────────────────────────────────────────
const TASK_SCHEMA = {
  type: 'object',
  properties: {
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id:       { type: 'string', description: 'short identifier like T-1, T-2' },
          title:    { type: 'string' },
          priority: { type: 'string', enum: ['p0', 'p1', 'p2', 'p3'] },
          agent:    { type: 'string', enum: ['claude', 'cursor', 'codex', 'human'] },
          note:     { type: 'string' },
        },
        required: ['title'],
      },
    },
  },
  required: ['tasks'],
};

export async function decomposeTasks({ block_id, title, mission, layer } = {}) {
  if (!block_id) throw new Error('decomposeTasks: block_id required');
  const sys = [
    'You are SIMA Atlas. Decompose a block mission into 4-8 concrete implementation tasks.',
    'Each task must be:',
    '  - small enough to fit one PR (no "build the whole system")',
    '  - actionable, starting with a verb',
    '  - typed with a priority p0..p3 (p0 = blocks shipping)',
    '  - assigned to one agent: claude (Claude Code, can edit files in workspace),',
    '    cursor (UI hooks, react-tied work), codex (script-heavy refactors),',
    '    human (decisions, design choices needing approval)',
    'Reply ONLY structured JSON.',
  ].join('\n');
  const prompt = [
    `Block: ${block_id} — "${title || ''}"`,
    `Layer: ${layer || 'logic'}`,
    '',
    'Mission:',
    String(mission || '').slice(0, 4000),
    '',
    'Propose 4-8 tasks. Number them T-1, T-2, ...',
  ].join('\n');
  const r = await callLLM({
    system: sys,
    prompt,
    schema: TASK_SCHEMA,
    max_tokens: 900,
    temperature: 0.3,
    op: 'synthesis_tasks',
  });
  const tasks = (r.value?.tasks || [])
    .filter((t) => t && t.title)
    .slice(0, 8)
    .map((t, i) => ({
      id: t.id ? String(t.id) : `T-${i + 1}`,
      title: String(t.title).trim(),
      priority: ['p0', 'p1', 'p2', 'p3'].includes(t.priority) ? t.priority : 'p2',
      agent: ['claude', 'cursor', 'codex', 'human'].includes(t.agent) ? t.agent : 'claude',
      note: t.note ? String(t.note).trim() : '',
    }));
  return { ok: true, tasks, provider: r.trace?.provider || null, model: r.trace?.model || null, mock: r.trace?.provider === 'mock' };
}

// ─── fillField / rewriteField ───────────────────────────────────────
// Per-field AI assist for the design UI's «Контракт» tab. Each block has
// 5 markdown files (mission, kpi, acceptance, depends_on, provides);
// these helpers generate or refine one of them given the rest as context.

const FIELD_SCHEMA = {
  type: 'object',
  properties: { content: { type: 'string' } },
  required: ['content'],
};

const FIELD_GUIDANCE = {
  'mission.md':    'Markdown — 4-8 sentences. Why does this block exist? What problem does it solve in the product?',
  'kpi.md':        'Markdown — 2-5 measurable KPI lines as a bulleted list. Each line is one metric (latency, error rate, throughput, business KPI).',
  'acceptance.md': 'Markdown — 3-6 testable acceptance criteria as a checkbox list (- [ ] **A1.** ...). Each criterion must be verifiable from code or output.',
  'depends_on.md': 'Markdown — short bulleted list of blocks this depends on with the capability name (e.g. `- b.auth: rbac_check`).',
  'provides.md':   'Markdown — short bulleted list of capabilities this block provides to others (snake_case identifiers).',
  'tasks.md':      'Markdown — 4-8 task lines starting with `- [ ] T-N:`',
};

function buildFieldSystemPrompt(field) {
  return [
    'You are SIMA Atlas, an architect helping the operator fill in a block contract file.',
    `Target file: ${field}`,
    'Conventions:',
    `  ${FIELD_GUIDANCE[field] || 'Markdown — concise, factual, no fluff.'}`,
    'Reply ONLY with structured JSON: { "content": "..." }.',
    'Keep the language matching the surrounding context (Russian if Russian, English if English).',
    'Do not include the leading H1 — the file already has it.',
  ].join('\n');
}

export async function fillField({ block_id, field, mission_context, layer, neighbors } = {}) {
  if (!block_id || !field) throw new Error('fillField: block_id and field required');
  if (!FIELD_GUIDANCE[field]) throw new Error(`fillField: unsupported field "${field}"`);
  const prompt = [
    `Block: ${block_id}  (layer: ${layer || 'logic'})`,
    '',
    'Mission / context:',
    String(mission_context || '').slice(0, 4000) || '(empty — infer from id and layer)',
    '',
    neighbors?.kpi ? `Existing KPI:\n${String(neighbors.kpi).slice(0, 600)}\n` : '',
    neighbors?.acceptance ? `Existing acceptance:\n${String(neighbors.acceptance).slice(0, 600)}\n` : '',
    neighbors?.depends_on ? `depends_on:\n${String(neighbors.depends_on).slice(0, 400)}\n` : '',
    '',
    `Generate the body of ${field} now. Reply with JSON.`,
  ].join('\n');
  const r = await callLLM({
    system: buildFieldSystemPrompt(field),
    prompt,
    schema: FIELD_SCHEMA,
    max_tokens: 700,
    temperature: 0.4,
    op: 'synthesis_fill_field',
  });
  const content = String(r.value?.content || '').trim();
  return { ok: true, block_id, field, content, provider: r.trace?.provider || null, model: r.trace?.model || null, mock: r.trace?.provider === 'mock' };
}

// ─── extractInsights (Phase G) ───────────────────────────────────
// Reads a meeting transcript / document / free text and pulls out the
// goals / constraints / ideas / domain terms hidden inside, so the
// Composer can offer them as auto-tags or follow-up artifacts.

const INSIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'one-sentence summary of the source' },
    goals:       { type: 'array', items: { type: 'string', description: 'a desired outcome explicitly mentioned' } },
    constraints: { type: 'array', items: { type: 'string', description: 'a limitation, deadline, or non-negotiable' } },
    ideas:       { type: 'array', items: { type: 'string', description: 'a candidate solution or experiment' } },
    risks:       { type: 'array', items: { type: 'string', description: 'a risk, blocker, or open question' } },
    terms:       { type: 'array', items: { type: 'string', description: 'a domain term worth treating as a tag (snake_case or kebab-case)' } },
  },
  required: ['summary'],
};

export async function extractInsights({ text, kind } = {}) {
  if (!text || typeof text !== 'string') throw new Error('extractInsights: text required');
  const sys = [
    'You are SIMA Atlas. Read the source carefully and extract structured insights.',
    'Rules:',
    '  - Only extract things the source actually mentions; do not invent.',
    '  - Goals: outcomes the speakers want.',
    '  - Constraints: deadlines, budget caps, non-negotiable rules, technical limits.',
    '  - Ideas: candidate solutions / experiments / proposals.',
    '  - Risks: blockers, open questions, things that might fail.',
    '  - Terms: 3-12 short domain words (kebab-case or snake_case) to use as tags.',
    '  - Each list item is ONE concise sentence (≤ 20 words).',
    '  - Match the language of the source (Russian → Russian, English → English).',
    'Reply ONLY structured JSON.',
  ].join('\n');
  const prompt = [
    `Source kind: ${kind || 'document'}`,
    '',
    'Source:',
    String(text).slice(0, 8000),
  ].join('\n');
  const r = await callLLM({
    system: sys,
    prompt,
    schema: INSIGHTS_SCHEMA,
    max_tokens: 1200,
    temperature: 0.3,
    op: 'synthesis_extract_insights',
  });
  const v = r.value || {};
  const arr = (a) => Array.isArray(a) ? a.filter(Boolean).map((x) => String(x).trim()).filter(Boolean).slice(0, 12) : [];
  return {
    ok: true,
    summary: String(v.summary || '').trim(),
    goals: arr(v.goals),
    constraints: arr(v.constraints),
    ideas: arr(v.ideas),
    risks: arr(v.risks),
    terms: arr(v.terms).map((t) => t.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-|-$/g, '')).filter((t) => t.length > 1).slice(0, 10),
    provider: r.trace?.provider || null,
    model: r.trace?.model || null,
    mock: r.trace?.provider === 'mock',
  };
}

export async function rewriteField({ block_id, field, current_content, mission_context } = {}) {
  if (!block_id || !field) throw new Error('rewriteField: block_id and field required');
  if (!FIELD_GUIDANCE[field]) throw new Error(`rewriteField: unsupported field "${field}"`);
  if (!current_content) throw new Error('rewriteField: current_content required');
  const sys = [
    'You are SIMA Atlas. Rewrite the operator-supplied draft to:',
    '  - keep all factual info — do NOT drop or invent content',
    '  - improve clarity, tighten language, fix obvious typos',
    '  - keep markdown structure (headings/bullets/checkboxes)',
    '  - preserve the language (Russian → Russian, English → English)',
    `  - target file: ${field} — ${FIELD_GUIDANCE[field] || ''}`,
    'Reply ONLY with structured JSON: { "content": "..." }.',
  ].join('\n');
  const prompt = [
    `Block: ${block_id}`,
    mission_context ? `Mission context:\n${String(mission_context).slice(0, 2000)}\n` : '',
    'Current draft (rewrite it):',
    String(current_content).slice(0, 6000),
  ].join('\n');
  const r = await callLLM({
    system: sys,
    prompt,
    schema: FIELD_SCHEMA,
    max_tokens: 800,
    temperature: 0.25,
    op: 'synthesis_rewrite_field',
  });
  const content = String(r.value?.content || '').trim();
  return { ok: true, block_id, field, content, original: String(current_content), provider: r.trace?.provider || null, model: r.trace?.model || null, mock: r.trace?.provider === 'mock' };
}

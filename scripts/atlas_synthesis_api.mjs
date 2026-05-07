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
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const VALID_LAYERS = ['logic', 'data', 'front', 'testing'];

// R-7.39 — собираем «полный контекст для LLM» по блоку: project.md /
// rules.md / tech_stack.md, граф (все блоки + их короткие миссии),
// для текущего блока — список depends_on соседей с их mission.md.
// Это даёт LLM достаточный контекст чтобы fillField/rewriteField
// учитывал структуру всего проекта, а не сидел в вакууме одного блока.
function safeRead(p) { try { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; } catch { return ''; } }
function buildBlockContext({ client_id, block_id }) {
  if (!block_id) return null;
  const clientRoot = client_id && /^[a-zA-Z0-9._-]+$/.test(client_id)
    ? path.join(ROOT, 'atlas', 'clients', client_id)
    : path.join(ROOT, 'atlas');
  const projectMd = safeRead(path.join(clientRoot, 'project.md')).slice(0, 4000);
  const rulesMd   = safeRead(path.join(clientRoot, 'rules.md')).slice(0, 2000);
  const stackMd   = safeRead(path.join(clientRoot, 'tech_stack.md')).slice(0, 2000);
  const graphP = path.join(clientRoot, 'graph.json');
  let graph = null;
  try { graph = fs.existsSync(graphP) ? JSON.parse(fs.readFileSync(graphP, 'utf8')) : null; } catch {}
  const blocks = (graph?.blocks || []);
  const edges = (graph?.edges || []);
  const focal = blocks.find((b) => b.id === block_id);
  // Соседи: блоки, на которые ссылается this.depends_on (R-7 формат graph
  // хранит depends_on как `<block_id>:<capability>`) — резолвим до block_id.
  const depsRaw = focal?.depends_on || [];
  const depBlockIds = new Set();
  for (const d of depsRaw) {
    const m = String(d || '').match(/^(b\.[\w.-]+)/);
    if (m) depBlockIds.add(m[1]);
  }
  // Дополнительно — edges from current block (если другие блоки указывают на нас).
  // Контекст inbound полезен «кто меня использует».
  const inbound = edges.filter((e) => e.to === block_id);
  const outbound = edges.filter((e) => e.from === block_id);
  const neighborMissions = [];
  for (const id of depBlockIds) {
    const nb = blocks.find((b) => b.id === id);
    if (!nb) continue;
    const mission = safeRead(path.join(clientRoot, 'blocks', id, 'mission.md')).slice(0, 600);
    neighborMissions.push({ id, title: nb.title || id, mission: mission.trim() });
  }
  // Краткий «индекс всех блоков проекта» (id + title + layer) — даёт LLM
  // понимание масштаба и места текущего блока в общей картине.
  const blockIndex = blocks.map((b) => ({ id: b.id, title: b.title || b.id, layer: b.layer || '' }));
  return {
    client_id: client_id || null,
    project: { project_md: projectMd, rules_md: rulesMd, tech_stack_md: stackMd },
    focal: focal ? { id: focal.id, title: focal.title, layer: focal.layer } : null,
    block_index: blockIndex,
    neighbors: {
      depends_on: neighborMissions,
      inbound_edges:  inbound.map((e) => ({ from: e.from, capability: e.capability || e.label || '' })),
      outbound_edges: outbound.map((e) => ({ to: e.to, capability: e.capability || e.label || '' })),
    },
  };
}
function renderContextForPrompt(ctx) {
  if (!ctx) return '';
  const lines = [];
  if (ctx.project.project_md.trim()) {
    lines.push('## Project context (project.md)', ctx.project.project_md.trim(), '');
  }
  if (ctx.project.rules_md.trim()) {
    lines.push('## Project rules (rules.md)', ctx.project.rules_md.trim(), '');
  }
  if (ctx.project.tech_stack_md.trim()) {
    lines.push('## Tech stack (tech_stack.md)', ctx.project.tech_stack_md.trim(), '');
  }
  if (ctx.block_index.length) {
    lines.push('## All blocks in this project (id · title · layer)');
    for (const b of ctx.block_index) lines.push(`  - ${b.id} · ${b.title} · ${b.layer || '-'}`);
    lines.push('');
  }
  if (ctx.neighbors.depends_on.length) {
    lines.push('## Blocks THIS block depends on (their missions):');
    for (const n of ctx.neighbors.depends_on) {
      lines.push(`### ${n.id} — ${n.title}`);
      lines.push(n.mission || '(empty)');
      lines.push('');
    }
  }
  if (ctx.neighbors.inbound_edges.length) {
    lines.push('## Blocks that depend on THIS block:');
    for (const e of ctx.neighbors.inbound_edges) lines.push(`  - ${e.from} (capability: ${e.capability || '-'})`);
    lines.push('');
  }
  if (ctx.neighbors.outbound_edges.length) {
    lines.push('## Capabilities THIS block provides:');
    for (const e of ctx.neighbors.outbound_edges) lines.push(`  - → ${e.to} (capability: ${e.capability || '-'})`);
    lines.push('');
  }
  return lines.join('\n');
}

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

// K4 — intent biases the system prompt so Sima frames proposals through
// the right lens (a "book" structure looks different from a "marketing
// campaign" or a "SaaS product").
const INTENT_HINTS = {
  product:   'Frame proposals as software-product modules: backend services, data stores, UI, billing.',
  book:      'Frame proposals as book chapters or supporting structures (thesis, audience, sources, outline).',
  idea:      'Frame proposals as steps in idea-validation: hypothesis, riskiest assumption, experiment, metric, kill criteria.',
  marketing: 'Frame proposals as marketing-campaign pieces: ICP, channel, offer, landing, metrics, nurture.',
  custom:    '',
};

function buildBlockSystemPrompt(productContext, intent) {
  const ctx = productContext ? `\nProduct: ${productContext.title || ''}\nGoal: ${productContext.goal || ''}\nMission: ${productContext.mission || ''}` : '';
  const intentHint = intent && INTENT_HINTS[intent] ? `\nIntent: ${INTENT_HINTS[intent]}` : '';
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
    intentHint,
  ].join('\n');
}

export async function synthesizeBlock({ source_text, product_context, count = 3, intent } = {}) {
  if (!source_text || typeof source_text !== 'string') {
    throw new Error('synthesizeBlock: source_text required');
  }
  const cap = Math.min(Math.max(1, Number(count) || 3), 5);
  const cleanIntent = intent && INTENT_HINTS[intent] ? intent : 'custom';
  const prompt = [
    `Source artefact (count up to ${cap} proposals):`,
    '',
    String(source_text).slice(0, 6000),
    '',
    'Propose blocks that this artefact suggests should exist in the product.',
    'Prefer few high-quality proposals over many shallow ones.',
  ].join('\n');
  const r = await callLLM({
    system: buildBlockSystemPrompt(product_context, cleanIntent),
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
  'user_story.md': 'Markdown — single user story in classic format: **Как** [persona] / **Когда** [trigger] / **Я хочу** [action] / **Чтобы** [outcome]. The OUTCOME line is what determines whether the block actually solves the right problem.',
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

export async function fillField({ block_id, field, mission_context, layer, neighbors, client_id } = {}) {
  if (!block_id || !field) throw new Error('fillField: block_id and field required');
  if (!FIELD_GUIDANCE[field]) throw new Error(`fillField: unsupported field "${field}"`);
  // R-7.39 — собираем контекст проекта (project.md, rules.md, tech_stack.md
  // + индекс блоков + миссии соседей по depends_on). LLM теперь видит весь
  // граф, а не только файлы текущего блока.
  const ctx = buildBlockContext({ client_id, block_id });
  const ctxBlock = renderContextForPrompt(ctx);
  const prompt = [
    ctxBlock ? '# Project & graph context (READ FIRST)\n' + ctxBlock : '',
    `# Current block: ${block_id}  (layer: ${layer || ctx?.focal?.layer || 'logic'})`,
    '',
    'Existing files of THIS block:',
    `- mission.md:\n${String(mission_context || '').slice(0, 4000) || '(empty — infer from id, layer, project context)'}`,
    neighbors?.kpi ? `- kpi.md:\n${String(neighbors.kpi).slice(0, 600)}` : '',
    neighbors?.acceptance ? `- acceptance.md:\n${String(neighbors.acceptance).slice(0, 600)}` : '',
    neighbors?.depends_on ? `- depends_on.md:\n${String(neighbors.depends_on).slice(0, 400)}` : '',
    '',
    `Generate the body of ${field} now. Use the project context + neighbor missions above to make this block fit cleanly into the existing graph (no duplication of capabilities, no contradictions with rules). Reply with JSON.`,
  ].filter(Boolean).join('\n');
  const r = await callLLM({
    system: buildFieldSystemPrompt(field),
    prompt,
    schema: FIELD_SCHEMA,
    max_tokens: 1200,
    temperature: 0.4,
    op: 'synthesis_fill_field',
  });
  const content = String(r.value?.content || '').trim();
  return { ok: true, block_id, field, content, provider: r.trace?.provider || null, model: r.trace?.model || null, mock: r.trace?.provider === 'mock' };
}

// ─── reviewArchitecture (Phase Q-3) ───────────────────────────────
// Whole-product LLM review. Looks at the graph, all blocks' missions
// + tech_stacks, project.md (с заявленным load profile / multi-user /
// фильтрами / etc) and surfaces architectural concerns.
//
// Returns:
//   {verdict: 'aligned'|'drift'|'broken', concerns: [{kind, severity,
//    evidence, fix?}], strengths: [string]}

const ARCH_SCHEMA = {
  type: 'object',
  properties: {
    verdict:    { type: 'string', enum: ['aligned', 'drift', 'broken'] },
    summary:    { type: 'string' },
    concerns:   {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind:     { type: 'string', enum: ['stack_consistency', 'scalability', 'multi_tenant', 'data_flow', 'security', 'missing_block', 'redundancy', 'condition'] },
          severity: { type: 'string', enum: ['low', 'med', 'high'] },
          evidence: { type: 'string' },
          fix:      { type: 'string' },
          blocks:   { type: 'array', items: { type: 'string' } },
        },
        required: ['kind', 'severity', 'evidence'],
      },
    },
    strengths:  { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'summary'],
};

export async function reviewArchitecture({
  project_md, rules_md, tech_stack_md,
  blocks, edges,
} = {}) {
  if (!Array.isArray(blocks)) throw new Error('reviewArchitecture: blocks[] required');
  const sys = [
    'You are SIMA Atlas — a senior software architect.',
    'Review THE ENTIRE PRODUCT (not one block). Surface architectural concerns:',
    '',
    'kinds:',
    '  stack_consistency — different blocks declare incompatible frameworks',
    '  scalability      — design will not handle the stated load profile',
    '  multi_tenant     — single-tenant design where multi-user was promised (or vice versa)',
    '  data_flow        — missing filtering / projection layer for fetching specific data',
    '  security         — auth/authorization gaps between blocks',
    '  missing_block    — a capability is required but no block provides it',
    '  redundancy       — two blocks doing essentially the same thing',
    '  condition        — project-wide condition stated in project.md/rules.md is violated',
    '',
    'Severity high = will fail in production / blocks shipping.',
    'Severity med = will require painful rewrite later.',
    'Severity low = nice-to-fix, not urgent.',
    '',
    'Be conservative — only flag what the input actually shows. Match input language.',
    'Reply ONLY structured JSON.',
  ].join('\n');
  const blockSnippets = blocks.slice(0, 30).map((b) => {
    return `- ${b.id} (${b.layer}) "${b.title}"
  mission: ${(b.mission || '').slice(0, 280)}
  stack: ${(b.tech_stack || []).join(', ') || '(none)'}
  status: ${b.status}`;
  }).join('\n');
  const prompt = [
    'PROJECT CONTEXT:',
    `project.md:\n${(project_md || '(empty)').slice(0, 2000)}`,
    `\nrules.md:\n${(rules_md || '(empty)').slice(0, 1500)}`,
    `\ntech_stack.md:\n${(tech_stack_md || '(empty)').slice(0, 1000)}`,
    '',
    'BLOCKS:',
    blockSnippets,
    '',
    'EDGES:',
    (edges || []).slice(0, 50).map((e) => `${e.from} → ${e.to} (${e.kind || 'contract'}${e.capability ? ': ' + e.capability : ''})`).join('\n'),
    '',
    'Now review the architecture as a whole.',
  ].join('\n');
  const r = await callLLM({
    system: sys, prompt, schema: ARCH_SCHEMA,
    max_tokens: 1500, temperature: 0.2, op: 'review_architecture',
  });
  const v = r.value || {};
  return {
    ok: true,
    verdict: ['aligned', 'drift', 'broken'].includes(v.verdict) ? v.verdict : 'drift',
    summary: String(v.summary || '').trim(),
    concerns: Array.isArray(v.concerns) ? v.concerns.filter((c) => c?.kind && c?.evidence).slice(0, 12) : [],
    strengths: Array.isArray(v.strengths) ? v.strengths.filter(Boolean).map(String).slice(0, 8) : [],
    provider: r.trace?.provider || null,
    model: r.trace?.model || null,
    mock: r.trace?.provider === 'mock',
  };
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

// ─── validateBlock (Phase N-1) ───────────────────────────────────
// «Работает, но не то». Sync-check проверяет наличие файлов; этот
// валидатор спрашивает у LLM: реально ли реализация блока соответствует
// его mission / acceptance / KPI / правилам проекта / tech_stack /
// условиям соседних блоков. Возвращает structured verdict.
//
// Returns: {
//   verdict: 'aligned' | 'drift' | 'broken',
//   summary: string,
//   violations: [{ kind, severity: 'low'|'med'|'high', evidence, fix? }],
//   matches:    [string],   // что хорошо
// }

const VALIDATE_SCHEMA = {
  type: 'object',
  properties: {
    verdict:    { type: 'string', enum: ['aligned', 'drift', 'broken'] },
    summary:    { type: 'string', description: 'one-sentence verdict explanation' },
    violations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind:     { type: 'string', enum: ['mission', 'user_story', 'kpi', 'acceptance', 'rules', 'tech_stack', 'depends_on', 'condition'] },
          severity: { type: 'string', enum: ['low', 'med', 'high'] },
          evidence: { type: 'string' },
          fix:      { type: 'string' },
        },
        required: ['kind', 'severity', 'evidence'],
      },
    },
    matches: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'summary'],
};

export async function validateBlock({
  block_id,
  mission, kpi, acceptance, tasks, depends_on_md, provides_md,
  decisions, checks_tail, files,
  project_md, rules_md, tech_stack_md,
  neighbors,
  user_story, code_summary,
} = {}) {
  if (!block_id) throw new Error('validateBlock: block_id required');
  const sys = [
    'You are SIMA Atlas — a senior architect doing block consistency review.',
    'Goal: decide whether the block\'s ACTUAL state (what was decided + tested + which files exist) ',
    'aligns with what was PROMISED (mission, KPI, acceptance, conditions / rules / tech_stack).',
    '',
    'Verdict rubric:',
    '  aligned — implementation matches mission and respects all constraints',
    '  drift   — partial match; some KPI/acceptance unverified or one rule violated',
    '  broken  — fundamentally fails the mission or violates a hard rule (e.g. forbidden lib)',
    '',
    'For each violation classify the kind:',
    '  mission     — implementation diverges from why this block exists',
    '  user_story  — code passes acceptance but does NOT actually solve the user story (the END USER would not get the intended outcome)',
    '  kpi         — a measurable target not met or not measured',
    '  acceptance  — a specific criterion not satisfied',
    '  rules       — violates rules.md (style, forbidden patterns)',
    '  tech_stack  — uses a lib/framework not in tech_stack.md',
    '  depends_on  — broken contract with neighbor (capability missing)',
    '  condition   — block-specific condition (visual, functional) unmet — e.g. mission says "must use LLM for semantic decisions" but the code uses a static formula',
    '',
    'Be strict but fair. If evidence is missing, flag as drift+kpi (not measured).',
    'Reply ONLY with structured JSON matching the schema. Match the input language.',
  ].join('\n');
  const prompt = [
    `Block: ${block_id}`,
    '',
    '== PROMISED ==',
    `mission.md:\n${(mission || '(empty)').slice(0, 2000)}`,
    user_story ? `\nuser_story.md (КАК / КОГДА / ЧТО / ЗАЧЕМ):\n${user_story.slice(0, 1500)}` : '',
    `\nkpi.md:\n${(kpi || '(empty)').slice(0, 800)}`,
    `\nacceptance.md:\n${(acceptance || '(empty)').slice(0, 1500)}`,
    `\ntasks.md (что собирались сделать):\n${(tasks || '(empty)').slice(0, 1000)}`,
    `\ndepends_on.md:\n${(depends_on_md || '(empty)').slice(0, 500)}`,
    `\nprovides.md:\n${(provides_md || '(empty)').slice(0, 500)}`,
    '',
    '== CONSTRAINTS ==',
    `project.md (главная цель):\n${(project_md || '(empty)').slice(0, 1500)}`,
    `\nrules.md (запреты, стиль):\n${(rules_md || '(empty)').slice(0, 1500)}`,
    `\ntech_stack.md:\n${(tech_stack_md || '(empty)').slice(0, 800)}`,
    '',
    '== ACTUAL ==',
    code_summary ? `code_summary.md (что реально написано в коде блока):\n${code_summary.slice(0, 2000)}\n` : '',
    `decisions.log (последние записи):\n${(decisions || '(empty)').slice(0, 2000)}`,
    `\nchecks.log (последние проверки):\n${(checks_tail || '(empty)').slice(0, 1500)}`,
    `\nfiles.md (что относится к блоку):\n${(files || '(empty)').slice(0, 800)}`,
    '',
    neighbors?.length ? `== NEIGHBORS ==\n${neighbors.slice(0, 6).map((n) => `- ${n.id} (${n.layer}) provides:\n  ${(n.provides_md || '').slice(0, 200)}`).join('\n')}\n` : '',
    'Now decide: does ACTUAL match PROMISED under CONSTRAINTS? Pay special attention to user_story (high-level intent) — code that satisfies acceptance but violates the user_story is still drift/broken.',
  ].join('\n');
  const r = await callLLM({
    system: sys,
    prompt,
    schema: VALIDATE_SCHEMA,
    max_tokens: 1200,
    temperature: 0.2,
    op: 'synthesis_validate_block',
  });
  const v = r.value || {};
  return {
    ok: true,
    block_id,
    verdict: ['aligned', 'drift', 'broken'].includes(v.verdict) ? v.verdict : 'drift',
    summary: String(v.summary || '').trim(),
    violations: Array.isArray(v.violations) ? v.violations.filter((x) => x && x.kind && x.evidence).slice(0, 10) : [],
    matches: Array.isArray(v.matches) ? v.matches.filter(Boolean).map(String).slice(0, 8) : [],
    provider: r.trace?.provider || null,
    model: r.trace?.model || null,
    mock: r.trace?.provider === 'mock',
  };
}

export async function rewriteField({ block_id, field, current_content, mission_context, client_id } = {}) {
  if (!block_id || !field) throw new Error('rewriteField: block_id and field required');
  if (!FIELD_GUIDANCE[field]) throw new Error(`rewriteField: unsupported field "${field}"`);
  if (!current_content) throw new Error('rewriteField: current_content required');
  // R-7.39 — добавляем project + neighbor контекст так же как fillField.
  const ctx = buildBlockContext({ client_id, block_id });
  const ctxBlock = renderContextForPrompt(ctx);
  const sys = [
    'You are SIMA Atlas. Rewrite the operator-supplied draft to:',
    '  - keep all factual info — do NOT drop or invent content',
    '  - improve clarity, tighten language, fix obvious typos',
    '  - keep markdown structure (headings/bullets/checkboxes)',
    '  - preserve the language (Russian → Russian, English → English)',
    '  - reference the project / neighbor context only if it sharpens the draft',
    `  - target file: ${field} — ${FIELD_GUIDANCE[field] || ''}`,
    'Reply ONLY with structured JSON: { "content": "..." }.',
  ].join('\n');
  const prompt = [
    ctxBlock ? '# Project & graph context (READ FIRST)\n' + ctxBlock : '',
    `# Current block: ${block_id}`,
    mission_context ? `Mission context (this block):\n${String(mission_context).slice(0, 2000)}\n` : '',
    'Current draft (rewrite it without losing facts):',
    String(current_content).slice(0, 6000),
  ].filter(Boolean).join('\n');
  const r = await callLLM({
    system: sys,
    prompt,
    schema: FIELD_SCHEMA,
    max_tokens: 1200,
    temperature: 0.25,
    op: 'synthesis_rewrite_field',
  });
  const content = String(r.value?.content || '').trim();
  return { ok: true, block_id, field, content, original: String(current_content), provider: r.trace?.provider || null, model: r.trace?.model || null, mock: r.trace?.provider === 'mock' };
}

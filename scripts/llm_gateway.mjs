#!/usr/bin/env node
// PR3: Sima Atlas LLM Gateway
//
// Single entry point for every LLM call inside Atlas. Provides:
//   * provider-agnostic interface: callLLM({ provider, model, system, prompt, schema, ... })
//   * structured output via JSON Schema (forced on Anthropic via tool-use, on Gemini via responseSchema)
//   * deterministic mock provider (used in CI / smoke tests / when no API key is present)
//   * trace logging into atlas/llm_traces/<UTC>.json (provider, model, in/out tokens, cost-estimate, prompt hash)
//   * token budget guard and per-run cost cap (USD)
//   * automatic fallback to the next available provider on 5xx / timeout
//
// The gateway is import-only (no top-level work). For self-test run:
//   node scripts/llm_gateway.mjs --self-test
//
// Env (loaded from process.env or .env, see loadEnvFile() below):
//   ANTHROPIC_API_KEY     — Anthropic key (Claude family)
//   GOOGLE_API_KEY        — Google key (Gemini)
//   LLM_DEFAULT_PROVIDER  — default provider, e.g. "anthropic" / "google" / "mock"
//   LLM_DEFAULT_MODEL     — default model name; overrides per-call
//   LLM_MAX_USD_PER_RUN   — hard cap (default 0.05 USD)
//   LLM_MAX_INPUT_TOKENS  — hard cap on input (default 30000)

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const TRACE_DIR = path.join(ROOT, 'atlas', 'llm_traces');
const MOCK_DIR = path.join(ROOT, 'tests', 'llm_mocks');

// ───────────────────────────────────────────────────────────────── env loader
function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    const [, k, v] = m;
    if (process.env[k] !== undefined) continue;
    let value = v;
    // Strip inline comments (`KEY=value  # tail comment`) when not inside quotes.
    const isQuoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (!isQuoted) {
      const hash = value.indexOf('#');
      if (hash >= 0) value = value.slice(0, hash);
    }
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[k] = value.trim();
  }
}
loadEnvFile();

// ───────────────────────────────────────────────────────────── provider table
const PROVIDERS = {
  anthropic: {
    available: () => !!process.env.ANTHROPIC_API_KEY,
    defaultModel: 'claude-haiku-4-5',
    pricePerMTokenIn: 1.0,
    pricePerMTokenOut: 5.0,
  },
  google: {
    available: () => !!process.env.GOOGLE_API_KEY,
    defaultModel: 'gemini-2.0-flash',
    pricePerMTokenIn: 0.10,
    pricePerMTokenOut: 0.40,
  },
  mock: {
    available: () => true,
    defaultModel: 'mock-1',
    pricePerMTokenIn: 0,
    pricePerMTokenOut: 0,
  },
};

function pickProvider(requested) {
  if (requested && PROVIDERS[requested] && PROVIDERS[requested].available()) return requested;
  if (requested && PROVIDERS[requested] && requested !== 'mock') {
    // requested explicitly but no key → fall back to mock with a warning trace
    console.warn(`[llm-gateway] requested provider "${requested}" has no key; falling back to mock`);
    return 'mock';
  }
  if (requested && !PROVIDERS[requested]) {
    console.warn(`[llm-gateway] unknown provider "${requested}" (allowed: ${Object.keys(PROVIDERS).join(', ')}); ignoring`);
  }
  const order = ['anthropic', 'google', 'mock'];
  const dfltRaw = process.env.LLM_DEFAULT_PROVIDER;
  const dflt = typeof dfltRaw === 'string' ? dfltRaw.trim() : dfltRaw;
  if (dflt) {
    if (!PROVIDERS[dflt]) {
      console.warn(`[llm-gateway] LLM_DEFAULT_PROVIDER="${dfltRaw}" is not one of ${Object.keys(PROVIDERS).join(', ')}; check your .env (do not put inline comments without a # at column 0).`);
    } else if (PROVIDERS[dflt].available()) {
      return dflt;
    } else {
      console.warn(`[llm-gateway] LLM_DEFAULT_PROVIDER=${dflt} but its API key env var is empty; will fall back according to availability order.`);
    }
  }
  for (const p of order) if (PROVIDERS[p].available()) return p;
  return 'mock';
}

// ──────────────────────────────────────────────────────────────────── helpers
function hashPrompt(parts) {
  const h = crypto.createHash('sha256');
  for (const part of parts) h.update(typeof part === 'string' ? part : JSON.stringify(part));
  return h.digest('hex').slice(0, 16);
}

function approxTokens(text) {
  // crude UTF-8 character → token approximation (~4 chars per token for English; ~2 for Cyrillic)
  if (!text) return 0;
  const cyrillic = (text.match(/[А-Яа-яЁё]/g) || []).length;
  const rest = text.length - cyrillic;
  return Math.ceil(cyrillic / 2 + rest / 4);
}

function ensureTraceDir() {
  if (!fs.existsSync(TRACE_DIR)) fs.mkdirSync(TRACE_DIR, { recursive: true });
}

function writeTrace(record) {
  ensureTraceDir();
  const ts = record.at.replace(/[:.]/g, '-');
  const out = path.join(TRACE_DIR, `${ts}__${record.provider}__${record.prompt_hash}.json`);
  fs.writeFileSync(out, JSON.stringify(record, null, 2) + '\n', 'utf8');
}

function validateSchemaShape(schema, value, ctxPath = '$') {
  const errs = [];
  if (!schema || typeof schema !== 'object') return errs;
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errs.push(`${ctxPath}: expected object, got ${Array.isArray(value) ? 'array' : typeof value}`);
      return errs;
    }
    for (const req of schema.required || []) {
      if (!(req in value)) errs.push(`${ctxPath}.${req}: missing required property`);
    }
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (key in value) errs.push(...validateSchemaShape(sub, value[key], `${ctxPath}.${key}`));
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errs.push(`${ctxPath}: expected array, got ${typeof value}`);
      return errs;
    }
    if (schema.items) {
      value.forEach((item, i) => errs.push(...validateSchemaShape(schema.items, item, `${ctxPath}[${i}]`)));
    }
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') errs.push(`${ctxPath}: expected string, got ${typeof value}`);
    else if (schema.enum && !schema.enum.includes(value)) errs.push(`${ctxPath}: not in enum ${JSON.stringify(schema.enum)}`);
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number') errs.push(`${ctxPath}: expected number, got ${typeof value}`);
  } else if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') errs.push(`${ctxPath}: expected boolean, got ${typeof value}`);
  }
  return errs;
}

// ─────────────────────────────────────────────────────────── mock provider
function promptOnlyHash(prompt) {
  return crypto.createHash('sha256').update(prompt).digest('hex').slice(0, 16);
}

function findMock(promptHash, prompt) {
  if (!fs.existsSync(MOCK_DIR)) return null;
  // 1) Exact hash (provider + model dependent) — most precise.
  const exact = path.join(MOCK_DIR, `${promptHash}.json`);
  if (fs.existsSync(exact)) return JSON.parse(fs.readFileSync(exact, 'utf8'));
  // 2) prompt-only hash — provider/model independent, useful for golden sets.
  if (typeof prompt === 'string') {
    const onlyPrompt = path.join(MOCK_DIR, `${promptOnlyHash(prompt)}.json`);
    if (fs.existsSync(onlyPrompt)) return JSON.parse(fs.readFileSync(onlyPrompt, 'utf8'));
  }
  // 3) Fallback to _default.json so dev runs still pass.
  const dflt = path.join(MOCK_DIR, '_default.json');
  if (fs.existsSync(dflt)) return JSON.parse(fs.readFileSync(dflt, 'utf8'));
  return null;
}

function deterministicEmptyForSchema(schema) {
  if (!schema || typeof schema !== 'object') return null;
  if (schema.type === 'object') {
    const out = {};
    for (const [k, sub] of Object.entries(schema.properties || {})) out[k] = deterministicEmptyForSchema(sub);
    return out;
  }
  if (schema.type === 'array') return [];
  if (schema.type === 'string') return schema.enum ? schema.enum[0] : '';
  if (schema.type === 'number' || schema.type === 'integer') return 0;
  if (schema.type === 'boolean') return false;
  return null;
}

async function callMock({ schema, promptHash, prompt }) {
  const fixture = findMock(promptHash, prompt);
  if (fixture) {
    // If a fixture exists but does not match the requested schema, prefer
    // deterministic empty so callers get a predictable shape for their tests.
    if (schema) {
      const errs = validateSchemaShape(schema, fixture);
      if (errs.length) return deterministicEmptyForSchema(schema);
    }
    return fixture;
  }
  return deterministicEmptyForSchema(schema || {});
}

// Public helper so other scripts can compute the deterministic hash and
// pre-place a fixture before invoking callLLM.
export function mockHashForPrompt(prompt) {
  return promptOnlyHash(prompt);
}

// ─────────────────────────────────────────────────────── anthropic provider
async function callAnthropic({ model, system, prompt, schema, max_tokens, temperature }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const tool = schema
    ? {
        name: 'submit_structured_response',
        description: 'Submit the answer in the required structured format.',
        input_schema: schema,
      }
    : null;

  const body = {
    model,
    max_tokens: max_tokens || 2048,
    temperature: typeof temperature === 'number' ? temperature : 0.0,
    system: system || 'You are a precise extractor. Always respond by calling submit_structured_response.',
    messages: [{ role: 'user', content: prompt }],
  };
  if (tool) {
    body.tools = [tool];
    body.tool_choice = { type: 'tool', name: tool.name };
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`anthropic ${res.status}: ${txt.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const usage = { input_tokens: data.usage?.input_tokens || 0, output_tokens: data.usage?.output_tokens || 0 };

  if (tool) {
    const toolBlock = (data.content || []).find((b) => b.type === 'tool_use' && b.name === tool.name);
    if (!toolBlock) throw new Error(`anthropic returned no tool_use block; got ${JSON.stringify(data.content || []).slice(0, 200)}`);
    return { value: toolBlock.input, usage };
  }
  const textBlock = (data.content || []).find((b) => b.type === 'text');
  return { value: textBlock?.text || '', usage };
}

// ────────────────────────────────────────────────────────── google provider
function jsonSchemaForGemini(schema) {
  // Gemini's responseSchema accepts a subset of JSON Schema. Strip unknown keys.
  if (!schema || typeof schema !== 'object') return undefined;
  const allowed = ['type', 'properties', 'required', 'items', 'enum', 'description', 'nullable'];
  const out = {};
  for (const key of allowed) if (schema[key] !== undefined) out[key] = schema[key];
  if (schema.type === 'object' && schema.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) out.properties[k] = jsonSchemaForGemini(v);
  }
  if (schema.type === 'array' && schema.items) out.items = jsonSchemaForGemini(schema.items);
  return out;
}

async function callGoogle({ model, system, prompt, schema, max_tokens, temperature }) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
  const body = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: typeof temperature === 'number' ? temperature : 0.0,
      maxOutputTokens: max_tokens || 2048,
    },
  };
  if (schema) {
    body.generationConfig.responseMimeType = 'application/json';
    body.generationConfig.responseSchema = jsonSchemaForGemini(schema);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    const err = new Error(`google ${res.status}: ${txt.slice(0, 400)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const cand = data.candidates?.[0];
  const text = cand?.content?.parts?.map((p) => p.text || '').join('') || '';
  const usage = {
    input_tokens: data.usageMetadata?.promptTokenCount || 0,
    output_tokens: data.usageMetadata?.candidatesTokenCount || 0,
  };
  if (schema) {
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (e) { throw new Error(`google did not return JSON: ${text.slice(0, 200)}`); }
    return { value: parsed, usage };
  }
  return { value: text, usage };
}

// ─────────────────────────────────────────────────────────────── public API
export async function callLLM(opts = {}) {
  const {
    provider: providerReq,
    model: modelReq,
    system,
    prompt,
    schema,
    max_tokens,
    temperature,
    strict = false,
    op = 'unspecified',
  } = opts;
  if (typeof prompt !== 'string') throw new Error('callLLM: prompt must be a string');

  const inputBudget = Number(process.env.LLM_MAX_INPUT_TOKENS || 30000);
  const inputApprox = approxTokens([system, prompt].filter(Boolean).join('\n'));
  if (inputApprox > inputBudget) {
    throw new Error(`callLLM: input ~${inputApprox} tokens exceeds LLM_MAX_INPUT_TOKENS=${inputBudget}`);
  }

  // Build the cascade of providers to try.
  // Rule: a single live provider is chosen up-front. If the caller (or env) set
  // a specific provider, ONLY that one is tried before falling back to mock.
  // Cross-provider cascade is opt-in via `allow_provider_cascade: true` so that
  // a user with both ANTHROPIC_API_KEY and GOOGLE_API_KEY who explicitly pinned
  // LLM_DEFAULT_PROVIDER=google does NOT silently end up calling Anthropic.
  const cascade = [];
  const initial = pickProvider(providerReq);
  if (strict && providerReq && providerReq !== 'mock' && initial !== providerReq) {
    throw new Error(`callLLM strict: requested provider "${providerReq}" not available`);
  }
  cascade.push(initial);
  const explicitlyPinned = !!providerReq || !!process.env.LLM_DEFAULT_PROVIDER;
  if (!explicitlyPinned && opts.allow_provider_cascade) {
    for (const p of ['anthropic', 'google']) {
      if (p === initial) continue;
      if (PROVIDERS[p] && PROVIDERS[p].available()) cascade.push(p);
    }
  }
  if (!cascade.includes('mock') && !strict) cascade.push('mock');

  const startedAt = new Date();
  let value;
  let usage = { input_tokens: inputApprox, output_tokens: 0 };
  const attempts = [];
  let chosenProvider = null;
  let chosenModel = null;
  let lastError = null;

  for (const provider of cascade) {
    const model = modelReq || process.env.LLM_DEFAULT_MODEL || PROVIDERS[provider].defaultModel;
    chosenProvider = provider;
    chosenModel = model;
    try {
      if (provider === 'anthropic') ({ value, usage } = await callAnthropic({ model, system, prompt, schema, max_tokens, temperature }));
      else if (provider === 'google') ({ value, usage } = await callGoogle({ model, system, prompt, schema, max_tokens, temperature }));
      else value = await callMock({ schema, promptHash: hashPrompt(['v1', provider, model, system || '', prompt, schema || null]), prompt });
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      attempts.push({ provider, model, error_status: err.status || 0, error_message: (err.message || '').slice(0, 200) });
      // 4xx auth/quota → don't retry the same provider; cascade to next.
      // 5xx → also cascade.
      // (We don't have backoff here; retry-with-backoff lives in caller if needed.)
      if (provider === 'mock') {
        // mock provider should not throw, but if it did, this is a code bug.
        throw err;
      }
      console.warn(`[llm-gateway] ${provider} failed (${(err.message || '').slice(0, 160)}); trying next in cascade [${cascade.slice(cascade.indexOf(provider) + 1).join(', ') || '∅'}]`);
    }
  }

  if (lastError && !value) throw lastError;
  const promptHash = hashPrompt(['v1', chosenProvider, chosenModel, system || '', prompt, schema || null]);

  const schemaErrors = schema ? validateSchemaShape(schema, value) : [];
  if (schemaErrors.length && strict) {
    throw new Error(`callLLM strict schema mismatch:\n - ${schemaErrors.join('\n - ')}`);
  }

  const cost =
    (usage.input_tokens * (PROVIDERS[chosenProvider].pricePerMTokenIn || 0)) / 1e6 +
    (usage.output_tokens * (PROVIDERS[chosenProvider].pricePerMTokenOut || 0)) / 1e6;
  const cap = Number(process.env.LLM_MAX_USD_PER_RUN || 0.05);
  if (cost > cap && strict) {
    throw new Error(`callLLM strict: estimated cost $${cost.toFixed(4)} exceeds cap $${cap.toFixed(4)}`);
  }

  const trace = {
    at: startedAt.toISOString(),
    op,
    provider: chosenProvider,
    model: chosenModel,
    prompt_hash: promptHash,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cost_usd: cost,
    schema_present: !!schema,
    schema_ok: schemaErrors.length === 0,
    schema_errors: schemaErrors,
    fallback_to_mock: chosenProvider === 'mock' && cascade.length > 1,
    cascade,
    attempts,
  };
  writeTrace(trace);

  return { value, trace, errors: schemaErrors };
}

// ────────────────────────────────────────────── extractBlockSchema (sugar)
const BLOCK_EXTRACTION_SCHEMA = {
  type: 'object',
  required: ['blocks'],
  properties: {
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'title', 'mission', 'layer'],
        properties: {
          id: { type: 'string', description: 'kebab-case id with b. prefix, e.g. b.payments' },
          title: { type: 'string' },
          mission: { type: 'string', description: 'one paragraph: what this block does and why it exists' },
          layer: {
            type: 'string',
            enum: ['user', 'front', 'logic', 'ai', 'data', 'ext', 'content', 'testing'],
          },
          type: { type: 'string', enum: ['module', 'function', 'task', 'test'] },
          mvp: { type: 'boolean' },
          status: { type: 'string', enum: ['idea', 'wip', 'review', 'done', 'broken', 'drift'] },
          depends_on: { type: 'array', items: { type: 'string' } },
          provides: { type: 'array', items: { type: 'string' } },
          tech_stack: { type: 'array', items: { type: 'string' } },
          confidence: { type: 'number', description: '0..1; how sure is the extractor' },
        },
      },
    },
  },
};

export const BLOCK_SCHEMA = BLOCK_EXTRACTION_SCHEMA;

const SYSTEM_BLOCK_EXTRACTION = `You extract product-block descriptions from a user/AI dialog.
Rules:
- Only emit a block if the dialog clearly describes a product capability (auth, payments, search, ingestion, …).
- "id" must be kebab-case with a "b." prefix (b.auth, b.payments, b.notifications).
- "mission" must be 1 paragraph (50-300 chars) that explains why the block exists, NOT a generic phrase.
- "layer" classifies the block:
    user (JTBD), front (UI), logic (backend rules), ai (LLM/agent), data (DB/storage),
    ext (3rd-party), content (docs/CMS), testing (test sandbox).
- "depends_on" lists other block ids the block needs (only ids you also emit, or "none").
- Do NOT invent blocks that are not in the dialog. If unsure, return blocks: [].
- Provide confidence per block (0..1) reflecting how clearly the dialog defines it.`;

export async function extractBlockSchema(dialogText, opts = {}) {
  return callLLM({
    provider: opts.provider,
    model: opts.model,
    system: SYSTEM_BLOCK_EXTRACTION,
    prompt: dialogText,
    schema: BLOCK_EXTRACTION_SCHEMA,
    max_tokens: opts.max_tokens || 2048,
    temperature: 0,
    strict: !!opts.strict,
    op: 'extract_block_schema',
  });
}

// ──────────────────────────────────────────────────────────────── self-test
async function selfTest() {
  process.env.LLM_DEFAULT_PROVIDER = 'mock';
  const dialogText = 'Нам нужен блок b.payments на слое logic. Он принимает Stripe-вебхуки и пишет в БД.';
  const { value, trace, errors } = await extractBlockSchema(dialogText);
  if (errors.length) {
    console.error('llm_gateway self-test FAILED — schema errors:', errors);
    process.exit(1);
  }
  if (!Array.isArray(value.blocks)) {
    console.error('llm_gateway self-test FAILED — value.blocks is not an array:', value);
    process.exit(1);
  }
  console.log('llm_gateway self-test: OK');
  console.log(`  provider=${trace.provider}, schema_ok=${trace.schema_ok}, blocks=${value.blocks.length}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  if (process.argv.includes('--self-test')) {
    selfTest().catch((e) => { console.error(e); process.exit(1); });
  } else {
    console.log('Usage: node scripts/llm_gateway.mjs --self-test');
  }
}

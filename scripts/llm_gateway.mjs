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
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';

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
    // Phase R-7: default model name overridable via LLM_GOOGLE_MODEL.
    // Google переименовывает / снимает с поддержки модели чаще, чем мы
    // успеваем релизить — env-переменная позволяет любому контрибьютору
    // или оператору переключить на актуальную без правки кода.
    // Найти актуальное имя: https://ai.google.dev/gemini-api/docs/models
    // Дефолт `gemini-2.5-flash` — стабильный, бесплатный tier с квотой;
    // если он тоже устареет — поставь свой через ENV.
    defaultModel: process.env.LLM_GOOGLE_MODEL || 'gemini-2.5-flash',
    pricePerMTokenIn: 0.10,
    pricePerMTokenOut: 0.40,
  },
  // Phase R-7.60 (TIER-2 #16) — Ollama for local models. Top community
  // ask on the launch readiness audit: people want to run Sima against
  // their own Llama / Qwen / DeepSeek without sending prompts to a
  // third-party API. Detection: HTTP GET /api/tags on OLLAMA_BASE_URL
  // (default http://localhost:11434). Available iff that responds 200
  // with at least one model installed. Opt-in via LLM_DEFAULT_PROVIDER=
  // ollama or LLM_PREFER_OLLAMA=1; never first in cascade by default
  // because most users have neither Ollama installed nor a model pulled,
  // and we don't want a 4-second connect-refused on every fillField call.
  ollama: {
    available: () => {
      // Cached availability — `available()` is called frequently
      // (every pickProvider). HTTP probe per call would slow startup.
      if (PROVIDERS.ollama._cachedAvail !== undefined) return PROVIDERS.ollama._cachedAvail;
      // Don't probe unless explicitly enabled, to avoid the cost.
      const enabled = process.env.LLM_DEFAULT_PROVIDER === 'ollama'
        || process.env.LLM_PREFER_OLLAMA === '1';
      if (!enabled) {
        PROVIDERS.ollama._cachedAvail = false;
        return false;
      }
      // Sync probe via execFileSync (no fetch in available() — pickProvider
      // is sync). Use curl with 2s connect timeout; if curl is missing, fall
      // through to false. Cache result.
      try {
        const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        execFileSync('curl', ['-sf', '--connect-timeout', '2', `${base}/api/tags`], {
          stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000,
        });
        PROVIDERS.ollama._cachedAvail = true;
        return true;
      } catch {
        PROVIDERS.ollama._cachedAvail = false;
        return false;
      }
    },
    defaultModel: process.env.LLM_OLLAMA_MODEL || 'llama3.2',
    pricePerMTokenIn: 0,    // local compute — zero from Sima's POV
    pricePerMTokenOut: 0,
  },
  // Phase R-1: zero-config provider that shells out to the user's local
  // Claude Code CLI. Uses whatever model the user picked in their CLI
  // settings; consumes the user's Pro/Max subscription, NOT a separate
  // API key. Available iff the `claude` binary is on PATH and prints a
  // version. Disabled by default — opt in via LLM_DEFAULT_PROVIDER=claude_cli
  // (or omit and the cascade picks it last after anthropic/google).
  claude_cli: {
    available: () => {
      // Phase R-4 — on Windows the binary is `claude.cmd`, and execFileSync
      // does NOT do PATHEXT resolution (only execSync does). Try both names
      // so a Windows install is detected. Cache the resolved binary on the
      // provider so callClaudeCli reuses it.
      const candidates = process.platform === 'win32' ? ['claude.cmd', 'claude'] : ['claude'];
      for (const bin of candidates) {
        try {
          execFileSync(bin, ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 4000, shell: process.platform === 'win32' });
          PROVIDERS.claude_cli._bin = bin;
          return true;
        } catch {}
      }
      return false;
    },
    defaultModel: 'claude-cli', // actual model is whatever CLI is configured for
    pricePerMTokenIn: 0,        // user's subscription — zero from Sima's POV
    pricePerMTokenOut: 0,
  },
  mock: {
    available: () => true,
    defaultModel: 'mock-1',
    pricePerMTokenIn: 0,
    pricePerMTokenOut: 0,
  },
};

function pickProvider(requested) {
  // Phase R-1 escape hatch: nightly / CI pipelines need deterministic
  // mock responses (cheap, fast, idempotent). Setting ATLAS_FORCE_MOCK_LLM=1
  // forces every call onto the mock provider regardless of which paid
  // keys or local CLI are available.
  if (process.env.ATLAS_FORCE_MOCK_LLM === '1') return 'mock';
  if (requested && PROVIDERS[requested] && PROVIDERS[requested].available()) return requested;
  if (requested && PROVIDERS[requested] && requested !== 'mock') {
    // requested explicitly but no key → fall back to mock with a warning trace
    console.warn(`[llm-gateway] requested provider "${requested}" has no key; falling back to mock`);
    return 'mock';
  }
  if (requested && !PROVIDERS[requested]) {
    console.warn(`[llm-gateway] unknown provider "${requested}" (allowed: ${Object.keys(PROVIDERS).join(', ')}); ignoring`);
  }
  // Phase R-7: subscription-first cascade. Главный use-case Sima — у
  // оператора есть Claude.ai Pro/Max подписка, и он хочет тратить **её**,
  // не отдельный API-ключ. Поэтому если `claude` CLI установлен (значит
  // подписка активна) — он берётся первым, до anthropic/google ключей.
  // Кому нужен старый порядок (API-key first, для скорости / параллельности):
  // `LLM_PREFER_CLI=0` или явный `LLM_DEFAULT_PROVIDER=anthropic`.
  const preferCli = process.env.LLM_PREFER_CLI !== '0';
  // Phase R-7.60 — ollama opt-in, never first in default cascade.
  // It only enters the order if explicitly requested via LLM_PREFER_OLLAMA=1
  // (jumps to head) or via LLM_DEFAULT_PROVIDER=ollama (handled below).
  const preferOllama = process.env.LLM_PREFER_OLLAMA === '1';
  const order = preferOllama
    ? ['ollama', 'claude_cli', 'anthropic', 'google', 'mock']
    : preferCli
      ? ['claude_cli', 'anthropic', 'google', 'mock']
      : ['anthropic', 'google', 'claude_cli', 'mock'];
  const dfltRaw = process.env.LLM_DEFAULT_PROVIDER;
  const dflt = typeof dfltRaw === 'string' ? dfltRaw.trim() : dfltRaw;
  if (dflt) {
    if (!PROVIDERS[dflt]) {
      console.warn(`[llm-gateway] LLM_DEFAULT_PROVIDER="${dfltRaw}" is not one of ${Object.keys(PROVIDERS).join(', ')}; check your .env (do not put inline comments without a # at column 0).`);
    } else if (PROVIDERS[dflt].available()) {
      console.log(`[llm-gateway] using provider=${dflt} (explicit LLM_DEFAULT_PROVIDER)`);
      return dflt;
    } else {
      console.warn(`[llm-gateway] LLM_DEFAULT_PROVIDER=${dflt} but its API key env var is empty; will fall back according to availability order.`);
    }
  }
  for (const p of order) {
    if (PROVIDERS[p].available()) {
      const reason = p === 'claude_cli' ? 'subscription via claude CLI' :
                     p === 'anthropic'  ? 'ANTHROPIC_API_KEY' :
                     p === 'google'     ? 'GOOGLE_API_KEY' :
                     p === 'ollama'     ? `local Ollama at ${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}` :
                     p === 'mock'       ? 'no provider available — fallback to deterministic mock' :
                                          'available';
      console.log(`[llm-gateway] using provider=${p} (${reason})`);
      return p;
    }
  }
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
    // Strip markdown fences (```json ... ``` or ``` ... ```) — gemini-2.5-flash
    // emits them despite responseMimeType=application/json on long schemas.
    let body = text.trim();
    const fence = body.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
    if (fence) body = fence[1].trim();
    // Also tolerate a stray prefix line and only-first-object cases.
    if (!body.startsWith('{') && !body.startsWith('[')) {
      const m = body.match(/[{\[]/);
      if (m) body = body.slice(m.index);
    }
    try { parsed = JSON.parse(body); }
    catch (e) { throw new Error(`google did not return JSON: ${text.slice(0, 200)}`); }
    return { value: parsed, usage };
  }
  return { value: text, usage };
}

// ──────────────────────────────────────── Phase R-1: Claude Code CLI provider
// Shells out to the user's local `claude` binary so Sima can use the user's
// Pro/Max subscription instead of a separate Anthropic API key. The CLI's
// ────────────────────────────────────────────────────────── ollama provider
// Phase R-7.60 — local-model provider. Talks to a self-hosted Ollama
// instance (https://ollama.com). Default base URL http://localhost:11434
// (override via OLLAMA_BASE_URL); default model llama3.2 (override via
// LLM_OLLAMA_MODEL — pick whatever you've pulled, e.g. qwen2.5-coder:7b
// for code tasks).
//
// API: POST /api/generate with format='json' for schema-bound calls;
// for free-form text we drop format. Ollama exposes prompt_eval_count
// and eval_count as token counters — we surface them as input/output
// tokens. Pricing is 0/0 (local compute).
async function callOllama({ model, system, prompt, schema, max_tokens, temperature }) {
  const base = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  // For schema mode, hint the model + ask Ollama to constrain output to JSON.
  // Ollama's `format: 'json'` doesn't enforce a specific schema (unlike
  // Anthropic's tool_use), so we paste the schema into the prompt for the
  // model to follow, then JSON.parse the response.
  const isStructured = schema && typeof schema === 'object';
  const schemaHint = isStructured
    ? `\n\nReply ONLY with JSON matching this schema (no markdown fences, no preamble):\n${JSON.stringify(schema, null, 2)}`
    : '';
  const body = {
    model,
    prompt: prompt + schemaHint,
    system: system || (isStructured
      ? 'You are a precise extractor. Return only valid JSON matching the schema.'
      : 'You are a helpful assistant.'),
    stream: false,
    options: {
      temperature: typeof temperature === 'number' ? temperature : 0.0,
      num_predict: max_tokens || 2048,
    },
  };
  if (isStructured) body.format = 'json';

  let res;
  try {
    res = await fetch(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180_000), // local models can be slow
    });
  } catch (e) {
    throw new Error(`ollama: connection failed at ${base} (${e.message}); is the Ollama daemon running? \`ollama serve\``);
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`ollama ${res.status}: ${txt.slice(0, 300)}`);
  }
  const data = await res.json();
  const usage = {
    input_tokens: data.prompt_eval_count || 0,
    output_tokens: data.eval_count || 0,
  };
  const raw = data.response || '';

  if (isStructured) {
    // Try direct parse; if model emitted ```json fences, strip them.
    let jsonText = raw.trim();
    const fenced = jsonText.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
    if (fenced) jsonText = fenced[1].trim();
    try {
      return { value: JSON.parse(jsonText), usage };
    } catch (e) {
      // Fallback: wrap raw text into the first string property of the schema
      // (matches the R-7.37 wrap-fallback we do for claude_cli).
      const props = schema.properties || {};
      const stringKey = Object.keys(props).find((k) => props[k]?.type === 'string');
      if (stringKey) return { value: { [stringKey]: raw.trim() }, usage };
      throw new Error(`ollama returned non-JSON: ${raw.slice(0, 200)}`);
    }
  }
  return { value: raw, usage };
}

// `--output-format json` returns {result: text, usage: {...}} which we
// translate into the same shape callAnthropic returns.
//
// Schema mode: claude --print does not natively enforce JSON-schema; we
// append `Reply ONLY with JSON matching <schema>` to the prompt and parse
// the response defensively (raw, ```json fence, or first {...} block).
async function callClaudeCli({ system, prompt, schema, max_tokens, temperature }) {
  let fullPrompt = '';
  if (system) fullPrompt += system + '\n\n';
  fullPrompt += prompt;
  if (schema) {
    fullPrompt += '\n\n---\nReply ONLY with valid JSON matching this schema. No prose, no markdown fences, just the raw JSON object:\n';
    fullPrompt += JSON.stringify(schema);
  }

  const stdout = await new Promise((resolve, reject) => {
    // R-7.38b — на Windows многострочный prompt-arg ломается shell:true
    // (cmd.exe режет по newlines/spaces → claude видит «You»). R-7.38
    // пытался cmd.exe /c "..." < "tmp" — кавычки внутри /c строки cmd
    // парсит криво («Синтаксическая ошибка в имени файла» в cp866).
    //
    // Финал: на Windows спавним cmd.exe /c <bin> и пайпим promptв stdin
    // через Node child.stdin.write. Это обходит ВСЕ cmd-quoting issues.
    // (R-7.12 говорил «stdin → Not logged in», но это было через
    // PowerShell echo-pipe; Node child.stdin это другой механизм и
    // у юзера сейчас свежая сессия после /login.)
    const isWin = process.platform === 'win32';
    const bin = PROVIDERS.claude_cli._bin || 'claude';
    let child;

    if (isWin) {
      // cmd.exe /c <bin> --print --output-format json
      // Node автоматически escape'ит args между cmd.exe и /c.
      child = spawn('cmd.exe', ['/c', bin, '--print', '--output-format', 'json'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 120_000,
      });
    } else {
      // Linux/macOS — pass prompt as positional arg (R-7.12).
      const args = ['--print', '--output-format', 'json', fullPrompt];
      child = spawn(bin, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 120_000,
      });
    }

    let out = '', err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => reject(new Error(`claude spawn failed: ${e.message}`)));
    child.on('close', (code) => {
      // Phase R-7.13 — Windows-quirk: claude --print sometimes returns
      // exit 1 even on a successful response (with valid JSON in stdout
      // containing input_tokens/output_tokens/etc.). Probably a CLI/cmd.exe
      // wrapper interaction. If exit != 0 BUT stdout looks like a parseable
      // JSON envelope, accept it — reject only on truly broken runs.
      if (code === 0) { resolve(out); return; }
      const outTrimmed = (out || '').trim();
      if (outTrimmed.startsWith('{') && /"result"|"input_tokens"|"output_tokens"/i.test(outTrimmed)) {
        // Looks like a real response despite the non-zero exit — let
        // downstream JSON parsing handle it as success.
        console.warn(`[llm-gateway] claude --print exited ${code} with parseable JSON; accepting (likely Windows cmd-wrapper quirk).`);
        resolve(out);
        return;
      }
      const errMsg = (err || '').trim();
      const combined = [errMsg, outTrimmed].filter(Boolean).join(' | ').slice(-400);
      reject(new Error(`claude --print exit ${code}: ${combined || '(silent)'}`));
    });

    if (isWin) {
      child.stdin.write(fullPrompt);
      child.stdin.end();
    }
  });

  // Try the documented JSON-output shape first.
  let envelope = null;
  try { envelope = JSON.parse(stdout); } catch {}
  const text = (envelope && (envelope.result || envelope.text)) || stdout;
  const usage = {
    input_tokens:  envelope?.usage?.input_tokens || 0,
    output_tokens: envelope?.usage?.output_tokens || 0,
  };

  // R-7.37 — детектируем error-паттерны от claude CLI: «Invalid API key»,
  // «Not logged in», «Rate limit», «Network error» и т.п. CLI отдаёт их
  // как обычный текст в .result, и без явной проверки мы treat'ом их как
  // valid model output (юзер видит ошибку в поле контракта). Throw'ом
  // переключаем cascade на следующего провайдера (anthropic API).
  const errPatterns = [
    /^invalid api key/i, /api key/i, /not logged in/i, /please log in/i,
    /rate limit/i, /quota.*exceeded/i, /network error/i, /authentication/i,
  ];
  if (typeof text === 'string' && text.trim().length < 200 && errPatterns.some((p) => p.test(text.trim()))) {
    throw new Error(`claude_cli error: ${text.trim().slice(0, 160)}`);
  }

  if (!schema) {
    return { value: typeof text === 'string' ? text : String(text), usage };
  }

  // Schema-mode: extract JSON from text. Try direct, then fenced, then
  // first balanced object. On total failure return deterministicEmpty so
  // callers always see the expected shape.
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return null; } };
  let parsed = tryParse(typeof text === 'string' ? text : '');
  if (!parsed && typeof text === 'string') {
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) parsed = tryParse(fence[1].trim());
  }
  if (!parsed && typeof text === 'string') {
    // Find first balanced { or [ … } or ]
    const startCh = text.search(/[{[]/);
    if (startCh >= 0) {
      const open = text[startCh];
      const close = open === '{' ? '}' : ']';
      let depth = 0, end = -1;
      for (let i = startCh; i < text.length; i++) {
        if (text[i] === open) depth++;
        else if (text[i] === close) { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end > startCh) parsed = tryParse(text.slice(startCh, end + 1));
    }
  }
  // R-7.37 — graceful fallback: claude --print иногда отвечает обычным
  // markdown-текстом ВМЕСТО JSON-объекта, несмотря на инструкцию schema.
  // Если в схеме одно строковое поле (как FIELD_SCHEMA: {content: string})
  // и parse не удался, а text непустой — оборачиваем сырой текст в это
  // поле. Это превращает «пустую LLM-ответ» (виден как пустая модалка
  // «Переписать») в реальный полезный draft.
  if (!parsed && schema?.type === 'object' && schema.properties && typeof text === 'string') {
    const stringProps = Object.entries(schema.properties).filter(([, v]) => v?.type === 'string');
    if (stringProps.length === 1 && text.trim().length > 0) {
      parsed = { [stringProps[0][0]]: text.trim() };
    }
  }
  if (!parsed) {
    parsed = deterministicEmptyForSchema(schema);
    // R-7.37: явная диагностика, когда LLM провалила structured-output
    // (видно в API-логе оператора → понятно, что чинить — у себя schema
    // или у LLM провайдера).
    console.warn(`[llm-gateway] claude_cli schema-parse failed; envelope=${typeof envelope === 'object' ? 'json' : 'raw'}, text-head=${(typeof text === 'string' ? text : '').slice(0, 160).replace(/\n/g, '\\n')}`);
  }
  return { value: parsed, usage };
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
      else if (provider === 'claude_cli') ({ value, usage } = await callClaudeCli({ system, prompt, schema, max_tokens, temperature }));
      else if (provider === 'ollama') ({ value, usage } = await callOllama({ model, system, prompt, schema, max_tokens, temperature }));
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

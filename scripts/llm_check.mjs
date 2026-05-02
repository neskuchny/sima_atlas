#!/usr/bin/env node
// Sima Atlas LLM diagnostic.
//
// Usage:  node scripts/llm_check.mjs
//
// Reports:
//   * which keys are present in env (length only — never prints the secret)
//   * which provider would be chosen with current env
//   * whether the chosen provider passes a tiny ping (live request with 1 token)
//   * suggests the corrective action if mismatch detected

import { callLLM } from './llm_gateway.mjs';

const has = (k) => typeof process.env[k] === 'string' && process.env[k].trim().length > 0;
const len = (k) => (has(k) ? process.env[k].length : 0);

const ANTHROPIC = has('ANTHROPIC_API_KEY');
const GOOGLE = has('GOOGLE_API_KEY');
const PINNED = process.env.LLM_DEFAULT_PROVIDER || '(not set)';
const KNOWN_PROVIDERS = new Set(['anthropic', 'google', 'mock']);
const ANTHROPIC_LEN_OK = !ANTHROPIC || (process.env.ANTHROPIC_API_KEY.startsWith('sk-ant-') && len('ANTHROPIC_API_KEY') >= 80);
const GOOGLE_LEN_OK = !GOOGLE || (process.env.GOOGLE_API_KEY.startsWith('AIza') && len('GOOGLE_API_KEY') >= 35);

console.log('Sima Atlas LLM diagnostic');
console.log('─'.repeat(60));
console.log(`ANTHROPIC_API_KEY      : ${ANTHROPIC ? `present (${len('ANTHROPIC_API_KEY')} chars)${ANTHROPIC_LEN_OK ? '' : ' ⚠ looks too short / wrong prefix'}` : 'MISSING'}`);
console.log(`GOOGLE_API_KEY         : ${GOOGLE ? `present (${len('GOOGLE_API_KEY')} chars)${GOOGLE_LEN_OK ? '' : ' ⚠ looks too short / wrong prefix'}` : 'MISSING'}`);
console.log(`LLM_DEFAULT_PROVIDER   : "${PINNED}"${KNOWN_PROVIDERS.has(PINNED) || PINNED === '(not set)' ? '' : ' ⚠ not one of anthropic/google/mock — check .env for inline comments'}`);
console.log(`LLM_DEFAULT_MODEL      : ${process.env.LLM_DEFAULT_MODEL || '(provider default)'}`);
console.log(`LLM_MAX_USD_PER_RUN    : ${process.env.LLM_MAX_USD_PER_RUN || '0.05 (default)'}`);
console.log('');

// Hard-stop hints before pinging.
if (PINNED !== '(not set)' && !KNOWN_PROVIDERS.has(PINNED)) {
  console.error('✗ LLM_DEFAULT_PROVIDER value is malformed.');
  console.error(`  Got: "${PINNED}"`);
  console.error('  Hint: in .env do NOT use inline comments after the value, e.g.');
  console.error('     BAD :  LLM_DEFAULT_PROVIDER=google   # or anthropic');
  console.error('     OK  :  LLM_DEFAULT_PROVIDER=google');
  console.error('  (.env parser as of PR4.2 strips inline comments — pull the latest branch and try again.)');
  process.exit(3);
}

if (!ANTHROPIC && !GOOGLE) {
  console.log('No API keys present → gateway will use the mock provider.');
  console.log('To run live extraction, set ANTHROPIC_API_KEY or GOOGLE_API_KEY in .env.');
  process.exit(0);
}

if (PINNED !== '(not set)') {
  if (PINNED === 'anthropic' && !ANTHROPIC) {
    console.log('⚠ LLM_DEFAULT_PROVIDER=anthropic but ANTHROPIC_API_KEY is empty → mock fallback will be used.');
  }
  if (PINNED === 'google' && !GOOGLE) {
    console.log('⚠ LLM_DEFAULT_PROVIDER=google but GOOGLE_API_KEY is empty → mock fallback will be used.');
  }
}

console.log('Pinging the chosen provider with a tiny request…');
console.log('');

try {
  const r = await callLLM({
    prompt: 'Reply with the literal word "OK" only.',
    schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
    max_tokens: 50,
    op: 'llm_check_ping',
  });
  console.log(`provider chosen        : ${r.trace.provider}`);
  console.log(`model                  : ${r.trace.model}`);
  console.log(`cascade tried          : ${(r.trace.cascade || []).join(' → ')}`);
  console.log(`schema_ok              : ${r.trace.schema_ok}`);
  console.log(`fallback_to_mock       : ${r.trace.fallback_to_mock}`);
  console.log(`input_tokens (approx)  : ${r.trace.input_tokens}`);
  console.log(`output_tokens          : ${r.trace.output_tokens}`);
  console.log(`cost_usd               : $${(r.trace.cost_usd || 0).toFixed(6)}`);
  if (r.trace.attempts && r.trace.attempts.length) {
    console.log('');
    console.log('attempts that failed:');
    for (const a of r.trace.attempts) {
      console.log(`  ✗ ${a.provider} (${a.error_status}): ${(a.error_message || '').slice(0, 200)}`);
    }
  }
  console.log('');
  if (r.trace.fallback_to_mock) {
    console.log('Result: gateway is on MOCK. Live providers failed — see attempts above.');
    if (r.trace.attempts.some((a) => a.error_status === 401)) {
      console.log('  → 401 = invalid API key. Edit .env and restart the run.');
    }
    if (r.trace.attempts.some((a) => a.error_status === 400 && /API key not valid/i.test(a.error_message))) {
      console.log('  → Google key invalid. Edit .env and restart the run.');
    }
    if (r.trace.attempts.some((a) => a.error_status === 429)) {
      console.log('  → 429 = rate limit / quota. Wait or rotate key.');
    }
    process.exit(2);
  } else {
    console.log(`Result: live provider "${r.trace.provider}" answered correctly.`);
    process.exit(0);
  }
} catch (e) {
  console.error('llm_check failed:', e.message);
  process.exit(1);
}

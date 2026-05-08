#!/usr/bin/env node
// PR-4 (b.operator-profile-learner): periodic LLM-driven analysis of repeated
// failure modes from decisions.log + checks.log fail records. Output is a
// concise list of lessons that get appended (never overwritten) to
// atlas/operator_profile/lessons.json. Lessons feed into the inject_context_pack
// hook (PR-5) and into UI hints (PR-6).
//
// Cost cap: LLM_MAX_USD_PER_RUN ≤ $0.05 per run (default). Mock-friendly.
//
// API:
//   import { analyzeLessons } from './analyze_lessons_from_history.mjs';
//   const r = await analyzeLessons({ window_days, dry_run, atlas_root });
//   r → { lessons_added: N, lessons_total: M, cost_usd, provider, model,
//         warming_up?: bool }
//
// CLI:
//   node scripts/analyze_lessons_from_history.mjs                 # write
//   node scripts/analyze_lessons_from_history.mjs --dry-run       # print only
//   node scripts/analyze_lessons_from_history.mjs --window-days 60
//   node scripts/analyze_lessons_from_history.mjs --json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { callLLM } from './llm_gateway.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');
const COST_CAP_USD = Number(process.env.LLM_MAX_USD_PER_RUN || 0.05);
const DEFAULT_WINDOW_DAYS = 30;

export const LESSONS_SCHEMA = {
  type: 'object',
  required: ['lessons'],
  properties: {
    lessons: {
      type: 'array',
      items: {
        type: 'object',
        required: ['lesson', 'evidence'],
        properties: {
          lesson: { type: 'string' },
          evidence: { type: 'array', items: { type: 'string' } },
          expires_at: { type: ['string', 'null'] },
        },
      },
    },
  },
};

function readWindowedFailures(atlasRoot, windowDays) {
  const cutoffMs = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  const blocksDir = path.join(atlasRoot, 'blocks');
  const fails = [];
  const decisions = [];
  if (!fs.existsSync(blocksDir)) return { fails, decisions };
  for (const blockId of fs.readdirSync(blocksDir)) {
    const checks = path.join(blocksDir, blockId, 'checks.log');
    if (fs.existsSync(checks)) {
      const lines = fs.readFileSync(checks, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const [ts, kind, result, ...rest] = line.split('\t');
        if (!ts || !kind) continue;
        if ((result || '').toLowerCase() !== 'fail') continue;
        const tms = Date.parse(ts);
        if (Number.isFinite(tms) && tms < cutoffMs) continue;
        fails.push({ block_id: blockId, ts, kind, note: rest.join('\t').slice(0, 240) });
      }
    }
    const decs = path.join(blocksDir, blockId, 'decisions.log');
    if (fs.existsSync(decs)) {
      const lines = fs.readFileSync(decs, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        if (line.startsWith('#')) continue;
        const [ts, kind, ...rest] = line.split('\t');
        if (!ts) continue;
        const tms = Date.parse(ts);
        if (Number.isFinite(tms) && tms < cutoffMs) continue;
        decisions.push({ block_id: blockId, ts, kind: kind || 'misc', note: rest.join('\t').slice(0, 240) });
      }
    }
  }
  return { fails, decisions };
}

function buildPrompt({ fails, decisions, windowDays }) {
  const sections = [
    `You are an Atlas pattern-spotter. Look at a single operator's last ${windowDays} days of FAILED checks and architectural decisions, and surface RECURRING problems (≥ 2 evidence pieces).`,
    '',
    '## Failed checks',
    ...fails.slice(0, 80).map((f) => `- ${f.ts}\t[${f.block_id}]\t${f.kind}\t${f.note}`),
    '',
    '## Decisions',
    ...decisions.slice(0, 60).map((d) => `- ${d.ts}\t[${d.block_id}]\t${d.kind}\t${d.note}`),
    '',
    'Return strictly JSON: {"lessons": [{"lesson": "<sentence>", "evidence": ["<block_id>@<date>", ...], "expires_at": null|"<ISO>"}]}.',
    'Rules:',
    '- Only lessons backed by ≥ 2 distinct evidence items.',
    '- "lesson" is a single sentence in the operator\'s working language (Russian if log notes are mostly Russian, English otherwise).',
    '- evidence array must reference real block_id@date pairs from the input.',
    '- If nothing recurring → return {"lessons": []}.',
    '- expires_at: null unless the lesson is clearly tied to a deprecated tool (then ~3 months out).',
  ];
  return sections.join('\n');
}

function loadLessons(atlasRoot) {
  const p = path.join(atlasRoot, 'operator_profile', 'lessons.json');
  if (!fs.existsSync(p)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return Array.isArray(j) ? j : (Array.isArray(j.lessons) ? j.lessons : []);
  } catch { return []; }
}

function saveLessons(atlasRoot, lessons) {
  const dir = path.join(atlasRoot, 'operator_profile');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'lessons.json'), JSON.stringify(lessons, null, 2) + '\n', 'utf8');
}

function dedupeLessons(existing, incoming) {
  // Simple dedupe by exact-text or evidence-overlap ≥ 50%.
  const out = [...existing];
  const added = [];
  for (const ln of incoming) {
    if (!ln || !ln.lesson) continue;
    const dup = existing.find((e) => {
      if (e.lesson === ln.lesson) return true;
      const inter = (e.evidence || []).filter((x) => (ln.evidence || []).includes(x));
      const overlap = (e.evidence || []).length ? inter.length / (e.evidence || []).length : 0;
      return overlap >= 0.5;
    });
    if (dup) continue;
    const id = 'L-' + (out.length + 1).toString().padStart(3, '0');
    const entry = {
      id,
      lesson: ln.lesson,
      evidence: Array.isArray(ln.evidence) ? ln.evidence : [],
      expires_at: ln.expires_at ?? null,
      added_at: new Date().toISOString(),
    };
    out.push(entry);
    added.push(entry);
  }
  return { lessons: out, added };
}

export async function analyzeLessons({ window_days = DEFAULT_WINDOW_DAYS, dry_run = false, atlas_root } = {}) {
  const root = atlas_root || ATLAS;
  const { fails, decisions } = readWindowedFailures(root, window_days);

  // Min-data guard: if there are < 2 fail+decision items total, no point
  // calling the LLM. Stay silent — same warming_up principle as
  // aggregate_operator_profile.
  if (fails.length + decisions.length < 2) {
    return { lessons_added: 0, lessons_total: loadLessons(root).length, cost_usd: 0, provider: 'mock', warming_up: true, reason: 'min_data_not_met' };
  }

  const prompt = buildPrompt({ fails, decisions, windowDays: window_days });
  const t0 = Date.now();
  const result = await callLLM({
    prompt,
    schema: LESSONS_SCHEMA,
    op: 'analyze_lessons',
    max_tokens: 1024,
    temperature: 0,
  });
  const trace = result.trace || {};
  const cost = Number(trace.cost_usd || 0);
  if (cost > COST_CAP_USD) {
    return { lessons_added: 0, lessons_total: loadLessons(root).length, cost_usd: cost, provider: trace.provider, cost_capped: true };
  }
  const incoming = (result.value && Array.isArray(result.value.lessons)) ? result.value.lessons : [];

  // Filter out lessons with < 2 evidence (LLM might cheat on the rule).
  const filtered = incoming.filter((ln) => Array.isArray(ln.evidence) && ln.evidence.length >= 2);

  const existing = loadLessons(root);
  const { lessons, added } = dedupeLessons(existing, filtered);

  if (!dry_run) saveLessons(root, lessons);

  return {
    lessons_added: added.length,
    lessons_total: lessons.length,
    cost_usd: cost,
    provider: trace.provider,
    model: trace.model,
    duration_ms: Date.now() - t0,
    sample_added: added.slice(0, 3),
  };
}

// ─────────────────────────────────────────── MCP-friendly helpers
export function addLesson({ atlas_root, lesson, evidence = [], expires_at = null }) {
  const root = atlas_root || ATLAS;
  const existing = loadLessons(root);
  const id = 'L-' + (existing.length + 1).toString().padStart(3, '0');
  const entry = { id, lesson, evidence, expires_at, added_at: new Date().toISOString(), added_by: 'manual' };
  existing.push(entry);
  saveLessons(root, existing);
  return entry;
}

export function revokeLesson({ atlas_root, lesson_id }) {
  const root = atlas_root || ATLAS;
  const existing = loadLessons(root);
  const idx = existing.findIndex((l) => l.id === lesson_id);
  if (idx < 0) return { revoked: false, reason: 'not_found' };
  const removed = existing.splice(idx, 1)[0];
  saveLessons(root, existing);
  return { revoked: true, lesson: removed };
}

export function listLessons({ atlas_root } = {}) {
  return loadLessons(atlas_root || ATLAS);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry-run');
  const json = argv.includes('--json');
  const wIdx = argv.indexOf('--window-days');
  const windowDays = wIdx >= 0 ? Number(argv[wIdx + 1] || DEFAULT_WINDOW_DAYS) : DEFAULT_WINDOW_DAYS;

  // Sub-commands for manual lessons management
  if (argv[0] === 'add' || argv[0] === 'revoke' || argv[0] === 'list') {
    const sub = argv[0];
    if (sub === 'list') {
      const items = listLessons();
      if (json) console.log(JSON.stringify(items, null, 2));
      else for (const l of items) console.log(`  ${l.id}: ${l.lesson}`);
      process.exit(0);
    }
    if (sub === 'add') {
      const lessonText = argv.slice(1).filter((a) => !a.startsWith('--')).join(' ');
      const evIdx = argv.indexOf('--evidence');
      const ev = evIdx >= 0 ? String(argv[evIdx + 1] || '').split(',').map((s) => s.trim()).filter(Boolean) : [];
      if (!lessonText || ev.length < 2) {
        console.error('Usage: ... add "<lesson text>" --evidence b.x@2026-04-01,b.y@2026-04-02');
        process.exit(1);
      }
      const entry = addLesson({ lesson: lessonText, evidence: ev });
      console.log(JSON.stringify(entry, null, 2));
      process.exit(0);
    }
    if (sub === 'revoke') {
      const id = argv[1];
      if (!id) { console.error('Usage: ... revoke <lesson_id>'); process.exit(1); }
      const r = revokeLesson({ lesson_id: id });
      console.log(JSON.stringify(r, null, 2));
      process.exit(r.revoked ? 0 : 2);
    }
  }

  const r = await analyzeLessons({ window_days: windowDays, dry_run: dry });
  if (json) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    if (r.warming_up) console.log(`analyze_lessons: warming_up — ${r.reason} (existing total ${r.lessons_total})`);
    else console.log(`analyze_lessons: added=${r.lessons_added} total=${r.lessons_total} provider=${r.provider} cost=$${(r.cost_usd || 0).toFixed(5)}${r.cost_capped ? ' [CAPPED]' : ''}`);
  }
}

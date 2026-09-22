#!/usr/bin/env node
// R-8.12 (b.clarify) — is the contract written so that it can be checked?
//
// Taken from Spec Kit's /speckit.checklist («unit tests for English») and
// /speckit.analyze: test the requirements, not the code. Theirs is a prompt
// the model follows; this is deterministic — it runs offline, on every block,
// every night, and gives the same answer twice. It does not judge meaning
// (that is b.clarify's questions); it finds the places where a contract
// cannot be verified as written:
//
//   vague             a KPI (or a judge-only acceptance item) leans on a word
//                     like «быстро», «удобно», «корректно», «robust» with no
//                     measure next to it
//   kpi_unmeasurable  (info) a KPI with no number, threshold, comparison or
//                     quantifier — fine for a yes/no property («a conflicting
//                     command is blocked»), otherwise it needs one; info, not a
//                     warning, because a boolean KPI is objectively checkable
//   kpi_unchecked     a KPI that acceptance.md never mentions and no `kpi` line
//                     in checks.log names — the b.user-docs-generator and
//                     b.acceptance-verifier-loop cases, found by hand before
//   kpi_untraced      the block's `kpi` lines record a pass but never name a
//                     KPI, so which ones were measured is not on record
//   kpi_declared_failing
//                     the KPI's own text says it is not met («Сейчас: ✗»)
//   kpi_unnamed       KPIs written as plain bullets, without KPI-N numbers:
//                     nothing can refer to them
//   kpi_declared_unmeasured
//                     a `kpi` line says outright that this KPI is not measured
//   judge_only        an acceptance item only an LLM judge can decide
//
// A «measure» is a digit, a percentage, a comparison, or a quantifier
// («каждый», «ни один», «всегда», «ноль», every / none / never …):
// «каждый прогон возвращает X» is measurable without a number.
//
// A REPORT, NOT A GATE (exit 0 on every finding), like validate_meaning: no
// evidence yet that a lint finding precedes rework. Promotion condition: two
// recorded cases of a block reaching `done` and failing later on a KPI or an
// assertion this lint had flagged. Removal condition: 30 days of findings
// that never preceded such a failure.
//
// Library: import { lintContract } from './contract_lint.mjs';
// CLI:     node scripts/contract_lint.mjs [--json] [<block_id>]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_ATLAS = () => process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');

// Stems (Russian inflects) and phrases. Kept short on purpose: every entry
// is a word that, alone, gives a checker nothing to check.
const VAGUE = [
  'быстр', 'медленн', 'удобн', 'корректн', 'правильн', 'качествен', 'эффективн', 'оптимальн',
  'надёжн', 'надежн', 'стабильн', 'хорош', 'интуитивн', 'понятн', 'гибк', 'масштабируем',
  'при необходимости', 'по возможности', 'и т.д', 'и т. д', 'и так далее',
  'fast', 'quick', 'slow', 'user-friendly', 'intuitive', 'properly', 'correctly', 'robust',
  'efficient', 'optimal', 'scalable', 'flexible', 'as needed', 'works well', 'reasonable', 'adequate', 'etc',
];
const QUANTIFIERS = [
  'каждый', 'каждая', 'каждое', 'каждого', 'каждой', 'каждому', 'каждую', 'все', 'всех', 'всё', 'ни один', 'ни одна',
  'ни одно', 'ни одного', 'никогда', 'всегда', 'ноль', 'нуль', 'нулевой', 'ни разу',
  'every', 'each', 'all', 'none', 'never', 'always', 'zero', 'no single',
  // comparisons are measures too
  'только', 'не более', 'не менее', 'не больше', 'не меньше', 'меньше', 'больше', 'ниже', 'выше',
  'only', 'at most', 'at least', 'less than', 'more than', 'fewer', 'below', 'above', 'under',
];
// …and so are trends («снижается от прогона к прогону»): stems, any ending.
const TRENDS = ['снижа', 'уменьша', 'увеличива', 'растёт', 'растет', 'пада', 'decreas', 'increas', 'declin', 'drops', 'grows'];
const L = '\\p{L}\\p{N}_';
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const VAGUE_RE = new RegExp(`(?<![${L}])(${VAGUE.map(escapeRe).join('|')})[\\p{L}-]*`, 'iu');
const MEASURE_RE = new RegExp(`\\d|%|[<>≤≥=]|(?<![${L}])(${QUANTIFIERS.map(escapeRe).join('|')})(?![${L}])|(?<![${L}])(${TRENDS.map(escapeRe).join('|')})`, 'iu');

// KPIs written as plain top-level bullets (no KPI-N): numbered by position.
function unnamedKpis(text) {
  const out = new Map();
  let n = 0;
  for (const line of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    if (/^[-*]\s+\S/.test(line)) { n += 1; out.set(`KPI #${n}`, line); }
    else if (n && /^\s+\S/.test(line)) out.set(`KPI #${n}`, `${out.get(`KPI #${n}`)}\n${line}`);
  }
  return out;
}

// Units of a file: acceptance items by id, KPIs by number, else by heading.
function units(file, text) {
  const out = new Map();
  let key = null;
  let buf = [];
  const flush = () => { if (key) out.set(key, buf.join('\n')); buf = []; };
  for (const line of String(text || '').replace(/\r\n/g, '\n').split('\n')) {
    let k = null;
    if (file === 'acceptance.md') { const m = line.match(/^- \[[ xX]\] \*\*(A\d+)/); if (m) k = m[1]; }
    if (file === 'kpi.md') { const m = line.match(/^- \*\*(KPI-\d+)/); if (m) k = m[1]; }
    if (k || /^#{1,3}\s/.test(line)) { flush(); key = k; }
    if (key) buf.push(line);
  }
  flush();
  return out;
}

// The wording of an acceptance item, without its label and YAML block. The
// label («**A2.**») carries a digit and would count as a measure.
function itemWording(text) {
  const i = text.indexOf('```yaml');
  return (i >= 0 ? text.slice(0, i) : text).trim().replace(/^- \[[ xX]\] \*\*A\d+\.?\*\*\.?/, '');
}
// A KPI's wording without its label («**KPI-2 (ux)**:»), for the same reason.
function kpiWording(text) {
  return String(text).replace(/^[-*]\s+\*\*KPI-\d+[^*]*\*\*:?/, '').replace(/^[-*]\s+/, '');
}
function itemKind(text) {
  const m = text.match(/```yaml[\s\S]*?evidence_kind:\s*([a-z_]+)/);
  return m ? m[1] : 'llm_judge'; // no YAML → the verifier falls back to the judge
}

// KPI numbers a line of text mentions: «KPI-3», «KPI-1..4», «KPI-4/5/7»,
// and the short form some ledgers use: «K3», «K1-K5».
export function kpiMentions(text) {
  const found = new Set();
  for (const m of String(text || '').matchAll(/(?<![\p{L}\p{N}])K(\d+)(?:\s*[-–—]\s*K(\d+))?(?![\p{L}\p{N}])/gu)) {
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let n = a; n <= b; n++) found.add(n);
  }
  for (const m of String(text || '').matchAll(/KPI-(\d+)((?:\s*(?:\.\.|–|—)\s*\d+)|(?:\/\d+)+)?/g)) {
    const first = Number(m[1]);
    const rest = m[2] || '';
    const range = rest.match(/(?:\.\.|–|—)\s*(\d+)/);
    if (range) { for (let n = first; n <= Number(range[1]); n++) found.add(n); }
    else if (rest.startsWith('/')) { found.add(first); rest.split('/').filter(Boolean).forEach((n) => found.add(Number(n))); }
    else found.add(first);
  }
  return found;
}
const UNMEASURED_RE = /не измер|не проверен|not measur|unmeasur|\bn\/a\b/i;

export function lintContract(blockId, atlasRoot = DEFAULT_ATLAS()) {
  const dir = path.join(atlasRoot, 'blocks', blockId);
  const read = (f) => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch { return ''; } };
  const findings = [];
  const add = (severity, rule, file, key, message, extra = {}) => findings.push({ severity, rule, file, key, message, ...extra });

  let kpis = units('kpi.md', read('kpi.md'));
  const acceptance = units('acceptance.md', read('acceptance.md'));
  const unnamed = kpis.size === 0 ? unnamedKpis(read('kpi.md')) : new Map();
  if (unnamed.size) add('warn', 'kpi_unnamed', 'kpi.md', null, `${unnamed.size} KPIs are plain bullets without KPI-N numbers — no acceptance item or measurement can refer to them`, { count: unnamed.size });

  // KPI wording
  for (const [key, text] of [...kpis, ...unnamed]) {
    if (/(Сейчас|Now|Currently)[^:\n]*:\s*(✗|❌)/i.test(text)) {
      add('warn', 'kpi_declared_failing', 'kpi.md', key, `${key}: its own text says it is not met (✗) — fix the KPI or update the note`);
    }
    const flat = kpiWording(text).replace(/\s+/g, ' ');
    const vague = flat.match(VAGUE_RE);
    if (vague && !MEASURE_RE.test(flat.slice(Math.max(0, vague.index - 60), vague.index + vague[0].length + 60))) {
      add('warn', 'vague', 'kpi.md', key, `${key}: «${vague[0]}» with no measure next to it`, { term: vague[0] });
    } else if (!MEASURE_RE.test(flat)) {
      add('info', 'kpi_unmeasurable', 'kpi.md', key, `${key} has no explicit number, threshold or quantifier — fine for a yes/no property, otherwise add one`);
    }
  }

  // Acceptance wording (only where no deterministic evidence pins it down)
  for (const [key, text] of acceptance) {
    if (itemKind(text) !== 'llm_judge') continue;
    add('info', 'judge_only', 'acceptance.md', key, `${key} can only be decided by an LLM judge`);
    const wording = itemWording(text).replace(/\s+/g, ' ');
    const vague = wording.match(VAGUE_RE);
    if (vague && !MEASURE_RE.test(wording)) add('warn', 'vague', 'acceptance.md', key, `${key}: «${vague[0]}» with no measure — the judge has to guess what counts`, { term: vague[0] });
  }

  // KPI coverage: mentioned anywhere in acceptance.md, or named in a kpi line
  const referenced = kpiMentions(read('acceptance.md'));
  const measured = new Set();
  const declaredUnmeasured = new Set();
  let kpiLines = 0;
  for (const line of read('checks.log').split(/\r?\n/)) {
    const c = line.split(/\t|\s{2,}/);
    if (c.length < 4 || !/^kpi/i.test(c[1] || '')) continue;
    kpiLines += 1;
    for (const seg of c.slice(3).join(' ').split(/[;·]|,\s(?=KPI-)/)) {
      const ns = kpiMentions(seg);
      for (const n of ns) (UNMEASURED_RE.test(seg) ? declaredUnmeasured : measured).add(n);
    }
  }
  const untraced = kpiLines > 0 && measured.size === 0 && declaredUnmeasured.size === 0;
  if (untraced && kpis.size) {
    add('warn', 'kpi_untraced', 'checks.log', null, `${kpiLines} kpi line(s) record a result but none names a KPI — which of ${[...kpis.keys()].join(', ')} were measured is not on record`, { count: kpiLines, kpis: [...kpis.keys()] });
  }
  for (const key of kpis.keys()) {
    const n = Number(key.slice(4));
    if (referenced.has(n) || measured.has(n)) continue;
    if (declaredUnmeasured.has(n)) add('info', 'kpi_declared_unmeasured', 'kpi.md', key, `${key} is recorded as not measured yet`);
    else if (!untraced) add('warn', 'kpi_unchecked', 'kpi.md', key, `${key}: acceptance.md never mentions it and no kpi line names it`);
  }

  const counts = { warn: findings.filter((f) => f.severity === 'warn').length, info: findings.filter((f) => f.severity === 'info').length };
  return { block_id: blockId, kpis: kpis.size + unnamed.size, assertions: acceptance.size, counts, findings };
}

// ── CLI: report only ─────────────────────────────────────────────────────────
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const only = args.find((a) => !a.startsWith('--'));
  const atlas = DEFAULT_ATLAS();
  const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));
  const rows = (graph.blocks || []).filter((b) => b.status !== 'archived' && (!only || b.id === only))
    .map((b) => ({ status: b.status, ...lintContract(b.id, atlas) }));
  if (asJson) { console.log(JSON.stringify({ ok: true, gate: false, rows }, null, 2)); process.exit(0); }
  for (const r of rows) {
    const w = r.findings.filter((f) => f.severity === 'warn');
    if (!w.length) continue;
    console.log(` · ${r.block_id} (${r.status}) — ${w.length} to fix`);
    for (const f of w) console.log(`     ${f.file} ${f.message}`);
  }
  const warn = rows.reduce((n, r) => n + r.counts.warn, 0);
  const clean = rows.filter((r) => r.counts.warn === 0).length;
  console.log(`contract_lint: ${rows.length} blocks — ${clean} with no findings, ${warn} findings to fix (report only, not a gate)`);
}

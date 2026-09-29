#!/usr/bin/env node
// R-8.13 (b.clarify) — review a draft of a contract file BEFORE it is written.
//
// The best thing to take from OpenSpec is its core rule: both sides look at
// the same delta, and only then is it applied. We already show the delta
// after the fact (contractDelta, when a confirmed frame goes stale). The
// place where the model actually writes the human's contract is the editor:
// «✨ Fill», «✏ Rewrite», «✨ Expand». There the operator got two blobs — WAS
// and BECAME — and had to diff them by eye: a dropped acceptance item or a
// changed KPI threshold slipped through, and a draft about another product
// («fill user story wrote about the wrong product») looked like any other.
//
// reviewDraft() returns, for one file:
//   delta      added / modified (before, after) / removed units of meaning
//              (acceptance items by id, KPIs by number, sections by heading)
//   risks      removed       a requirement disappears
//              numbers       a number or threshold inside a unit changed
//              rewrite_added «rewrite» promised no new facts, but a new
//                            requirement appeared (a new number inside an
//                            existing one is already a `numbers` risk)
//              off_topic     the draft shares almost no words with the
//                            block's mission and the project — likely about
//                            something else
//   relevance  shared / total word stems, so the warning can show its basis;
//              judged=false when either side is too short to tell
//
// Deterministic, no LLM. It never blocks the save: the risks are for the
// human to see before «write», which stays theirs.
//
// Library: import { reviewDraft } from './contract_draft_review.mjs';

import { contractUnits, normalizeContractText } from './block_meaning.mjs';

// Words that carry no topic: generic Russian / English and this repo's own
// vocabulary («блок», «контракт»), present in every contract.
const STOP = new Set([
  'этот', 'этого', 'этой', 'этом', 'эти', 'который', 'которая', 'которое', 'которые', 'также', 'более', 'менее',
  'должен', 'должна', 'должно', 'должны', 'может', 'могут', 'будет', 'будут', 'быть', 'есть', 'чтобы', 'когда',
  'если', 'после', 'перед', 'через', 'между', 'каждый', 'всех', 'только', 'например', 'нужно', 'можно', 'такой',
  'блок', 'блока', 'блоку', 'блоком', 'блоке', 'блоки', 'блоков', 'контракт', 'контракта', 'контракте', 'контракту',
  'контракты', 'контрактов', 'миссия', 'миссии', 'миссию', 'сейчас',
  'this', 'that', 'with', 'from', 'have', 'will', 'should', 'must', 'each', 'which', 'when', 'then', 'into',
  'only', 'also', 'more', 'than', 'there', 'their', 'block', 'blocks', 'contract', 'mission', 'user', 'users',
]);
export function stems(text) {
  const out = new Set();
  for (const w of String(text || '').toLowerCase().match(/\p{L}+/gu) || []) {
    if (w.length < 4 || STOP.has(w)) continue;
    out.add(w.slice(0, 6));
  }
  return out;
}

// Numbers with the unit next to them, labels removed first (A2, KPI-3 are
// names, not values).
export function numbersOf(text) {
  const clean = String(text || '')
    .replace(/\*\*A\d+\.?\*\*/g, ' ')
    .replace(/\*\*KPI-\d+[^*]*\*\*/g, ' ')
    .replace(/\bKPI-\d+\b/g, ' ')
    .replace(/\bA\d+\b/g, ' ');
  const re = /\d+(?:[.,]\d+)?\s*(?:%|мс|ms|сек\p{L}*|с|s|мин\p{L}*|ч|h|кб|kb|мб|mb|гб|gb|тыс\.?|k)?(?![\p{L}\d])/giu;
  return (clean.match(re) || []).map((n) => n.toLowerCase().replace(/\s+/g, '').replace(',', '.')).sort();
}
const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const OFF_TOPIC_MIN_STEMS = 12;
const OFF_TOPIC_RATIO = 0.15;

/**
 * @param file     contract file name (acceptance.md, kpi.md, mission.md, …)
 * @param current  its text now
 * @param draft    the proposed text
 * @param mode     'fill' | 'rewrite' | 'expand' | 'manual'
 * @param mission  the block's mission.md (topic reference)
 * @param project  atlas/project.md (topic reference)
 */
export function reviewDraft({ file, current = '', draft = '', mode = 'manual', mission = '', project = '' } = {}) {
  const u0 = contractUnits(file, current);
  const u1 = contractUnits(file, draft);
  const norm = (t) => normalizeContractText(t);
  const real = (k) => k !== '(начало)'; // the title/intro block is not a requirement
  const added = [...u1.keys()].filter((k) => !u0.has(k)).map((k) => ({ key: k, text: u1.get(k) }));
  const removed = [...u0.keys()].filter((k) => !u1.has(k)).map((k) => ({ key: k, text: u0.get(k) }));
  const modified = [...u1.keys()].filter((k) => u0.has(k) && norm(u0.get(k)) !== norm(u1.get(k)))
    .map((k) => ({ key: k, before: u0.get(k), after: u1.get(k) }));

  const risks = [];
  for (const r of removed.filter((x) => real(x.key) && norm(x.text))) risks.push({ kind: 'removed', key: r.key });
  for (const m of modified) {
    const nb = numbersOf(m.before);
    const na = numbersOf(m.after);
    if (!sameList(nb, na)) {
      risks.push({ kind: 'numbers', key: m.key, before: nb.filter((n) => !na.includes(n)), after: na.filter((n) => !nb.includes(n)) });
    }
  }
  if (mode === 'rewrite') {
    for (const a of added.filter((x) => real(x.key))) risks.push({ kind: 'rewrite_added', key: a.key });
  }

  // Off topic: the draft's word stems against the block's mission, the
  // project and the file's current text. Only when both sides are long
  // enough to tell — against an empty mission and project every draft would
  // look foreign, and a false alarm teaches the operator to ignore it.
  const ds = stems(draft);
  const ref = stems([mission, project, current].join('\n'));
  const shared = [...ds].filter((s) => ref.has(s)).length;
  const judged = mode !== 'manual' && ds.size >= OFF_TOPIC_MIN_STEMS && ref.size >= OFF_TOPIC_MIN_STEMS;
  const relevance = { shared, total: ds.size, reference: ref.size, ratio: ds.size ? shared / ds.size : 1, judged };
  if (judged && relevance.ratio < OFF_TOPIC_RATIO) {
    risks.push({ kind: 'off_topic', shared, total: ds.size });
  }

  return { file, mode, delta: { added, modified, removed }, risks, relevance, unchanged: !added.length && !modified.length && !removed.length };
}

// KPI-9 source: who wrote the contract text, from the audit lines
// patchBlockFile appends to a block's checks.log (`… <file> by=<source>`).
// A model draft the operator changed before writing (`edited`) is the
// measurable trace of «the model understood it differently».
export function draftWriteStats(checksLogText) {
  const s = { manual: 0, model: 0, model_edited: 0, other: 0, unattributed: 0 };
  for (const line of String(checksLogText || '').split('\n')) {
    const cols = line.split('\t');
    if (cols[1] !== 'design_patch' || !/^atlas\/blocks\//.test(cols[3] || '')) continue;
    const by = (cols[3].match(/ by=(.*)$/) || [])[1];
    if (!by) s.unattributed++;
    else if (/^sima-/.test(by)) { s.model++; if (/(^| )edited( |$)/.test(by)) s.model_edited++; }
    else if (/^manual( |$)/.test(by)) s.manual++;
    else s.other++;
  }
  return s;
}

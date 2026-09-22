#!/usr/bin/env node
// R-8.08 (b.clarify) — the human → model direction of meaning transfer.
//
// b.clarify's first half (R-8.06) makes the model ASK the human where the
// contract may not say what was meant. This half closes the other direction.
// Two things the agent's prompt was missing, both taken from the operator's
// own description of how they transfer context to people and to models:
//
// 1. TRAJECTORY — where this block is heading.
//    The contract described only the present: mission, KPI, acceptance. When
//    several implementations satisfy acceptance, every one of them is green,
//    so nothing distinguishes them — and the agent picked arbitrarily, where
//    nobody would ever notice. The operator's point is that the future cannot
//    be written down as conditions («I don't know all the conditions yet»),
//    but it CAN be written as a direction, and a direction is enough to choose
//    between green variants: prefer the one that can grow into it. It is also
//    cheaper than conditions — three sentences of meaning replace a list of
//    constraints nobody can write.
//
// 2. DECLARED UNDERSTANDING — the agent states its frame before coding.
//    The cheapest divergence detector there is. If the agent writes «I am
//    treating this as a standard CRUD resource» and the operator meant
//    something else, it shows in one line, before a single line of code. No
//    acceptance check catches that, because the CRUD implementation is
//    honestly green.
//
// Library:
//   import { readTrajectory, trajectoryPromptLines, understandingPromptLines,
//            parseUnderstanding, readUnderstanding, understandingStaleness,
//            blockMeaningSummary,
//            // R-8.09 — two-phase run
//            frameGate, recordDeclared, recordFrameReview, contractFingerprint,
//            declarePhasePromptLines, implementPhasePromptLines, operatorLanguage,
//          } from './block_meaning.mjs';

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const DEFAULT_ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');

// ── trajectory ──────────────────────────────────────────────────────────────
// Headings accepted for the trajectory section of mission.md. The operator
// writes contracts in Russian; agents often write them in English.
export const TRAJECTORY_HEADINGS = [
  'во что это вырастет',
  'куда это движется',
  'траектория',
  'trajectory',
  'where this is heading',
];

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// NOT `\b`: in JavaScript `\b` is defined over [A-Za-z0-9_] only, so after a
// Cyrillic word it never matches. With `\b` here every Russian trajectory
// heading («## Во что это вырастет») was silently invisible while English ones
// worked — found on the first real contract, not by a test written in English.
// A Unicode-aware lookahead plus the `u` flag handles both scripts.
const HEADING_RE = new RegExp(
  `^(#{2,3})\\s+(${TRAJECTORY_HEADINGS.map(escapeRe).join('|')})(?=$|[^\\p{L}\\p{N}_]).*$`, 'iu',
);

/**
 * Split mission.md into the trajectory section and everything else.
 * Returns { text, heading, missionWithout, empty }.
 *   text            — trajectory body, or null when there is none
 *   missionWithout  — the mission with that section removed, so the prompt
 *                     does not carry the same text twice
 *   empty           — a trajectory heading exists but has no body; reported,
 *                     because an empty heading reads as «declared» while
 *                     declaring nothing
 */
export function readTrajectory(missionText) {
  const src = typeof missionText === 'string' ? missionText : '';
  const lines = src.split(/\r?\n/);
  let start = -1, level = 0, heading = null;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING_RE);
    if (m) { start = i; level = m[1].length; heading = lines[i].replace(/^#+\s*/, '').trim(); break; }
  }
  if (start < 0) return { text: null, heading: null, missionWithout: src, empty: false };

  // The section runs until the next heading of the same or higher level.
  const stop = new RegExp(`^#{1,${level}}\\s`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (stop.test(lines[i])) { end = i; break; }
  }
  const body = lines.slice(start + 1, end).join('\n').trim();
  const without = [...lines.slice(0, start), ...lines.slice(end)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    text: body || null,
    heading,
    missionWithout: without,
    empty: !body,
  };
}

/**
 * R-8.10 — write the trajectory section into a mission (the canvas «Set the
 * trajectory» button). Replaces the body of an existing section, inserts a new
 * «## Во что это вырастет» before «## Layer» (or at the end), or removes the
 * section when the body is empty. Headings inside the body would end the
 * section when it is read back, so they are turned into bold lines — what is
 * written is exactly what readTrajectory will return.
 */
export const DEFAULT_TRAJECTORY_HEADING = 'Во что это вырастет';
export function setTrajectory(missionText, body, { heading = DEFAULT_TRAJECTORY_HEADING } = {}) {
  const src = String(missionText || '').replace(/\r\n/g, '\n');
  const text = String(body || '').replace(/\r\n/g, '\n').trim()
    .split('\n').map((l) => l.replace(/^#{1,6}\s+(.*)$/, '**$1**')).join('\n');
  const lines = src.split('\n');
  let start = -1, level = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEADING_RE);
    if (m) { start = i; level = m[1].length; break; }
  }
  let out;
  if (start >= 0) {
    const stop = new RegExp(`^#{1,${level}}\\s`);
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) { if (stop.test(lines[i])) { end = i; break; } }
    const section = text ? [lines[start], '', text, ''] : [];
    out = [...lines.slice(0, start), ...section, ...lines.slice(end)];
  } else {
    if (!text) return src;
    const section = [`## ${heading}`, '', text, ''];
    const layerAt = lines.findIndex((l) => /^##\s+Layer\s*$/i.test(l));
    out = layerAt >= 0
      ? [...lines.slice(0, layerAt), ...section, ...lines.slice(layerAt)]
      : [...lines, '', ...section];
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n');
}

/**
 * Prompt lines for the trajectory section — present or absent. `recordIn` is
 * where the agent writes down a choice between green variants: the declaration
 * while it may still write one, narrative.md once the operator has confirmed
 * the declaration and it must not be rewritten (R-8.09).
 */
export function trajectoryPromptLines(traj, { recordIn = 'understanding.md' } = {}) {
  const inDeclaration = recordIn === 'understanding.md';
  if (traj && traj.text) {
    return [
      '## Where this is heading (trajectory)',
      traj.text,
      '',
      'This is NOT something to build now — the right-size rules below still apply, and the future form is out of scope for this run.',
      'Use it to choose BETWEEN implementations. When several of them satisfy the acceptance criteria, all of them will verify green, so acceptance cannot tell them apart — this can:',
      '- prefer the implementation that can grow into this form without a rewrite;',
      '- never pick one that closes this direction off, even if it is shorter;',
      inDeclaration
        ? '- if you had to make that choice, name it under «Variant chosen» in understanding.md.'
        : '- the confirmed «Variant chosen» already made that choice; if the work forces a different one, explain it in narrative.md.',
    ];
  }
  return [
    '## Where this is heading (trajectory)',
    traj && traj.empty
      ? 'The mission has a trajectory heading with nothing under it — treat that as no trajectory declared.'
      : 'No trajectory is declared for this block.',
    inDeclaration
      ? 'When several implementations satisfy the acceptance criteria, choose the one that is easiest to change later, and record that choice under «Assumed without asking» in understanding.md.'
      : 'When several implementations satisfy the acceptance criteria, choose the one that is easiest to change later, and record that choice in narrative.md (understanding.md is confirmed and must not be rewritten).',
    'The operator did not say where this is heading, so any choice you make between green variants is a guess — it must be visible, not silent.',
  ];
}

// ── declared understanding ──────────────────────────────────────────────────
export const UNDERSTANDING_FILE = 'understanding.md';

// Fixed headings, so declared frames stay machine-comparable across runs.
export const UNDERSTANDING_SECTIONS = [
  {
    key: 'treating_as',
    heading: 'Treating this as',
    hint: 'the known kind of thing you are building this as — your operative analogy, in one or two sentences. «A standard CRUD resource», «a pure function over the graph», «a background job with retries». The operator reads this line first: if it is wrong, everything after it is wrong in the same direction.',
  },
  {
    key: 'in_scope',
    heading: 'In scope',
    hint: 'what you will build.',
  },
  {
    key: 'out_of_scope',
    heading: 'Out of scope',
    hint: 'what you deliberately will NOT do, including things a reader might expect you to.',
  },
  {
    key: 'variant_chosen',
    heading: 'Variant chosen',
    hint: 'when more than one implementation would satisfy acceptance, which one you picked and why — against the trajectory if one is declared.',
  },
  {
    key: 'assumed',
    heading: 'Assumed without asking',
    hint: 'every decision you made because the contract did not say. A recorded assumption is visible debt; an unrecorded one looks like knowledge from the outside.',
  },
];

// ── operator language ───────────────────────────────────────────────────────
// The declaration is read by the operator, so it is written in the language the
// operator writes the contract in — not in the language of the (English)
// prompt. Detected from the mission itself; ATLAS_OPERATOR_LANG overrides.
export function operatorLanguage(text, env = process.env) {
  if (env.ATLAS_OPERATOR_LANG && env.ATLAS_OPERATOR_LANG.trim()) return env.ATLAS_OPERATOR_LANG.trim();
  const letters = String(text || '').match(/\p{L}/gu) || [];
  if (letters.length < 20) return null;
  const cyr = letters.filter((c) => /\p{Script=Cyrillic}/u.test(c)).length;
  return cyr / letters.length >= 0.3 ? 'Russian' : 'English';
}

function languageLine(language) {
  return language
    ? `- Write the content under these headings in ${language} — the language the operator wrote the mission in; the operator reads this file. Keep the headings themselves exactly as given: they are machine-read.`
    : '- Write the content in the language the mission is written in. Keep the headings exactly as given: they are machine-read.';
}

/**
 * Prompt lines for a single run that both declares and implements (the
 * pre-R-8.09 flow). Used only when the frame review is explicitly skipped:
 * in that mode the operator sees the declaration after the code, not before.
 */
export function understandingPromptLines(blockDirRel, { language = null } = {}) {
  const target = `${blockDirRel}/${UNDERSTANDING_FILE}`;
  return [
    '## Step 0 — declare how you understand this block (after reading this whole prompt, BEFORE writing any code)',
    `Write \`${target}\` first, with exactly these headings:`,
    '',
    ...UNDERSTANDING_SECTIONS.map((s) => `- \`## ${s.heading}\` — ${s.hint}`),
    '',
    'Rules:',
    '- Write it before touching code, so the frame your code is built on is recorded rather than implicit.',
    '- If it already exists from an earlier run, overwrite it: it must describe your understanding now. History is kept by git.',
    '- If writing «Treating this as» shows that you cannot say what this block is, STOP: say so in narrative.md instead of guessing in code.',
    languageLine(language),
  ];
}

/**
 * R-8.09 — phase 1 of a two-phase run: declare, then STOP. The operator reads
 * the declaration and either confirms it (phase 2 writes code) or corrects it
 * (this phase runs again with the correction). A frame read after the code is
 * too late to steer anything; this is where it can still be steered.
 */
export function declarePhasePromptLines(blockDirRel, { language = null, correction = null, previousFrame = null } = {}) {
  const target = `${blockDirRel}/${UNDERSTANDING_FILE}`;
  const lines = [
    '## Your task in this run — declare how you understand this block, then STOP',
    'This run is phase 1 of 2. Do NOT write or change any code, tests, contract files, checks.log, narrative.md or anything else.',
    `The ONLY file you may write is \`${target}\`, with exactly these headings:`,
    '',
    ...UNDERSTANDING_SECTIONS.map((s) => `- \`## ${s.heading}\` — ${s.hint}`),
    '',
    'Rules:',
    '- The operator will read this before any code exists and either confirm it or correct it. Only after the confirmation will a second run write the code — inside the frame you declare here. So be specific: a vague frame cannot be corrected.',
    '- Overwrite the file if it exists: it must describe your understanding now. History is kept by git.',
    '- If you cannot say what this block is, write that under «Treating this as» and list what you would need to know — that is a valid declaration, and a better one than a guess.',
    languageLine(language),
  ];
  if (correction) {
    lines.push(
      '',
      '## The operator corrected your previous declaration — this is the most important section',
      previousFrame ? `You previously treated this block as: ${String(previousFrame).replace(/\s+/g, ' ').trim()}` : null,
      'The operator answered:',
      '',
      String(correction).trim().split(/\r?\n/).map((l) => `> ${l}`).join('\n'),
      '',
      'Re-declare with this correction taken as given. Do not argue with it in the declaration; if it conflicts with the contract, say so under «Assumed without asking».',
    );
  }
  return lines.filter((l) => l !== null);
}

/**
 * R-8.09 — phase 2: the operator confirmed the declared frame. The agent gets
 * it as given and builds within it; it must not rewrite it.
 */
export function implementPhasePromptLines(blockDirRel, { understandingText = '', confirmedAt = null } = {}) {
  const target = `${blockDirRel}/${UNDERSTANDING_FILE}`;
  return [
    `## Confirmed understanding — the operator confirmed this frame${confirmedAt ? ` on ${String(confirmedAt).slice(0, 10)}` : ''}; build within it`,
    String(understandingText || '').replace(/^#\s[^\n]*\n+/, '').trim(),
    '',
    `- Do NOT rewrite \`${target}\`: it is what the operator agreed to. Rewriting it voids the confirmation and the next run will stop for a new one.`,
    '- If during the work you find this frame is wrong, stop and explain it in narrative.md instead of silently building something else.',
  ];
}

/** Parse understanding.md into its fixed sections. */
export function parseUnderstanding(text) {
  const src = typeof text === 'string' ? text : '';
  const lines = src.split(/\r?\n/);
  const sections = {};
  const missing = [];
  const empty = [];
  for (const s of UNDERSTANDING_SECTIONS) {
    const re = new RegExp(`^##\\s+${escapeRe(s.heading)}\\s*$`, 'i');
    const idx = lines.findIndex((l) => re.test(l.trim()));
    if (idx < 0) { missing.push(s.heading); continue; }
    let end = lines.length;
    for (let i = idx + 1; i < lines.length; i++) {
      if (/^#{1,2}\s/.test(lines[i])) { end = i; break; }
    }
    const body = lines.slice(idx + 1, end).join('\n').trim();
    sections[s.key] = body;
    if (!body) empty.push(s.heading);
  }
  return { sections, missing, empty, complete: missing.length === 0 && empty.length === 0 };
}

const CONTRACT_FILES = ['mission.md', 'acceptance.md', 'kpi.md', 'user_story.md'];

export function readUnderstanding(blockId, atlasRoot = DEFAULT_ATLAS) {
  const p = path.join(atlasRoot, 'blocks', blockId, UNDERSTANDING_FILE);
  if (!fs.existsSync(p)) return { exists: false, path: p };
  const text = fs.readFileSync(p, 'utf8');
  return { exists: true, path: p, text, mtimeMs: fs.statSync(p).mtimeMs, ...parseUnderstanding(text) };
}

/**
 * A declaration is stale when the contract changed after it was written: the
 * frame the agent declared may no longer match what the block now says.
 * mtime-based, so advisory only — a fresh checkout resets mtimes. Since R-8.09
 * this is only the fallback: once the orchestrator or the operator has written
 * a record to frame_reviews.jsonl, frameGate compares contract fingerprints.
 */
export function understandingStaleness(blockId, atlasRoot = DEFAULT_ATLAS) {
  const u = readUnderstanding(blockId, atlasRoot);
  if (!u.exists) return { stale: false, reason: 'no declaration', newer: [] };
  const newer = [];
  for (const f of CONTRACT_FILES) {
    const p = path.join(atlasRoot, 'blocks', blockId, f);
    if (fs.existsSync(p) && fs.statSync(p).mtimeMs > u.mtimeMs + 1000) newer.push(f);
  }
  return {
    stale: newer.length > 0,
    reason: newer.length ? `contract changed after the declaration: ${newer.join(', ')}` : 'up to date',
    newer,
  };
}

// ── frame review gate (R-8.09) ──────────────────────────────────────────────
// A declaration read after the code is too late to steer anything. So a run is
// two-phase: the agent declares its frame and stops; the operator confirms or
// corrects it; only a confirmed frame lets the next run write code.
//
// Nothing here is stored as «state». Every record goes to an append-only
// journal (frame_reviews.jsonl in the block folder) and the gate is derived
// from it plus the files on disk, on every call. A confirmation is bound to the
// exact text of the declaration AND the exact contract it was made for: change
// either and the confirmation no longer applies. The journal is also the
// corpus the trajectory in b.clarify's mission talks about — every «wrong
// frame» the operator caught, with the correction.
export const FRAME_REVIEWS_FILE = 'frame_reviews.jsonl';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 16);

// Checkbox state and trailing whitespace are not meaning: an agent ticking
// «- [x]» in acceptance.md must not void a frame the operator confirmed.
export function normalizeContractText(text) {
  return String(text || '').replace(/\r\n/g, '\n')
    .replace(/^(\s*[-*]\s*)\[[xX ]\]/gm, '$1[ ]')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

export function contractFingerprint(blockId, atlasRoot = DEFAULT_ATLAS) {
  const files = {};
  for (const f of CONTRACT_FILES) {
    const p = path.join(atlasRoot, 'blocks', blockId, f);
    files[f] = fs.existsSync(p) ? sha(normalizeContractText(fs.readFileSync(p, 'utf8'))) : null;
  }
  return { hash: sha(CONTRACT_FILES.map((f) => `${f}:${files[f] || '-'}`).join('\n')), files };
}

export function understandingSha(text) {
  return sha(String(text || '').replace(/\r\n/g, '\n').trim());
}

export function readFrameReviews(blockId, atlasRoot = DEFAULT_ATLAS) {
  const p = path.join(atlasRoot, 'blocks', blockId, FRAME_REVIEWS_FILE);
  if (!fs.existsSync(p)) return [];
  const out = [];
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    // A torn or hand-mangled line is skipped, so it can never count as a
    // confirmation.
    try { out.push(JSON.parse(line)); } catch { /* skipped */ }
  }
  return out;
}

function appendFrameReview(blockId, atlasRoot, event) {
  const p = path.join(atlasRoot, 'blocks', blockId, FRAME_REVIEWS_FILE);
  fs.appendFileSync(p, JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n', 'utf8');
}

const DECISIVE = new Set(['declared', 'confirmed', 'corrected']);

/**
 * Where the block stands between «agent declared» and «agent may write code».
 *   state  none      — no declaration                      → next: declare
 *          awaiting  — declared, operator has not answered  → next: wait
 *          confirmed — operator said «right» for this text
 *                      and this contract                    → next: implement
 *          corrected — operator said «wrong» and why        → next: declare
 *          stale     — the contract changed since the declaration
 *                      or the confirmation                  → next: declare
 */
export function frameGate(blockId, atlasRoot = DEFAULT_ATLAS) {
  const contract = contractFingerprint(blockId, atlasRoot);
  const events = readFrameReviews(blockId, atlasRoot);
  const base = {
    contract_hash: contract.hash,
    corrections: events.filter((e) => e.event === 'corrected').length,
    confirmations: events.filter((e) => e.event === 'confirmed').length,
    // The agent that wrote the latest declaration — «right, go on» continues
    // with the same one.
    last_declared_agent: ([...events].reverse().find((e) => e.event === 'declared' && e.agent) || {}).agent || null,
  };
  const u = readUnderstanding(blockId, atlasRoot);
  if (!u.exists) {
    return { ...base, state: 'none', next: 'declare', stale: false, stale_basis: null, changed: [], reason: 'no declaration yet' };
  }
  const usha = understandingSha(u.text);
  const forThis = events.filter((e) => e.understanding_sha === usha && DECISIVE.has(e.event));
  const last = forThis.length ? forThis[forThis.length - 1] : null;
  // The latest record for this exact text says which contract it belongs to.
  const anchor = [...forThis].reverse().find((e) => e.contract_hash) || null;
  let changed = [];
  let staleBasis = 'fingerprint';
  if (anchor) {
    if (anchor.contract_hash !== contract.hash) {
      changed = CONTRACT_FILES.filter((f) => (anchor.contract_files || {})[f] !== contract.files[f]);
      if (!changed.length) changed = ['contract'];
    }
  } else {
    // Written outside the orchestrator (print-only run, hand edit) and never
    // reviewed: no fingerprint to compare with, so fall back to mtimes.
    staleBasis = 'mtime';
    changed = understandingStaleness(blockId, atlasRoot).newer;
  }
  const stale = changed.length > 0;
  const common = { ...base, understanding_sha: usha, stale, stale_basis: staleBasis, changed, last_event: last };
  if (last && last.event === 'confirmed' && !stale) {
    return { ...common, state: 'confirmed', next: 'implement', confirmed_at: last.ts, reason: 'the operator confirmed this frame for the current contract' };
  }
  if (stale) {
    return { ...common, state: 'stale', next: 'declare', reason: `the contract changed after the ${last && last.event === 'confirmed' ? 'confirmation' : 'declaration'}: ${changed.join(', ')}` };
  }
  if (last && last.event === 'corrected') {
    return { ...common, state: 'corrected', next: 'declare', correction: last.correction, previous_frame: last.previous_frame || null, reason: 'the operator corrected this frame; the agent re-declares with the correction' };
  }
  return { ...common, state: 'awaiting', next: 'wait', reason: 'declared; waiting for the operator to confirm or correct it' };
}

/** The orchestrator records that a declare-phase run produced this text. */
export function recordDeclared({ block_id, atlas_root = DEFAULT_ATLAS, run_id = null, agent = null, language = null } = {}) {
  const u = readUnderstanding(block_id, atlas_root);
  if (!u.exists) throw new Error(`recordDeclared: ${block_id} has no ${UNDERSTANDING_FILE}`);
  const contract = contractFingerprint(block_id, atlas_root);
  appendFrameReview(block_id, atlas_root, {
    event: 'declared', understanding_sha: understandingSha(u.text),
    contract_hash: contract.hash, contract_files: contract.files,
    run_id, agent, language,
  });
  return frameGate(block_id, atlas_root);
}

/**
 * The operator's answer: «right» or «wrong, it is actually …». Refuses what
 * would make the confirmation meaningless: confirming nothing, confirming a
 * frame declared for an older contract, or a correction without content.
 */
export function recordFrameReview({ block_id, atlas_root = DEFAULT_ATLAS, verdict, correction = '', actor = 'operator' } = {}) {
  if (verdict !== 'confirmed' && verdict !== 'corrected') {
    throw new Error(`verdict must be «confirmed» or «corrected», got «${verdict}»`);
  }
  const u = readUnderstanding(block_id, atlas_root);
  if (!u.exists) throw new Error('nothing to review: the agent has not declared its understanding of this block yet');
  const gate = frameGate(block_id, atlas_root);
  const text = String(correction || '').trim();
  if (verdict === 'confirmed') {
    if (!u.sections.treating_as) throw new Error('cannot confirm: «Treating this as» is empty — there is no frame to agree to');
    if (gate.stale) throw new Error(`cannot confirm: ${gate.reason}. The declaration describes an older contract — run the agent to re-declare first`);
  } else {
    if (!text) throw new Error('a correction needs text: say what this block actually is');
    if (text.length > 4000) throw new Error('a correction is limited to 4000 characters');
  }
  const contract = contractFingerprint(block_id, atlas_root);
  appendFrameReview(block_id, atlas_root, {
    event: verdict, understanding_sha: gate.understanding_sha,
    contract_hash: contract.hash, contract_files: contract.files, actor,
    ...(verdict === 'corrected' ? { correction: text, previous_frame: u.sections.treating_as || null } : {}),
  });
  return frameGate(block_id, atlas_root);
}

/**
 * Everything the operator needs to see about meaning transfer for one block,
 * in one object. The single reader for both the nightly report and the canvas
 * (via the API), so the two can never parse the same files differently.
 */
export function blockMeaningSummary(blockId, atlasRoot = DEFAULT_ATLAS) {
  const missionPath = path.join(atlasRoot, 'blocks', blockId, 'mission.md');
  const mission = fs.existsSync(missionPath) ? fs.readFileSync(missionPath, 'utf8') : '';
  const traj = readTrajectory(mission);
  const u = readUnderstanding(blockId, atlasRoot);
  const gate = frameGate(blockId, atlasRoot);
  const stale = {
    stale: gate.stale,
    reason: gate.stale ? `contract changed after the declaration: ${gate.changed.join(', ')}` : (u.exists ? 'up to date' : 'no declaration'),
    newer: gate.changed,
  };

  const warnings = [];
  if (traj.empty) warnings.push('trajectory heading present but empty — reads as declared while declaring nothing');
  if (u.exists && !u.complete) {
    const gaps = [...(u.missing || []).map((h) => `missing «${h}»`), ...(u.empty || []).map((h) => `empty «${h}»`)];
    warnings.push(`understanding.md incomplete: ${gaps.join(', ')}`);
  }
  if (stale.stale) warnings.push(`understanding.md may be stale: ${stale.reason}`);

  return {
    block_id: blockId,
    trajectory: {
      declared: Boolean(traj.text),
      empty: traj.empty,
      heading: traj.heading,
      text: traj.text,
      // The canvas sends it back when it writes the trajectory, so an edit
      // made in the meantime is not silently overwritten.
      mission_mtime: fs.existsSync(missionPath) ? fs.statSync(missionPath).mtime.toISOString() : null,
    },
    understanding: u.exists
      ? {
        exists: true,
        complete: u.complete,
        missing: u.missing,
        empty: u.empty,
        sections: u.sections,
        declared_at: new Date(u.mtimeMs).toISOString(),
      }
      : { exists: false },
    stale: { stale: stale.stale, reason: stale.reason, newer: stale.newer, basis: gate.stale_basis },
    // R-8.09 — where the block stands between «declared» and «may write code».
    gate: {
      state: gate.state,
      next: gate.next,
      reason: gate.reason,
      corrections: gate.corrections,
      confirmations: gate.confirmations,
      confirmed_at: gate.confirmed_at || null,
      correction: gate.correction || null,
      last_declared_agent: gate.last_declared_agent,
      last_event: gate.last_event ? {
        event: gate.last_event.event, ts: gate.last_event.ts,
        agent: gate.last_event.agent || null, actor: gate.last_event.actor || null,
      } : null,
    },
    warnings,
  };
}

#!/usr/bin/env node
// R-8.08 (b.clarify) — the human → model direction of meaning transfer.
//
// b.clarify's first half (R-8.06) makes the model ASK the human where the
// contract may not say what was meant. This half closes the other direction.
// Two things the agent's prompt was missing, both taken from the operator's
// own description of how he transfers context to people and to models:
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
//            parseUnderstanding, readUnderstanding, understandingStaleness } from './block_meaning.mjs';

import fs from 'node:fs';
import path from 'node:path';
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

/** Prompt lines for the trajectory section — present or absent. */
export function trajectoryPromptLines(traj) {
  if (traj && traj.text) {
    return [
      '## Where this is heading (trajectory)',
      traj.text,
      '',
      'This is NOT something to build now — the right-size rules below still apply, and the future form is out of scope for this run.',
      'Use it to choose BETWEEN implementations. When several of them satisfy the acceptance criteria, all of them will verify green, so acceptance cannot tell them apart — this can:',
      '- prefer the implementation that can grow into this form without a rewrite;',
      '- never pick one that closes this direction off, even if it is shorter;',
      '- if you had to make that choice, name it under «Variant chosen» in understanding.md.',
    ];
  }
  return [
    '## Where this is heading (trajectory)',
    traj && traj.empty
      ? 'The mission has a trajectory heading with nothing under it — treat that as no trajectory declared.'
      : 'No trajectory is declared for this block.',
    'When several implementations satisfy the acceptance criteria, choose the one that is easiest to change later, and record that choice under «Assumed without asking» in understanding.md.',
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
    hint: 'what you will do in this run.',
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

/** Prompt lines instructing the agent to declare its understanding first. */
export function understandingPromptLines(blockDirRel) {
  const target = `${blockDirRel}/${UNDERSTANDING_FILE}`;
  return [
    '## Step 0 — declare how you understand this block (after reading this whole prompt, BEFORE writing any code)',
    `Write \`${target}\` first, with exactly these headings:`,
    '',
    ...UNDERSTANDING_SECTIONS.map((s) => `- \`## ${s.heading}\` — ${s.hint}`),
    '',
    'Rules:',
    '- Write it before touching code. It is how the operator checks that you understood the task the way it was meant — cheaply, before the work, instead of expensively, after it.',
    '- If it already exists from an earlier run, overwrite it: it must describe your understanding now. History is kept by git.',
    '- If writing «Treating this as» shows that you cannot say what this block is, STOP: say so in narrative.md instead of guessing in code.',
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
  return { exists: true, path: p, mtimeMs: fs.statSync(p).mtimeMs, ...parseUnderstanding(text) };
}

/**
 * A declaration is stale when the contract changed after it was written: the
 * frame the agent declared may no longer match what the block now says.
 * mtime-based, so advisory only — a fresh checkout resets mtimes.
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

#!/usr/bin/env node
// R-8.12 (b.acceptance-verifier-loop) — the semantic judge's «what must still
// change» becomes tasks, append-only. Taken from Spec Kit's /speckit.converge:
// gaps between the code and the contract are appended to tasks.md, never
// edited or deleted, and the loop repeats until nothing is appended.
//
// Before, the list lived in semantic_review.json (overwritten by every run)
// and as prose in narrative.md. As tasks it is on the Tasks tab with a done
// state, and the next agent run picks it up like any other unchecked task.
//
//   ## Convergence (semantic judge, append-only)
//
//   - [ ] **C1.** <what must change> — <date>, judge <provider>
//
// A todo already listed (same text, ignoring case, spacing and a trailing
// full stop) is not added again, checked or not. Nothing is ever removed:
// the operator or the agent ticks an item when it is done.
//
// Library: import { appendConvergenceTasks } from './convergence_log.mjs';

import fs from 'node:fs';
import path from 'node:path';

export const CONVERGENCE_HEADING = '## Convergence (semantic judge, append-only)';

const normalize = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.。;:!\s]+$/, '').trim();

/**
 * Append the judge's todos to <blockDir>/tasks.md. Returns { added: [...ids], skipped: n }.
 */
export function appendConvergenceTasks(blockDir, todos, { date = new Date().toISOString().slice(0, 10), provider = null } = {}) {
  const list = (Array.isArray(todos) ? todos : []).map((t) => String(t || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (!list.length) return { added: [], skipped: 0 };
  const p = path.join(blockDir, 'tasks.md');
  let text = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  const existing = [...text.matchAll(/^- \[[ xX]\] \*\*C(\d+)\.\*\* (.+?)(?: — \d{4}-\d{2}-\d{2}.*)?$/gm)];
  const seen = new Set(existing.map((m) => normalize(m[2])));
  let next = existing.reduce((n, m) => Math.max(n, Number(m[1])), 0) + 1;
  const lines = [];
  const added = [];
  let skipped = 0;
  for (const todo of list) {
    const key = normalize(todo);
    if (seen.has(key)) { skipped += 1; continue; }
    seen.add(key);
    lines.push(`- [ ] **C${next}.** ${todo} — ${date}${provider ? `, judge ${provider}` : ''}`);
    added.push(`C${next}`);
    next += 1;
  }
  if (!lines.length) return { added, skipped };
  if (!text.includes(CONVERGENCE_HEADING)) {
    text = `${text.replace(/\s*$/, '')}\n\n${CONVERGENCE_HEADING}\n\n`;
  } else if (!text.endsWith('\n')) {
    text += '\n';
  }
  fs.writeFileSync(p, `${text}${lines.join('\n')}\n`, 'utf8');
  return { added, skipped };
}

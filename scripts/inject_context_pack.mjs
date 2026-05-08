#!/usr/bin/env node
// PR4: beforeSubmitPrompt hook action.
//
// Detects which block the user is talking about and prints a compact context
// pack to stdout so Cursor can prepend it to the agent prompt. The detection
// strategy is local-first (no LLM call):
//   1. Explicit env: CURSOR_BLOCK_ID / SIMA_BLOCK_ID
//   2. Block id mentioned in the user prompt (CURSOR_PROMPT / argv joined),
//      e.g. "продолжи b.payments" → b.payments
//   3. Recent file edit owner: latest atlas/process_runs/cursor_observations/*.json
//      whose `owners` array is non-empty
//   4. Atlas project default (head of graph.blocks)
//
// Output (markdown) is bounded by SIMA_CONTEXT_PACK_MAX_BYTES (default 12000).
// The pack contains: project mission, rules, tech_stack, the block's mission,
// kpi, acceptance, depends_on, and a list of files registered to the block.
// On error — emits a one-line warning to stderr and exits 0 so the user can
// still type their prompt without disruption.
//
// CLI usage (for tests):
//   SIMA_BLOCK_ID=b.docs node scripts/inject_context_pack.mjs
//   node scripts/inject_context_pack.mjs "продолжи b.docs - нужен mermaid"

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');
const BLOCKS = path.join(ATLAS, 'blocks');

const MAX_BYTES = Number(process.env.SIMA_CONTEXT_PACK_MAX_BYTES || 12000);

function readSafe(p) { return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; }

function getPrompt() {
  const candidates = [
    process.env.CURSOR_PROMPT,
    process.env.CURSOR_BEFORE_SUBMIT_PROMPT_TEXT,
    process.env.CURSOR_HOOK_PROMPT,
  ];
  for (const c of candidates) if (c && c.trim()) return c.trim();
  if (process.argv.length > 2) return process.argv.slice(2).join(' ').trim();
  return '';
}

function detectBlockIdFromPrompt(text, blockIds) {
  if (!text) return null;
  // Look for any registered block id verbatim (b.payments, b.core-sync, etc.).
  for (const id of blockIds) {
    const re = new RegExp(`\\b${id.replace(/\./g, '\\.')}\\b`);
    if (re.test(text)) return id;
  }
  return null;
}

function lastObservedOwner() {
  const dir = path.join(ATLAS, 'process_runs', 'cursor_observations');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse();
  for (const f of files) {
    try {
      const ev = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (Array.isArray(ev.owners) && ev.owners.length) return ev.owners[0];
    } catch {}
  }
  return null;
}

function blockMeta(blockId) {
  const dir = path.join(BLOCKS, blockId);
  if (!fs.existsSync(dir)) return null;
  return {
    mission: readSafe(path.join(dir, 'mission.md')),
    kpi: readSafe(path.join(dir, 'kpi.md')),
    acceptance: readSafe(path.join(dir, 'acceptance.md')),
    tasks: readSafe(path.join(dir, 'tasks.md')),
    depends: readSafe(path.join(dir, 'depends_on.md')),
    provides: readSafe(path.join(dir, 'provides.md')),
    files: readSafe(path.join(dir, 'files.md')),
  };
}

function shorten(s, max) {
  if (!s) return '';
  if (s.length <= max) return s;
  return s.slice(0, max) + `\n\n…(truncated, ${s.length - max} chars omitted)…\n`;
}

try {
  const graph = JSON.parse(readSafe(path.join(ATLAS, 'graph.json')) || '{}');
  const blockIds = (graph.blocks || []).map((b) => b.id);
  const prompt = getPrompt();
  const blockId =
    process.env.CURSOR_BLOCK_ID ||
    process.env.SIMA_BLOCK_ID ||
    detectBlockIdFromPrompt(prompt, blockIds) ||
    lastObservedOwner() ||
    blockIds[0];

  if (!blockId) {
    process.stderr.write('inject_context_pack: no block id resolvable; nothing to inject\n');
    process.exit(0);
  }

  const meta = blockMeta(blockId);
  if (!meta) {
    process.stderr.write(`inject_context_pack: block dir not found for ${blockId}\n`);
    process.exit(0);
  }

  const project = readSafe(path.join(ATLAS, 'project.md'));
  const rules = readSafe(path.join(ATLAS, 'rules.md'));
  const techStack = readSafe(path.join(ATLAS, 'tech_stack.md'));

  // PR-5 (b.operator-profile-learner): operator profile (work_style + agents +
  // tech preferences + last 3 lessons + dont_use). Silent when profile is in
  // warming_up state OR --no-profile flag is set OR SIMA_NO_PROFILE=1 is set.
  // Profile values come from atlas/operator_profile/profile.json (PR-1) and
  // atlas/operator_profile/lessons.json (PR-4 of this same block).
  const argv = process.argv.slice(2);
  const noProfile = argv.includes('--no-profile') || process.env.SIMA_NO_PROFILE === '1';
  let operatorProfileSection = '';
  if (!noProfile) {
    const profilePath = path.join(ATLAS, 'operator_profile', 'profile.json');
    const lessonsPath = path.join(ATLAS, 'operator_profile', 'lessons.json');
    let profile = null;
    try { if (fs.existsSync(profilePath)) profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')); } catch {}
    if (profile && profile._status !== 'warming_up') {
      const lines = ['## Operator profile (likely preferences)', ''];
      const ws = profile.work_style || {};
      if (ws.median_time_idea_to_done_h) {
        lines.push(`- Этот оператор обычно проходит idea→done за ~${Math.round(ws.median_time_idea_to_done_h * 10) / 10}h.`);
      }
      if (typeof ws.rollback_rate === 'number' && ws.rollback_rate > 0) {
        lines.push(`- Rollback-rate ${(ws.rollback_rate * 100).toFixed(0)}% — будь осторожен с непроверенными решениями.`);
      }
      // Tech stack: top items per scope by uses with high satisfaction
      const techHist = profile.tech_stack_history || {};
      for (const scope of ['frontend', 'backend', 'testing']) {
        const items = (techHist[scope] || []).filter((x) => x.uses >= 2 && x.satisfaction === 'high').slice(0, 3);
        if (items.length) {
          lines.push(`- ${scope}: оператор предпочитает ${items.map((x) => `\`${x.name}\``).join(', ')}.`);
        }
      }
      // Agents
      const agents = profile.agents_used || {};
      const topAgent = Object.entries(agents).sort((a, b) => (b[1].count || 0) - (a[1].count || 0))[0];
      if (topAgent) {
        const [name, st] = topAgent;
        const sr = st.success_rate != null ? Math.round(st.success_rate * 100) : null;
        lines.push(`- Чаще всего использует агента \`${name}\`${sr != null ? ` (success-rate ${sr}%)` : ''}.`);
      }
      // dont_use (read from explicit dont_use.json if exists; future PR-3 wires it)
      let dontUse = [];
      try {
        const dPath = path.join(ATLAS, 'operator_profile', 'dont_use.json');
        if (fs.existsSync(dPath)) {
          const j = JSON.parse(fs.readFileSync(dPath, 'utf8'));
          dontUse = Array.isArray(j) ? j : (Array.isArray(j.items) ? j.items : []);
        }
      } catch {}
      if (Array.isArray(profile.dont_use) && profile.dont_use.length) dontUse = dontUse.concat(profile.dont_use);
      const dontUseNames = dontUse.map((d) => typeof d === 'string' ? d : d.value).filter(Boolean);
      if (dontUseNames.length) {
        lines.push(`- НИКОГДА не использует: ${dontUseNames.map((x) => `\`${x}\``).join(', ')}.`);
      }
      // Lessons (last 3)
      let lessons = [];
      try { if (fs.existsSync(lessonsPath)) {
        const j = JSON.parse(fs.readFileSync(lessonsPath, 'utf8'));
        lessons = Array.isArray(j) ? j : (Array.isArray(j.lessons) ? j.lessons : []);
      } } catch {}
      // Filter out expired
      const now = Date.now();
      const fresh = lessons.filter((l) => !l.expires_at || Date.parse(l.expires_at) > now);
      const recent = fresh.slice(-3);
      if (recent.length) {
        lines.push('', 'Последние уроки оператора (учти их в решении):');
        for (const l of recent) {
          const ev = (l.evidence || []).slice(0, 3).join(', ');
          lines.push(`  - ${l.lesson}${ev ? ` _(evidence: ${ev})_` : ''}`);
        }
      }
      if (lines.length > 2) {
        lines.push('', '_Источники профиля: aggregate_operator_profile + analyze_lessons_from_history. Эти подсказки тихие — не диктуй, но учитывай._', '');
        operatorProfileSection = lines.join('\n');
      }
    }
  }

  // Tight per-section budgets so we never overshoot MAX_BYTES.
  const SECTION = Math.floor(MAX_BYTES / 9);

  const out = [
    '<!-- ATLAS CONTEXT PACK — auto-injected by .cursor/hooks.json -->',
    `<!-- block: ${blockId} -->`,
    '',
    '## Project',
    shorten(project, SECTION),
    '',
    '## Rules',
    shorten(rules, SECTION),
    '',
    '## Tech stack (forbidden commands enforced via guard_against_drift)',
    shorten(techStack, SECTION),
    '',
    operatorProfileSection ? shorten(operatorProfileSection, SECTION) : '',
    `## Block: ${blockId}`,
    '',
    '### mission',
    shorten(meta.mission, SECTION),
    '',
    '### KPI',
    shorten(meta.kpi, SECTION),
    '',
    '### Acceptance',
    shorten(meta.acceptance, SECTION),
    '',
    '### depends_on',
    shorten(meta.depends, SECTION),
    '',
    '### provides',
    shorten(meta.provides, SECTION),
    '',
    '### files (alive only — agent should edit only these)',
    shorten(meta.files, SECTION),
    '',
    '<!-- /ATLAS CONTEXT PACK -->',
  ].join('\n');

  process.stdout.write(out + '\n');
  process.exit(0);
} catch (e) {
  process.stderr.write(`inject_context_pack: ${e.message}\n`);
  process.exit(0);
}

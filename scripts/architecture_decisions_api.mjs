#!/usr/bin/env node
// R-7.85 (S-6) — architecture_decisions.md helpers.
//
// Append-only project-level architectural lock-in. Operator records
// decisions like «use LLM for sentiment, never math», «Postgres not
// MongoDB», «JWT 15min + 30day refresh» — once, then they're auto-
// loaded into EVERY block's context-pack and injected into EVERY
// agent prompt. Future agents physically cannot reverse them silently.
//
// File location:
//   atlas/architecture_decisions.md                 (root project)
//   atlas/clients/<client>/architecture_decisions.md (multi-tenant)
//
// Format (markdown, append-only):
//   # Architecture decisions
//
//   This file is APPEND-ONLY. Every architectural choice the
//   operator makes about the product is logged here. Agents read
//   it as part of context-pack and MUST NOT silently reverse a
//   past decision — if they think a decision should change, they
//   surface it in narrative.md and ask the operator.
//
//   ---
//
//   ## 2026-05-09 · LLM for sentiment analysis, never math formulas
//
//   **Rationale:** math formulas don't understand context, proven
//   in b.lensa-pilot. Use Anthropic / Google / Ollama via llm_gateway.
//
//   ## 2026-05-12 · Postgres + jsonb, not MongoDB
//   ...

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT_DEFAULT = path.resolve(path.dirname(__filename), '..');

function atlasRootFor(clientId) {
  const root = process.env.ATLAS_ROOT || path.join(ROOT_DEFAULT, 'atlas');
  if (clientId && clientId !== 'main') {
    return path.join(root, 'clients', clientId);
  }
  return root;
}

function decisionsPath(clientId) {
  return path.join(atlasRootFor(clientId), 'architecture_decisions.md');
}

const SEED_HEADER = `# Architecture decisions

This file is **append-only**. Every architectural choice the operator makes about the product is logged here. Agents read it as part of context-pack and MUST NOT silently reverse a past decision — if they think a decision should change, they surface it in \`narrative.md\` and ask the operator.

Format per entry:

\`\`\`
## <ISO-date> · <one-line decision>

**Rationale:** <why this and not the alternative>
**Affects:** <block ids or "all">
**Reversible:** <yes / no / "needs operator approval">
\`\`\`

The latest entry is always at the bottom — chronological, not most-important-first.

---
`;

export function ensureArchitectureDecisionsFile(clientId) {
  const p = decisionsPath(clientId);
  if (fs.existsSync(p)) return { ok: true, created: false, path: p };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, SEED_HEADER, 'utf8');
  return { ok: true, created: true, path: p };
}

export function readArchitectureDecisions(clientId) {
  const p = decisionsPath(clientId);
  if (!fs.existsSync(p)) return '';
  return fs.readFileSync(p, 'utf8');
}

// Parse decisions for context-pack consumption — strip the seed header,
// return the list of decision sections only. Each entry preserves the
// `## <date> · <title>` heading + body.
export function listArchitectureDecisions(clientId) {
  const raw = readArchitectureDecisions(clientId);
  if (!raw.trim()) return [];
  const sections = raw.split(/^## /m).slice(1); // first chunk is the header
  return sections.map(s => '## ' + s.trim()).filter(Boolean);
}

// Append a new decision. Operator-facing — the only mutation. Atomic.
export function addArchitectureDecision({ clientId, decision, rationale, affects, reversible, ts }) {
  if (!decision || typeof decision !== 'string' || !decision.trim()) {
    throw new Error('addArchitectureDecision: decision (one-line summary) required');
  }
  if (!rationale || typeof rationale !== 'string' || !rationale.trim()) {
    throw new Error('addArchitectureDecision: rationale required');
  }

  ensureArchitectureDecisionsFile(clientId);
  const p = decisionsPath(clientId);

  const stamp = ts || new Date().toISOString().slice(0, 10);
  const entry = [
    '',
    `## ${stamp} · ${decision.trim()}`,
    '',
    `**Rationale:** ${rationale.trim()}`,
    `**Affects:** ${(affects || 'all').toString().trim()}`,
    `**Reversible:** ${(reversible || 'needs operator approval').toString().trim()}`,
    '',
  ].join('\n');

  // Atomic append via tmp + rename
  const current = readArchitectureDecisions(clientId);
  const next = current + entry;
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, next, 'utf8');
  fs.renameSync(tmp, p);

  return { ok: true, path: p, appended: entry };
}

// CLI mode for direct invocation / testing
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const cmd = args[0];
  if (cmd === 'add') {
    const decision = args[1];
    const rationale = args[2];
    const affects = args[3] || 'all';
    const clientId = args[4] || null;
    if (!decision || !rationale) {
      console.error('Usage: node scripts/architecture_decisions_api.mjs add "<decision>" "<rationale>" [affects] [client_id]');
      process.exit(2);
    }
    const r = addArchitectureDecision({ clientId, decision, rationale, affects });
    console.log(`Appended to ${r.path}:\n${r.appended}`);
  } else if (cmd === 'list') {
    const clientId = args[1] || null;
    const list = listArchitectureDecisions(clientId);
    console.log(`${list.length} decision(s) in ${decisionsPath(clientId)}:\n`);
    for (const e of list) {
      const firstLine = e.split('\n')[0];
      console.log('  ' + firstLine);
    }
  } else if (cmd === 'ensure') {
    const clientId = args[1] || null;
    const r = ensureArchitectureDecisionsFile(clientId);
    console.log(r.created ? `Created ${r.path}` : `Already exists: ${r.path}`);
  } else {
    console.error('Usage:');
    console.error('  node scripts/architecture_decisions_api.mjs ensure [client_id]');
    console.error('  node scripts/architecture_decisions_api.mjs add "<decision>" "<rationale>" [affects] [client_id]');
    console.error('  node scripts/architecture_decisions_api.mjs list [client_id]');
    process.exit(2);
  }
}

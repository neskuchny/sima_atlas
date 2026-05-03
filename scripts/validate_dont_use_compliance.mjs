#!/usr/bin/env node
// PR-3 (b.operator-profile-learner): nightly compliance check.
//
// Walks every block in graph.json and reports a WARNING (never a fail) if any
// block lists a tech_stack entry that overlaps the operator's dont_use list
// (atlas/operator_profile/dont_use.json or profile.dont_use). Output goes to
// stderr as warnings + a per-block proposal of kind=`dont_use_warning` so it
// surfaces in the UI without blocking the nightly run.
//
// Exit code: 0 always (info-only validator). The block author can either
//   - clear the dont_use ban (manage_dont_use.mjs clear)
//   - swap the offending tech_stack entry to an alternative
//   - reject the proposal (it stays in atlas/proposals/ history)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { effectiveDontUseValues } from './manage_dont_use.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');
const PROPOSALS = path.join(ATLAS, 'proposals');

function blockHits(block, banned) {
  const stack = Array.isArray(block.tech_stack) ? block.tech_stack : [];
  return stack.filter((t) => banned.includes(t));
}

function run() {
  const graphPath = path.join(ATLAS, 'graph.json');
  if (!fs.existsSync(graphPath)) {
    return { warnings: [], banned: [], blocks_checked: 0 };
  }
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const banned = effectiveDontUseValues({ atlas_root: ATLAS });
  if (!banned.length) {
    return { warnings: [], banned: [], blocks_checked: (graph.blocks || []).length };
  }
  fs.mkdirSync(PROPOSALS, { recursive: true });
  const warnings = [];
  for (const b of (graph.blocks || [])) {
    if (!b.id) continue;
    if (b.test_only) continue;
    const hits = blockHits(b, banned);
    if (!hits.length) continue;
    warnings.push({ block_id: b.id, status: b.status, hits });

    // Dedup: skip if a pending dont_use_warning proposal for these exact hits already exists
    const existing = fs.readdirSync(PROPOSALS).find((f) => f.endsWith('__dont_use_warning.json') && f.includes(`__${b.id}__`));
    if (existing) {
      try {
        const j = JSON.parse(fs.readFileSync(path.join(PROPOSALS, existing), 'utf8'));
        if (j.verdict === 'pending' && Array.isArray(j.hits)
            && j.hits.length === hits.length
            && j.hits.every((h) => hits.includes(h))) {
          continue;
        }
      } catch {}
    }
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const proposalId = `${ts}__${b.id}__dont_use_warning`;
    fs.writeFileSync(path.join(PROPOSALS, `${proposalId}.json`), JSON.stringify({
      id: proposalId,
      block_id: b.id,
      kind: 'dont_use_warning',
      created_at: new Date().toISOString(),
      source: { detector: 'validate_dont_use_compliance' },
      current: { tech_stack: b.tech_stack || [] },
      hits,
      retry_prompt_hint: `Block ${b.id} declares tech_stack [${(b.tech_stack || []).join(', ')}] but the operator has banned: [${hits.join(', ')}]. Either clear the ban (\`node scripts/manage_dont_use.mjs clear <value>\`) or swap to an alternative.`,
      verdict: 'pending',
    }, null, 2) + '\n', 'utf8');
  }
  return { warnings, banned, blocks_checked: (graph.blocks || []).length };
}

const r = run();
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(r, null, 2));
} else {
  console.log(`validate_dont_use_compliance: banned=${r.banned.length} (${r.banned.join(', ') || 'none'}); checked=${r.blocks_checked}; warnings=${r.warnings.length}`);
  for (const w of r.warnings) {
    console.warn(` ⚠ ${w.block_id} [${w.status}]: tech_stack hits [${w.hits.join(', ')}]`);
  }
}
// Always exit 0 — info-only.

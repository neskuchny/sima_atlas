#!/usr/bin/env node
// Subagent: wiki-builder.
//
// Role: regenerate /atlas/WIKI.md + /atlas/wiki.html + /atlas/roadmap.md
// from the canonical graph + per-block files. Also re-renders end-user
// docs if any block has a mission newer than its tutorial.
//
// CLI:
//   node scripts/subagent_wiki_builder.mjs [--json]

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

function step(name, args) {
  const r = spawnSync('node', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return {
    name,
    exit: r.status,
    ok: r.status === 0,
    out_tail: (r.stdout || '').split(/\n/).filter(Boolean).slice(-3).join(' · '),
    err_tail: (r.stderr || '').split(/\n/).filter(Boolean).slice(-3).join(' · '),
  };
}

function fileMtime(p) {
  try { return fs.existsSync(p) ? fs.statSync(p).mtime.toISOString() : null; } catch { return null; }
}

export function runWikiBuilder() {
  const startedAt = new Date();
  const steps = [
    step('generate_wiki',      ['scripts/generate_wiki.mjs']),
    step('render_wiki_html',   ['scripts/render_wiki_html.mjs']),
    step('rebuild_roadmap',    ['scripts/rebuild_atlas_roadmap.mjs']),
    step('generate_tz',        ['scripts/generate_tz_from_atlas.mjs']),
  ];
  const finishedAt = new Date();
  const artefacts = {
    wiki_md:    fileMtime(path.join(ROOT, 'atlas', 'WIKI.md')),
    wiki_html:  fileMtime(path.join(ROOT, 'atlas', 'wiki.html')),
    roadmap:    fileMtime(path.join(ROOT, 'atlas', 'roadmap.md')),
    auto_tz:    fileMtime(path.join(ROOT, 'ТЗ', 'auto_tz.md')),
  };
  return {
    ok: steps.every((s) => s.ok),
    started_at: startedAt.toISOString(),
    finished_at: finishedAt.toISOString(),
    duration_ms: finishedAt - startedAt,
    steps,
    artefacts,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = runWikiBuilder();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    console.log(`wiki-builder: ${out.steps.filter((s) => s.ok).length}/${out.steps.length} steps ok in ${out.duration_ms}ms`);
    for (const s of out.steps) console.log(`  ${s.ok ? '✓' : '✗'} ${s.name} — ${s.out_tail || s.err_tail || `exit ${s.exit}`}`);
  }
  process.exit(out.ok ? 0 : 1);
}

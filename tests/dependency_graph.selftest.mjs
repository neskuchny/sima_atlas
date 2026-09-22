#!/usr/bin/env node
// R-8.07 (b.core-sync) — selftest for validate_dependency_graph.mjs.
//
// Group 1 is the regression this validator exists for: R-8.06 added a
// dependency edge to depends_on.md only, which left graph.json (read by
// cascade) and depends_on.md (read by the daemon) describing different graphs,
// and created cycles. Nightly stayed green. Every group below would have
// passed silently before this validator existed.
//
// Runs against a throwaway atlas under os.tmpdir() via ATLAS_ROOT; never
// touches the repo's own atlas/.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const VALIDATOR = path.join(ROOT, 'scripts', 'validate_dependency_graph.mjs');

const failures = [];
const check = (name, cond, detail = '') => { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-depgraph-'));
const atlas = path.join(tmp, 'atlas');

/**
 * spec: { id: { graph: [...graph.json depends_on], md: [...depends_on.md ids] | null, status? } }
 */
function seed(spec, exemptions = null) {
  fs.rmSync(atlas, { recursive: true, force: true });
  fs.mkdirSync(path.join(atlas, 'blocks'), { recursive: true });
  const blocks = [];
  for (const [id, s] of Object.entries(spec)) {
    blocks.push({ id, status: s.status || 'wip', depends_on: s.graph });
    const dir = path.join(atlas, 'blocks', id);
    fs.mkdirSync(dir, { recursive: true });
    if (s.md !== null) {
      const lines = s.md.length ? s.md.map((d) => `- ${d}: some_capability`) : ['- none'];
      fs.writeFileSync(path.join(dir, 'depends_on.md'), `# ${id} — depends_on\n\n${lines.join('\n')}\n`, 'utf8');
    }
  }
  fs.writeFileSync(path.join(atlas, 'graph.json'), JSON.stringify({ layers: [], blocks }, null, 2) + '\n', 'utf8');
  if (exemptions) {
    fs.writeFileSync(path.join(atlas, 'dependency_cycle_exemptions.json'), JSON.stringify({ exemptions }, null, 2), 'utf8');
  }
}

function run() {
  const r = spawnSync('node', [VALIDATOR, '--json'], { encoding: 'utf8', env: { ...process.env, ATLAS_ROOT: atlas } });
  let json = null; try { json = JSON.parse(r.stdout); } catch {}
  return { status: r.status, json, stdout: r.stdout, stderr: r.stderr };
}
const kinds = (r) => (r.json?.errors || []).map((e) => e.check);

// ── Group 1: the R-8.06 regression — edge added to depends_on.md only ───────
{
  seed({
    'b.db':   { graph: [], md: ['b.verif'] },           // edge only in md
    'b.verif': { graph: ['b.db'], md: ['b.db'] },
  });
  const r = run();
  check('g1: exits non-zero', r.status === 1, `status=${r.status}`);
  check('g1: reports parity', kinds(r).includes('parity'), JSON.stringify(kinds(r)));
  check('g1: reports the cycle it creates', kinds(r).includes('cycle'), JSON.stringify(kinds(r)));
}

// ── Group 2: consistent, acyclic graph passes ──────────────────────────────
{
  seed({
    'b.a': { graph: ['b.b'], md: ['b.b'] },
    'b.b': { graph: ['b.c'], md: ['b.c'] },
    'b.c': { graph: [], md: [] },
  });
  const r = run();
  check('g2: consistent acyclic graph passes', r.status === 0, `status=${r.status} ${r.stdout.slice(0, 200)}`);
  check('g2: no errors', (r.json?.errors || []).length === 0);
}

// ── Group 3: capability suffix in graph.json is a format error ─────────────
{
  seed({
    'b.a': { graph: ['b.b: some_capability'], md: ['b.b'] },
    'b.b': { graph: [], md: [] },
  });
  const r = run();
  check('g3: suffixed entry fails', r.status === 1, `status=${r.status}`);
  check('g3: reported as format', kinds(r).includes('format'), JSON.stringify(kinds(r)));
  const fix = (r.json?.errors || []).find((e) => e.check === 'format')?.fix || '';
  check('g3: fix names the bare id', fix.includes('"b.b"'), fix);
}

// ── Group 4: a dependency on a block that does not exist ───────────────────
{
  seed({ 'b.a': { graph: ['b.ghost'], md: ['b.ghost'] } });
  const r = run();
  check('g4: dangling dependency fails', r.status === 1 && kinds(r).includes('format'), JSON.stringify(kinds(r)));
}

// ── Group 5: missing depends_on.md is a parity error, not a silent pass ────
{
  seed({ 'b.a': { graph: [], md: null } });
  const r = run();
  check('g5: missing depends_on.md fails', r.status === 1 && kinds(r).includes('parity'), JSON.stringify(kinds(r)));
}

// ── Group 6: self-loop is a cycle ──────────────────────────────────────────
{
  seed({ 'b.a': { graph: ['b.a'], md: ['b.a'] } });
  const r = run();
  check('g6: self-loop reported as cycle', kinds(r).includes('cycle'), JSON.stringify(kinds(r)));
}

// ── Group 7: a justified exemption tolerates exactly its own cycle ─────────
{
  const spec = {
    'b.x': { graph: ['b.y'], md: ['b.y'] },
    'b.y': { graph: ['b.x'], md: ['b.x'] },
  };
  seed(spec, [{ blocks: ['b.y', 'b.x'], why_tolerated: 'test', removal_condition: 'test' }]);
  const r = run();
  check('g7: exempted cycle passes', r.status === 0, `status=${r.status} ${JSON.stringify(r.json?.errors)}`);
  check('g7: exemption reported as in use', r.json?.exemptions_in_use === 1, JSON.stringify(r.json));
}

// ── Group 8: an exemption does NOT cover a different, larger cycle ─────────
// If the exemption matched loosely (any cycle containing b.x, say), a new
// cycle routed through an exempted pair would slip through — which is exactly
// how R-8.06's edge fanned out into cycles that also ran through
// b.agent-orchestrator ↔ b.operator-profile-learner.
{
  seed({
    'b.x': { graph: ['b.y'], md: ['b.y'] },
    'b.y': { graph: ['b.x', 'b.z'], md: ['b.x', 'b.z'] },
    'b.z': { graph: ['b.x'], md: ['b.x'] },
  }, [{ blocks: ['b.x', 'b.y'], why_tolerated: 'test', removal_condition: 'test' }]);
  const r = run();
  check('g8: new cycle through an exempted pair still fails', r.status === 1, `status=${r.status}`);
  const msgs = (r.json?.errors || []).filter((e) => e.check === 'cycle').map((e) => e.message).join(' | ');
  check('g8: the unexempted cycle is the one reported', msgs.includes('b.z'), msgs);
}

// ── Group 9: a stale exemption is surfaced, not silently kept ──────────────
{
  seed({
    'b.a': { graph: [], md: [] },
  }, [{ blocks: ['b.a', 'b.gone'], why_tolerated: 'test', removal_condition: 'test' }]);
  const r = run();
  check('g9: stale exemption does not fail the run', r.status === 0, `status=${r.status}`);
  const stale = (r.json?.warnings || []).some((w) => w.check === 'stale_exemption');
  check('g9: stale exemption reported as warning', stale, JSON.stringify(r.json?.warnings));
}

// ── Group 10: archived blocks are not held to the contract ─────────────────
{
  seed({
    'b.a': { graph: [], md: [] },
    'b.old': { graph: ['b.nothing'], md: null, status: 'archived' },
  });
  const r = run();
  check('g10: archived block ignored', r.status === 0, `status=${r.status} ${JSON.stringify(r.json?.errors)}`);
}

// ── Group 11: every error carries a fix line ───────────────────────────────
{
  seed({
    'b.a': { graph: ['b.b: cap'], md: ['b.c'] },
    'b.b': { graph: [], md: [] },
    'b.c': { graph: ['b.a'], md: ['b.a'] },
  });
  const r = run();
  const errs = r.json?.errors || [];
  check('g11: produced errors to inspect', errs.length > 0);
  check('g11: every error has a non-empty fix', errs.every((e) => typeof e.fix === 'string' && e.fix.length > 10),
    JSON.stringify(errs.map((e) => [e.check, e.fix])));
}

fs.rmSync(tmp, { recursive: true, force: true });

if (failures.length) {
  console.error('dependency_graph.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('dependency_graph.selftest: OK (11 groups, all assertions green)');

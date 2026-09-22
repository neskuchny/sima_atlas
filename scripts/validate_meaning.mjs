#!/usr/bin/env node
// R-8.08 (b.clarify) — report on the human → model transfer of meaning.
//
// For each live block, three facts:
//   * trajectory — does the mission say where the block is heading?
//   * declared understanding — has the executing agent written
//     understanding.md, and is it complete?
//   * staleness — did the contract change after the agent declared its frame?
//
// DELIBERATELY A REPORT, NOT A GATE. It exits 0 on every finding.
//
// Why: a gate needs a problem it prevents. There is no evidence yet that a
// missing trajectory or a missing/stale understanding.md precedes real rework
// in this repo — the mechanism is new. A gate installed ahead of evidence is
// the failure mode the Agile retrospective named: a practice that outlives
// (or never had) the problem it was built for, kept because it exists.
//
// Promotion condition (make «stale» or «incomplete» a hard error for status
// `done`): at least two recorded cases where a block reached `done`, then
// needed rework, and its understanding.md was missing, incomplete, or stale at
// the time — i.e. the missing declaration demonstrably preceded the rework.
//
// Removal condition (drop the incomplete/stale warnings): after 30 days of
// live agent runs, no warning from this report ever preceded a failed
// acceptance or a semantic-judge FAIL on the same block.
//
// Absence of a trajectory is never a warning, only information: where a block
// is heading is the operator's knowledge, and «not declared» is a legitimate
// state — the agent is told to record its choice as an assumption instead.
//
// Usage:
//   node scripts/validate_meaning.mjs
//   node scripts/validate_meaning.mjs --json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTrajectory, readUnderstanding, understandingStaleness } from './block_meaning.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');
const asJson = process.argv.includes('--json');

const graphPath = path.join(ATLAS, 'graph.json');
if (!fs.existsSync(graphPath)) {
  console.error(`validate_meaning: graph.json not found at ${graphPath}`);
  process.exit(1);
}
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));

const rows = [];
for (const b of graph.blocks || []) {
  if (b.status === 'archived') continue;
  const missionPath = path.join(ATLAS, 'blocks', b.id, 'mission.md');
  const mission = fs.existsSync(missionPath) ? fs.readFileSync(missionPath, 'utf8') : '';
  const traj = readTrajectory(mission);
  const u = readUnderstanding(b.id, ATLAS);
  const stale = understandingStaleness(b.id, ATLAS);

  const warnings = [];
  if (traj.empty) warnings.push('trajectory heading present but empty — reads as declared while declaring nothing');
  if (u.exists && !u.complete) {
    const gaps = [...(u.missing || []).map((h) => `missing «${h}»`), ...(u.empty || []).map((h) => `empty «${h}»`)];
    warnings.push(`understanding.md incomplete: ${gaps.join(', ')}`);
  }
  if (stale.stale) warnings.push(`understanding.md may be stale: ${stale.reason}`);

  rows.push({
    block_id: b.id,
    status: b.status,
    trajectory: Boolean(traj.text),
    understanding: u.exists ? (u.complete ? 'complete' : 'incomplete') : 'absent',
    treating_as: u.exists ? (u.sections?.treating_as || '').replace(/\s+/g, ' ').trim().slice(0, 160) : null,
    stale: stale.stale,
    warnings,
  });
}

const withTrajectory = rows.filter((r) => r.trajectory).length;
const declared = rows.filter((r) => r.understanding !== 'absent').length;
const warned = rows.filter((r) => r.warnings.length);

if (asJson) {
  console.log(JSON.stringify({ ok: true, gate: false, blocks: rows.length, with_trajectory: withTrajectory, declared, rows }, null, 2));
  process.exit(0);
}

for (const r of rows.filter((x) => x.trajectory || x.understanding !== 'absent')) {
  const bits = [];
  if (r.trajectory) bits.push('trajectory');
  if (r.understanding !== 'absent') bits.push(`understanding: ${r.understanding}`);
  console.log(` · ${r.block_id} (${r.status}) — ${bits.join(', ')}${r.treating_as ? `\n     treating as: ${r.treating_as}` : ''}`);
}
for (const r of warned) for (const w of r.warnings) console.warn(` ⚠ ${r.block_id}: ${w}`);
console.log(`validate_meaning: ${rows.length} blocks — ${withTrajectory} with a declared trajectory, ${declared} with a declared understanding, ${warned.length} with warnings (report only, not a gate)`);

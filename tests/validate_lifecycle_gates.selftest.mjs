#!/usr/bin/env node
// Phase R-5 — selftest for the soft lifecycle-gates validator.
//
// Builds an isolated client atlas with three blocks at different statuses
// and varying contract content. Asserts the validator catches the right
// violations and lets the right ones through.

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const c = `selftest-r5-gates-${Date.now()}`;
const cdir = path.join(ROOT, 'atlas', 'clients', c);
const bdir = path.join(cdir, 'blocks');
fs.mkdirSync(bdir, { recursive: true });

// Block 1 — fresh idea with empty contract → warnings, no fails.
fs.mkdirSync(path.join(bdir, 'b.idea'), { recursive: true });
fs.writeFileSync(path.join(bdir, 'b.idea', 'mission.md'),    '# b.idea — mission\n\nshort.\n');
fs.writeFileSync(path.join(bdir, 'b.idea', 'kpi.md'),        '# b.idea — KPI\n');
fs.writeFileSync(path.join(bdir, 'b.idea', 'acceptance.md'), '# b.idea — acceptance\n');

// Block 2 — declared as todo but mission/kpi/acceptance still empty → fail.
fs.mkdirSync(path.join(bdir, 'b.broken'), { recursive: true });
fs.writeFileSync(path.join(bdir, 'b.broken', 'mission.md'),    '# b.broken — mission\n\nshort.\n');
fs.writeFileSync(path.join(bdir, 'b.broken', 'kpi.md'),        '# b.broken — KPI\n');
fs.writeFileSync(path.join(bdir, 'b.broken', 'acceptance.md'), '# b.broken — acceptance\n');

// Block 3 — proper progress block with all gates satisfied.
fs.mkdirSync(path.join(bdir, 'b.healthy'), { recursive: true });
fs.writeFileSync(path.join(bdir, 'b.healthy', 'mission.md'),
  '# b.healthy — mission\n\nThis block exists to handle the green-path of the test ' +
  'and demonstrate that a long enough mission with at least eighty characters does pass the gate.\n');
fs.writeFileSync(path.join(bdir, 'b.healthy', 'kpi.md'),        '# b.healthy — KPI\n\n- response_p95 < 200ms\n');
fs.writeFileSync(path.join(bdir, 'b.healthy', 'acceptance.md'), '# b.healthy — acceptance\n\n- [ ] **A1.** Returns 200 on /healthz\n');
fs.writeFileSync(path.join(bdir, 'b.healthy', 'depends_on.md'), '# b.healthy — depends_on\n\n- none\n');
fs.writeFileSync(path.join(bdir, 'b.healthy', 'provides.md'),   '# b.healthy — provides\n\n- health-probe\n');

// Block 4 — status=done but no acceptance_runs ledger → must fail.
fs.mkdirSync(path.join(bdir, 'b.done-no-evidence'), { recursive: true });
fs.writeFileSync(path.join(bdir, 'b.done-no-evidence', 'mission.md'),
  '# b.done-no-evidence — mission\n\nA mission well over eighty characters so the length gate is satisfied for this scenario.\n');
fs.writeFileSync(path.join(bdir, 'b.done-no-evidence', 'kpi.md'),        '# b.done-no-evidence — KPI\n\n- shipped\n');
fs.writeFileSync(path.join(bdir, 'b.done-no-evidence', 'acceptance.md'), '# b.done-no-evidence — acceptance\n\n- [x] A1\n');
fs.writeFileSync(path.join(bdir, 'b.done-no-evidence', 'depends_on.md'), '# b.done-no-evidence — depends_on\n\n- none\n');
fs.writeFileSync(path.join(bdir, 'b.done-no-evidence', 'provides.md'),   '# b.done-no-evidence — provides\n\n- nothing\n');

fs.writeFileSync(path.join(cdir, 'graph.json'), JSON.stringify({
  blocks: [
    { id: 'b.idea',             status: 'idea',     layer: 'logic' },
    { id: 'b.broken',           status: 'todo',     layer: 'logic' },
    { id: 'b.healthy',          status: 'progress', layer: 'logic' },
    { id: 'b.done-no-evidence', status: 'done',     layer: 'logic' },
  ],
  edges: [],
}, null, 2));

const out = execFileSync('node', ['scripts/validate_lifecycle_gates.mjs', '--client', c, '--json'], { cwd: ROOT }).toString();
const r = JSON.parse(out);

assert.equal(r.total_blocks, 4);
const byId = Object.fromEntries(r.reports.map((x) => [x.id, x]));

// b.idea — should have warnings, no fails.
assert.equal(byId['b.idea'].fails.length, 0, `b.idea should pass: ${byId['b.idea'].fails}`);
assert.ok(byId['b.idea'].warns.length >= 2, `b.idea should warn about mission/kpi/acceptance`);

// b.broken — status todo with empty contract → must fail mission/kpi/acceptance.
assert.ok(byId['b.broken'].fails.some((f) => /mission too short/.test(f)), `b.broken expected mission fail`);
assert.ok(byId['b.broken'].fails.some((f) => /no KPI/.test(f)),            `b.broken expected kpi fail`);
assert.ok(byId['b.broken'].fails.some((f) => /no acceptance/.test(f)),     `b.broken expected acceptance fail`);

// b.healthy — should be totally clean.
assert.equal(byId['b.healthy'].fails.length, 0, `b.healthy should pass: ${byId['b.healthy'].fails}`);

// b.done-no-evidence — must fail because status=done but no acceptance verdict.
assert.ok(
  byId['b.done-no-evidence'].fails.some((f) => /done.*acceptance/.test(f) || /no acceptance_runs/.test(f)),
  `b.done-no-evidence expected acceptance verdict fail: ${byId['b.done-no-evidence'].fails}`,
);

// Cleanup.
fs.rmSync(cdir, { recursive: true, force: true });

console.log('validate_lifecycle_gates.selftest: OK (4 scenarios — idea warns, todo-broken fails, progress-healthy passes, done-no-evidence fails)');

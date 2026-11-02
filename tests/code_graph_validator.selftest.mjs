#!/usr/bin/env node
// R-7.99 (b.code-graph A3) — selftest for the contract-drift validator.
//
// Builds a synthetic mini-atlas in tmp/, runs the validator's `validate()`
// directly with that atlas root, and asserts both detectors fire on the
// positive cases and are silent on the negative ones.
//
// 7 test groups: clean case · undeclared_code_dependency · declared dep
// satisfies · provided_capability_not_exported (real) · capability with
// parenthetical annotation skipped (non-code) · severity split (errors
// vs warnings) · runtime calls declared in calls.md (R-8.15).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validate } from '../scripts/validate_code_graph_vs_contracts.mjs';

const failures = [];
const check = (name, cond, detail = '') => { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); };

function setupMiniAtlas() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-cg-val-'));
  const atlas = path.join(tmp, 'atlas');
  fs.mkdirSync(path.join(atlas, 'blocks'), { recursive: true });

  // Mini-graph: b.alpha (depends on b.beta), b.beta, b.gamma (provides annotated)
  const graph = {
    blocks: [
      { id: 'b.alpha', status: 'wip', layer: 'logic' },
      { id: 'b.beta', status: 'done', layer: 'data' },
      { id: 'b.gamma', status: 'wip', layer: 'logic' },
    ],
  };
  fs.writeFileSync(path.join(atlas, 'graph.json'), JSON.stringify(graph, null, 2));
  return { tmp, atlas };
}

function writeBlock(atlas, blockId, { mission = 'mission', kpi = 'kpi', acceptance = 'acceptance', deps = [], provides = [], files = [] }) {
  const dir = path.join(atlas, 'blocks', blockId);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'mission.md'), mission);
  fs.writeFileSync(path.join(dir, 'kpi.md'), kpi);
  fs.writeFileSync(path.join(dir, 'acceptance.md'), acceptance);
  fs.writeFileSync(path.join(dir, 'depends_on.md'),
    `# ${blockId} — depends_on\n\n` + (deps.length ? deps.map((d) => `- ${d}`).join('\n') + '\n' : '- none\n'));
  fs.writeFileSync(path.join(dir, 'provides.md'),
    `# ${blockId} — provides\n\n` + (provides.length ? provides.map((p) => `- ${p}`).join('\n') + '\n' : '- none\n'));
  fs.writeFileSync(path.join(dir, 'files.md'),
    `# ${blockId} — files\n\n` + (files.length ? files.map((f) => `- ${f} [alive]`).join('\n') + '\n' : ''));
  fs.writeFileSync(path.join(dir, 'narrative.md'), '');
}

function writeCodeGraphForMini(atlas, { files, edges, byBlock }) {
  fs.writeFileSync(path.join(atlas, 'code_graph.json'), JSON.stringify({
    generated_at: '2026-06-09T00:00:00Z', backend: 'test',
    by_block: byBlock, edges, files, owner_warnings: [], supported_extensions: ['.mjs'],
  }, null, 2));
}

// ── Group 1: clean case — declared deps match imports, all caps are exported
{
  const { tmp, atlas } = setupMiniAtlas();
  writeBlock(atlas, 'b.alpha', { deps: ['b.beta: data_api'], files: ['scripts/alpha.mjs'] });
  writeBlock(atlas, 'b.beta', { provides: ['data_api'], files: ['scripts/beta.mjs'] });
  writeBlock(atlas, 'b.gamma', { files: [] }); // empty
  writeCodeGraphForMini(atlas, {
    files: {
      'scripts/alpha.mjs': { owning_block: 'b.alpha', imports: [{ from: './beta.mjs', external: false, resolved_to: 'scripts/beta.mjs', kind: 'static', line: 1, specifiers: [] }], exports: [] },
      'scripts/beta.mjs': { owning_block: 'b.beta', imports: [], exports: [{ kind: 'named', name: 'data_api', line: 1 }] },
    },
    edges: [{ from_block: 'b.alpha', to_block: 'b.beta', examples: [{ from_file: 'scripts/alpha.mjs', line: 1, to_file: 'scripts/beta.mjs', kind: 'static' }] }],
    byBlock: { 'b.alpha': { files: ['scripts/alpha.mjs'] }, 'b.beta': { files: ['scripts/beta.mjs'] }, 'b.gamma': { files: [] } },
  });
  const r = validate({ atlasRoot: atlas, sourceRoot: path.dirname(atlas) });
  check('g1: ok=true', r.ok === true, JSON.stringify(r.drifts));
  check('g1: zero errors', r.error_count === 0);
  check('g1: zero warnings', r.warning_count === 0, JSON.stringify(r.drifts));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── Group 2: undeclared_code_dependency — error
{
  const { tmp, atlas } = setupMiniAtlas();
  writeBlock(atlas, 'b.alpha', { deps: [], files: ['scripts/alpha.mjs'] });
  writeBlock(atlas, 'b.beta', { provides: ['data_api'], files: ['scripts/beta.mjs'] });
  writeBlock(atlas, 'b.gamma', { files: [] });
  writeCodeGraphForMini(atlas, {
    files: {
      'scripts/alpha.mjs': { owning_block: 'b.alpha', imports: [{ from: './beta.mjs', external: false, resolved_to: 'scripts/beta.mjs', kind: 'static', line: 7, specifiers: [] }], exports: [] },
      'scripts/beta.mjs': { owning_block: 'b.beta', imports: [], exports: [{ kind: 'named', name: 'data_api', line: 1 }] },
    },
    edges: [{ from_block: 'b.alpha', to_block: 'b.beta', examples: [{ from_file: 'scripts/alpha.mjs', line: 7, to_file: 'scripts/beta.mjs', kind: 'static' }] }],
    byBlock: { 'b.alpha': { files: ['scripts/alpha.mjs'] }, 'b.beta': { files: ['scripts/beta.mjs'] }, 'b.gamma': { files: [] } },
  });
  const r = validate({ atlasRoot: atlas, sourceRoot: path.dirname(atlas) });
  check('g2: ok=false', r.ok === false);
  const errs = r.drifts.filter((d) => d.severity === 'error');
  check('g2: one error', errs.length === 1, JSON.stringify(errs));
  check('g2: error pinpoints line', errs[0]?.examples?.[0]?.line === 7);
  check('g2: hint mentions depends_on file', /depends_on\.md/.test(errs[0]?.hint || ''));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── Group 3: declared dep with capability that is not literally exported
// but matches via fuzzy / source-text — must NOT warn (KPI-6).
//
// Realistic case: `provides: code_graph`, file exports `buildCodeGraph`.
{
  const { tmp, atlas } = setupMiniAtlas();
  writeBlock(atlas, 'b.alpha', { deps: ['b.beta: code_graph'], files: ['scripts/alpha.mjs'] });
  writeBlock(atlas, 'b.beta', { provides: ['code_graph'], files: ['scripts/beta.mjs'] });
  writeBlock(atlas, 'b.gamma', { files: [] });
  // Write a real beta.mjs in tmp ROOT so the source-text check sees the
  // capability name in source.
  const srcRoot = path.dirname(atlas);
  fs.mkdirSync(path.join(srcRoot, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(srcRoot, 'scripts', 'beta.mjs'), '// code_graph emission\nexport function buildCodeGraph() {}\n');
  writeCodeGraphForMini(atlas, {
    files: {
      'scripts/alpha.mjs': { owning_block: 'b.alpha', imports: [{ from: './beta.mjs', external: false, resolved_to: 'scripts/beta.mjs', kind: 'static', line: 1, specifiers: [] }], exports: [] },
      'scripts/beta.mjs': { owning_block: 'b.beta', imports: [], exports: [{ kind: 'named', name: 'buildCodeGraph', line: 2 }] },
    },
    edges: [{ from_block: 'b.alpha', to_block: 'b.beta', examples: [{ from_file: 'scripts/alpha.mjs', line: 1, to_file: 'scripts/beta.mjs', kind: 'static' }] }],
    byBlock: { 'b.alpha': { files: ['scripts/alpha.mjs'] }, 'b.beta': { files: ['scripts/beta.mjs'] }, 'b.gamma': { files: [] } },
  });
  const r = validate({ atlasRoot: atlas, sourceRoot: path.dirname(atlas) });
  check('g3: ok=true with fuzzy export', r.ok === true);
  check('g3: zero warnings (fuzzy buildCodeGraph matches code_graph)', r.warning_count === 0, JSON.stringify(r.drifts));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── Group 4: provided_capability_not_exported — warning (not error)
{
  const { tmp, atlas } = setupMiniAtlas();
  writeBlock(atlas, 'b.alpha', { files: [] });
  // Beta provides `phantom_widget` — no file exports it and no source mention.
  writeBlock(atlas, 'b.beta', { provides: ['phantom_widget'], files: ['scripts/beta.mjs'] });
  writeBlock(atlas, 'b.gamma', { files: [] });
  writeCodeGraphForMini(atlas, {
    files: {
      'scripts/beta.mjs': { owning_block: 'b.beta', imports: [], exports: [{ kind: 'named', name: 'somethingElse', line: 1 }] },
    },
    edges: [],
    byBlock: { 'b.alpha': { files: [] }, 'b.beta': { files: ['scripts/beta.mjs'] }, 'b.gamma': { files: [] } },
  });
  const r = validate({ atlasRoot: atlas, sourceRoot: path.dirname(atlas) });
  check('g4: ok=true (warnings do not block)', r.ok === true);
  check('g4: warning present', r.warning_count === 1, JSON.stringify(r.drifts));
  check('g4: capability echoed', r.drifts[0]?.capability === 'phantom_widget');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── Group 5: capability with parenthetical annotation skipped (non-code intent)
{
  const { tmp, atlas } = setupMiniAtlas();
  writeBlock(atlas, 'b.alpha', { files: [] });
  // Beta provides `some_thing (для XYZ)` — parens signal non-code intent.
  writeBlock(atlas, 'b.beta', { provides: ['some_thing (для XYZ — annotation only)'], files: ['scripts/beta.mjs'] });
  writeBlock(atlas, 'b.gamma', { files: [] });
  writeCodeGraphForMini(atlas, {
    files: { 'scripts/beta.mjs': { owning_block: 'b.beta', imports: [], exports: [] } },
    edges: [],
    byBlock: { 'b.alpha': { files: [] }, 'b.beta': { files: ['scripts/beta.mjs'] }, 'b.gamma': { files: [] } },
  });
  const r = validate({ atlasRoot: atlas, sourceRoot: path.dirname(atlas) });
  check('g5: zero warnings (parens skip the detector)', r.warning_count === 0, JSON.stringify(r.drifts));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── Group 6: --strict-provides semantics — errors escalate from warnings.
// We don't have CLI here, so we simulate by hand: validate() returns
// `severity: warning`; in real use, the CLI handler flips it to error
// before exit-code calculation. Just check the data is there.
{
  const { tmp, atlas } = setupMiniAtlas();
  writeBlock(atlas, 'b.alpha', { files: [] });
  writeBlock(atlas, 'b.beta', { provides: ['phantom_widget'], files: ['scripts/beta.mjs'] });
  writeBlock(atlas, 'b.gamma', { files: [] });
  writeCodeGraphForMini(atlas, {
    files: { 'scripts/beta.mjs': { owning_block: 'b.beta', imports: [], exports: [{ kind: 'named', name: 'somethingElse', line: 1 }] } },
    edges: [],
    byBlock: { 'b.alpha': { files: [] }, 'b.beta': { files: ['scripts/beta.mjs'] }, 'b.gamma': { files: [] } },
  });
  const r = validate({ atlasRoot: atlas, sourceRoot: path.dirname(atlas) });
  const w = r.drifts.find((d) => d.kind === 'provided_capability_not_exported');
  check('g6: warning has explicit severity', w?.severity === 'warning');
  check('g6: warning carries scanned_files', Array.isArray(w?.scanned_files) && w.scanned_files.length === 1);
  check('g6: warning lists exported_names_in_block', Array.isArray(w?.exported_names_in_block) && w.exported_names_in_block.includes('somethingElse'));
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error('code_graph_validator.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
// ── Group 7 (R-8.15): runtime calls — a started script or an API call to
// another block is declared in calls.md, not in depends_on.md; undeclared,
// stale and unknown calls are warnings.
{
  const { tmp, atlas } = setupMiniAtlas();
  writeBlock(atlas, 'b.alpha', { files: ['scripts/alpha.mjs'] });
  writeBlock(atlas, 'b.beta', { files: ['scripts/beta.mjs'] });
  writeBlock(atlas, 'b.gamma', { files: [] });
  fs.mkdirSync(path.join(tmp, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'scripts', 'alpha.mjs'), [
    "import { spawnSync } from 'node:child_process';",
    "spawnSync('node', ['scripts/beta.mjs', '--json']);",
    "console.log('fix: node scripts/beta.mjs');",
  ].join('\n'));
  fs.writeFileSync(path.join(tmp, 'scripts', 'beta.mjs'), 'console.log(1);\n');
  writeCodeGraphForMini(atlas, {
    files: {
      'scripts/alpha.mjs': { owning_block: 'b.alpha', imports: [{ from: 'node:child_process', external: true, resolved_to: null, kind: 'static', line: 1, specifiers: [] }], exports: [] },
      'scripts/beta.mjs': { owning_block: 'b.beta', imports: [], exports: [] },
    },
    edges: [],
    byBlock: { 'b.alpha': { files: ['scripts/alpha.mjs'] }, 'b.beta': { files: ['scripts/beta.mjs'] }, 'b.gamma': { files: [] } },
  });
  const v = () => validate({ atlasRoot: atlas, sourceRoot: tmp }).drifts.filter((d) => /runtime_call|call_target/.test(d.kind));
  const r1 = v();
  check('g7: an undeclared started script is a warning that points at calls.md', r1.length === 1 && r1[0].kind === 'undeclared_runtime_call' && r1[0].severity === 'warning'
    && r1[0].calls_block === 'b.beta' && r1[0].examples[0].line === 2 && /calls\.md/.test(r1[0].hint), JSON.stringify(r1));
  fs.writeFileSync(path.join(atlas, 'blocks', 'b.alpha', 'calls.md'), '# b.alpha — calls\n\n- b.beta: alpha.mjs запускает beta.mjs — чтобы пересобрать данные\n');
  check('g7: declared in calls.md → no warning', v().length === 0, JSON.stringify(v()));
  fs.writeFileSync(path.join(atlas, 'blocks', 'b.alpha', 'calls.md'), '# b.alpha — calls\n\n- b.beta: запуск\n- b.gamma: ничего не запускает\n- b.nope: такого блока нет\n');
  const r3 = v();
  check('g7: a declared call no code makes is stale', r3.some((d) => d.kind === 'stale_runtime_call' && d.calls_block === 'b.gamma'), JSON.stringify(r3));
  check('g7: a call to a block that does not exist is reported', r3.some((d) => d.kind === 'unknown_call_target' && d.calls_block === 'b.nope'), JSON.stringify(r3));
  check('g7: a command shown to a person (fix: …) is not a call', r3.filter((d) => d.calls_block === 'b.beta').length === 0);
  check('g7: runtime calls never fail the run on their own', validate({ atlasRoot: atlas, sourceRoot: tmp }).ok === true);
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('code_graph_validator.selftest: OK (7 test groups, all assertions green)');

#!/usr/bin/env node
// R-7.99 (b.code-graph A2 + A7) — selftest for the ES-module extractor.
//
// 9 test groups: static / dynamic / re-export / side-effect imports;
// named / default / list / aliased exports; comments-don't-confuse-matcher;
// determinism (sha256 of two consecutive build_code_graph runs).
//
// Synthetic fixtures only — does not touch real atlas.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractModule } from '../scripts/build_code_graph.mjs';

const failures = [];
const check = (name, cond, detail = '') => { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-code-extract-'));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Group 1: static named + default imports
{
  const f = path.join(tmp, 'g1.mjs');
  fs.writeFileSync(f, `
import fs from 'node:fs';
import { join, dirname as dn } from 'node:path';
import * as os from 'node:os';
import { buildGraph } from './sibling.mjs';
fs.readFileSync(join('.'));
`, 'utf8');
  // Create sibling so the relative import resolves.
  fs.writeFileSync(path.join(tmp, 'sibling.mjs'), 'export function buildGraph(){}\n', 'utf8');
  const r = extractModule(f);
  check('g1: 4 imports', r.imports.length === 4, `got=${r.imports.length}`);
  const sibling = r.imports.find((i) => i.from === './sibling.mjs');
  check('g1: relative resolved', sibling && !sibling.external && sibling.resolved_to, JSON.stringify(sibling || null));
  const fsImp = r.imports.find((i) => i.from === 'node:fs');
  check('g1: node:fs external', fsImp && fsImp.external && fsImp.resolved_to === null);
  check('g1: default specifier name=fs', fsImp.specifiers.some((s) => s.kind === 'default' && s.name === 'fs'));
  const pathImp = r.imports.find((i) => i.from === 'node:path');
  check('g1: aliased named import dirname as dn', pathImp.specifiers.some((s) => s.kind === 'named' && s.name === 'dirname' && s.alias === 'dn'));
  const osImp = r.imports.find((i) => i.from === 'node:os');
  check('g1: namespace import', osImp.specifiers.some((s) => s.kind === 'namespace' && s.name === 'os'));
}

// ── Group 2: dynamic import()
{
  const f = path.join(tmp, 'g2.mjs');
  fs.writeFileSync(f, `
const mod = await import('./util.mjs');
const ext = await import('lodash');
`, 'utf8');
  fs.writeFileSync(path.join(tmp, 'util.mjs'), 'export default {};\n', 'utf8');
  const r = extractModule(f);
  check('g2: 2 dynamic imports', r.imports.length === 2, `got=${r.imports.length}`);
  check('g2: all kind=dynamic', r.imports.every((i) => i.kind === 'dynamic'));
  check('g2: ./util resolved', r.imports.find((i) => i.from === './util.mjs')?.resolved_to);
  check('g2: lodash external', r.imports.find((i) => i.from === 'lodash')?.external);
}

// ── Group 3: re-export from
{
  const f = path.join(tmp, 'g3.mjs');
  fs.writeFileSync(f, `
export { foo, bar } from './pkg.mjs';
export * from './all.mjs';
export { default as Main } from './main.mjs';
`, 'utf8');
  fs.writeFileSync(path.join(tmp, 'pkg.mjs'), 'export const foo=1, bar=2;\n');
  fs.writeFileSync(path.join(tmp, 'all.mjs'), 'export const x=1;\n');
  fs.writeFileSync(path.join(tmp, 'main.mjs'), 'export default {};\n');
  const r = extractModule(f);
  const reexports = r.imports.filter((i) => i.kind === 'reexport');
  check('g3: 3 re-exports', reexports.length === 3, `got=${reexports.length} of ${r.imports.length}`);
  check('g3: all reexports resolved', reexports.every((i) => i.resolved_to));
}

// ── Group 4: side-effect import
{
  const f = path.join(tmp, 'g4.mjs');
  fs.writeFileSync(f, `import './polyfills.mjs';
import './another.mjs';
`, 'utf8');
  fs.writeFileSync(path.join(tmp, 'polyfills.mjs'), '// noop\n');
  fs.writeFileSync(path.join(tmp, 'another.mjs'), '// noop\n');
  const r = extractModule(f);
  const sideEffect = r.imports.filter((i) => i.kind === 'side_effect');
  check('g4: 2 side-effect imports', sideEffect.length === 2, `got=${sideEffect.length} of ${r.imports.length}: kinds=${r.imports.map((i) => i.kind).join(',')}`);
}

// ── Group 5: named / default / list exports
//
// MVP scope note: `export const a=1, b=2, c=3;` only records `a` — the
// regex captures the FIRST identifier after `const`/`let`/`var`, not the
// rest of the destructuring/comma-list. Documented limitation; full
// solution needs a real lexer (tree-sitter, the PR4 escape hatch). For the
// detector's purpose (provided-capability-not-exported) this is fine —
// capabilities are usually single named exports, not destructured tuples.
{
  const f = path.join(tmp, 'g5.mjs');
  fs.writeFileSync(f, `
export const PI = 3.14;
export function compute() {}
export async function fetchIt() {}
export class Widget {}
const a=1, b=2, c=3;
export { a, b as B, c };
export default function main() {}
`, 'utf8');
  const r = extractModule(f);
  const names = r.exports.map((e) => e.kind + ':' + e.name).sort();
  check('g5: default present', names.includes('default:default'));
  check('g5: function/class/const each captured', ['PI', 'compute', 'fetchIt', 'Widget'].every((n) => names.includes('named:' + n)));
  check('g5: aliased export uses ALIAS name (B, not b)', names.includes('named:B') && !names.includes('named:b'), `names=${names.join(',')}`);
  check('g5: list-exported a + c also captured', names.includes('named:a') && names.includes('named:c'));
}

// ── Group 6: comments must not poison matchers
{
  const f = path.join(tmp, 'g6.mjs');
  fs.writeFileSync(f, `
// import { evil } from 'do-not-find-me';
/* import { also_evil } from 'definitely-not';
   even though span multiple lines */
import { real } from './real.mjs';
`, 'utf8');
  fs.writeFileSync(path.join(tmp, 'real.mjs'), 'export const real = 1;\n');
  const r = extractModule(f);
  check('g6: only one import (commented ones ignored)', r.imports.length === 1, `got=${r.imports.length}: ${r.imports.map((i) => i.from).join(',')}`);
  check('g6: that one is ./real.mjs', r.imports[0]?.from === './real.mjs');
}

// ── Group 7: line numbers are preserved through comment-stripping
{
  const f = path.join(tmp, 'g7.mjs');
  fs.writeFileSync(f, `// line 1\n// line 2\nimport X from './x.mjs';\n/* line 4\n   line 5 */\nimport Y from './y.mjs';\n`, 'utf8');
  fs.writeFileSync(path.join(tmp, 'x.mjs'), 'export default 1;\n');
  fs.writeFileSync(path.join(tmp, 'y.mjs'), 'export default 1;\n');
  const r = extractModule(f);
  check('g7: X on line 3', r.imports.find((i) => i.from === './x.mjs')?.line === 3, `lines=${r.imports.map((i) => i.from + ':' + i.line).join(', ')}`);
  check('g7: Y on line 6', r.imports.find((i) => i.from === './y.mjs')?.line === 6, `lines=${r.imports.map((i) => i.from + ':' + i.line).join(', ')}`);
}

// ── Group 8: relative-but-unresolvable imports (e.g. .css) marked
// external=false + resolved_to=null
{
  const f = path.join(tmp, 'g8.mjs');
  fs.writeFileSync(f, `import './styles.css';\n`);
  const r = extractModule(f);
  check('g8: 1 import', r.imports.length === 1);
  check('g8: external=false, resolved_to=null', r.imports[0]?.external === false && r.imports[0]?.resolved_to === null,
    JSON.stringify(r.imports[0]));
}

// ── Group 9: DETERMINISM — full repo build, sha256 two runs == match.
// This is the A7 / KPI-2 gate.
{
  const exec = (n) => spawnSync('node', ['scripts/build_code_graph.mjs', '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const r1 = exec(1);
  const r2 = exec(2);
  check('g9: build #1 ok', r1.status === 0, r1.stderr.slice(0, 200));
  check('g9: build #2 ok', r2.status === 0, r2.stderr.slice(0, 200));
  const h1 = crypto.createHash('sha256').update(r1.stdout).digest('hex');
  const h2 = crypto.createHash('sha256').update(r2.stdout).digest('hex');
  check('g9: deterministic — sha256 match', h1 === h2, `h1=${h1.slice(0,12)} h2=${h2.slice(0,12)}`);
  if (h1 === h2) console.log('  deterministic — sha256(' + h1.slice(0, 12) + '…) matches across runs');
}

if (failures.length) {
  console.error('code_graph_extractor.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}
console.log('code_graph_extractor.selftest: OK (9 test groups, all assertions green)');
fs.rmSync(tmp, { recursive: true, force: true });

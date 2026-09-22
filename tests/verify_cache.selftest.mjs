#!/usr/bin/env node
// R-8.11 (b.acceptance-verifier-loop) — the verifier cache (KPI-6) never
// returns a pass it should not.
//
// A cache that answers «pass» after a real change is a silent green, so the
// point of this test is the misses: every part of the key is changed on its
// own and each must invalidate, naming what changed. Then the rules: fail is
// never cached, inconclusive only under the mock and never served live,
// clock- or diff-dependent blocks never are, entries expire, the switches
// work, and a hit keeps the ledgers consistent.
//
// Runs the real verify_block_acceptance.mjs (CLI) on a synthetic atlas
// (ATLAS_ROOT). The code part of the key is the real repo's git state, so one
// group creates and removes an untracked file inside the repo.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const failures = [];
const check = (name, cond, detail = '') => { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sima-vcache-'));
const atlas = path.join(tmp, 'atlas');
const target = path.join(tmp, 'evidence.txt');
const probe = path.join(ROOT, 'tests', `_verify_cache_probe_${process.pid}.tmp`);

function seed() {
  fs.rmSync(atlas, { recursive: true, force: true });
  fs.mkdirSync(atlas, { recursive: true });
  fs.writeFileSync(target, 'status: ready\n');
  const blocks = ['b.main', 'b.other', 'b.clock', 'b.red'];
  fs.writeFileSync(path.join(atlas, 'graph.json'), JSON.stringify({ blocks: blocks.map((id) => ({ id, status: 'wip', depends_on: [] })) }, null, 2));
  const acc = {
    'b.main': [
      '- [x] **A1.** node runs.', '```yaml', 'evidence_kind: exit_code', 'evidence_spec:', '  cmd: node --version', '```',
      '- [x] **A2.** the evidence file says ready.', '```yaml', 'evidence_kind: log_grep', 'evidence_spec:', `  file: ${target}`, '  pattern: "status: ready"', '```',
    ],
    'b.other': ['- [x] **A1.** node runs.', '```yaml', 'evidence_kind: exit_code', 'evidence_spec:', '  cmd: node --version', '```'],
    'b.clock': ['- [x] **A1.** a fresh file exists.', '```yaml', 'evidence_kind: fs_glob', 'evidence_spec:', `  pattern: ${target}`, '  max_age_min: 60', '```'],
    'b.red': ['- [ ] **A1.** this fails.', '```yaml', 'evidence_kind: exit_code', 'evidence_spec:', '  cmd: node -e "process.exit(1)"', '```'],
  };
  for (const [id, lines] of Object.entries(acc)) {
    fs.mkdirSync(path.join(atlas, 'blocks', id), { recursive: true });
    fs.writeFileSync(path.join(atlas, 'blocks', id, 'acceptance.md'), `# ${id}\n\n${lines.join('\n')}\n`);
    fs.writeFileSync(path.join(atlas, 'blocks', id, 'checks.log'), '');
  }
}
const verify = (id, extraEnv = {}, args = []) => {
  const r = spawnSync('node', [path.join(ROOT, 'scripts', 'verify_block_acceptance.mjs'), id, '--json', ...args],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ATLAS_ROOT: atlas, ATLAS_FORCE_MOCK_LLM: '1', ATLAS_VERIFY_CACHE: '', ATLAS_VERIFY_CACHE_TTL_H: '', ...extraEnv } });
  try { return JSON.parse(r.stdout); } catch { return { parse_error: (r.stdout + r.stderr).slice(-300) }; }
};
const hit = (r) => r.cache?.hit === true;
const reason = (r) => r.cache?.reason || '';

try {
  seed();

  // ── g1: a pass is cached ───────────────────────────────────────────────
  const first = verify('b.main');
  check('g1: first run verifies (miss: nothing cached yet)', first.verdict === 'pass' && !hit(first) && /no cached (pass|result)/.test(reason(first)), JSON.stringify(first.cache || first));
  const second = verify('b.main');
  check('g1: second run is a hit', second.verdict === 'pass' && hit(second), JSON.stringify(second.cache));
  check('g1: …returning the original verification, not a new one', second.checked_at === first.checked_at);
  const verifierLines = () => fs.readFileSync(path.join(atlas, 'blocks', 'b.main', 'checks.log'), 'utf8').split('\n').filter((l) => l.includes('\tacceptance_verifier\t')).length;
  check('g1: a hit writes no new ledger line', verifierLines() === 1, String(verifierLines()));

  // ── g2: every part of the key invalidates on its own ───────────────────
  fs.writeFileSync(target, 'status: ready\nnote: edited\n');
  const t = verify('b.main');
  check('g2: a changed evidence target → miss, named', !hit(t) && /file this block's assertions read changed/.test(reason(t)), reason(t));
  check('g2: …and the new state is verified for real', t.verdict === 'pass');
  check('g2: …then cached again', hit(verify('b.main')));

  fs.appendFileSync(path.join(atlas, 'blocks', 'b.main', 'acceptance.md'), '\n<!-- contract edited -->\n');
  const c = verify('b.main');
  check('g2: a changed contract → miss, named', !hit(c) && /contract, graph.json or project rules changed/.test(reason(c)), reason(c));
  verify('b.main');

  fs.mkdirSync(path.join(atlas, 'acceptance_runs', 'b.other'), { recursive: true });
  fs.writeFileSync(path.join(atlas, 'acceptance_runs', 'b.other', '_latest.json'), JSON.stringify({ verdict: 'fail', counts: { pass: 0, fail: 1, skipped: 0 } }));
  const v = verify('b.main');
  check('g2: another block\'s verdict changed → miss, named', !hit(v) && /another block's verdict/.test(reason(v)), reason(v));
  verify('b.main');

  const e = verify('b.main', { ATLAS_FORCE_MOCK_LLM: '' });
  check('g2: LLM mode changed → miss, named', !hit(e) && /LLM mode/.test(reason(e)), reason(e));
  verify('b.main');

  fs.writeFileSync(probe, 'a new untracked file outside atlas/\n');
  const k = verify('b.main');
  check('g2: code changed (a new file outside atlas/) → miss, named', !hit(k) && /code changed/.test(reason(k)), reason(k));
  fs.rmSync(probe, { force: true });

  // ── g3: what is never cached ───────────────────────────────────────────
  verify('b.red');
  const red = verify('b.red');
  check('g3: a failing block is re-verified every time (fail is never cached)', red.verdict === 'fail' && !hit(red), JSON.stringify(red.cache));
  verify('b.clock');
  const clock = verify('b.clock');
  check('g3: an fs_glob with max_age_min is never cached (depends on the clock)', !hit(clock) && /max_age_min/.test(reason(clock)), reason(clock));

  // inconclusive: cached under the mock (deterministic), never served live
  fs.mkdirSync(path.join(atlas, 'blocks', 'b.judge'), { recursive: true });
  fs.writeFileSync(path.join(atlas, 'blocks', 'b.judge', 'acceptance.md'), '# b.judge\n\n- [ ] **A1.** only a judge can tell.\n');
  fs.writeFileSync(path.join(atlas, 'blocks', 'b.judge', 'checks.log'), '');
  verify('b.judge');
  const inc = verify('b.judge');
  check('g3: an inconclusive result under the mock is cached (the judge is skipped, so it is deterministic)', inc.verdict === 'inconclusive' && hit(inc), JSON.stringify(inc.cache));
  const live = verify('b.judge', { ATLAS_FORCE_MOCK_LLM: '', ANTHROPIC_API_KEY: '', GOOGLE_API_KEY: '', OPENAI_API_KEY: '', LLM_DEFAULT_PROVIDER: 'mock' });
  check('g3: …and never served to a run that is not forced onto the mock', !hit(live), JSON.stringify(live.cache));

  // ── g4: expiry and the switches ────────────────────────────────────────
  verify('b.main');
  check('g4: (precondition) cached', hit(verify('b.main')));
  const expired = verify('b.main', { ATLAS_VERIFY_CACHE_TTL_H: '0.000001' });
  check('g4: an entry older than the TTL is a miss', !hit(expired) && /expired/.test(reason(expired)), reason(expired));
  verify('b.main');
  const off = verify('b.main', { ATLAS_VERIFY_CACHE: '0' });
  check('g4: ATLAS_VERIFY_CACHE=0 verifies', !hit(off) && /disabled/.test(reason(off)), reason(off));
  const flag = verify('b.main', {}, ['--no-cache']);
  check('g4: --no-cache verifies', !hit(flag), JSON.stringify(flag.cache));

  // ── g5: a hit keeps the ledgers consistent ─────────────────────────────
  verify('b.main');
  // Someone else wrote a failing verdict in between (another state, since reverted).
  fs.writeFileSync(path.join(atlas, 'acceptance_runs', 'b.main', '_latest.json'), JSON.stringify({ verdict: 'fail', counts: { pass: 0, fail: 1, skipped: 0 } }));
  fs.appendFileSync(path.join(atlas, 'blocks', 'b.main', 'checks.log'), `${new Date().toISOString()}\tacceptance_verifier\tfail\tverdict=fail\n`);
  const sync = verify('b.main');
  // The verdicts part changed (b.main's own _latest), so this is a miss —
  // re-verified for real, which is also correct. Either way, afterwards the
  // ledgers must say pass.
  const latest = JSON.parse(fs.readFileSync(path.join(atlas, 'acceptance_runs', 'b.main', '_latest.json'), 'utf8'));
  const lastLine = fs.readFileSync(path.join(atlas, 'blocks', 'b.main', 'checks.log'), 'utf8').trim().split('\n').filter((l) => l.includes('\tacceptance_verifier\t')).pop();
  check('g5: after a stray fail, _latest.json is pass again', sync.verdict === 'pass' && latest.verdict === 'pass', latest.verdict);
  check('g5: …and the last verifier line is pass', /\tacceptance_verifier\tpass\t/.test(lastLine || ''), lastLine);

  // ── g6: the fast path is fast (KPI-6: < 50 ms) and counted ─────────────
  const lat = [];
  for (let i = 0; i < 5; i++) { const r = verify('b.main'); if (hit(r)) lat.push(r.cache.lookup_ms); }
  lat.sort((a, b) => a - b);
  check('g6: five repeated runs are five hits', lat.length === 5, String(lat.length));
  check('g6: median hit lookup under 50 ms', lat.length === 5 && lat[2] < 50, lat.map((x) => x.toFixed(1)).join(', '));
  const { cacheStats } = await import('../scripts/verify_cache.mjs');
  const s = cacheStats({ atlasRoot: atlas });
  check('g6: hits and misses are recorded for the hit-rate KPI', s.hits >= 5 && s.misses >= 5 && s.hit_rate > 0 && s.hit_rate < 1, JSON.stringify(s));
  console.log(`  (median hit lookup ${lat[2]?.toFixed(1)} ms)`);
} finally {
  fs.rmSync(probe, { force: true });
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error('verify_cache.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('verify_cache.selftest: OK (6 groups, all assertions green)');

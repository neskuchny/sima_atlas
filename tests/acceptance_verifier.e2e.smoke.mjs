#!/usr/bin/env node
// PR-4 (b.acceptance-verifier-loop): end-to-end smoke for the gate flow.
//
// Builds a synthetic block in a tmpdir-based fake atlas/ tree, then exercises:
//   1. verify_block_acceptance writes acceptance_runs/<block>/<UTC>.json + _latest.json
//   2. log_transition rejects wip→done while verdict=fail
//   3. After fixing the failing assertion + rerunning verifier → verdict=pass
//   4. log_transition now accepts wip→done with gate=pass note in the log
//   5. verify_done_blocks_still_green creates a proposal when a previously-
//      passing block regresses (assertion source disappears)
//
// All filesystem mutations happen inside a tmpdir; the real repo is untouched.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');

const failures = [];
function check(name, cond, detail = '') {
  if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

// Build a fake atlas/ tree where verifier scripts can run against it. The
// scripts use process.cwd() to locate atlas/ — so we shim by chdir'ing the
// child process to the tmpdir for each call.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'av-e2e-'));
const tmpAtlas = path.join(tmpRoot, 'atlas');
fs.mkdirSync(path.join(tmpAtlas, 'blocks', 'b.synth-e2e'), { recursive: true });
fs.mkdirSync(path.join(tmpAtlas, 'proposals'), { recursive: true });

// Minimal graph.json so verify_done_blocks_still_green can find blocks
fs.writeFileSync(path.join(tmpAtlas, 'graph.json'), JSON.stringify({
  blocks: [
    { id: 'b.synth-e2e', title: 'synth', status: 'wip', layer: 'logic', tech_stack: [] },
  ],
}, null, 2), 'utf8');

// Probe file the assertion will check for
const probeFile = path.join(tmpRoot, 'probe.txt');

// Initial acceptance.md: a single assertion that depends on probe.txt EXISTING
fs.writeFileSync(path.join(tmpAtlas, 'blocks', 'b.synth-e2e', 'acceptance.md'),
  `# b.synth-e2e — acceptance

- [ ] **A1.** Probe file exists.
\`\`\`yaml
evidence_kind: fs_glob
evidence_spec:
  pattern: ${probeFile}
  min_count: 1
\`\`\`
`, 'utf8');

fs.writeFileSync(path.join(tmpAtlas, 'blocks', 'b.synth-e2e', 'mission.md'), '# b.synth-e2e — mission\nSynthetic test block for e2e smoke.\n', 'utf8');
fs.writeFileSync(path.join(tmpAtlas, 'blocks', 'b.synth-e2e', 'checks.log'), '', 'utf8');

function runScript(scriptRelPath, args = [], opts = {}) {
  return spawnSync('node', [path.join(REPO_ROOT, scriptRelPath), ...args], {
    cwd: tmpRoot,
    encoding: 'utf8',
    env: { ...process.env, ATLAS_ROOT: tmpAtlas, ATLAS_SKIP_VERIFIER: '1' },
    ...opts,
  });
}

try {
  // ─── 1: verifier reports fail (probe.txt does not yet exist)
  const v1 = runScript('scripts/verify_block_acceptance.mjs', ['b.synth-e2e', '--quiet']);
  check('phase1:verifier exit fail', v1.status === 1, `exit=${v1.status}, stderr=${v1.stderr}`);
  const latestPath1 = path.join(tmpAtlas, 'acceptance_runs', 'b.synth-e2e', '_latest.json');
  check('phase1:_latest.json written', fs.existsSync(latestPath1));
  if (fs.existsSync(latestPath1)) {
    const j = JSON.parse(fs.readFileSync(latestPath1, 'utf8'));
    check('phase1:verdict=fail', j.verdict === 'fail', `got ${j.verdict}`);
  }

  // ─── 2: log_transition REJECTS wip → done while verdict=fail
  const t1 = runScript('scripts/log_transition.mjs', ['b.synth-e2e', 'wip', 'done', 'e2e']);
  check('phase2:transition rejected', t1.status === 1, `exit=${t1.status}`);
  check('phase2:reject reason cited', /verdict\s*=\s*fail/.test(t1.stderr || ''),
    `stderr=${t1.stderr}`);
  // transitions.log should not contain a successful wip→done line
  const transPath = path.join(tmpAtlas, 'transitions.log');
  const transContents = fs.existsSync(transPath) ? fs.readFileSync(transPath, 'utf8') : '';
  check('phase2:no entry written on reject', !/b\.synth-e2e\twip\tdone/.test(transContents));

  // ─── 3: fix the failing assertion (create probe.txt) + re-verify → pass
  fs.writeFileSync(probeFile, 'now exists', 'utf8');
  const v2 = runScript('scripts/verify_block_acceptance.mjs', ['b.synth-e2e', '--quiet']);
  check('phase3:verifier exit pass', v2.status === 0, `exit=${v2.status}, stderr=${v2.stderr}`);
  const j2 = JSON.parse(fs.readFileSync(latestPath1, 'utf8'));
  check('phase3:verdict=pass', j2.verdict === 'pass');

  // ─── 4: log_transition now ACCEPTS wip → done with gate=pass note
  const t2 = runScript('scripts/log_transition.mjs', ['b.synth-e2e', 'wip', 'done', 'e2e']);
  check('phase4:transition accepted', t2.status === 0, `exit=${t2.status}, stderr=${t2.stderr}`);
  check('phase4:stdout cites gate=pass', /gate=pass/.test(t2.stdout || ''),
    `stdout=${t2.stdout}`);
  const transContents2 = fs.readFileSync(transPath, 'utf8');
  check('phase4:transitions.log contains entry', /b\.synth-e2e\twip\tdone.*gate=pass/.test(transContents2),
    `transitions.log=${transContents2.split(/\r?\n/).slice(-3).join(' / ')}`);

  // ─── 5: regression — flip graph.json status to done, then DELETE probe and re-run regression check
  const graph = JSON.parse(fs.readFileSync(path.join(tmpAtlas, 'graph.json'), 'utf8'));
  graph.blocks[0].status = 'done';
  fs.writeFileSync(path.join(tmpAtlas, 'graph.json'), JSON.stringify(graph, null, 2), 'utf8');
  fs.unlinkSync(probeFile);
  const v3 = runScript('scripts/verify_done_blocks_still_green.mjs');
  check('phase5:regression script exit 0', v3.status === 0, `exit=${v3.status}, stderr=${v3.stderr}`);
  check('phase5:summary mentions regression', /regressions=1/.test(v3.stdout || ''),
    `stdout=${v3.stdout}`);
  const proposalsDir = path.join(tmpAtlas, 'proposals');
  const proposalFiles = fs.readdirSync(proposalsDir).filter((f) => f.endsWith('__acceptance_regression.json'));
  check('phase5:proposal written', proposalFiles.length === 1,
    `got ${proposalFiles.length} proposals: ${proposalFiles.join(', ')}`);
  if (proposalFiles.length === 1) {
    const proposal = JSON.parse(fs.readFileSync(path.join(proposalsDir, proposalFiles[0]), 'utf8'));
    check('phase5:proposal kind', proposal.kind === 'acceptance_regression');
    check('phase5:proposal proposes broken', proposal.proposed?.status === 'broken');
    check('phase5:retry_prompt_hint present', typeof proposal.retry_prompt_hint === 'string' && proposal.retry_prompt_hint.length > 20,
      `hint="${proposal.retry_prompt_hint}"`);
  }
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

if (failures.length) {
  console.error('acceptance_verifier.e2e.smoke: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('acceptance_verifier.e2e.smoke: OK (5 phases — verifier writes report; gate rejects fail; gate accepts pass; regression detected; proposal created)');

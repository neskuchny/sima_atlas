#!/usr/bin/env node
// PR-2 (b.acceptance-verifier-loop): selftest for scripts/collect_evidence.mjs
//
// Positive + negative per collector kind, plus llm_judge skip + unknown kind +
// verifyBlock end-to-end with a synthetic block.
//
// 11 test groups.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collectEvidence, verifyBlock } from '../scripts/collect_evidence.mjs';

const failures = [];
function check(name, cond, detail = '') {
  if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

// ─── Group 1: exit_code positive
{
  const r = collectEvidence({ evidence_kind: 'exit_code', evidence_spec: { cmd: 'echo HELLO' } });
  check('exit_code:pos pass', r.verdict === 'pass', `verdict=${r.verdict}, evidence=${r.evidence}`);
  check('exit_code:pos evidence has exit 0', r.evidence.includes('exit 0'));
  check('exit_code:pos kind echoed', r.evidence_kind === 'exit_code');
}

// ─── Group 2: exit_code negative (non-zero exit)
{
  const r = collectEvidence({ evidence_kind: 'exit_code', evidence_spec: { cmd: 'exit 7' } });
  check('exit_code:neg fail', r.verdict === 'fail', `verdict=${r.verdict}`);
  check('exit_code:neg evidence has exit 7', r.evidence.includes('exit 7'));
}

// ─── Group 3: exit_code with expect_in_stdout — match + miss
{
  const pos = collectEvidence({ evidence_kind: 'exit_code', evidence_spec: { cmd: 'echo passing-mark', expect_in_stdout: 'passing-mark' } });
  check('exit_code:expect_in_stdout match', pos.verdict === 'pass');
  const neg = collectEvidence({ evidence_kind: 'exit_code', evidence_spec: { cmd: 'echo other-text', expect_in_stdout: 'passing-mark' } });
  check('exit_code:expect_in_stdout miss', neg.verdict === 'fail');
  check('exit_code:expect_in_stdout reasoning mentions regex', neg.reasoning.includes('passing-mark') || neg.evidence.includes('passing-mark'));
}

// ─── Group 4: fs_glob positive (tmpdir with files)
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evtest-'));
  fs.writeFileSync(path.join(tmp, 'a.json'), '{}', 'utf8');
  fs.writeFileSync(path.join(tmp, 'b.json'), '{}', 'utf8');
  const r = collectEvidence({ evidence_kind: 'fs_glob', evidence_spec: { pattern: path.join(tmp, '*.json'), min_count: 1 } });
  check('fs_glob:pos pass', r.verdict === 'pass', `evidence=${r.evidence}`);
  check('fs_glob:pos count=2', r.raw.count === 2);
  fs.rmSync(tmp, { recursive: true });
}

// ─── Group 5: fs_glob negative (empty dir)
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evtest-'));
  const r = collectEvidence({ evidence_kind: 'fs_glob', evidence_spec: { pattern: path.join(tmp, '*.json'), min_count: 1 } });
  check('fs_glob:neg fail', r.verdict === 'fail');
  check('fs_glob:neg count=0', r.raw.count === 0);
  fs.rmSync(tmp, { recursive: true });
}

// ─── Group 6: fs_glob max_age_min — fresh pass, stale fail
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evtest-'));
  fs.writeFileSync(path.join(tmp, 'fresh.json'), '{}', 'utf8');
  const r1 = collectEvidence({ evidence_kind: 'fs_glob', evidence_spec: { pattern: path.join(tmp, '*.json'), max_age_min: 5 } });
  check('fs_glob:fresh max_age pass', r1.verdict === 'pass');
  // Backdate file to 10 hours ago
  const past = new Date(Date.now() - 10 * 60 * 60 * 1000);
  fs.utimesSync(path.join(tmp, 'fresh.json'), past, past);
  const r2 = collectEvidence({ evidence_kind: 'fs_glob', evidence_spec: { pattern: path.join(tmp, '*.json'), max_age_min: 5 } });
  check('fs_glob:stale max_age fail', r2.verdict === 'fail',
    `evidence=${r2.evidence}`);
  fs.rmSync(tmp, { recursive: true });
}

// ─── Group 7: log_grep positive + negative
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evtest-'));
  const logFile = path.join(tmp, 'checks.log');
  fs.writeFileSync(logFile, [
    '2026-05-01T10:00:00Z\tacceptance\tpass\tA1 ok',
    '2026-05-02T11:00:00Z\tacceptance\tfail\tA2 broke',
    '2026-05-03T12:00:00Z\tkpi\tpass\tK1 ok',
  ].join('\n'), 'utf8');
  const pos = collectEvidence({ evidence_kind: 'log_grep', evidence_spec: { file: logFile, pattern: 'acceptance.*pass' } });
  check('log_grep:pos pass', pos.verdict === 'pass', `evidence=${pos.evidence}`);
  check('log_grep:pos count=1', pos.raw.match_count === 1);
  const neg = collectEvidence({ evidence_kind: 'log_grep', evidence_spec: { file: logFile, pattern: 'never_appears_xyz' } });
  check('log_grep:neg fail', neg.verdict === 'fail');
  // since_time filtering
  const sinceMid = collectEvidence({ evidence_kind: 'log_grep', evidence_spec: { file: logFile, pattern: 'pass', since_time: '2026-05-02T00:00:00Z' } });
  check('log_grep:since filters out earlier', sinceMid.raw.match_count === 1,
    `got ${sinceMid.raw.match_count}, sample=${JSON.stringify(sinceMid.raw.sample)}`);
  fs.rmSync(tmp, { recursive: true });
}

// ─── Group 8: log_grep missing file
{
  const r = collectEvidence({ evidence_kind: 'log_grep', evidence_spec: { file: '/tmp/__nope__/nofile.log', pattern: 'x' } });
  check('log_grep:missing file fail', r.verdict === 'fail');
  check('log_grep:missing file reason', r.reasoning.includes('missing'));
}

// ─── Group 9: file_diff in tmp git repo
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evtest-git-'));
  function sh(cmd) { return collectEvidence({ evidence_kind: 'exit_code', evidence_spec: { cmd }, cwd: tmp }); }
  // init repo with one commit (disable gpg signing for sandboxed CI)
  sh('git init -q && git config user.email x@y && git config user.name x && git config commit.gpgsign false');
  fs.writeFileSync(path.join(tmp, 'a.txt'), 'one\n');
  sh('git add . && git -c commit.gpgsign=false commit -q -m initial');
  // edit and don't commit yet (file_diff vs HEAD shows working-tree change)
  fs.writeFileSync(path.join(tmp, 'a.txt'), 'one\ntwo\n');
  const pos = collectEvidence({
    evidence_kind: 'file_diff',
    evidence_spec: { since_ref: 'HEAD', must_touch: ['a.txt'], must_not_touch: ['secret.env'] },
    cwd: tmp,
  });
  check('file_diff:must_touch present pass', pos.verdict === 'pass', `evidence=${pos.evidence}`);
  // missing must_touch
  const neg = collectEvidence({
    evidence_kind: 'file_diff',
    evidence_spec: { since_ref: 'HEAD', must_touch: ['b.txt'] },
    cwd: tmp,
  });
  check('file_diff:must_touch missing fail', neg.verdict === 'fail');
  // forbidden touched
  fs.writeFileSync(path.join(tmp, 'secret.env'), 'KEY=x\n');
  sh('git add . && git -c commit.gpgsign=false commit -q -m add-secret');
  fs.writeFileSync(path.join(tmp, 'secret.env'), 'KEY=y\n');
  const fb = collectEvidence({
    evidence_kind: 'file_diff',
    evidence_spec: { since_ref: 'HEAD', must_not_touch: ['secret.env'] },
    cwd: tmp,
  });
  check('file_diff:forbidden touched fail', fb.verdict === 'fail',
    `evidence=${fb.evidence}`);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ─── Group 10: selftest_run + llm_judge skip + unknown kind
{
  const a = collectEvidence({ evidence_kind: 'selftest_run', evidence_spec: { cmd: 'echo OK', expect_in_stdout: 'OK' } });
  check('selftest_run:pass', a.verdict === 'pass');
  const b = collectEvidence({ evidence_kind: 'llm_judge', evidence_spec: {} });
  check('llm_judge:skipped', b.verdict === 'skipped');
  check('llm_judge:reason mentions PR-3', b.reasoning.includes('PR-3'));
  const c = collectEvidence({ evidence_kind: 'monkey_typing', evidence_spec: {} });
  check('unknown kind:fail', c.verdict === 'fail');
  check('unknown kind:reason lists allowed', c.reasoning.includes('exit_code'));
}

// ─── Group 11: verifyBlock end-to-end on synthetic block
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'evtest-block-'));
  const atlas = path.join(tmp, 'atlas');
  const blockDir = path.join(atlas, 'blocks', 'b.synth');
  fs.mkdirSync(blockDir, { recursive: true });
  // Create acceptance.md with mixed evidence kinds
  const probeFile = path.join(tmp, 'probe.txt');
  fs.writeFileSync(probeFile, 'marker\n');
  fs.writeFileSync(path.join(blockDir, 'acceptance.md'), `# b.synth — acceptance

- [ ] **A1.** Echo passes.
\`\`\`yaml
evidence_kind: exit_code
evidence_spec:
  cmd: echo OK
  expect_in_stdout: OK
\`\`\`
- [ ] **A2.** Probe file exists.
\`\`\`yaml
evidence_kind: fs_glob
evidence_spec:
  pattern: ${probeFile}
  min_count: 1
\`\`\`
- [ ] **A3.** Always-skipped (LLM-judge).
- [ ] **A4.** Intentionally failing.
\`\`\`yaml
evidence_kind: exit_code
evidence_spec:
  cmd: exit 1
\`\`\`
`);
  const r = verifyBlock('b.synth', { atlas_root: atlas });
  check('verifyBlock:counts pass=2', r.counts.pass === 2, JSON.stringify(r.counts));
  check('verifyBlock:counts fail=1', r.counts.fail === 1, JSON.stringify(r.counts));
  check('verifyBlock:counts skipped=1', r.counts.skipped === 1, JSON.stringify(r.counts));
  check('verifyBlock:overall verdict=fail', r.verdict === 'fail');
  check('verifyBlock:A4 has retry-able evidence', r.assertions.find((a) => a.id === 'A4')?.evidence?.includes('exit 1'));
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (failures.length) {
  console.error('evidence_collectors.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('evidence_collectors.selftest: OK (11 test groups, all assertions green)');

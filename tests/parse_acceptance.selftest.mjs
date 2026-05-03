#!/usr/bin/env node
// PR-1 (b.acceptance-verifier-loop): selftest for scripts/parse_acceptance.mjs
//
// 9 test groups:
//  1. Real acceptance.md files in repo parse cleanly (≥ 30 assertions across 7 blocks, 0 warnings)
//  2. Bullet variants: checked vs unchecked, with/without label
//  3. Section header stops parsing
//  4. Duplicate id → warning
//  5. ID gap → warning
//  6. Fenced YAML evidence_spec parsed (exit_code, fs_glob, log_grep)
//  7. Invalid evidence_kind → warning, default applied
//  8. Malformed YAML → warning, fall back to default kind
//  9. Empty acceptance.md → warning, no assertions

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseAcceptance, parseAcceptanceText } from '../scripts/parse_acceptance.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const failures = [];
function check(name, cond, detail = '') {
  if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`);
}

// ─── Group 1: real acceptance.md files
{
  const blocks = ['b.llm-gateway', 'b.agent-orchestrator', 'b.docs', 'b.core-sync',
                  'b.db', 'b.ui-control', 'b.operator-profile-learner'];
  let totalAssertions = 0;
  let totalWarnings = 0;
  for (const blockId of blocks) {
    const r = parseAcceptance(blockId);
    check(`real:${blockId} parsed`, r.assertions.length > 0, `got ${r.assertions.length}`);
    check(`real:${blockId} no warnings`, r.warnings.length === 0,
      `warnings: ${r.warnings.join(', ')}`);
    totalAssertions += r.assertions.length;
    totalWarnings += r.warnings.length;
  }
  check('real:total assertions ≥ 30', totalAssertions >= 30, `got ${totalAssertions}`);
  check('real:zero warnings overall', totalWarnings === 0, `got ${totalWarnings}`);
}

// ─── Group 2: bullet variants
{
  const text = `# acceptance

- [ ] **A1.** Unchecked simple.
- [x] **A2.** Checked simple.
- [ ] **A3 (label here).** With label.
- [x] **A4 (live flow).** Checked with label.
`;
  const r = parseAcceptanceText(text);
  check('variants:4 assertions', r.assertions.length === 4);
  check('variants:A1 unchecked', !r.assertions[0].checked);
  check('variants:A2 checked', r.assertions[1].checked);
  check('variants:A3 label', r.assertions[2].label === 'label here');
  check('variants:A4 label+checked', r.assertions[3].label === 'live flow' && r.assertions[3].checked);
  check('variants:no warnings', r.warnings.length === 0);
}

// ─── Group 3: section header stops parsing
{
  const text = `# acceptance

- [ ] **A1.** First.
- [ ] **A2.** Second.

## Что считается NOT acceptance
- [ ] **A99.** Should not be parsed.
`;
  const r = parseAcceptanceText(text);
  check('section_stop:2 only', r.assertions.length === 2,
    `got ${r.assertions.length}: ${r.assertions.map((a) => a.id).join(',')}`);
  check('section_stop:no A99', !r.assertions.some((a) => a.id === 'A99'));
}

// ─── Group 4: duplicate id → warning
{
  const text = `- [ ] **A1.** First.
- [ ] **A2.** Second.
- [ ] **A1.** Duplicate.
`;
  const r = parseAcceptanceText(text);
  check('dup:warn present', r.warnings.some((w) => w.includes('duplicate')),
    `warnings: ${r.warnings.join(', ')}`);
}

// ─── Group 5: ID gap → warning
{
  const text = `- [ ] **A1.** One.
- [ ] **A3.** Skipped A2.
- [ ] **A4.** Four.
`;
  const r = parseAcceptanceText(text);
  check('gap:warn present', r.warnings.some((w) => w.includes('gap')),
    `warnings: ${r.warnings.join(', ')}`);
}

// ─── Group 6: fenced YAML evidence_spec parsed
{
  const text = `- [ ] **A1.** Selftest passes.
\`\`\`yaml
evidence_kind: exit_code
evidence_spec:
  cmd: node tests/llm_gateway.selftest.mjs
  expect_in_stdout: OK
\`\`\`
- [ ] **A2.** Trace files exist.
\`\`\`yaml
evidence_kind: fs_glob
evidence_spec:
  pattern: atlas/llm_traces/*.json
  min_count: 1
\`\`\`
- [ ] **A3.** Log line written.
\`\`\`yaml
evidence_kind: log_grep
evidence_spec:
  file: atlas/blocks/b.x/checks.log
  pattern: acceptance pass
\`\`\`
`;
  const r = parseAcceptanceText(text);
  check('yaml:3 assertions', r.assertions.length === 3, `got ${r.assertions.length}`);
  check('yaml:A1 exit_code', r.assertions[0]?.evidence_kind === 'exit_code',
    `got ${r.assertions[0]?.evidence_kind}`);
  check('yaml:A1 spec.cmd', r.assertions[0]?.evidence_spec?.cmd === 'node tests/llm_gateway.selftest.mjs');
  check('yaml:A2 fs_glob', r.assertions[1]?.evidence_kind === 'fs_glob');
  check('yaml:A2 min_count=1', r.assertions[1]?.evidence_spec?.min_count === 1);
  check('yaml:A3 log_grep', r.assertions[2]?.evidence_kind === 'log_grep');
  check('yaml:no warnings', r.warnings.length === 0,
    `warnings: ${r.warnings.join(', ')}`);
}

// ─── Group 7: invalid evidence_kind → warning, default applied
{
  const text = `- [ ] **A1.** Bad kind.
\`\`\`yaml
evidence_kind: human_check
evidence_spec:
  note: ask the operator
\`\`\`
`;
  const r = parseAcceptanceText(text);
  check('invalid_kind:warn present',
    r.warnings.some((w) => w.includes('invalid evidence_kind')),
    `warnings: ${r.warnings.join(', ')}`);
  check('invalid_kind:default applied', r.assertions[0]?.evidence_kind === 'llm_judge',
    `got ${r.assertions[0]?.evidence_kind}`);
}

// ─── Group 8: malformed YAML → warning, default kind
{
  const text = `- [ ] **A1.** Bad yaml.
\`\`\`yaml
this is not yaml at all just text without colons
\`\`\`
`;
  const r = parseAcceptanceText(text);
  check('malformed:warn present',
    r.warnings.some((w) => w.includes('malformed YAML')),
    `warnings: ${r.warnings.join(', ')}`);
  check('malformed:default kind', r.assertions[0]?.evidence_kind === 'llm_judge');
}

// ─── Group 9: empty file
{
  const r = parseAcceptanceText('');
  check('empty:no assertions', r.assertions.length === 0);
  check('empty:warn present', r.warnings.some((w) => w.includes('no assertions')),
    `warnings: ${r.warnings.join(', ')}`);
}

if (failures.length) {
  console.error('parse_acceptance.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('parse_acceptance.selftest: OK (9 test groups, all assertions green)');

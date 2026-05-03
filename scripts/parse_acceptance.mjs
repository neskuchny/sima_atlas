#!/usr/bin/env node
// PR-1 (b.acceptance-verifier-loop): strict parser for atlas/blocks/<id>/acceptance.md.
//
// Format (mandatory):
//   - [ ] **A1.** <assertion text>
//   - [x] **A2 (label).** <assertion text>
// Optional fenced YAML block immediately after the bullet (before the next
// bullet or section header) with structured evidence spec:
//   ```yaml
//   evidence_kind: exit_code
//   evidence_spec:
//     cmd: node tests/llm_gateway.selftest.mjs
//     expect_in_stdout: "OK"
//   ```
//
// Supported evidence_kind values: exit_code, fs_glob, file_diff, log_grep,
// selftest_run, llm_judge (default when not specified).
//
// API:
//   import { parseAcceptance, parseAcceptanceText } from './parse_acceptance.mjs';
//   const r = parseAcceptance('b.llm-gateway');
//   r → { block_id, source_path, assertions: [...], warnings: [...] }
//
// CLI:
//   node scripts/parse_acceptance.mjs <block_id> [--json]

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const VALID_EVIDENCE_KINDS = new Set([
  'exit_code', 'fs_glob', 'file_diff', 'log_grep', 'selftest_run', 'llm_judge',
]);

const DEFAULT_EVIDENCE_KIND = 'llm_judge';

// Bullet pattern. Captures:
//   1: checkbox content (' ' or 'x' or 'X')
//   2: assertion id (A1..AN)
//   3: optional label inside parens
//   4: rest of line (the assertion text after **A1.**)
const BULLET_RE = /^- \[([ xX])\] \*\*([A-Z]\d+)(?:\s*\(([^)]+)\))?\.\*\*\s*(.*)$/;

// Section headers that mark "no more assertions" (like `## Что считается NOT acceptance`).
const SECTION_HEADER_RE = /^#{1,6}\s+/;

function parseYamlSimple(yamlBody) {
  // Minimal YAML parser tailored to the evidence_spec subset we accept.
  // Supports:
  //   key: value
  //   key:
  //     subkey: value
  //   key: "quoted with : colons"
  // Returns null on syntactic anomaly the caller should surface as warning.
  const out = {};
  const lines = yamlBody.split(/\r?\n/);
  let currentKey = null;
  let currentObj = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const indent = line.match(/^( +)/)?.[1].length || 0;
    const content = line.trim();
    const colonIdx = content.indexOf(':');
    if (colonIdx === -1) return null;
    const key = content.slice(0, colonIdx).trim();
    let value = content.slice(colonIdx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (indent === 0) {
      if (value === '') {
        currentKey = key;
        currentObj = {};
        out[key] = currentObj;
      } else {
        out[key] = coerce(value);
        currentKey = null;
        currentObj = null;
      }
    } else if (currentObj) {
      currentObj[key] = coerce(value);
    } else {
      return null;
    }
  }
  return out;
}

function coerce(v) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v === 'null') return null;
  if (/^-?\d+$/.test(v)) return Number(v);
  if (/^-?\d+\.\d+$/.test(v)) return Number(v);
  return v;
}

export function parseAcceptanceText(text, sourceLabel = '<inline>') {
  const lines = text.split(/\r?\n/);
  const assertions = [];
  const warnings = [];
  const seenIds = new Set();

  let stoppedAtSection = -1;
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Stop at the first section header AFTER we've seen at least one bullet.
    // (We tolerate headers above the bullets — title `# block — acceptance`.)
    if (assertions.length && SECTION_HEADER_RE.test(line)) {
      stoppedAtSection = i;
      break;
    }
    const m = line.match(BULLET_RE);
    if (!m) { i += 1; continue; }
    const [, checkboxRaw, id, label, textRaw] = m;
    if (seenIds.has(id)) {
      warnings.push(`duplicate assertion id ${id} at line ${i + 1}`);
    }
    seenIds.add(id);

    // Look ahead for fenced YAML block immediately after this bullet.
    let evidence_kind = DEFAULT_EVIDENCE_KIND;
    let evidence_spec = null;
    let yamlConsumed = 0;
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j += 1;
    if (lines[j] && /^```ya?ml\s*$/i.test(lines[j].trim())) {
      const start = j + 1;
      let end = start;
      while (end < lines.length && !/^```\s*$/.test(lines[end].trim())) end += 1;
      if (end < lines.length) {
        const yamlBody = lines.slice(start, end).join('\n');
        const parsed = parseYamlSimple(yamlBody);
        if (parsed) {
          if (typeof parsed.evidence_kind === 'string') {
            if (VALID_EVIDENCE_KINDS.has(parsed.evidence_kind)) {
              evidence_kind = parsed.evidence_kind;
            } else {
              warnings.push(`invalid evidence_kind "${parsed.evidence_kind}" for ${id} at line ${start + 1}`);
            }
          }
          if (parsed.evidence_spec && typeof parsed.evidence_spec === 'object') {
            evidence_spec = parsed.evidence_spec;
          }
          yamlConsumed = (end - i);
        } else {
          warnings.push(`malformed YAML block for ${id} at line ${start + 1}`);
        }
      } else {
        warnings.push(`unterminated YAML fence for ${id} at line ${j + 1}`);
      }
    }

    assertions.push({
      id,
      label: label || null,
      text: textRaw.trim(),
      checked: checkboxRaw.toLowerCase() === 'x',
      line: i + 1,
      evidence_kind,
      evidence_spec,
    });

    i = yamlConsumed ? i + yamlConsumed + 1 : i + 1;
  }

  // Sanity warnings
  if (!assertions.length) {
    warnings.push(`no assertions parsed from ${sourceLabel}`);
  }
  // Sequential ID check (A1, A2, A3 — gaps allowed but warned)
  const numericIds = assertions.map((a) => Number(a.id.slice(1))).sort((x, y) => x - y);
  for (let k = 1; k < numericIds.length; k++) {
    if (numericIds[k] !== numericIds[k - 1] + 1) {
      warnings.push(`assertion id gap between A${numericIds[k - 1]} and A${numericIds[k]} in ${sourceLabel}`);
    }
  }

  return { assertions, warnings, stopped_at_section_line: stoppedAtSection };
}

export function parseAcceptance(blockId, atlasRoot) {
  const root = atlasRoot || path.join(ROOT, 'atlas');
  const sourcePath = path.join(root, 'blocks', blockId, 'acceptance.md');
  if (!fs.existsSync(sourcePath)) {
    return { block_id: blockId, source_path: sourcePath, assertions: [], warnings: [`acceptance.md missing: ${sourcePath}`] };
  }
  const text = fs.readFileSync(sourcePath, 'utf8');
  const parsed = parseAcceptanceText(text, sourcePath);
  return { block_id: blockId, source_path: sourcePath, ...parsed };
}

// ────────────────────── CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const blockId = argv[0];
  if (!blockId) {
    console.error('Usage: node scripts/parse_acceptance.mjs <block_id> [--json]');
    process.exit(1);
  }
  const r = parseAcceptance(blockId);
  if (argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    console.log(`${blockId}: ${r.assertions.length} assertions, ${r.warnings.length} warnings`);
    for (const a of r.assertions) {
      const tick = a.checked ? '[x]' : '[ ]';
      const lbl = a.label ? ` (${a.label})` : '';
      console.log(`  ${tick} ${a.id}${lbl} kind=${a.evidence_kind}: ${a.text.slice(0, 80)}${a.text.length > 80 ? '…' : ''}`);
    }
    for (const w of r.warnings) console.log(`  ⚠ ${w}`);
  }
}

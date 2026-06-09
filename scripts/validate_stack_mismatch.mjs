#!/usr/bin/env node
// PR2: detect cross-language stack mismatches — a block declaring `tech_stack: [react]`
// but containing `.py` files in files.md is flagged as drift with reason: stack_mismatch.
//
// Writes its findings into the `stackMismatch` section of atlas/sync_report.json.

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlasRoot = path.join(root, 'atlas');
const blocksRoot = path.join(atlasRoot, 'blocks');
const graph = JSON.parse(fs.readFileSync(path.join(atlasRoot, 'graph.json'), 'utf8'));

// File extensions that strongly fingerprint a specific non-JS language ecosystem
const LANG_FINGERPRINTS = {
  python:  ['.py', '.pyx', '.pyi'],
  ruby:    ['.rb', '.erb', '.rake', '.gemspec'],
  go:      ['.go'],
  rust:    ['.rs'],
  java:    ['.java'],
  kotlin:  ['.kt', '.kts'],
  swift:   ['.swift'],
  csharp:  ['.cs'],
  php:     ['.php'],
  elixir:  ['.ex', '.exs'],
  haskell: ['.hs'],
  scala:   ['.scala'],
};

// All stacks that belong to the JS/Node/Web ecosystem
const JS_ECOSYSTEM = new Set([
  'react', 'vue', 'angular', 'svelte', 'preact',
  'nodejs', 'node', 'esm', 'commonjs',
  'typescript', 'javascript', 'babel-standalone', 'babel',
  'nextjs', 'next', 'nuxt', 'remix', 'astro',
  'fastify', 'express', 'koa', 'hono',
  'zod', 'drizzle-orm', 'prisma', 'typeorm',
  'sqlite', 'postgresql', 'mysql',
  'vitest', 'jest', 'mocha', 'chai',
  'pino', 'winston',
  'mcp', 'anthropic-api', 'google-genai-api',
  'session-cookies', 'jwt',
  'filesystem', 'json', 'markdown',
]);

function detectEcosystems(techStack) {
  const ecosystems = new Set();
  for (const tech of (techStack || [])) {
    const lower = tech.toLowerCase();
    if (JS_ECOSYSTEM.has(lower) || lower.includes('typescript') || lower.includes('javascript')) {
      ecosystems.add('js');
    }
    for (const lang of Object.keys(LANG_FINGERPRINTS)) {
      if (lower === lang || lower.startsWith(lang + '-') || lower.startsWith(lang + '_')) {
        ecosystems.add(lang);
      }
    }
  }
  return ecosystems;
}

// Returns [{path, line}] entries from files.md (same format as validate_files_registry.mjs)
function parseFilesMd(filesPath) {
  if (!fs.existsSync(filesPath)) return [];
  const lines = fs.readFileSync(filesPath, 'utf8').split(/\r?\n/);
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('- ')) continue;
    if (/^- \(none/i.test(line)) continue;
    const m = line.match(/^- (.+?)\s*\[(alive|archived|dead|pending)\]/i);
    if (!m) continue;
    entries.push({ filePath: m[1].trim(), lineNum: i + 1 });
  }
  return entries;
}

const drifts = [];

for (const b of (graph.blocks || [])) {
  const techStack = b.tech_stack || [];
  if (!techStack.length) continue;

  const filesPath = path.join(blocksRoot, b.id, 'files.md');
  const fileEntries = parseFilesMd(filesPath);
  if (!fileEntries.length) continue;

  const ecosystems = detectEcosystems(techStack);
  const blockIssues = [];

  for (const { filePath, lineNum } of fileEntries) {
    const ext = path.extname(filePath).toLowerCase();
    if (!ext) continue;

    for (const [lang, exts] of Object.entries(LANG_FINGERPRINTS)) {
      if (!exts.includes(ext)) continue;
      // This file belongs to a language ecosystem not declared in tech_stack
      if (!ecosystems.has(lang)) {
        blockIssues.push({
          type: 'stack_mismatch',
          message: `file "${filePath}" has extension "${ext}" (${lang}) but tech_stack declares [${techStack.join(', ')}]`,
          file: path.relative(root, filesPath).replace(/\\/g, '/'),
          line: lineNum,
        });
      }
    }
  }

  if (blockIssues.length) {
    drifts.push({ blockId: b.id, status: 'drift', reason: 'stack_mismatch', issues: blockIssues });
  }
}

// Merge findings into atlas/sync_report.json
const reportPath = path.join(atlasRoot, 'sync_report.json');
let report = {};
if (fs.existsSync(reportPath)) {
  try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch { report = {}; }
}
report.stackMismatch = {
  checkedAt: new Date().toISOString(),
  driftCount: drifts.length,
  details: drifts,
};
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');

if (drifts.length) {
  console.log(`Stack mismatch validation: ${drifts.length} block(s) with cross-language drift`);
  for (const d of drifts) {
    console.log(`  - ${d.blockId}: ${d.reason}`);
    for (const issue of d.issues) {
      console.log(`      ${issue.file}:${issue.line} — ${issue.message}`);
    }
  }
} else {
  console.log('Stack mismatch validation: OK');
}

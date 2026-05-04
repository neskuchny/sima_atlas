#!/usr/bin/env node
// PR-3 (b.user-docs-generator): selftest for scripts/take_screenshots.mjs
// + the integration into generate_user_docs.mjs.
//
// 7 test groups:
//  1. detectPlaywright returns {available:false} on this repo (no
//     playwright.config + no @playwright/test installed)
//  2. slugifyRoute handles parametric, root, and nested paths
//  3. expectedScreenshots returns N entries for N <Route> declarations
//  4. tryCapture returns status=skipped with "no routes" reason for a
//     block without routes (e.g. b.llm-gateway)
//  5. tryCapture returns status=skipped with playwright-unavailable
//     reason for a block WITH routes (synthetic fixture)
//  6. cleanupOrphanScreenshots removes files for inactive blocks AND
//     drops their manifest entries; preserves files for active blocks
//  7. generate_user_docs end-to-end: warnings empty when route-less
//     block (skip is benign); meta records screenshots: {status:skipped}

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectPlaywright, slugifyRoute, expectedScreenshots, tryCapture,
  cleanupOrphanScreenshots,
} from '../scripts/take_screenshots.mjs';
import { introspectBlock } from '../scripts/introspect_block_ui.mjs';
import { generateUserDocs } from '../scripts/generate_user_docs.mjs';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(REPO_ROOT, 'atlas');

const failures = [];
function check(name, cond, detail = '') { if (!cond) failures.push(`${name}${detail ? ' — ' + detail : ''}`); }

const docsRoot = path.join(ATLAS, 'docs', 'end-user');

function cleanupDocsDir() { if (fs.existsSync(docsRoot)) fs.rmSync(docsRoot, { recursive: true }); }

try {
  cleanupDocsDir();

  // ─── Group 1: detectPlaywright on bare repo
  {
    const r = detectPlaywright();
    check('group1:available false', r.available === false);
    check('group1:reason mentions playwright', /playwright/.test(r.reason),
      `reason=${r.reason}`);
  }

  // ─── Group 2: slugifyRoute
  {
    check('group2:root path', slugifyRoute('/') === 'root');
    check('group2:empty path', slugifyRoute('') === 'root');
    check('group2:simple path', slugifyRoute('/tasks') === 'tasks');
    check('group2:nested path', slugifyRoute('/users/profile') === 'users-profile');
    check('group2:parametric', slugifyRoute('/tasks/:id') === 'tasks-param-id');
    check('group2:special chars stripped', slugifyRoute('/api/v1.0?x=1') === 'api-v1_0_x_1',
      `got: ${slugifyRoute('/api/v1.0?x=1')}`);
  }

  // ─── Group 3: expectedScreenshots
  {
    const intro = { routes: [{ path: '/tasks' }, { path: '/tasks/:id' }, { path: '/' }] };
    const r = expectedScreenshots('b.synth-shots', intro);
    check('group3:count=3', r.length === 3);
    check('group3:slugs', r.map((x) => x.slug).join(',') === 'tasks,tasks-param-id,root');
    check('group3:files have block_id prefix', r.every((x) => path.basename(x.file).startsWith('b.synth-shots__')));
  }

  // ─── Group 4: tryCapture skip "no routes"
  {
    // b.llm-gateway has zero <Route> elements (proposals_panel.jsx is the
    // only alive JSX). expectedScreenshots returns []. status=skipped.
    const intro = introspectBlock('b.llm-gateway');
    const r = tryCapture('b.llm-gateway', intro);
    check('group4:skipped', r.status === 'skipped');
    check('group4:reason no routes', /no routes/.test(r.reason),
      `reason=${r.reason}`);
    check('group4:zero screenshots', r.screenshots.length === 0);
  }

  // ─── Group 5: tryCapture skip "playwright unavailable" with routes
  {
    const intro = { routes: [{ path: '/tasks' }, { path: '/users' }] };
    const r = tryCapture('b.synth-routes', intro);
    check('group5:skipped on missing playwright', r.status === 'skipped');
    check('group5:reason cites unavailable',
      /playwright unavailable/.test(r.reason),
      `reason=${r.reason}`);
  }

  // ─── Group 6: cleanupOrphanScreenshots
  {
    fs.mkdirSync(path.join(docsRoot, '_screenshots'), { recursive: true });
    const dir = path.join(docsRoot, '_screenshots');
    const active = path.join(dir, 'b.active__tasks.png');
    const orphan = path.join(dir, 'b.removed__main.png');
    fs.writeFileSync(active, 'fakePNG');
    fs.writeFileSync(orphan, 'fakePNG');
    // Manifest with both
    fs.writeFileSync(path.join(dir, '_manifest.json'), JSON.stringify({
      entries: [
        { block_id: 'b.active', routes: [{ path: '/tasks', slug: 'tasks' }] },
        { block_id: 'b.removed', routes: [{ path: '/main', slug: 'main' }] },
      ],
    }));
    const r = cleanupOrphanScreenshots(['b.active']);
    check('group6:1 removed', r.removed.length === 1, `removed=${r.removed.length}`);
    check('group6:active preserved', fs.existsSync(active));
    check('group6:orphan removed', !fs.existsSync(orphan));
    const m = JSON.parse(fs.readFileSync(path.join(dir, '_manifest.json'), 'utf8'));
    check('group6:manifest pruned to 1 entry', m.entries.length === 1 && m.entries[0].block_id === 'b.active',
      `manifest=${JSON.stringify(m)}`);
    cleanupDocsDir();
  }

  // ─── Group 7: end-to-end via generate_user_docs (route-less block → benign skip)
  {
    const r = await generateUserDocs({ block_id: 'b.llm-gateway' });
    check('group7:status written', r.status === 'written');
    // No-routes skip is benign — should NOT add a "screenshots skipped" warning
    check('group7:no warning for route-less skip',
      !(r.warnings || []).some((w) => /screenshots skipped/.test(w)),
      `warnings=${JSON.stringify(r.warnings)}`);
    const meta = JSON.parse(fs.readFileSync(path.join(docsRoot, '_meta', 'b.llm-gateway.json'), 'utf8'));
    check('group7:meta carries skipped status',
      meta.screenshots && meta.screenshots.status === 'skipped',
      `meta.screenshots=${JSON.stringify(meta.screenshots)}`);
  }
} finally {
  cleanupDocsDir();
}

if (failures.length) {
  console.error('screenshots_integration.selftest: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('screenshots_integration.selftest: OK (7 test groups, all assertions green)');

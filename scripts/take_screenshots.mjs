#!/usr/bin/env node
// PR-3 (b.user-docs-generator): Playwright screenshot integration.
//
// MUST work without Playwright installed — when no playwright.config.* and
// no @playwright/test in node_modules, we skip gracefully (no fail), so
// generate_user_docs.mjs always produces a valid markdown even on bare
// repos.
//
// When Playwright IS available, the orchestrator:
//   1. writes a JSON manifest atlas/docs/end-user/_screenshots/_manifest.json
//      listing {block_id, routes: [{path, slug}]} entries the operator wants
//      captured;
//   2. invokes `npx playwright test tests/playwright/user_docs_screenshots.
//      spec.ts` which reads that manifest, opens each route under the
//      configured baseURL, and saves PNGs as
//      atlas/docs/end-user/_screenshots/<block_id>__<slug>.png
//   3. appends `![alt](./_screenshots/<block>__<slug>.png)` references into
//      the generated markdown.
//
// API:
//   import { detectPlaywright, tryCapture, cleanupOrphanScreenshots,
//            slugifyRoute } from './take_screenshots.mjs';
//   detectPlaywright()  → { available: bool, reason: string }
//   tryCapture(blockId, introspection)
//                       → { status: 'captured'|'skipped'|'failed',
//                           reason, screenshots: [{path, slug, route}] }
//   cleanupOrphanScreenshots(activeBlockIds) → { removed: [...] }
//
// CLI:
//   node scripts/take_screenshots.mjs detect
//   node scripts/take_screenshots.mjs cleanup
//   node scripts/take_screenshots.mjs run <block_id>

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { introspectBlock } from './introspect_block_ui.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = process.env.ATLAS_ROOT || path.join(ROOT, 'atlas');
const SCREENSHOTS_DIR = path.join(ATLAS, 'docs', 'end-user', '_screenshots');

export function detectPlaywright({ repo_root } = {}) {
  const root = repo_root || ROOT;
  // 1. Check for playwright.config.{js,ts,mjs,cjs}
  const configCandidates = ['playwright.config.js', 'playwright.config.ts', 'playwright.config.mjs', 'playwright.config.cjs'];
  const configFound = configCandidates.find((c) => fs.existsSync(path.join(root, c)));
  // 2. Check node_modules/@playwright/test or node_modules/playwright
  const modCandidates = ['node_modules/@playwright/test/package.json', 'node_modules/playwright/package.json'];
  const modFound = modCandidates.find((m) => fs.existsSync(path.join(root, m)));
  if (configFound && modFound) {
    return { available: true, reason: `config=${configFound}, module=${modFound}` };
  }
  if (!modFound && !configFound) {
    return { available: false, reason: 'no playwright.config.* and no @playwright/test in node_modules' };
  }
  if (!modFound) {
    return { available: false, reason: `playwright config exists (${configFound}) but @playwright/test is not installed` };
  }
  return { available: false, reason: 'no playwright.config.* in repo root' };
}

export function slugifyRoute(routePath) {
  if (!routePath) return 'root';
  return String(routePath)
    .replace(/^\/+|\/+$/g, '')
    .replace(/\//g, '-')
    .replace(/:/g, 'param-')
    .replace(/[^a-zA-Z0-9-_]/g, '_')
    .replace(/_+/g, '_')
    || 'root';
}

function manifestPath() { return path.join(SCREENSHOTS_DIR, '_manifest.json'); }

function readManifest() {
  if (!fs.existsSync(manifestPath())) return { entries: [] };
  try { return JSON.parse(fs.readFileSync(manifestPath(), 'utf8')); }
  catch { return { entries: [] }; }
}

function writeManifest(manifest) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  fs.writeFileSync(manifestPath(), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
}

function upsertManifestEntry(blockId, routes) {
  const m = readManifest();
  m.entries = (m.entries || []).filter((e) => e.block_id !== blockId);
  m.entries.push({
    block_id: blockId,
    routes: routes.map((r) => ({ path: r.path, slug: slugifyRoute(r.path) })),
    updated_at: new Date().toISOString(),
  });
  writeManifest(m);
}

export function expectedScreenshots(blockId, introspection) {
  // Set of routes worth capturing: routes from <Route path="...">,
  // plus distinct fetch URLs that map to navigable paths (heuristic: paths
  // starting with `/` and not containing `:` placeholders).
  const routes = (introspection.routes || []).map((r) => ({ path: r.path }));
  return routes.map((r) => ({
    block_id: blockId,
    route: r.path,
    slug: slugifyRoute(r.path),
    file: path.join(SCREENSHOTS_DIR, `${blockId}__${slugifyRoute(r.path)}.png`),
  }));
}

export function tryCapture(blockId, introspection, opts = {}) {
  const t0 = Date.now();
  const det = detectPlaywright({ repo_root: opts.repo_root });
  const expected = expectedScreenshots(blockId, introspection);
  if (!expected.length) {
    return { status: 'skipped', reason: 'no routes to capture (block has no <Route> elements)', screenshots: [], duration_ms: Date.now() - t0 };
  }
  if (!det.available) {
    return { status: 'skipped', reason: `playwright unavailable: ${det.reason}`, screenshots: [], duration_ms: Date.now() - t0 };
  }
  // Persist what we WANT to capture; the playwright spec reads the manifest.
  upsertManifestEntry(blockId, introspection.routes || []);
  // Spawn `npx playwright test` filtered to our spec
  const r = spawnSync('npx', ['playwright', 'test', 'tests/playwright/user_docs_screenshots.spec.ts',
    '--grep', blockId], {
    cwd: opts.repo_root || ROOT,
    encoding: 'utf8',
    timeout: 90_000,
    env: { ...process.env, ATLAS_USER_DOCS_BLOCK: blockId },
  });
  if (r.status !== 0) {
    return {
      status: 'failed',
      reason: `npx playwright test exited ${r.status}: ${(r.stderr || '').slice(0, 300)}`,
      screenshots: [],
      duration_ms: Date.now() - t0,
    };
  }
  // Inspect produced files
  const produced = expected.filter((e) => fs.existsSync(e.file));
  return {
    status: produced.length ? 'captured' : 'failed',
    reason: produced.length
      ? `${produced.length}/${expected.length} screenshots saved`
      : 'playwright exited 0 but no PNGs produced — check spec',
    screenshots: produced,
    duration_ms: Date.now() - t0,
  };
}

export function cleanupOrphanScreenshots(activeBlockIds, opts = {}) {
  const dir = SCREENSHOTS_DIR;
  if (!fs.existsSync(dir)) return { removed: [], scanned: 0 };
  const active = new Set(activeBlockIds || []);
  const removed = [];
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.png')) continue;
    // Filename convention: <block_id>__<slug>.png
    const blockId = f.split('__')[0];
    if (!blockId.startsWith('b.')) continue;
    if (active.has(blockId)) continue;
    const full = path.join(dir, f);
    if (!opts.dry_run) try { fs.unlinkSync(full); } catch {}
    removed.push(full);
  }
  // Manifest cleanup
  const m = readManifest();
  if (Array.isArray(m.entries)) {
    const before = m.entries.length;
    m.entries = m.entries.filter((e) => active.has(e.block_id));
    if (m.entries.length !== before && !opts.dry_run) writeManifest(m);
  }
  return { removed, scanned: fs.readdirSync(dir).filter((f) => f.endsWith('.png')).length };
}

export function activeBlockIdsFromGraph() {
  const out = new Set();
  const main = path.join(ATLAS, 'graph.json');
  if (fs.existsSync(main)) {
    try {
      const j = JSON.parse(fs.readFileSync(main, 'utf8'));
      for (const b of (j.blocks || [])) if (b.id) out.add(b.id);
    } catch {}
  }
  const projDir = path.join(ATLAS, 'projects');
  if (fs.existsSync(projDir)) {
    for (const proj of fs.readdirSync(projDir)) {
      const g = path.join(projDir, proj, 'graph.json');
      if (!fs.existsSync(g)) continue;
      try {
        const j = JSON.parse(fs.readFileSync(g, 'utf8'));
        for (const b of (j.blocks || [])) if (b.id) out.add(b.id);
      } catch {}
    }
  }
  return Array.from(out);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (cmd === 'detect') {
    const r = detectPlaywright();
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.available ? 0 : 0);
  } else if (cmd === 'cleanup') {
    const ids = activeBlockIdsFromGraph();
    const r = cleanupOrphanScreenshots(ids, { dry_run: argv.includes('--dry-run') });
    console.log(`take_screenshots cleanup: removed ${r.removed.length}, scanned ${r.scanned}`);
    for (const f of r.removed) console.log(`  - ${path.relative(ROOT, f)}`);
  } else if (cmd === 'run') {
    const blockId = argv[1];
    if (!blockId) { console.error('Usage: take_screenshots run <block_id>'); process.exit(1); }
    const intro = introspectBlock(blockId);
    const r = tryCapture(blockId, intro);
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.status === 'failed' ? 0 : 0); // info-only
  } else {
    console.error('Usage:');
    console.error('  node scripts/take_screenshots.mjs detect');
    console.error('  node scripts/take_screenshots.mjs cleanup [--dry-run]');
    console.error('  node scripts/take_screenshots.mjs run <block_id>');
    process.exit(1);
  }
}

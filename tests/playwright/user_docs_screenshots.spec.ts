// PR-3 (b.user-docs-generator): Playwright spec for end-user screenshots.
//
// This file is a TEMPLATE — it only runs when:
//   * @playwright/test is installed (npm i -D @playwright/test)
//   * playwright.config.{js,ts} exists with a baseURL pointing at the
//     running app (e.g. http://localhost:3000)
//
// scripts/take_screenshots.mjs detects Playwright availability before
// invoking this spec; without Playwright the orchestrator skips silently
// and the spec file is simply unused.
//
// Behaviour:
//   1. Read the manifest at atlas/docs/end-user/_screenshots/_manifest.json
//      (written by take_screenshots.mjs::upsertManifestEntry).
//   2. For each block_id, navigate to each route and capture a PNG
//      <block_id>__<slug>.png next to the manifest.
//   3. Filterable via `--grep <block_id>` so generate_user_docs can
//      capture only the block it just regenerated.
//
// Lint note: this file imports from @playwright/test which isn't installed
// in this repo by default. The import is inside try/catch elsewhere; here
// we just declare it. CI will skip this spec entirely until Playwright
// arrives.

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOTS_DIR = path.resolve('atlas/docs/end-user/_screenshots');
const MANIFEST_PATH = path.join(SCREENSHOTS_DIR, '_manifest.json');

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return { entries: [] };
  try { return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')); }
  catch { return { entries: [] }; }
}

const manifest = readManifest();

// ATLAS_USER_DOCS_BLOCK env (set by take_screenshots tryCapture) restricts
// the run to a single block; absent → capture all known.
const onlyBlock = process.env.ATLAS_USER_DOCS_BLOCK || null;

for (const entry of (manifest.entries || [])) {
  if (onlyBlock && entry.block_id !== onlyBlock) continue;

  test.describe(`screenshots: ${entry.block_id}`, () => {
    for (const route of (entry.routes || [])) {
      // Skip parametric routes — we can't navigate to /tasks/:id without a
      // real id; PR-4 will add fixture-route resolution.
      if (String(route.path).includes(':')) continue;

      test(`${entry.block_id} → ${route.path}`, async ({ page }) => {
        await page.goto(route.path);
        // Wait for network to settle so the page paints before capture.
        await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {});
        const file = path.join(SCREENSHOTS_DIR, `${entry.block_id}__${route.slug}.png`);
        fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
        await page.screenshot({ path: file, fullPage: true });
        await expect(fs.existsSync(file), `screenshot saved: ${file}`).toBeTruthy();
      });
    }
  });
}

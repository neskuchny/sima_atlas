#!/usr/bin/env node
// R-7.51 — capture the README hero image with Playwright.
//
// Usage (after `npm run dev` is running in another terminal):
//
//   node scripts/capture_hero_screenshot.mjs
//
// What it does:
//   1. Launches headless Chromium via @playwright/test (already a devDep)
//   2. Visits http://localhost:8000/atlas_design/index.html?client=example
//      (the populated 5-block habit-tracker — the demo we want visitors
//      to see in the README hero, not the empty Sima-meta canvas)
//   3. Waits for the canvas to render (network-idle + 1.5s buffer for
//      the React tree + first refresh of /atlas/design-payload)
//   4. Screenshots the viewport at 1280×720 and writes to
//      tests/playwright/screenshots/sima_design_live.png — the path
//      already referenced by README.md hero
//
// Why a script and not a Playwright test: this is a one-shot artifact
// for marketing, not a regression check; runs explicitly on demand.

import { chromium } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const OUT = path.join(ROOT, 'tests/playwright/screenshots/sima_design_live.png');
const URL = process.env.HERO_URL || 'http://localhost:8000/atlas_design/index.html?client=example';

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  console.log(`[hero] launching chromium`);
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();

  console.log(`[hero] visiting ${URL}`);
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (e) {
    console.error(`[hero] failed to load ${URL} — is \`npm run dev\` running?`);
    console.error(`[hero]   ${e.message}`);
    await browser.close();
    process.exit(1);
  }

  // Wait for the React tree + first design-payload refresh to settle.
  await page.waitForTimeout(1500);

  // Optionally close any onboarding/banner overlays that might cover the canvas.
  try {
    await page.evaluate(() => {
      document.querySelectorAll('.cmd-bar, .onboard-overlay').forEach((el) => el.remove());
    });
  } catch {}

  console.log(`[hero] screenshotting → ${path.relative(ROOT, OUT)}`);
  await page.screenshot({ path: OUT, type: 'png' });
  await browser.close();

  const stat = fs.statSync(OUT);
  console.log(`[hero] done · ${stat.size.toLocaleString()} bytes · 1280x720`);
  console.log(`[hero] commit & push: README.md will pick up the new image automatically`);
})();

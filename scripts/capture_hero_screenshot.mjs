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
  const browser = await chromium.launch({
    args: ['--ignore-certificate-errors', '--disable-web-security'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  // Surface console errors so headless render issues are obvious
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error(`[hero][console.error] ${msg.text()}`);
  });
  page.on('pageerror', (err) => console.error(`[hero][pageerror] ${err.message}`));

  console.log(`[hero] visiting ${URL}`);
  try {
    await page.goto(URL, { waitUntil: 'networkidle', timeout: 30_000 });
  } catch (e) {
    console.error(`[hero] failed to load ${URL} — is \`npm run dev\` running?`);
    console.error(`[hero]   ${e.message}`);
    await browser.close();
    process.exit(1);
  }

  // The canvas is rendered by React+Babel-in-browser; first paint after
  // networkidle still has babel parsing JSX from CDN. Wait for the canvas
  // root + at least one rendered node before screenshotting.
  console.log(`[hero] waiting for canvas node to render`);
  try {
    await page.waitForSelector('.node, .module-card, [data-mid]', { timeout: 25_000 });
  } catch {
    console.warn(`[hero] no .node selector after 25s — screenshot may show empty canvas`);
  }
  // Settle: data-payload first refresh + edge animations
  await page.waitForTimeout(2500);

  // Close any onboarding / cmd-bar overlays that would cover the canvas.
  // .onboarding is the K1 5-step welcome tour; localStorage persists
  // skip state so subsequent runs don't show it.
  try {
    await page.evaluate(() => {
      document.querySelectorAll('.onboarding, .cmd-bar, .onb-card, .composer-overlay').forEach((el) => el.remove());
      localStorage.setItem('sima.onboarding.dismissed', '1');
    });
  } catch {}
  // Allow re-render after overlay removal
  await page.waitForTimeout(500);

  console.log(`[hero] screenshotting → ${path.relative(ROOT, OUT)}`);
  await page.screenshot({ path: OUT, type: 'png' });
  await browser.close();

  const stat = fs.statSync(OUT);
  console.log(`[hero] done · ${stat.size.toLocaleString()} bytes · 1280x720`);
  console.log(`[hero] commit & push: README.md will pick up the new image automatically`);
})();

// SIMA Atlas Design UI smoke + screenshot.
//
// Two phases:
//   1. With the atlas_api_server NOT running — the page falls back to
//      data_static.js and still mounts. We capture sima_design_offline.png.
//   2. With the API running — the page fetches /atlas/design-payload and
//      OVERRIDES window.SIMA_DATA before App mounts. We verify
//      window.__SIMA_DATA_SOURCE === 'live' and capture sima_design_live.png.
//
// The Playwright config auto-starts the python static server on port 8000;
// we manage the API server lifecycle explicitly.

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, ChildProcess } from 'node:child_process';

const SHOTS_DIR = path.resolve('tests/playwright/screenshots');

async function gotoDesign(page) {
  await page.goto('/atlas_design/index.html');
  // Babel-standalone transpiles 4 JSX files (~150KB total) at parse time
  // — visible paint takes ~6-12s on a cold cache. Wait for the topbar /
  // canvas to appear, not just for #root to gain children.
  await page.waitForFunction(
    () => {
      const root = document.getElementById('root');
      if (!root || root.children.length === 0) return false;
      // App renders a `<div className="app">` with topbar inside; either is fine
      return !!document.querySelector('.topbar, .canvas-stage, .canvas-tools');
    },
    null, { timeout: 25_000 }
  ).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
  // Extra paint window — fonts arrive after networkidle.
  await page.waitForTimeout(1500);
}

test.describe('SIMA Atlas Design UI', () => {
  test.beforeEach(async () => {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
  });

  test('offline fallback (no API server) loads', async ({ page }) => {
    // Set SIMA_API_BASE to an unreachable host so the loader falls back fast.
    await page.addInitScript(() => {
      (window as any).SIMA_API_BASE = 'http://127.0.0.1:1';
    });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await gotoDesign(page);
    if (errors.length) console.log(`offline console errors:\n${errors.slice(0, 8).join('\n')}`);

    await page.screenshot({ path: path.join(SHOTS_DIR, 'sima_design_offline.png'), fullPage: true });

    // window.SIMA_DATA must exist and have modules from the offline fallback.
    const moduleCount = await page.evaluate(() => (window as any).SIMA_DATA?.modules?.length || 0);
    expect(moduleCount, 'offline fallback provides modules').toBeGreaterThan(0);

    // Source must be 'offline_fallback' or 'missing' (we set unreachable base)
    const source = await page.evaluate(() => (window as any).__SIMA_DATA_SOURCE);
    expect(['offline_fallback', 'missing']).toContain(source);
  });

  test('live API → SIMA_DATA overridden from /atlas/design-payload', async ({ page }) => {
    // Spawn the API server as a child process so we can control lifecycle.
    let api: ChildProcess | null = null;
    try {
      api = spawn('node', ['scripts/atlas_api_server.mjs'], {
        cwd: path.resolve('.'), stdio: 'pipe',
        env: { ...process.env, ATLAS_API_PORT: '8787' },
      });
      // Wait for /health to come up
      const ok = await new Promise<boolean>((resolve) => {
        const t0 = Date.now();
        const tick = async () => {
          try {
            const r = await fetch('http://localhost:8787/health');
            if (r.ok) return resolve(true);
          } catch {}
          if (Date.now() - t0 > 6000) return resolve(false);
          setTimeout(tick, 200);
        };
        tick();
      });
      expect(ok, 'API server should come up on :8787').toBeTruthy();

      await gotoDesign(page);

      // Give data_loader.js up to ~2s to fetch live and re-render.
      await page.waitForFunction(
        () => (window as any).__SIMA_DATA_SOURCE === 'live' || (window as any).__SIMA_DATA_SOURCE === 'live_late' || (window as any).__SIMA_DATA_SOURCE === 'live_polled',
        null, { timeout: 8_000 }
      ).catch(() => {});

      await page.screenshot({ path: path.join(SHOTS_DIR, 'sima_design_live.png'), fullPage: true });

      const source = await page.evaluate(() => (window as any).__SIMA_DATA_SOURCE);
      // We accept any of the live variants; the offline_fallback case here
      // would mean the API didn't respond in time.
      expect(['live', 'live_late', 'live_polled'], `actually got: ${source}`).toContain(source);

      // Live data should reference Atlas's own block ids (b.*)
      const idsAreAtlasBlocks = await page.evaluate(() =>
        ((window as any).SIMA_DATA?.modules || []).some((m: any) => /^b\./.test(m.id))
      );
      expect(idsAreAtlasBlocks, 'modules should carry b.* ids from atlas/graph.json').toBeTruthy();

      // SIMA_API exposes the full surface (blocks + edges + notes + artifacts + claudeAdvice)
      const apiShape = await page.evaluate(() => {
        const a = (window as any).SIMA_API || {};
        return {
          createBlock: typeof a.createBlock,
          patchBlock:  typeof a.patchBlock,
          deleteBlock: typeof a.deleteBlock,
          addEdge:     typeof a.addEdge,
          deleteEdge:  typeof a.deleteEdge,
          addNote:     typeof a.addNote,
          patchNote:   typeof a.patchNote,
          deleteNote:  typeof a.deleteNote,
          artifacts:   typeof a.artifacts,
          artifactsList: typeof a.artifacts?.list,
          artifactsCreate: typeof a.artifacts?.create,
          artifactsDelete: typeof a.artifacts?.delete,
          claudeAdvice: typeof a.claudeAdvice,
        };
      });
      expect(apiShape.createBlock).toBe('function');
      expect(apiShape.patchBlock).toBe('function');
      expect(apiShape.artifactsList).toBe('function');
      expect(apiShape.artifactsCreate).toBe('function');
      expect(apiShape.artifactsDelete).toBe('function');
      expect(apiShape.claudeAdvice).toBe('function');

      // /api/artifacts is real (returns ok:true with array, not 'stub' source)
      const listResp = await page.evaluate(() => (window as any).SIMA_API.artifacts.list());
      expect(listResp).toMatchObject({ ok: true });
      expect(Array.isArray((listResp as any).artifacts)).toBe(true);

      // End-to-end create → list → delete, all from inside the page.
      // Sweep any stragglers from previous failed runs first so we never
      // leak test data into atlas/artifacts/ on disk.
      const e2e = await page.evaluate(async () => {
        const stale = await (window as any).SIMA_API.artifacts.list({ search: 'pw-roundtrip' });
        for (const a of (stale?.artifacts || [])) {
          await (window as any).SIMA_API.artifacts.delete(a.id);
        }
        const c = await (window as any).SIMA_API.artifacts.create({
          kind: 'note',
          title: 'pw-roundtrip',
          body: 'hello',
          tags: ['e2e'],
        });
        const id = c?.artifact?.id;
        const after = await (window as any).SIMA_API.artifacts.list({ search: 'pw-roundtrip' });
        const del = id ? await (window as any).SIMA_API.artifacts.delete(id) : null;
        return { c, after, del };
      });
      expect((e2e as any).c?.ok).toBe(true);
      expect((e2e as any).after?.artifacts?.length).toBeGreaterThanOrEqual(1);
      expect((e2e as any).del?.ok).toBe(true);

      // Topbar pills: artifact / gallery / library / commandbar are present.
      // In sandbox CI the chromium-headless-shell can't validate unpkg.com's
      // cert chain → React/Babel CDN scripts fail to load → no DOM tree.
      // We assert on DOM only when React actually mounted.
      const reactMounted = await page.evaluate(() => !!document.querySelector('.topbar'));
      if (reactMounted) {
        const pills = await page.$$eval('.topbar .pill', (els) => els.map(e => (e.textContent || '').trim()));
        expect(pills.some(p => p.includes('Артефакт'))).toBeTruthy();
        expect(pills.some(p => p.includes('Галерея'))).toBeTruthy();
        expect(pills.some(p => p.includes('Библиотека'))).toBeTruthy();
      } else {
        console.log('skipping DOM-level topbar pill assertions: React did not mount in this environment');
      }
    } finally {
      if (api) {
        api.kill('SIGTERM');
        await new Promise((res) => setTimeout(res, 200));
      }
    }
  });
});

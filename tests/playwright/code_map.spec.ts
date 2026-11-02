// R-8.14 (b.ui-control) — the code map view in a real browser, on the real
// atlas, read-only (writes the canvas would send are answered locally):
//   * «Map» opens the building and folds the side panels to give it room;
//   * pinning a block draws its connections, the rooms at the other ends say
//     how they are connected, and an end scrolled out of view shows up as a
//     chip at the edge — the arrow alone does not tell where it leads;
//   * a connection in the inspector lists what actually crosses it (file,
//     line, imported names);
//   * pinning a file lights the files it is connected to in other blocks;
//   * a live refresh (the whole App re-mounts) keeps the view and the pin;
//   * inside a block every tile says what the file is for; a file opens into
//     its parts and its code, and an import line jumps to the imported file;
//   * the map and the graph open each other at the same block;
//   * R-8.16: a connection through atlas files (the code graph reads the
//     database's graph.json) and through the server (the canvas asks for the
//     map, the server builds it with the code graph) shows what crosses it; a
//     file lists the atlas files it reads and writes; a code line naming
//     another block's file leads to that block;
//   * R-8.17: a data link that would close a cycle is written in calls.md;
//     a long group of a connection folds and opens;
//   * no console errors.
//
// Run: npm run test:ui (SIMA_UI_TEST_CDN_DIR=<dir> serves react.js,
// react-dom.js, babel.js, marked.js and highlight.min.js locally).

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, ChildProcess } from 'node:child_process';

const ROOT = path.resolve('.');
let API_PORT = 0;
const freePort = () => new Promise<number>((resolve, reject) => {
  const srv = net.createServer();
  srv.unref();
  srv.on('error', reject);
  srv.listen(0, '127.0.0.1', () => { const p = (srv.address() as net.AddressInfo).port; srv.close(() => resolve(p)); });
});
const CDN: Record<string, string> = {
  'unpkg.com/react@18.3.1/umd/react.development.js': 'react.js',
  'unpkg.com/react-dom@18.3.1/umd/react-dom.development.js': 'react-dom.js',
  'unpkg.com/@babel/standalone@7.29.0/babel.min.js': 'babel.js',
  'cdn.jsdelivr.net/npm/marked@13.0.3/marked.min.js': 'marked.js',
  'cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js': 'highlight.min.js',
};
let api: ChildProcess | null = null;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  API_PORT = await freePort();
  api = spawn('node', ['scripts/atlas_api_server.mjs'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, ATLAS_API_PORT: String(API_PORT), ATLAS_AGENT: 'print-only' } });
  let serverErr = '';
  api.stderr?.on('data', (d) => { serverErr += String(d); });
  const t0 = Date.now();
  for (;;) {
    try { if ((await fetch(`http://127.0.0.1:${API_PORT}/health`)).ok) break; } catch { /* not up yet */ }
    if (Date.now() - t0 > 20_000) throw new Error(`atlas_api_server did not start on :${API_PORT}\n${serverErr.slice(-800)}`);
    await new Promise((r) => setTimeout(r, 150));
  }
});
test.afterAll(async () => { if (api) api.kill(); });

test('code map: building, pinned connections, file anatomy, back to the graph', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript((port) => {
    (window as any).SIMA_API_BASE = `http://localhost:${port}`;
    try { localStorage.setItem('sima.locale', 'ru'); localStorage.removeItem('sima.tweaks'); } catch { /* storage may be off */ }
  }, API_PORT);
  const cdnDir = process.env.SIMA_UI_TEST_CDN_DIR;
  await page.route('**/*', (route) => {
    const u = route.request().url();
    // read-only on the real atlas
    if (/\/atlas\/(activity-log\/append|checks\/append)/.test(u)) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    if (cdnDir) {
      const hit = Object.keys(CDN).find((k) => u.includes(k));
      if (hit) return route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(cdnDir, CDN[hit])) });
      if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u)) return route.continue();
      return route.abort();
    }
    return route.continue();
  });

  await page.goto('/atlas_design/index.html');
  await page.waitForSelector('[data-mid]', { timeout: 30_000 });
  if (await page.locator('.onb-skip').count()) await page.click('.onb-skip');

  // «Map»: the building, with room to breathe
  await page.click('.view-tabs button:has-text("Карта")');
  await expect(page.locator('[data-room="b.clarify"]')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('aside.detail')).toHaveCount(0);
  await expect(page.locator('.cm-room .cm-tile').first()).toBeVisible();

  // pin a block: arrows, how the other ends are connected
  await page.click('[data-room="b.clarify"] .cm-room-title');
  await expect(page.locator('svg.cm-wires path').first()).toBeAttached();
  await expect(page.locator('[data-room="b.ui-control"] .cm-rel')).toContainText('использует выбранное');
  await expect(page.locator('[data-room="b.llm-gateway"] .cm-rel')).toContainText('выбранное использует его');
  await expect(page.locator('.cm-room.dim').first()).toBeAttached();

  // scroll the building: the ends that left the view stay named at the edge
  await page.evaluate(() => { const sc = document.querySelector('.cm-building .cm-scroll') as HTMLElement; sc.scrollTop = sc.scrollHeight; });
  await expect(page.locator('.cm-edge-chip', { hasText: 'Agent Orchestrator' })).toBeVisible();
  await page.locator('.cm-edge-chip', { hasText: 'Agent Orchestrator' }).click();
  await expect(page.locator('[data-room="b.agent-orchestrator"]')).toBeInViewport();

  // what exactly crosses a connection
  await page.locator('.cm-insp .cm-list button', { hasText: 'Agent Orchestrator' }).first().click();
  await expect(page.locator('.cm-insp')).toContainText('atlas_api_server.mjs:15');
  await expect(page.locator('.cm-insp')).toContainText('blockMeaningSummary');
  await expect(page.locator('.cm-insp')).toContainText('и в коде, и в контракте');
  await expect(page.locator('.cm-insp')).toContainText('depends_on.md — зависимость');

  // R-8.15 — a runtime call «up» the layers is written in calls.md, not depends_on.md
  await page.locator('[data-room="b.db"] .cm-room-title').click();
  await page.locator('.cm-insp .cm-list button', { hasText: 'Acceptance Verifier Loop' }).first().click();
  await expect(page.locator('.cm-insp')).toContainText('change_set.mjs:78');
  await expect(page.locator('.cm-insp')).toContainText('calls.md — использует во время работы');

  // R-8.16 — a connection through atlas files: the code graph reads the database's files
  await page.locator('[data-room="b.code-graph"] .cm-room-title').click();
  await page.locator('.cm-insp .cm-list button', { hasText: 'Atlas Database' }).first().click();
  await expect(page.locator('.cm-insp')).toContainText('данные: файл атласа');
  await expect(page.locator('.cm-insp')).toContainText('atlas/graph.json');
  await expect(page.locator('.cm-insp')).toContainText('и в коде, и в контракте');
  // … and through the server: the canvas asks the server for the map, the server builds it with the code graph
  await page.locator('[data-room="b.ui-control"] .cm-room-title').click();
  await page.locator('.cm-insp .cm-list button', { hasText: 'Code Graph' }).first().click();
  await expect(page.locator('.cm-insp')).toContainText('через сервер');
  await expect(page.locator('.cm-insp')).toContainText('GET /atlas/map');
  // a file lists the atlas files it reads and writes, with their owners
  await page.locator('[data-tile="scripts/atlas_map.mjs"]').click();
  await expect(page.locator('.cm-insp')).toContainText('Файлы атласа, которые он читает и пишет');
  await expect(page.locator('.cm-insp')).toContainText('atlas/code_graph.json');

  // R-8.17 — a data link that would close a cycle is written in calls.md
  await page.locator('[data-room="b.docs"] .cm-room-title').click();
  await page.locator('.cm-insp .cm-list button', { hasText: 'End-User Docs Generator' }).first().click();
  await expect(page.locator('.cm-insp')).toContainText('atlas/docs');
  await expect(page.locator('.cm-insp')).toContainText('calls.md — использует во время работы');
  await expect(page.locator('.cm-insp')).toContainText('и в коде, и в контракте');
  // … and a long group folds: the first rows, then «show N more»
  await page.locator('[data-room="b.agent-orchestrator"] .cm-room-title').click();
  await page.locator('.cm-insp .cm-list button', { hasText: 'Atlas Database' }).first().click();
  const folded = await page.locator('.cm-insp .cm-list li').count();
  await page.locator('.cm-insp .cm-more').first().click();
  expect(await page.locator('.cm-insp .cm-list li').count()).toBeGreaterThan(folded);

  // pin a file: its connections in other blocks light up
  await page.evaluate(() => { (document.querySelector('.cm-building .cm-scroll') as HTMLElement).scrollTop = 0; });
  await page.locator('[data-tile="scripts/block_meaning.mjs"]').click();
  await expect(page.locator('.cm-tile.t-in, .cm-tile.t-out, .cm-tile.t-both')).not.toHaveCount(0);
  expect(await page.locator('.cm-tile.t-in, .cm-tile.t-out, .cm-tile.t-both').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('.cm-insp')).toContainText('Зачем нужен');
  await expect(page.locator('.cm-insp')).toContainText('Без него не работают');

  // a live refresh re-mounts the App: the view and the pin stay
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('sima-data-changed')));
  await page.waitForTimeout(800);
  await expect(page.locator('.code-map')).toHaveCount(1);
  await expect(page.locator('[data-tile="scripts/block_meaning.mjs"].sel')).toHaveCount(1);

  // inside the block: every tile says what the file is for
  await page.locator('[data-room="b.clarify"] .cm-room-title').dblclick();
  await expect(page.locator('.cm-ftile[data-tile="scripts/block_meaning.mjs"] .fr')).toContainText('библиотека');
  await page.locator('.cm-peer', { hasText: 'Agent Orchestrator' }).locator('.cm-peer-why').click();
  await expect(page.locator('.cm-insp')).toContainText('atlas_runs_api.mjs:26');

  // a file: its parts, its code, a jump along an import
  await page.locator('.cm-ftile[data-tile="scripts/contract_draft_review.mjs"]').dblclick();
  await expect(page.locator('.cm-ln').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('.cm-file .cm-what')).toContainText('Зачем нужен');
  await page.locator('.cm-seg', { hasText: 'reviewDraft' }).click();
  expect(await page.locator('.cm-ln.sel').count()).toBeGreaterThan(10);
  await expect(page.locator('.cm-crumbs')).toContainText('reviewDraft');
  await page.locator('.cm-jump', { hasText: 'block_meaning.mjs' }).click();
  await expect(page.locator('.cm-fpath')).toHaveText('scripts/block_meaning.mjs');

  // the graph and the map open each other at the same block
  await page.locator('.cm-crumbs button', { hasText: 'Clarification Arbiter' }).click();
  await page.locator('.cm-insp button', { hasText: 'На графе' }).click();
  await expect(page.locator('aside.detail h1')).toContainText('Clarification Arbiter');
  await page.locator('aside.detail button', { hasText: 'На карте' }).click();
  await expect(page.locator('.cm-btitle')).toHaveText('Clarification Arbiter');

  // R-8.16 — a code line naming another block's atlas file leads to that block
  await page.locator('.cm-ftile[data-tile="scripts/block_meaning.mjs"]').dblclick();
  await expect(page.locator('.cm-file .cm-what')).toContainText('чужие данные');
  await page.locator('.cm-jump', { hasText: 'Atlas Database' }).first().click();
  await expect(page.locator('.cm-btitle')).toHaveText('Atlas Database');

  expect(errors, errors.join('\n')).toEqual([]);
});

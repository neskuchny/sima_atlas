// R-8.10 (b.ui-control) — the meaning panel in a real browser.
//
// Until now the Overview section «How the agent understood this block», the
// frame marker on graph nodes, the LLM badge and the trajectory editor were
// checked by hand only. This spec drives them against a live API server on a
// disposable client atlas:
//   * the toolbar says which LLM answers;
//   * a node whose declared frame awaits the operator carries a marker, a node
//     without a declaration does not;
//   * «Not quite» opens the correction field and Cancel closes it;
//   * «confirm without starting a run» records the answer (actor = the canvas)
//     and the panel shows the confirmed state — no agent is started;
//   * «Set the trajectory» writes the section into mission.md;
//   * a live refresh (a file changed on disk → the whole <App> re-mounts)
//     keeps the open block, a half-typed correction and a «saved» notice —
//     it used to wipe all three (the notice loss showed up as this spec
//     failing 3 runs in 8);
//   * no console errors along the way.
//
// Nothing here starts an agent run: only the actions that do not spawn one
// are clicked, so the test leaves no processes behind.
//
// Run: npm run test:ui   (needs `npx playwright install chromium` once).
// SIMA_UI_TEST_CDN_DIR=<dir> serves React/ReactDOM/Babel/marked from local
// copies (react.js, react-dom.js, babel.js, marked.js) — for sandboxes whose
// browser cannot reach the CDN. The page's own SRI hashes still apply.

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn, ChildProcess } from 'node:child_process';
// @ts-ignore — plain ESM library, no types
import { recordDeclared, UNDERSTANDING_SECTIONS } from '../../scripts/block_meaning.mjs';

const ROOT = path.resolve('.');
const CLIENT = `uitest-meaning-${process.pid}`;
const CDIR = path.join(ROOT, 'atlas', 'clients', CLIENT);
// Asked from the OS in beforeAll: a pid-derived port collided with a busy one
// in 1 of 8 runs («atlas_api_server did not start»).
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
};

let api: ChildProcess | null = null;

function seedClient() {
  const blocks = [
    { id: 'b.await', title: 'Awaiting frame', x: 200 },
    { id: 'b.plain', title: 'No declaration', x: 520 },
  ];
  fs.mkdirSync(CDIR, { recursive: true });
  fs.writeFileSync(path.join(CDIR, 'graph.json'), JSON.stringify({
    blocks: blocks.map((b) => ({ id: b.id, title: b.title, status: 'wip', layer: 'logic', type: 'module', depends_on: [], tech_stack: [], canvas_x: b.x, canvas_y: 220, canvas_size: 'md' })),
    edges: [],
  }, null, 2));
  for (const b of blocks) {
    const d = path.join(CDIR, 'blocks', b.id);
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, 'mission.md'), `# ${b.id} — mission\n\nЭкспорт месячного отчёта в CSV для финансового отдела, с фильтрами по подразделению.\n\n## Layer\nlogic\n`);
    fs.writeFileSync(path.join(d, 'acceptance.md'), '# a\n\n- [ ] **A1.** CSV открывается в Excel\n');
    fs.writeFileSync(path.join(d, 'files.md'), '# f\n');
    fs.writeFileSync(path.join(d, 'checks.log'), '');
  }
  const decl = UNDERSTANDING_SECTIONS.map((s: any) => `## ${s.heading}\n\n${s.key === 'treating_as' ? 'Выгрузка только для чтения из витрины отчётов.' : '- x'}\n`).join('\n');
  fs.writeFileSync(path.join(CDIR, 'blocks', 'b.await', 'understanding.md'), decl);
  recordDeclared({ block_id: 'b.await', atlas_root: CDIR, agent: 'print-only' });
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  seedClient();
  API_PORT = await freePort();
  api = spawn('node', ['scripts/atlas_api_server.mjs'], {
    cwd: ROOT, stdio: 'pipe',
    // print-only: even if a button that starts a run were clicked by mistake,
    // no real agent would be launched.
    env: { ...process.env, ATLAS_API_PORT: String(API_PORT), ATLAS_AGENT: 'print-only' },
  });
  let serverErr = '';
  api.stderr?.on('data', (d) => { serverErr += String(d); });
  const t0 = Date.now();
  for (;;) {
    try { if ((await fetch(`http://127.0.0.1:${API_PORT}/health`)).ok) break; } catch { /* not up yet */ }
    if (Date.now() - t0 > 20_000) throw new Error(`atlas_api_server did not start on :${API_PORT}\n${serverErr.slice(-800)}`);
    await new Promise((r) => setTimeout(r, 150));
  }
});

test.afterAll(async () => {
  if (api) api.kill();
  fs.rmSync(CDIR, { recursive: true, force: true });
});

// Waits until the canvas has re-mounted on fresh data (index.html re-renders
// <App> with a new key on every `sima-data-changed`).
async function waitForRemount(page, before: string) {
  await page.waitForFunction((b) => (window as any).SIMA_DATA?._meta?.generated_at !== b, before, { timeout: 20_000 });
  await page.waitForTimeout(400);
}
const generatedAt = (page) => page.evaluate(() => (window as any).SIMA_DATA?._meta?.generated_at || '');

test('meaning panel: marker, badge, answer without a run, trajectory', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|net::ERR/.test(m.text())) errors.push(m.text()); });

  await page.addInitScript((port) => {
    (window as any).SIMA_API_BASE = `http://localhost:${port}`;
    try { localStorage.setItem('sima.locale', 'ru'); } catch { /* storage may be off */ }
  }, API_PORT);
  const cdnDir = process.env.SIMA_UI_TEST_CDN_DIR;
  if (cdnDir) {
    await page.route('**/*', (route) => {
      const u = route.request().url();
      const hit = Object.keys(CDN).find((k) => u.includes(k));
      if (hit) return route.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: fs.readFileSync(path.join(cdnDir, CDN[hit])) });
      if (/^https?:\/\/(localhost|127\.0\.0\.1)/.test(u)) return route.continue();
      return route.abort();
    });
  }

  await page.goto(`/atlas_design/index.html?client=${CLIENT}`);
  await page.waitForSelector('[data-mid="b.await"]', { timeout: 30_000 });
  if (await page.locator('.onb-skip').count()) await page.click('.onb-skip');

  // Which LLM answers — always said, whatever the machine has.
  await expect(page.locator('.llm-badge')).toContainText('LLM:');

  // The frame marker: on the block that waits for the operator, not elsewhere.
  await expect(page.locator('[data-mid="b.await"] .frame-dot.frame-awaiting')).toHaveCount(1);
  await expect(page.locator('[data-mid="b.plain"] .frame-dot')).toHaveCount(0);

  // Overview of the waiting block.
  await page.click('[data-mid="b.await"]');
  const section = page.locator('.ov-section', { has: page.locator('.meaning-card') }).first();
  await expect(section).toContainText('Выгрузка только для чтения из витрины отчётов.');
  await expect(section.getByRole('button', { name: '✓ Верно — писать код' })).toBeVisible();

  // «Not quite» opens the correction field.
  await section.getByRole('button', { name: '✎ Не так' }).click();
  await expect(section.locator('.meaning-correct textarea')).toBeVisible();
  await section.locator('.meaning-correct textarea').fill('черновик поправки');

  // A file changes on disk meanwhile (an agent, the nightly) → live refresh
  // re-mounts the App. The block stays open and the draft stays typed.
  const g0 = await generatedAt(page);
  fs.appendFileSync(path.join(CDIR, 'blocks', 'b.plain', 'checks.log'), `${new Date().toISOString()}\tui_test\tpass\ttouch\n`);
  await waitForRemount(page, g0);
  await expect(section.locator('.meaning-correct textarea')).toHaveValue('черновик поправки');

  // Cancel closes it without writing anything.
  await section.getByRole('button', { name: 'Отмена' }).first().click();
  await expect(section.locator('.meaning-correct textarea')).toHaveCount(0);

  // Confirm without starting a run → recorded by the canvas, shown as confirmed.
  await section.getByRole('button', { name: 'подтвердить, не запуская' }).click();
  await expect(section.locator('.meaning-review-ok')).toContainText('Вы подтвердили эту рамку');
  const journal = fs.readFileSync(path.join(CDIR, 'blocks', 'b.await', 'frame_reviews.jsonl'), 'utf8')
    .trim().split('\n').map((l) => JSON.parse(l));
  const last = journal[journal.length - 1];
  expect(last.event).toBe('confirmed');
  expect(last.actor).toBe('operator (canvas)');
  expect(fs.existsSync(path.join(CDIR, 'agent_invocations')), 'no agent run was started').toBe(false);

  // Trajectory on the block that has none.
  await page.click('[data-mid="b.plain"]');
  const plain = page.locator('.ov-section', { has: page.locator('.meaning-card') }).first();
  await plain.getByRole('button', { name: '✎ Задать траекторию' }).click();
  await plain.locator('.meaning-correct textarea').fill('Станет общим сервисом выгрузок для трёх продуктов.');
  const g1 = await generatedAt(page);
  await plain.getByRole('button', { name: 'Сохранить в mission.md' }).click();
  await expect(plain.locator('.meaning-notice-ok')).toContainText('Сохранено в mission.md');
  // The save changed mission.md, so the canvas re-mounts — the notice stays.
  await waitForRemount(page, g1);
  await expect(plain.locator('.meaning-notice-ok')).toContainText('Сохранено в mission.md');
  expect(fs.readFileSync(path.join(CDIR, 'blocks', 'b.plain', 'mission.md'), 'utf8'))
    .toContain('## Во что это вырастет\n\nСтанет общим сервисом выгрузок для трёх продуктов.');

  expect(errors, errors.join('\n')).toEqual([]);
});

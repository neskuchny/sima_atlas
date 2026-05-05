#!/usr/bin/env node
// Phase P-3 — capture a screenshot of a block's UI surface and save it
// to atlas/blocks/<id>/screenshots/<ts>.png. Closes the «у каждого
// модуля картиночка» requirement from описание.md and новое_тз.md §1.
//
// Usage:
//   node scripts/screenshot_block.mjs <block_id> [--url=<url>] [--full] [--json]
//
// Behavior:
//   - If --url is given, use it. Otherwise read graph.json → block.ui_url.
//   - If neither is set: returns ok:false with hint to set ui_url first.
//   - Writes atlas/blocks/<id>/screenshots/<UTC-ts>.png + a `latest.png`
//     symlink (or copy on platforms without symlinks).
//   - Falls back gracefully if playwright fails (e.g. sandbox can't reach
//     external URLs / no chromium binary): returns structured error.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');

function readGraph(root) {
  const p = path.join(root || ATLAS, 'graph.json');
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

export async function screenshotBlock({ block_id, url, fullPage = false, root, viewport = { width: 1280, height: 800 } } = {}) {
  if (!block_id) throw new Error('screenshotBlock: block_id required');
  const atlas = root || ATLAS;
  const blkDir = path.join(atlas, 'blocks', block_id);
  if (!fs.existsSync(blkDir)) return { ok: false, error: `block dir missing: ${block_id}` };

  // Resolve URL: explicit > graph.json block.ui_url
  let target = url;
  if (!target) {
    const graph = readGraph(atlas);
    const block = graph?.blocks?.find((b) => b.id === block_id);
    target = block?.ui_url || null;
  }
  if (!target || typeof target !== 'string') {
    return { ok: false, error: 'no URL: pass --url=<url> or set graph.json block.ui_url' };
  }
  if (!/^https?:\/\//.test(target)) return { ok: false, error: 'URL must start with http:// or https://' };

  // Lazy-import playwright so the rest of the system works without it.
  let pw;
  try { pw = await import('playwright'); }
  catch { return { ok: false, error: 'playwright not installed: npx playwright install chromium' }; }

  const screenshotsDir = path.join(blkDir, 'screenshots');
  fs.mkdirSync(screenshotsDir, { recursive: true });
  const ts = new Date().toISOString();
  const safeTs = ts.replace(/[:.]/g, '-');
  const outPath = path.join(screenshotsDir, `${safeTs}.png`);
  const latestPath = path.join(screenshotsDir, 'latest.png');

  let browser;
  try {
    browser = await pw.chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(target, { waitUntil: 'networkidle', timeout: 25_000 }).catch(() => {});
    await page.waitForTimeout(800); // let fonts/images settle
    await page.screenshot({ path: outPath, fullPage });
    await browser.close();
  } catch (e) {
    if (browser) try { await browser.close(); } catch {}
    return { ok: false, error: `playwright: ${String(e.message || e)}` };
  }

  // Maintain a stable `latest.png` for quick lookup. Symlink if possible,
  // else copy (Windows + some sandboxes block symlinks).
  try {
    if (fs.existsSync(latestPath)) fs.unlinkSync(latestPath);
    fs.symlinkSync(path.basename(outPath), latestPath);
  } catch {
    try { fs.copyFileSync(outPath, latestPath); } catch {}
  }

  // Trim oldest — keep last 10 timestamped screenshots
  try {
    const all = fs.readdirSync(screenshotsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}T.*\.png$/.test(f))
      .sort();
    while (all.length > 10) {
      const old = all.shift();
      try { fs.unlinkSync(path.join(screenshotsDir, old)); } catch {}
    }
  } catch {}

  // Audit
  try {
    const log = path.join(blkDir, 'checks.log');
    fs.appendFileSync(log, `${ts}\tscreenshot\tpass\t${target}\n`);
  } catch {}

  const stat = fs.statSync(outPath);
  return {
    ok: true,
    block_id,
    url: target,
    file: path.relative(ROOT, outPath),
    bytes: stat.size,
    captured_at: ts,
    full_page: fullPage,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const wantJson = args.includes('--json');
  const fullPage = args.includes('--full');
  const url = (args.find((a) => a.startsWith('--url=')) || '').slice(6) || undefined;
  const bid = args.find((a) => /^b\./.test(a));
  if (!bid) { console.error('usage: screenshot_block.mjs <b.block_id> [--url=https://...] [--full] [--json]'); process.exit(1); }
  screenshotBlock({ block_id: bid, url, fullPage }).then((r) => {
    if (wantJson) console.log(JSON.stringify(r, null, 2));
    else if (!r.ok) { console.error('screenshot: FAIL —', r.error); process.exit(1); }
    else console.log(`screenshot ${r.block_id}: ${r.file} (${(r.bytes / 1024).toFixed(1)} KB)`);
  });
}

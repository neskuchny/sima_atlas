#!/usr/bin/env node
// PR-Live smoke: spin up atlas_api_server in a child process, hit GET /atlas/state
// twice, mutate one atlas file in between, confirm the hash changes; then call
// /atlas/payload and verify it returns a usable bootstrap shape.

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

// Pick a port unlikely to clash with any dev server the user might be running.
const PORT = 18787 + Math.floor(Math.random() * 1000);

const failures = [];
const probePath = path.join(ROOT, 'atlas', 'rules.md');
const probeBefore = fs.readFileSync(probePath, 'utf8');
const proposalsDir = path.join(ROOT, 'atlas', 'proposals');
const preProposals = new Set(fs.existsSync(proposalsDir) ? fs.readdirSync(proposalsDir) : []);

const child = spawn('node', ['scripts/atlas_api_server.mjs'], {
  cwd: ROOT,
  env: { ...process.env, ATLAS_API_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

async function waitReady(timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(`http://localhost:${PORT}/health`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function getJson(p) {
  const r = await fetch(`http://localhost:${PORT}${p}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${p}`);
  return r.json();
}

try {
  const ready = await waitReady();
  if (!ready) { failures.push('atlas_api_server did not become ready'); throw new Error('not ready'); }

  // 1. initial hash
  const s1 = await getJson('/atlas/state');
  if (!s1.ok || !s1.hash) failures.push('initial /atlas/state did not return ok+hash');
  const hash1 = s1.hash;

  // 2. mutate one tracked file
  fs.writeFileSync(probePath, probeBefore + `\n<!-- live-smoke ${Date.now()} -->\n`, 'utf8');

  // 3. second hash should differ
  const s2 = await getJson('/atlas/state');
  if (s2.hash === hash1) failures.push(`hash did not change after mutation (still ${hash1})`);

  // 4. /atlas/payload returns parseable bootstrap shape
  const p3 = await getJson('/atlas/payload');
  if (!p3.ok || !p3.payload) failures.push('/atlas/payload did not return ok+payload');
  if (p3.payload && !p3.payload.archByProject) failures.push('/atlas/payload missing archByProject');
  if (p3.payload && !(p3.payload.data && Array.isArray(p3.payload.data.projects))) {
    failures.push('/atlas/payload.data.projects missing');
  }
} finally {
  fs.writeFileSync(probePath, probeBefore);
  // Clean up any proposals the regenerated bootstrap might have left.
  if (fs.existsSync(proposalsDir)) {
    for (const f of fs.readdirSync(proposalsDir)) {
      if (!preProposals.has(f)) fs.unlinkSync(path.join(proposalsDir, f));
    }
  }
  child.kill('SIGTERM');
}

if (failures.length) {
  console.error('atlas_live_polling.smoke: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('atlas_live_polling.smoke: OK (state hash changes on disk mutation; payload returns bootstrap shape)');

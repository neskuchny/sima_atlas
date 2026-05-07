#!/usr/bin/env node
// Phase R-6 — selftest для multi-tenant block writes.
//
// Воспроизводит реальный bug, на который налетел оператор:
//   - UI открыт на ?client=my-saas
//   - data_loader шлёт `_client: 'my-saas'` через withClient(...)
//   - старый код API: `/atlas/blocks/create` принимал _client в body, но НЕ
//     прокидывал в atlas_root, поэтому блок попадал в root atlas/, не в
//     atlas/clients/my-saas/. Итог — UI на клиенте видит пустой канвас, при
//     попытке создать блок получает «already exists» из root atlas, и canvas
//     откатывается.
//
// Этот тест поднимает API на временном порту, шлёт POST /atlas/blocks/create
// с _client, и проверяет:
//   1. блок появился в atlas/clients/<id>/graph.json
//   2. блок НЕ появился в root atlas/graph.json
//   3. директория блока лежит в atlas/clients/<id>/blocks/<id>/, не в root
//   4. patchBlock + patchBlockFile + addEdge тоже соблюдают _client
//   5. deleteBlock убирает только из клиентского графа

import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

const c = `selftest-r6-${Date.now()}`;
const cdir = path.join(ROOT, 'atlas', 'clients', c);
// Phase R-6.1 — на старте client dir НЕ создаём специально, чтобы
// проверить auto-scaffold на первой записи (баг возник у оператора:
// после R-6 createBlock падал с ENOENT, если client dir отсутствовал).

const port = 18800 + (Date.now() % 100);
const env = { ...process.env, ATLAS_API_PORT: String(port), ATLAS_FORCE_MOCK_LLM: '1' };
const server = spawn('node', ['scripts/atlas_api_server.mjs'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });

function cleanup(code = 0, msg = null) {
  try { server.kill('SIGKILL'); } catch {}
  try { fs.rmSync(cdir, { recursive: true, force: true }); } catch {}
  if (msg) console.error(msg);
  process.exit(code);
}
process.on('uncaughtException', (e) => cleanup(1, `selftest crashed: ${e.message}`));

async function waitForServer(p, attempts = 50) {
  for (let i = 0; i < attempts; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/atlas/state`);
      if (r.ok) return;
    } catch {}
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error('API server did not come up in 5s');
}

async function postJson(p, body) {
  const r = await fetch(`http://127.0.0.1:${port}${p}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return await r.json();
}

(async () => {
  await waitForServer(port);

  const blockId = 'b.r6-multi-tenant-test';

  // Pre-check: client dir does NOT exist before first call (R-6.1 invariant)
  assert.ok(!fs.existsSync(cdir), `precondition violated: ${cdir} should not exist yet`);

  // 1. createBlock with _client → must auto-scaffold client dir AND land in
  //    client atlas (not root). This exercises both R-6 routing and
  //    R-6.1 auto-scaffold in one call.
  const createRes = await postJson('/atlas/blocks/create', { _client: c, id: blockId, title: 'R-6 test', layer: 'logic' });
  assert.equal(createRes.ok, true, `createBlock failed: ${JSON.stringify(createRes)}`);

  // Auto-scaffold should have created project.md / rules.md / tech_stack.md too
  assert.ok(fs.existsSync(path.join(cdir, 'project.md')), 'auto-scaffold must create project.md');
  assert.ok(fs.existsSync(path.join(cdir, 'rules.md')),   'auto-scaffold must create rules.md');
  assert.ok(fs.existsSync(path.join(cdir, 'tech_stack.md')), 'auto-scaffold must create tech_stack.md');

  const clientGraph = JSON.parse(fs.readFileSync(path.join(cdir, 'graph.json'), 'utf8'));
  assert.ok((clientGraph.blocks || []).some((b) => b.id === blockId), 'block must be in CLIENT graph.json');

  const rootGraph = JSON.parse(fs.readFileSync(path.join(ROOT, 'atlas', 'graph.json'), 'utf8'));
  assert.ok(!(rootGraph.blocks || []).some((b) => b.id === blockId), 'block MUST NOT leak into ROOT graph.json');

  const clientBlockDir = path.join(cdir, 'blocks', blockId);
  assert.ok(fs.existsSync(clientBlockDir), 'client blocks/<id>/ directory must exist');
  const rootBlockDir = path.join(ROOT, 'atlas', 'blocks', blockId);
  assert.ok(!fs.existsSync(rootBlockDir), 'root atlas/blocks/<id>/ MUST NOT exist');

  // 2. patchBlock with _client → updates client only.
  const patchRes = await postJson('/atlas/blocks/patch', { _client: c, block_id: blockId, status: 'todo' });
  assert.equal(patchRes.ok, true, `patchBlock failed: ${JSON.stringify(patchRes)}`);
  const reread = JSON.parse(fs.readFileSync(path.join(cdir, 'graph.json'), 'utf8'));
  const block = (reread.blocks || []).find((b) => b.id === blockId);
  assert.equal(block?.status, 'todo', 'patched status must persist in client graph');

  // 3. patchBlockFile with _client → writes to client/blocks/<id>/.
  const fileRes = await postJson('/atlas/blocks/patch-file', { _client: c, block_id: blockId, file: 'mission.md', content: '# r6 mission\n\nr6 selftest mission, deliberately long enough to cross the 80-char threshold for soft gates.\n' });
  assert.equal(fileRes.ok, true, `patchBlockFile failed: ${JSON.stringify(fileRes)}`);
  const writtenMission = fs.readFileSync(path.join(clientBlockDir, 'mission.md'), 'utf8');
  assert.match(writtenMission, /r6 selftest mission/, 'mission must land in client block dir');

  // 4. recreate same id → must fail with "already exists" because it's now
  //    truly there in the client graph (this is correct behaviour).
  const recreateRes = await postJson('/atlas/blocks/create', { _client: c, id: blockId });
  assert.equal(recreateRes.ok, false, 're-create should be rejected');
  assert.match(String(recreateRes.error || ''), /already exists/);

  // 5. recreate same id WITHOUT _client → root atlas should accept it
  //    independently (proving the routing is real, not a side-effect).
  const rootRes = await postJson('/atlas/blocks/create', { id: blockId });
  assert.equal(rootRes.ok, true, `root createBlock should succeed independently: ${JSON.stringify(rootRes)}`);
  // Cleanup the leak we just made in root.
  await postJson('/atlas/blocks/delete', { id: blockId, hard: true });

  // 6. deleteBlock with _client → removes from client graph only.
  const delRes = await postJson('/atlas/blocks/delete', { _client: c, block_id: blockId, hard: true });
  assert.equal(delRes.ok, true, `deleteBlock failed: ${JSON.stringify(delRes)}`);
  const after = JSON.parse(fs.readFileSync(path.join(cdir, 'graph.json'), 'utf8'));
  assert.ok(!(after.blocks || []).some((b) => b.id === blockId), 'block must be gone from client graph after delete');

  console.log('multi_tenant_block_routing.selftest: OK (createBlock / patchBlock / patchBlockFile / deleteBlock honour _client; root atlas independent)');
  cleanup(0);
})().catch((e) => cleanup(1, `assertion failed: ${e.message}`));

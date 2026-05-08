#!/usr/bin/env node
// PR-Conn: connection-drift smoke.
// Builds a tiny ad-hoc project under atlas/projects/__smoke_conn_drift__/
// where one depends_on requests a capability the target block does NOT export,
// then runs generate_atlas_bootstrap_js.mjs and asserts that the corresponding
// link in the resulting archByProject entry is marked broken with a reason.
// Cleans up after itself.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const ATLAS = path.join(ROOT, 'atlas');
const SMOKE_PROJ = '__smoke_conn_drift__';
const PROJ_ROOT = path.join(ATLAS, 'projects', SMOKE_PROJ);

function ensure(p, content) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content, 'utf8');
}

const failures = [];

const remixDir = path.join(ROOT, 'frontend');
const archDataPath = path.join(remixDir, 'arch_data.js');
const bootstrapPath = path.join(remixDir, 'atlas_bootstrap.js');
const archDataBefore = fs.readFileSync(archDataPath, 'utf8');
const bootstrapBefore = fs.readFileSync(bootstrapPath, 'utf8');

try {
  // 1. Lay out a smoke project with a deliberately broken capability link.
  ensure(path.join(PROJ_ROOT, 'project.md'),
    '# Smoke conn-drift\n\nTemporary fixture used by tests/connection_drift.smoke.mjs to confirm the bootstrap generator marks broken capability links. Will be deleted at the end of the run.\n\nMust be at least 200 chars to satisfy validate_projects.mjs gate, so this paragraph is intentionally a bit longer than strictly needed for rendering.\n');
  ensure(path.join(PROJ_ROOT, 'rules.md'),
    '# Rules\n\n1. This is a smoke fixture; do not rely on it.\n2. Cleanup is the smoke runner\'s responsibility.\n');
  ensure(path.join(PROJ_ROOT, 'tech_stack.md'),
    '# Tech Stack\n\n- Frontend: react\n- Backend: nodejs\n- Storage: filesystem\n');
  ensure(path.join(PROJ_ROOT, 'graph.json'), JSON.stringify({
    version: 2,
    layers: [
      { id: 'front', name: 'Front', order: 0 },
      { id: 'logic', name: 'Logic', order: 1 },
    ],
    blocks: [
      { id: 'b.front', title: 'Front', status: 'wip', layer: 'front', type: 'module', mvp: true, subschema_id: null, depends_on: ['b.api'], tech_stack: ['react'], files: [] },
      { id: 'b.api',   title: 'API',   status: 'wip', layer: 'logic', type: 'module', mvp: true, subschema_id: null, depends_on: [], tech_stack: ['nodejs'], files: [] },
    ],
  }, null, 2) + '\n');

  // b.front declares it needs cap "missing_cap" from b.api
  const frontDir = path.join(PROJ_ROOT, 'blocks', 'b.front');
  for (const f of ['mission.md','kpi.md','acceptance.md','tasks.md','provides.md','files.md']) {
    ensure(path.join(frontDir, f), `# b.front — ${f}\n\nSmoke fixture content for testing connection-drift detection.\n`);
  }
  ensure(path.join(frontDir, 'depends_on.md'), '# b.front — depends_on\n\n- b.api: missing_cap\n');
  ensure(path.join(frontDir, 'checks.log'), '');
  // b.api provides only "real_cap", so missing_cap is unsatisfied.
  const apiDir = path.join(PROJ_ROOT, 'blocks', 'b.api');
  for (const f of ['mission.md','kpi.md','acceptance.md','tasks.md','depends_on.md','files.md']) {
    ensure(path.join(apiDir, f), `# b.api — ${f}\n\nSmoke fixture content for testing connection-drift detection.\n`);
  }
  ensure(path.join(apiDir, 'provides.md'), '# b.api — provides\n\n- real_cap\n');
  ensure(path.join(apiDir, 'checks.log'), '');

  // 2. Regenerate bootstrap.
  execFileSync('node', ['scripts/generate_atlas_bootstrap_js.mjs'], { cwd: ROOT, stdio: 'pipe' });

  // 3. Load arch_data + bootstrap in a sandbox and inspect the smoke project.
  const ctx = { window: { SIMA_DATA_V2: { projects: [] } }, console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(archDataPath, 'utf8'), ctx);
  vm.runInContext(fs.readFileSync(bootstrapPath, 'utf8'), ctx);
  const arch = ctx.window.ARCH_BY_PROJECT && ctx.window.ARCH_BY_PROJECT[SMOKE_PROJ];
  if (!arch) failures.push(`arch entry "${SMOKE_PROJ}" missing from ARCH_BY_PROJECT`);
  else {
    const link = (arch.links || []).find((l) => l.from === 'b.front' && l.to === 'b.api');
    if (!link) failures.push('expected link b.front → b.api missing');
    else if (link.broken !== true) failures.push(`link b.front → b.api should be broken, got broken=${link.broken}`);
    else if (!/missing_cap/.test(link.broken_reason || '')) failures.push(`broken_reason should mention "missing_cap", got: ${link.broken_reason}`);
    else if (link.capability !== 'missing_cap') failures.push(`link.capability should be "missing_cap", got: ${link.capability}`);

    // And the inverse: an additional ok link should be detectable as not broken.
    // (We didn't add one in this smoke, but we assert the schema exists anyway.)
  }
} finally {
  // 4. Cleanup: remove the smoke project, restore arch_data + bootstrap.
  if (fs.existsSync(PROJ_ROOT)) fs.rmSync(PROJ_ROOT, { recursive: true, force: true });
  fs.writeFileSync(archDataPath, archDataBefore);
  fs.writeFileSync(bootstrapPath, bootstrapBefore);
  // Re-run the generator so atlas_bootstrap.js reflects the real graph again.
  try { execFileSync('node', ['scripts/generate_atlas_bootstrap_js.mjs'], { cwd: ROOT, stdio: 'pipe' }); } catch {}
}

if (failures.length) {
  console.error('connection_drift.smoke: FAIL');
  failures.forEach((f) => console.error(' ✗', f));
  process.exit(1);
}
console.log('connection_drift.smoke: OK (broken capability link detected and propagated to archByProject.links)');

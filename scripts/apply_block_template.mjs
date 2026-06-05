#!/usr/bin/env node
// R-7.90 (S-1) — apply a drop-in block template.
//
// Operator pain: a fresh clone opens to the demo client, then you have to
// write every contract from scratch. The biggest «early but live» tell. S-1
// ships 5 production-shaped starters (auth / payments / search / ingestion /
// billing) so the canvas can come configured, not empty.
//
// Each template lives at atlas/templates/<id>/ with the full contract set
// (mission / kpi / acceptance / depends_on / provides / tasks). This engine
// creates the block in the target graph and copies those files in, then
// seeds the memory layer (narrative.md / decisions.log) like createBlock does.
//
// Safety:
//   - refuses to overwrite an existing block unless --force
//   - --dry-run prints what it would do, writes nothing
//   - --client <id> targets atlas/clients/<id>/ (multi-tenant)
//   - --block-id b.<custom> overrides the template's default id
//
// Usage:
//   node scripts/apply_block_template.mjs --list
//   node scripts/apply_block_template.mjs --template auth
//   node scripts/apply_block_template.mjs --template payments --client my-product
//   node scripts/apply_block_template.mjs --template search --block-id b.product-search
//   node scripts/apply_block_template.mjs --template billing --dry-run --json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');
const TEMPLATES_DIR = path.join(ROOT, 'atlas', 'templates');

const args = process.argv.slice(2);
const arg = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt; };
const has = (flag) => args.includes(flag);

const JSON_OUT = has('--json');
const DRY_RUN = has('--dry-run');
const FORCE = has('--force');

function loadRegistry() {
  const p = path.join(TEMPLATES_DIR, 'index.json');
  if (!fs.existsSync(p)) { console.error('apply_block_template: atlas/templates/index.json missing'); process.exit(2); }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const registry = loadRegistry();

// ── --list ──────────────────────────────────────────────────────────
if (has('--list')) {
  if (JSON_OUT) { process.stdout.write(JSON.stringify(registry.templates, null, 2) + '\n'); process.exit(0); }
  console.log('Available block templates:');
  for (const t of registry.templates) {
    console.log(`  ${t.id.padEnd(11)} → ${t.block_id.padEnd(14)} ${t.summary}`);
  }
  console.log('\nApply: node scripts/apply_block_template.mjs --template <id> [--client <id>] [--block-id b.<custom>]');
  process.exit(0);
}

const templateId = arg('--template');
if (!templateId) {
  console.error('apply_block_template: --template <id> required (or --list)');
  process.exit(2);
}
const tpl = registry.templates.find((t) => t.id === templateId);
if (!tpl) {
  console.error(`apply_block_template: unknown template "${templateId}". Known: ${registry.templates.map((t) => t.id).join(', ')}`);
  process.exit(2);
}

const clientId = arg('--client');
if (clientId && !/^[a-zA-Z0-9._-]+$/.test(clientId)) {
  console.error(`apply_block_template: invalid --client "${clientId}"`); process.exit(2);
}
const blockId = arg('--block-id') || tpl.block_id;
if (!/^[a-zA-Z0-9._-]+$/.test(blockId)) {
  console.error(`apply_block_template: invalid --block-id "${blockId}"`); process.exit(2);
}

const atlasRoot = clientId ? path.join(ROOT, 'atlas', 'clients', clientId) : path.join(ROOT, 'atlas');
const graphPath = path.join(atlasRoot, 'graph.json');
const tplDir = path.join(TEMPLATES_DIR, templateId);

const CONTRACT_FILES = ['mission.md', 'kpi.md', 'acceptance.md', 'depends_on.md', 'provides.md', 'tasks.md'];

// ── pre-flight ──────────────────────────────────────────────────────
if (!fs.existsSync(graphPath)) {
  console.error(`apply_block_template: graph not found at ${path.relative(ROOT, graphPath)} — create the client first (open ?client=${clientId} in the UI, or use the demo).`);
  process.exit(2);
}
const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
const exists = (graph.blocks || []).some((b) => b.id === blockId);
if (exists && !FORCE) {
  console.error(`apply_block_template: block "${blockId}" already exists in ${clientId || 'root'} graph. Use --block-id to pick another id, or --force to overwrite its contract files.`);
  process.exit(3);
}

const plan = {
  template: templateId,
  block_id: blockId,
  title: tpl.title,
  layer: tpl.layer,
  client: clientId || null,
  graph: path.relative(ROOT, graphPath),
  files: CONTRACT_FILES.filter((f) => fs.existsSync(path.join(tplDir, f))),
  provides: tpl.provides || [],
  overwrite: exists,
};

if (DRY_RUN) {
  if (JSON_OUT) process.stdout.write(JSON.stringify({ dry_run: true, plan }, null, 2) + '\n');
  else {
    console.log(`[dry-run] would apply template "${templateId}" as ${blockId} (${tpl.layer}) into ${clientId || 'root'}`);
    console.log(`  files: ${plan.files.join(', ')}`);
    console.log(`  provides: ${plan.provides.join(', ') || '(none)'}`);
    if (exists) console.log(`  ⚠ block exists — would OVERWRITE contract files (--force given)`);
  }
  process.exit(0);
}

// ── apply ───────────────────────────────────────────────────────────
async function apply() {
  const blocksApi = await import('./atlas_blocks_api.mjs');
  const blockDir = path.join(atlasRoot, 'blocks', blockId);

  if (!exists) {
    blocksApi.createBlock({
      atlas_root: atlasRoot,
      body: { id: blockId, title: tpl.title, status: 'idea', layer: tpl.layer },
    });
  }
  fs.mkdirSync(blockDir, { recursive: true });

  // Copy contract files from the template, overwriting the createBlock stubs.
  let copied = 0;
  for (const f of CONTRACT_FILES) {
    const src = path.join(tplDir, f);
    if (!fs.existsSync(src)) continue;
    fs.writeFileSync(path.join(blockDir, f), fs.readFileSync(src, 'utf8'));
    copied += 1;
  }

  // Seed memory-layer files if createBlock didn't (e.g. --force on an old block).
  for (const [mf, seed] of [
    ['narrative.md', `# narrative — ${blockId}\n\n_Append a section per run: what I tried / what worked / what failed and why / decisions made._\n`],
    ['decisions.log', `# decisions — ${blockId}\n`],
  ]) {
    const p = path.join(blockDir, mf);
    if (!fs.existsSync(p)) fs.writeFileSync(p, seed);
  }

  // Note the template origin in checks.log for provenance.
  fs.appendFileSync(path.join(blockDir, 'checks.log'),
    `${new Date().toISOString()}\ttemplate_apply\tpass\tapplied template "${templateId}"${exists ? ' (--force overwrite)' : ''}\n`);

  return { ...plan, copied };
}

apply().then((result) => {
  if (JSON_OUT) process.stdout.write(JSON.stringify({ ok: true, ...result }, null, 2) + '\n');
  else {
    console.log(`✓ applied template "${templateId}" → ${blockId} (${tpl.layer}) in ${clientId || 'root'}`);
    console.log(`  ${result.copied} contract files written · provides: ${plan.provides.join(', ') || '(none)'}`);
    console.log(`  next: open the canvas, fill any gaps, then run the verifier or an agent on ${blockId}.`);
  }
}).catch((e) => {
  if (JSON_OUT) process.stdout.write(JSON.stringify({ ok: false, error: String(e.message || e) }, null, 2) + '\n');
  else console.error(`apply_block_template: FAIL — ${e.message || e}`);
  process.exit(1);
});

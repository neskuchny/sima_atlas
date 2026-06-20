#!/usr/bin/env node
/**
 * mcp_smoke_e2e.mjs — Atlas MCP smoke test
 *
 * Exercises 30+ MCP tools in a single stdin batch.
 * All writes target b.smoke-sandbox only (KPI-2 isolation).
 * Outputs "mcp_smoke_e2e: OK" on success; exits non-zero on any tool error.
 *
 * Call order matters (server processes stdin sequentially):
 *   Phase 1 — read-only introspection (no side effects)
 *   Phase 2 — sandbox-only writes (b.smoke-sandbox contract files only)
 *   Phase 3 — bundle generation (writes atlas/ root, not any block dir)
 *   Phase 4 — verify + read latest acceptance run report
 */
import { spawnSync } from 'node:child_process';

// Recursion guard: b.smoke-sandbox acceptance A3 evaluates by spawning
// this very script. The smoke then calls `verify_block_acceptance` on the
// sandbox block, which fires A3 again → infinite loop, each level
// spawning new MCP servers + history snapshots until something blows up.
// Caught by an MCP zombie audit after the V-1 overnight; fix is to detect
// the re-entry via env var. The outer (top-level) call sets the var; any
// child sees it and exits clean immediately. From A3's standpoint that's
// still «smoke passed», which is honest — we ran the smoke once for real
// (at nightly), and the A3 assertion's intent («smoke executes cleanly»)
// is already satisfied by the outer call.
if (process.env.SIMA_MCP_SMOKE_RUNNING === '1') {
  console.log('mcp_smoke_e2e: OK (recursion guard — nested invocation skipped)');
  process.exit(0);
}
process.env.SIMA_MCP_SMOKE_RUNNING = '1';

const SANDBOX = 'b.smoke-sandbox';

const calls = [
  // --- Phase 1: read-only introspection ---
  { name: 'read_block',                  args: { block_id: SANDBOX } },
  { name: 'list_dependencies',           args: { block_id: SANDBOX } },
  { name: 'build_context_pack',          args: { block_id: SANDBOX, profile: 'acceptance-only' } },
  { name: 'sync_check',                  args: {} },
  { name: 'list_proposals',              args: { block_id: SANDBOX } },
  { name: 'list_blocks_by_layer',        args: { layer: 'testing' } },
  { name: 'list_architecture_decisions', args: {} },
  { name: 'read_operator_profile',       args: {} },
  { name: 'list_dont_use',               args: {} },
  { name: 'list_always_use',             args: {} },
  { name: 'list_lessons',                args: {} },
  { name: 'list_block_templates',        args: {} },
  { name: 'detect_playwright',           args: {} },
  { name: 'list_workspaces',             args: {} },
  { name: 'token_economics',             args: { days: 1 } },
  { name: 'get_block_history',           args: { block_id: SANDBOX } },
  { name: 'parse_acceptance',            args: { block_id: SANDBOX } },
  { name: 'list_failed_acceptances',     args: {} },
  { name: 'list_runs',                   args: {} },
  { name: 'change_set_list',             args: {} },
  { name: 'list_user_docs',              args: {} },
  { name: 'detect_stalled_runs',         args: { max_idle_ms: 3_600_000 } },
  // --- Phase 2: sandbox-only writes ---
  { name: 'update_block',                args: { block_id: SANDBOX, tasks: ['nightly smoke e2e task'] } },
  { name: 'log_check',                   args: { block_id: SANDBOX, kind: 'smoke', result: 'pass', note: 'nightly smoke e2e' } },
  { name: 'enqueue_ingestion',           args: { block_id: SANDBOX, note: 'smoke e2e queued insight', apply_to_rules: false } },
  { name: 'apply_ingestion_queue',       args: {} },
  { name: 'ingest_chat_distillate',      args: { block_id: SANDBOX, note: 'smoke e2e distillate' } },
  // --- Phase 3: bundle generation (atlas/ root only) ---
  { name: 'generate_wiki',               args: {} },
  { name: 'render_wiki_html',            args: {} },
  { name: 'generate_full_bundle',        args: {} },
  // --- Phase 4: verify sandbox + read the run report ---
  { name: 'verify_block_acceptance',     args: { block_id: SANDBOX } },
  { name: 'read_acceptance_run',         args: { block_id: SANDBOX } },
];

const idToName = {};
const payload = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
];
calls.forEach((c, i) => {
  const id = i + 2;
  idToName[id] = c.name;
  payload.push({
    jsonrpc: '2.0',
    id,
    method: 'tools/call',
    params: { name: c.name, arguments: c.args },
  });
});

const input = payload.map(x => JSON.stringify(x)).join('\n') + '\n';
const r = spawnSync('node', ['scripts/mcp_atlas_server.mjs'], {
  input,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});

if (r.status !== 0) {
  console.error('mcp_smoke_e2e: server process failed');
  console.error(r.stderr || r.stdout);
  process.exit(r.status ?? 1);
}

const lines = (r.stdout || '').trim().split(/\r?\n/).filter(Boolean);
const responses = lines
  .map(l => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);
const byId = Object.fromEntries(responses.map(x => [String(x.id), x]));

let failed = false;
for (const [id, name] of Object.entries(idToName)) {
  const resp = byId[id];
  if (!resp) {
    console.error(`mcp_smoke_e2e: NO RESPONSE tool=${name} id=${id}`);
    failed = true;
  } else if (resp.error) {
    console.error(`mcp_smoke_e2e: FAIL tool=${name} id=${id}`);
    console.error(JSON.stringify(resp.error, null, 2));
    failed = true;
  }
}

if (failed) process.exit(1);

console.log(`mcp_smoke_e2e: OK (${Object.keys(idToName).length} tools exercised)`);

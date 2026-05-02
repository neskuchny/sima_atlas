#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const payload = [
  { jsonrpc:'2.0', id:1, method:'initialize', params:{} },
  { jsonrpc:'2.0', id:2, method:'tools/call', params:{ name:'update_block', arguments:{ block_id:'b.smoke-sandbox', tasks:['nightly smoke e2e task'] } } },
  { jsonrpc:'2.0', id:3, method:'tools/call', params:{ name:'enqueue_ingestion', arguments:{ block_id:'b.smoke-sandbox', note:'smoke e2e queued insight', apply_to_rules:false } } },
  { jsonrpc:'2.0', id:4, method:'tools/call', params:{ name:'apply_ingestion_queue', arguments:{} } },
  { jsonrpc:'2.0', id:5, method:'tools/call', params:{ name:'build_context_pack', arguments:{ block_id:'b.smoke-sandbox' } } },
  { jsonrpc:'2.0', id:6, method:'tools/call', params:{ name:'generate_validated_bundle', arguments:{} } },
  { jsonrpc:'2.0', id:7, method:'tools/call', params:{ name:'render_wiki_html', arguments:{} } },
];

const input = payload.map(x=>JSON.stringify(x)).join('\n')+'\n';
const r = spawnSync('node', ['scripts/mcp_atlas_server.mjs'], { input, encoding:'utf8' });
if (r.status !== 0) {
  console.error('mcp_smoke_e2e: server process failed');
  console.error(r.stderr || r.stdout);
  process.exit(r.status ?? 1);
}

const lines = (r.stdout || '').trim().split(/\r?\n/).filter(Boolean);
const responses = lines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const byId = Object.fromEntries(responses.map(x => [x.id, x]));
for (const id of [2,3,4,5,6,7]) {
  if (!byId[id] || byId[id].error) {
    console.error(`mcp_smoke_e2e: call failed for id=${id}`);
    console.error(JSON.stringify(byId[id] || null, null, 2));
    process.exit(1);
  }
}

console.log('mcp_smoke_e2e: OK');

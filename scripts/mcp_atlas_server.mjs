#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { execSync } from 'node:child_process';

const root = process.cwd();
const atlasRoot = path.join(root, 'atlas');

function readJson(p){ return JSON.parse(fs.readFileSync(p,'utf8')); }
function readText(p){ return fs.existsSync(p) ? fs.readFileSync(p,'utf8') : ''; }

function blockDir(blockId){ return path.join(atlasRoot, 'blocks', blockId); }

function toolList(){
  return [
    { name:'read_block', description:'Read all markdown files for block', inputSchema:{ type:'object', properties:{ block_id:{type:'string'} }, required:['block_id'] } },
    { name:'list_dependencies', description:'List dependencies from depends_on.md', inputSchema:{ type:'object', properties:{ block_id:{type:'string'} }, required:['block_id'] } },
    { name:'sync_check', description:'Run atlas validators (contracts/dependencies/acceptance)', inputSchema:{ type:'object', properties:{} } },
    { name:'create_block', description:'Create/init block in atlas graph and docs', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, title:{type:'string'} }, required:['block_id'] } },
    { name:'set_block_mission', description:'Update mission.md for block', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, mission:{type:'string'} }, required:['block_id','mission'] } },
    { name:'generate_wiki', description:'Generate atlas WIKI.md', inputSchema:{ type:'object', properties:{} } },
    { name:'generate_tz', description:'Generate ТЗ/auto_tz.md from atlas', inputSchema:{ type:'object', properties:{} } },
    { name:'transition_block', description:'Change block status in graph', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, to:{type:'string'} }, required:['block_id','to'] } },
    { name:'log_check', description:'Append check record to block checks.log', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, kind:{type:'string'}, result:{type:'string'}, note:{type:'string'} }, required:['block_id','kind','result'] } },
    { name:'mark_file_dead', description:'Append dead-file mark in block tasks', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, file_path:{type:'string'}, reason:{type:'string'} }, required:['block_id','file_path'] } },
    { name:'set_dependencies', description:'Overwrite depends_on.md entries', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, entries:{type:'array', items:{type:'string'}} }, required:['block_id','entries'] } },
    { name:'set_provides', description:'Overwrite provides.md entries', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, entries:{type:'array', items:{type:'string'}} }, required:['block_id','entries'] } },
    { name:'set_tasks', description:'Overwrite tasks.md body', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, tasks:{type:'array', items:{type:'string'}} }, required:['block_id','tasks'] } },
    { name:'update_block', description:'Atomic update for title/status/depends/provides/tasks/mission', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, title:{type:'string'}, status:{type:'string'}, depends:{type:'array',items:{type:'string'}}, provides:{type:'array',items:{type:'string'}}, tasks:{type:'array',items:{type:'string'}}, mission:{type:'string'} }, required:['block_id'] } },
    { name:'generate_full_bundle', description:'Generate wiki, auto_tz and roadmap', inputSchema:{ type:'object', properties:{} } },
    { name:'generate_validated_bundle', description:'Run sync checks then generate bundle if all pass', inputSchema:{ type:'object', properties:{} } },
    { name:'nightly_consolidation', description:'Run validators + generators and write atlas/nightly_report.md', inputSchema:{ type:'object', properties:{} } },
    { name:'render_wiki_html', description:'Render atlas/WIKI.md to atlas/wiki.html', inputSchema:{ type:'object', properties:{} } },
    { name:'ingest_chat_distillate', description:'Append distilled chat insight to decisions/patterns/checks of block', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, note:{type:'string'} }, required:['block_id','note'] } },
    { name:'build_context_pack', description:'Build deterministic context-pack json for block', inputSchema:{ type:'object', properties:{ block_id:{type:'string'} }, required:['block_id'] } },
    { name:'enqueue_ingestion', description:'Queue distilled chat insight for nightly ingestion', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, note:{type:'string'}, apply_to_rules:{type:'boolean'}, conversation_text:{type:'string'} }, required:['block_id','note'] } },
    { name:'apply_ingestion_queue', description:'Apply queued distillates into block memory files', inputSchema:{ type:'object', properties:{} } },
    { name:'ingest_chat_batches', description:'Batch-ingest transcript JSONL into queue and apply automatically', inputSchema:{ type:'object', properties:{ transcript_path:{type:'string'}, block_id:{type:'string'}, batch_size:{type:'number'} }, required:['transcript_path'] } },
    { name:'run_block_process', description:'Run sync/audit/context process for a selected block and persist report', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, process:{type:'string'} }, required:['block_id'] } },
    { name:'finalize_iteration', description:'One-command ritual: ingest->process->nightly->wiki->tz', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, transcript_path:{type:'string'} }, required:['block_id'] } },

  ];
}

function parseDepends(md){
  return md.split(/\r?\n/).map(s=>s.trim()).filter(s=>s.startsWith('- ')).map(s=>s.slice(2));
}

function runSync(){
  const res = { contracts:true, dependencies:true, acceptance:true, errors:[] };
  try { readJson(path.join(atlasRoot,'graph.json')); } catch(e){ res.contracts=false; res.errors.push('graph.json unreadable'); }
  // lightweight checks based on existing scripts behavior
  const graph = readJson(path.join(atlasRoot,'graph.json'));
  for (const b of graph.blocks || []){
    const dir = blockDir(b.id);
    for (const f of ['mission.md','kpi.md','acceptance.md','tasks.md','checks.log']){
      const p = path.join(dir,f);
      if (!fs.existsSync(p) || !readText(p).trim()){ res.contracts=false; res.errors.push(`${b.id}: invalid ${f}`); }
    }
    const deps = parseDepends(readText(path.join(dir,'depends_on.md'))).filter(x=>x!=='none');
    for (const d of deps){
      const [dep,cap] = d.split(':').map(x=>x.trim());
      const prov = parseDepends(readText(path.join(blockDir(dep),'provides.md'))).filter(x=>x!=='none');
      if (!prov.includes(cap)){ res.dependencies=false; res.errors.push(`${b.id}: ${dep} !provides ${cap}`); }
    }
    if (['review','done'].includes(b.status)){
      const checks = readText(path.join(dir,'checks.log')).toLowerCase();
      if (!checks.includes('acceptance')){ res.acceptance=false; res.errors.push(`${b.id}: missing acceptance`); }
      if (b.status==='done' && (!checks.includes('kpi') || !checks.includes('pass'))){ res.acceptance=false; res.errors.push(`${b.id}: missing kpi pass`); }
    }
  }
  return res;
}


function ensureBlock(blockId, title=''){
  const gpath = path.join(atlasRoot,'graph.json');
  const g = readJson(gpath);
  let b = (g.blocks||[]).find(x=>x.id===blockId);
  if (!b){ b={id:blockId,title:title||blockId,status:'idea',depends_on:[]}; g.blocks.push(b); }
  if (title) b.title = title;
  fs.writeFileSync(gpath, JSON.stringify(g, null, 2)+'\n','utf8');
  const dir = blockDir(blockId); fs.mkdirSync(dir,{recursive:true});
  const tpl = {
    'mission.md': `# ${blockId} — mission\n\n${title||blockId}: цель блока.\n`,
    'kpi.md': `# ${blockId} — KPI\n\n- KPI-1: определить\n`,
    'acceptance.md': `# ${blockId} — acceptance\n\n- [ ] acceptance criteria\n`,
    'tasks.md': `# ${blockId} — tasks\n\n- [ ] task-1\n`,
    'checks.log': '',
    'depends_on.md': `# ${blockId} — depends_on\n\n- none\n`,
    'provides.md': `# ${blockId} — provides\n\n- none\n`,
  };
  for (const [f,t] of Object.entries(tpl)){ const p=path.join(dir,f); if(!fs.existsSync(p)) fs.writeFileSync(p,t,'utf8'); }
}

function setMission(blockId, mission){
  ensureBlock(blockId);
  fs.writeFileSync(path.join(blockDir(blockId),'mission.md'), `# ${blockId} — mission\n\n${mission}\n`, 'utf8');
}

function generateWiki(){
  const graph = readJson(path.join(atlasRoot,'graph.json'));
  let md = '# Sima Atlas Wiki\n\n';
  for (const b of graph.blocks || []){
    const dir = blockDir(b.id);
    md += `## ${b.id} — ${b.title}\n- status: **${b.status}**\n\n`;
    md += readText(path.join(dir,'mission.md')) + '\n\n';
  }
  fs.writeFileSync(path.join(atlasRoot,'WIKI.md'), md,'utf8');
}


function transitionBlock(blockId, to){
  const gpath = path.join(atlasRoot,'graph.json');
  const g = readJson(gpath);
  const b = (g.blocks||[]).find(x=>x.id===blockId);
  if (!b) throw new Error(`block not found: ${blockId}`);
  b.status = to;
  fs.writeFileSync(gpath, JSON.stringify(g, null, 2)+'\n','utf8');
}

function appendCheck(blockId, kind, result, note=''){
  ensureBlock(blockId);
  const p = path.join(blockDir(blockId),'checks.log');
  const line = `${new Date().toISOString()}  ${kind}  ${result}${note?`  ${note}`:''}\n`;
  fs.appendFileSync(p, line, 'utf8');
}

function upsertFilesMd(blockId, filePath, status, reason=''){
  ensureBlock(blockId);
  const p = path.join(blockDir(blockId),'files.md');
  let cur = readText(p);
  if (!cur.trim()) cur = `# ${blockId} — files\n\n- none\n`;
  const lines = cur.split(/\r?\n/).filter(Boolean).filter(l => !l.startsWith(`- ${filePath} [`));
  if (lines[lines.length-1] === '- none') lines.pop();
  lines.push(`- ${filePath} [${status}]${reason?` (${reason})`:''}`);
  fs.writeFileSync(p, lines.join('\n')+'\n','utf8');
}

function markFileDead(blockId, filePath, reason=''){
  ensureBlock(blockId);
  const p = path.join(blockDir(blockId),'tasks.md');
  fs.appendFileSync(p, `\n- [ ] dead-file: ${filePath}${reason?` (${reason})`:''}`, 'utf8');
  upsertFilesMd(blockId, filePath, 'dead', reason);
  appendCheck(blockId, 'files', 'pass', `marked dead: ${filePath}`);
}


function setListFile(blockId, fileName, header, entries){
  ensureBlock(blockId);
  const body = entries.length ? entries.map(e=>`- ${e}`).join('\n') : '- none';
  fs.writeFileSync(path.join(blockDir(blockId),fileName), `# ${blockId} — ${header}\n\n${body}\n`, 'utf8');
}

function setTasks(blockId, tasks){
  ensureBlock(blockId);
  const body = tasks.map(t=>`- [ ] ${t}`).join('\n');
  fs.writeFileSync(path.join(blockDir(blockId),'tasks.md'), `# ${blockId} — tasks\n\n${body}\n`, 'utf8');
}


function updateBlock(args){
  const blockId = args.block_id;
  ensureBlock(blockId, args.title || '');
  if (args.title){
    const gpath = path.join(atlasRoot,'graph.json');
    const g = readJson(gpath);
    const b = (g.blocks||[]).find(x=>x.id===blockId);
    if (b) b.title = args.title;
    fs.writeFileSync(gpath, JSON.stringify(g, null, 2)+'\n','utf8');
  }
  if (args.status) transitionBlock(blockId, args.status);
  if (Array.isArray(args.depends)) setListFile(blockId, 'depends_on.md', 'depends_on', args.depends);
  if (Array.isArray(args.provides)) setListFile(blockId, 'provides.md', 'provides', args.provides);
  if (Array.isArray(args.tasks)) setTasks(blockId, args.tasks);
  if (typeof args.mission === 'string') setMission(blockId, args.mission);
  appendCheck(blockId, 'sync', 'pass', 'update_block');
}

function generateRoadmap(){
  const graph = readJson(path.join(atlasRoot,'graph.json'));
  const rank = { broken:0, drift:1, wip:2, idea:3, review:4, done:5 };
  const ordered = [...(graph.blocks||[])].sort((a,b)=>(rank[a.status]??99)-(rank[b.status]??99));
  let md = '# Roadmap (auto-generated)\n\n';
  md += `_Generated: ${new Date().toISOString()}_\n\n`;
  md += 'Приоритет: broken → drift → wip → idea → review → done.\n\n';
  ordered.forEach((b,i)=>{ md += `${i+1}. **${b.id}** (${b.status}) — ${b.title}\n`; });
  fs.writeFileSync(path.join(atlasRoot,'roadmap.md'), md, 'utf8');
}

function generateTz(){
  const graph = readJson(path.join(atlasRoot,'graph.json'));
  const tzDir = path.join(root,'ТЗ');
  if (!fs.existsSync(tzDir)) fs.mkdirSync(tzDir, { recursive:true });
  let md = '# AUTO ТЗ (из Atlas)\n\n';
  for (const b of graph.blocks || []){
    md += `## ${b.id} (${b.status})\n\n`;
    md += readText(path.join(blockDir(b.id),'mission.md')) + '\n\n';
    md += readText(path.join(blockDir(b.id),'tasks.md')) + '\n\n';
  }
  fs.writeFileSync(path.join(tzDir,'auto_tz.md'), md,'utf8');
}


function validateAllStrict(){
  const report = runSync();
  return report.contracts && report.dependencies && report.acceptance;
}

function respond(id, result){
  process.stdout.write(JSON.stringify({ jsonrpc:'2.0', id, result })+'\n');
}
function respondErr(id, message){
  process.stdout.write(JSON.stringify({ jsonrpc:'2.0', id, error:{ code:-32000, message } })+'\n');
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  try {
    if (method === 'initialize') return respond(id, { protocolVersion:'2024-11-05', serverInfo:{ name:'sima-atlas-mcp', version:'0.1.0' }, capabilities:{ tools:{} } });
    if (method === 'tools/list') return respond(id, { tools: toolList() });
    if (method === 'tools/call') {
      const name = params?.name;
      const args = params?.arguments || {};
      if (name === 'read_block') {
        const bid = args.block_id;
        const dir = blockDir(bid);
        if (!fs.existsSync(dir)) return respondErr(id, `block not found: ${bid}`);
        const files = fs.readdirSync(dir).filter(f=>f.endsWith('.md')||f.endsWith('.log'));
        const payload = Object.fromEntries(files.map(f => [f, readText(path.join(dir,f))]));
        return respond(id, { content:[{ type:'text', text: JSON.stringify(payload, null, 2) }] });
      }
      if (name === 'list_dependencies') {
        const bid = args.block_id;
        const deps = parseDepends(readText(path.join(blockDir(bid),'depends_on.md'))).filter(x=>x!=='none');
        return respond(id, { content:[{ type:'text', text: JSON.stringify({ block_id: bid, dependencies: deps }, null, 2) }] });
      }
      if (name === 'sync_check') {
        const report = runSync();
        return respond(id, { content:[{ type:'text', text: JSON.stringify(report, null, 2) }] });
      }
      if (name === 'create_block') {
        ensureBlock(args.block_id, args.title || '');
        appendCheck(args.block_id, 'sync', 'pass', 'create_block');
        return respond(id, { content:[{ type:'text', text: `block created: ${args.block_id}` }] });
      }
      if (name === 'set_block_mission') {
        setMission(args.block_id, args.mission);
        appendCheck(args.block_id, 'sync', 'pass', 'set_block_mission');
        return respond(id, { content:[{ type:'text', text: `mission updated: ${args.block_id}` }] });
      }
      if (name === 'generate_wiki') {
        generateWiki();
        return respond(id, { content:[{ type:'text', text: 'generated atlas/WIKI.md' }] });
      }
      if (name === 'generate_tz') {
        generateTz();
        return respond(id, { content:[{ type:'text', text: 'generated ТЗ/auto_tz.md' }] });
      }
      if (name === 'transition_block') {
        transitionBlock(args.block_id, args.to);
        appendCheck(args.block_id, 'sync', 'pass', `transition -> ${args.to}`);
        return respond(id, { content:[{ type:'text', text: `status updated: ${args.block_id} -> ${args.to}` }] });
      }
      if (name === 'log_check') {
        appendCheck(args.block_id, args.kind, args.result, args.note || '');
        return respond(id, { content:[{ type:'text', text: `check appended: ${args.block_id}` }] });
      }
      if (name === 'mark_file_dead') {
        markFileDead(args.block_id, args.file_path, args.reason || '');
        return respond(id, { content:[{ type:'text', text: `file marked dead in tasks: ${args.file_path}` }] });
      }

      if (name === 'set_dependencies') {
        setListFile(args.block_id, 'depends_on.md', 'depends_on', args.entries || []);
        appendCheck(args.block_id, 'sync', 'pass', 'set_dependencies');
        return respond(id, { content:[{ type:'text', text: `depends_on updated: ${args.block_id}` }] });
      }
      if (name === 'set_provides') {
        setListFile(args.block_id, 'provides.md', 'provides', args.entries || []);
        appendCheck(args.block_id, 'sync', 'pass', 'set_provides');
        return respond(id, { content:[{ type:'text', text: `provides updated: ${args.block_id}` }] });
      }
      if (name === 'set_tasks') {
        setTasks(args.block_id, args.tasks || []);
        appendCheck(args.block_id, 'sync', 'pass', 'set_tasks');
        return respond(id, { content:[{ type:'text', text: `tasks updated: ${args.block_id}` }] });
      }
      if (name === 'update_block') {
        updateBlock(args);
        return respond(id, { content:[{ type:'text', text: `block updated: ${args.block_id}` }] });
      }
      if (name === 'generate_full_bundle') {
        generateWiki();
        generateTz();
        generateRoadmap();
        return respond(id, { content:[{ type:'text', text: 'generated wiki + auto_tz + roadmap' }] });
      }
      if (name === 'generate_validated_bundle') {
        const ok = validateAllStrict();
        if (!ok) return respondErr(id, 'validation failed; bundle not generated');
        generateWiki();
        generateTz();
        generateRoadmap();
        return respond(id, { content:[{ type:'text', text: 'validated bundle generated' }] });
      }
      if (name === 'nightly_consolidation') {
        execSync('node scripts/nightly_consolidation.mjs', { cwd: root, stdio:'pipe' });
        return respond(id, { content:[{ type:'text', text: 'nightly consolidation completed (atlas/nightly_report.md)' }] });
      }
      if (name === 'render_wiki_html') {
        execSync('node scripts/render_wiki_html.mjs', { cwd: root, stdio:'pipe' });
        return respond(id, { content:[{ type:'text', text: 'rendered atlas/wiki.html' }] });
      }
      if (name === 'ingest_chat_distillate') {
        const bid = args.block_id;
        const note = String(args.note || '').replace(/"/g, '\"');
        execSync(`node scripts/ingest_chat_distillate.mjs ${bid} "${note}"`, { cwd: root, stdio:'pipe' });
        return respond(id, { content:[{ type:'text', text: `distillate ingested: ${bid}` }] });
      }


      if (name === 'build_context_pack') {
        const bid = args.block_id;
        execSync(`node scripts/build_context_pack.mjs ${bid}`, { cwd: root, stdio:'pipe' });
        return respond(id, { content:[{ type:'text', text: `context-pack built: ${bid}` }] });
      }

      if (name === 'enqueue_ingestion') {
        const bid = args.block_id;
        const note = String(args.note || '').replace(/"/g, '\"');
        const apply = args.apply_to_rules ? 'true' : 'false';
        const convo = String(args.conversation_text || '').replace(/"/g, '\"');
        execSync(`node scripts/enqueue_ingestion_item.mjs ${bid} "${note}" ${apply} "${convo}"`, { cwd: root, stdio:'pipe' });
        return respond(id, { content:[{ type:'text', text: `ingestion queued: ${bid}` }] });
      }

      if (name === 'apply_ingestion_queue') {
        execSync('node scripts/apply_ingestion_queue.mjs', { cwd: root, stdio:'pipe' });
        return respond(id, { content:[{ type:'text', text: 'ingestion queue applied' }] });
      }


      if (name === 'ingest_chat_batches') {
        const transcriptPath = String(args.transcript_path || '');
        const blockId = String(args.block_id || 'b.docs');
        const batchSize = Number(args.batch_size || 6);
        execSync(`node scripts/ingest_chat_batches.mjs "${transcriptPath}" ${blockId} ${batchSize}`, { cwd: root, stdio:'pipe' });
        return respond(id, { content:[{ type:'text', text: `chat batches ingested: ${transcriptPath}` }] });
      }


      if (name === 'run_block_process') {
        const bid = String(args.block_id || '');
        const proc = String(args.process || 'sync_audit_context');
        execSync(`node scripts/run_block_process.mjs ${bid} ${proc}`, { cwd: root, stdio:'pipe' });
        return respond(id, { content:[{ type:'text', text: `block process executed: ${bid}` }] });
      }


      if (name === 'finalize_iteration') {
        const bid = String(args.block_id || 'b.docs');
        const transcriptPath = String(args.transcript_path || '');
        execSync(`node scripts/finalize_cursor_iteration.mjs ${bid} "${transcriptPath}"`, { cwd: root, stdio:'pipe' });
        return respond(id, { content:[{ type:'text', text: `iteration finalized: ${bid}` }] });
      }

      return respondErr(id, `unknown tool: ${name}`);
    }
    return respondErr(id, `unknown method: ${method}`);
  } catch (e) {
    return respondErr(id, e.message || String(e));
  }
});

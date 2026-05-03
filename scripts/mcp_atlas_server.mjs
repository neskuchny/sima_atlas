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
    { name:'list_proposals', description:'PR3.5: list pending LLM proposals for existing blocks', inputSchema:{ type:'object', properties:{ block_id:{type:'string'} } } },
    { name:'accept_proposal', description:'PR3.5: accept a pending LLM proposal — applies structural changes to graph.json + checks.log trace', inputSchema:{ type:'object', properties:{ proposal_id:{type:'string'} }, required:['proposal_id'] } },
    { name:'reject_proposal', description:'PR3.5: reject a pending LLM proposal with a reason', inputSchema:{ type:'object', properties:{ proposal_id:{type:'string'}, reason:{type:'string'} }, required:['proposal_id'] } },
    { name:'run_block_implementation', description:'PR4.5: run the configured coding agent (claude / codex / cursor) on the given block; writes prompt to atlas/agent_invocations/ and logs an agent_invocation check', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, prompt:{type:'string'}, agent:{type:'string'} }, required:['block_id'] } },
    { name:'read_operator_profile', description:'PR-1 (b.operator-profile-learner): read aggregated operator profile (profile.json). When no profile exists yet — returns warming_up.', inputSchema:{ type:'object', properties:{} } },
    { name:'recompute_operator_profile', description:'PR-1 (b.operator-profile-learner): re-aggregate operator profile from current repo signals (transitions / checks.log / llm_traces / proposals). Idempotent.', inputSchema:{ type:'object', properties:{} } },
    { name:'parse_acceptance', description:'PR-1 (b.acceptance-verifier-loop): parse atlas/blocks/<id>/acceptance.md into structured assertions (id, label, text, checked, evidence_kind, evidence_spec). Default evidence_kind = llm_judge when not declared in YAML block.', inputSchema:{ type:'object', properties:{ block_id:{type:'string'} }, required:['block_id'] } },
    { name:'collect_evidence', description:'PR-2 (b.acceptance-verifier-loop): run a single deterministic evidence collector. evidence_kind ∈ {exit_code, fs_glob, file_diff, log_grep, selftest_run}. Returns {verdict, evidence, reasoning, raw, duration_ms}.', inputSchema:{ type:'object', properties:{ evidence_kind:{type:'string'}, evidence_spec:{type:'object'} }, required:['evidence_kind','evidence_spec'] } },
    { name:'verify_block_acceptance', description:'PR-2 (b.acceptance-verifier-loop): parse acceptance.md AND collect evidence per assertion in one shot. Returns {block_id, assertions: [...], counts: {pass, fail, skipped}, verdict}.', inputSchema:{ type:'object', properties:{ block_id:{type:'string'} }, required:['block_id'] } },
    { name:'judge_assertion', description:'PR-3 (b.acceptance-verifier-loop): LLM-judge fallback for an individual assertion. Returns {verdict: pass|fail|inconclusive, reasoning, evidence_quote, cost_usd, provider}. Inconclusive on missing API key — never silent pass.', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, assertion_id:{type:'string'} }, required:['block_id','assertion_id'] } },
    { name:'read_acceptance_run', description:'PR-4 (b.acceptance-verifier-loop): read atlas/acceptance_runs/<block>/_latest.json — full assertion-level verdict report from the most recent verifier run.', inputSchema:{ type:'object', properties:{ block_id:{type:'string'} }, required:['block_id'] } },
    { name:'list_failed_acceptances', description:'PR-4 (b.acceptance-verifier-loop): list every block whose latest verifier verdict is fail or inconclusive (with sample failures).', inputSchema:{ type:'object', properties:{} } },
    { name:'list_lessons', description:'PR-4 (b.operator-profile-learner): list operator lessons stored in atlas/operator_profile/lessons.json.', inputSchema:{ type:'object', properties:{} } },
    { name:'add_lesson', description:'PR-4 (b.operator-profile-learner): manually add an operator lesson with ≥ 2 evidence items.', inputSchema:{ type:'object', properties:{ lesson:{type:'string'}, evidence:{type:'array', items:{type:'string'}}, expires_at:{type:'string'} }, required:['lesson','evidence'] } },
    { name:'revoke_lesson', description:'PR-4 (b.operator-profile-learner): revoke a stored lesson by id.', inputSchema:{ type:'object', properties:{ lesson_id:{type:'string'} }, required:['lesson_id'] } },
    { name:'analyze_lessons', description:'PR-4 (b.operator-profile-learner): trigger LLM-driven lessons analysis over the last N days of fail records.', inputSchema:{ type:'object', properties:{ window_days:{type:'number'}, dry_run:{type:'boolean'} } } },
    { name:'list_dont_use', description:'PR-3 (b.operator-profile-learner): list operator dont_use bans.', inputSchema:{ type:'object', properties:{} } },
    { name:'set_dont_use', description:'PR-3 (b.operator-profile-learner): add (or update reason of) a personal dont_use ban — guard_against_drift will block matching shell commands and ProposalsPanel will mark conflicting proposals.', inputSchema:{ type:'object', properties:{ value:{type:'string'}, reason:{type:'string'} }, required:['value'] } },
    { name:'clear_dont_use', description:'PR-3 (b.operator-profile-learner): remove a personal dont_use ban.', inputSchema:{ type:'object', properties:{ value:{type:'string'} }, required:['value'] } },
    { name:'list_always_use', description:'PR-3 (b.operator-profile-learner): list operator always_use entries (category → value).', inputSchema:{ type:'object', properties:{} } },
    { name:'set_always_use', description:'PR-3 (b.operator-profile-learner): pin a category default (e.g. language=typescript). Surfaces in inject_context_pack alongside dont_use.', inputSchema:{ type:'object', properties:{ category:{type:'string'}, value:{type:'string'}, reason:{type:'string'} }, required:['category','value'] } },
    { name:'clear_always_use', description:'PR-3 (b.operator-profile-learner): remove an always_use pin.', inputSchema:{ type:'object', properties:{ category:{type:'string'}, value:{type:'string'} }, required:['category','value'] } },
    { name:'introspect_block_ui', description:'PR-1 (b.user-docs-generator): scan alive JSX/HTML files of a block and return structured UI elements (buttons, inputs, textareas, forms, links, routes, fetches). Used by PR-2 LLM tutorial writer.', inputSchema:{ type:'object', properties:{ block_id:{type:'string'} }, required:['block_id'] } },
    { name:'generate_user_docs', description:'PR-2 (b.user-docs-generator): generate end-user tutorial markdown for a block via b.llm-gateway. Idempotent (skips if source hash unchanged). Writes atlas/docs/end-user/<block>.md + _meta/<block>.json. Cost cap $0.03/run.', inputSchema:{ type:'object', properties:{ block_id:{type:'string'}, lang:{type:'string'}, dry_run:{type:'boolean'} }, required:['block_id'] } },

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

      // PR3.5 — proposals (Accept/Reject flow for LLM-suggested updates)
      if (name === 'list_proposals') {
        const blockArg = args.block_id ? ['--block', String(args.block_id)] : [];
        const out = execSync(`node scripts/list_proposals.mjs --json ${blockArg.join(' ')}`, { cwd: root, stdio:'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out || '[]' }] });
      }
      if (name === 'accept_proposal') {
        const pid = String(args.proposal_id || '');
        if (!pid) return respondErr(id, 'accept_proposal: proposal_id required');
        const out = execSync(`node scripts/accept_proposal.mjs ${JSON.stringify(pid)}`, { cwd: root, stdio:'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out }] });
      }
      if (name === 'reject_proposal') {
        const pid = String(args.proposal_id || '');
        if (!pid) return respondErr(id, 'reject_proposal: proposal_id required');
        const reason = String(args.reason || '').replace(/"/g, '\\"');
        const out = execSync(`node scripts/reject_proposal.mjs ${JSON.stringify(pid)} "${reason}"`, { cwd: root, stdio:'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out }] });
      }
      if (name === 'run_block_implementation') {
        const bid = String(args.block_id || '');
        if (!bid) return respondErr(id, 'run_block_implementation: block_id required');
        const userPrompt = String(args.prompt || '');
        const agentEnv = args.agent ? { ATLAS_AGENT: String(args.agent) } : {};
        const cmdArgs = userPrompt ? [bid, '--', userPrompt] : [bid];
        const out = execSync(`node scripts/run_block_implementation.mjs ${cmdArgs.map(a => JSON.stringify(a)).join(' ')}`, { cwd: root, stdio:'pipe', env: { ...process.env, ...agentEnv } }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out }] });
      }

      if (name === 'read_operator_profile') {
        const p = path.join(atlasRoot, 'operator_profile', 'profile.json');
        if (!fs.existsSync(p)) {
          return respond(id, { content:[{ type:'text', text: JSON.stringify({ _status: 'warming_up', _note: 'profile.json not generated yet — run aggregate_operator_profile.mjs first.' }) }] });
        }
        return respond(id, { content:[{ type:'text', text: fs.readFileSync(p, 'utf8') }] });
      }
      if (name === 'recompute_operator_profile') {
        const out = execSync('node scripts/aggregate_operator_profile.mjs', { cwd: root, stdio: 'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out }] });
      }

      if (name === 'parse_acceptance') {
        const bid = String(args.block_id || '');
        if (!bid) return respondErr(id, 'parse_acceptance: block_id required');
        const out = execSync(`node scripts/parse_acceptance.mjs ${JSON.stringify(bid)} --json`, { cwd: root, stdio: 'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out }] });
      }
      if (name === 'collect_evidence') {
        const kind = String(args.evidence_kind || '');
        const spec = JSON.stringify(args.evidence_spec || {});
        if (!kind) return respondErr(id, 'collect_evidence: evidence_kind required');
        const out = execSync(`node scripts/collect_evidence.mjs --kind ${JSON.stringify(kind)} --spec ${JSON.stringify(spec)} --json`, { cwd: root, stdio: 'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out }] });
      }
      if (name === 'verify_block_acceptance') {
        const bid = String(args.block_id || '');
        if (!bid) return respondErr(id, 'verify_block_acceptance: block_id required');
        const out = execSync(`node scripts/collect_evidence.mjs --block ${JSON.stringify(bid)} --json`, { cwd: root, stdio: 'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out }] });
      }
      if (name === 'judge_assertion') {
        const bid = String(args.block_id || '');
        const aid = String(args.assertion_id || '');
        if (!bid || !aid) return respondErr(id, 'judge_assertion: block_id + assertion_id required');
        const out = execSync(`node scripts/judge_assertion.mjs --block ${JSON.stringify(bid)} --id ${JSON.stringify(aid)} --json`, { cwd: root, stdio: 'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out }] });
      }
      if (name === 'read_acceptance_run') {
        const bid = String(args.block_id || '');
        if (!bid) return respondErr(id, 'read_acceptance_run: block_id required');
        const p = path.join(atlasRoot, 'acceptance_runs', bid, '_latest.json');
        if (!fs.existsSync(p)) {
          return respond(id, { content:[{ type:'text', text: JSON.stringify({ block_id: bid, _status: 'no_run', hint: `node scripts/verify_block_acceptance.mjs ${bid}` }) }] });
        }
        return respond(id, { content:[{ type:'text', text: fs.readFileSync(p, 'utf8') }] });
      }
      if (name === 'list_lessons') {
        const out = execSync('node scripts/analyze_lessons_from_history.mjs list --json', { cwd: root, stdio: 'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out || '[]' }] });
      }
      if (name === 'add_lesson') {
        const txt = String(args.lesson || '');
        const ev = Array.isArray(args.evidence) ? args.evidence : [];
        if (!txt || ev.length < 2) return respondErr(id, 'add_lesson: lesson + at least 2 evidence items required');
        const evArg = ev.join(',');
        const out = execSync(`node scripts/analyze_lessons_from_history.mjs add ${JSON.stringify(txt)} --evidence ${JSON.stringify(evArg)}`, { cwd: root, stdio: 'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out }] });
      }
      if (name === 'revoke_lesson') {
        const lid = String(args.lesson_id || '');
        if (!lid) return respondErr(id, 'revoke_lesson: lesson_id required');
        const out = execSync(`node scripts/analyze_lessons_from_history.mjs revoke ${JSON.stringify(lid)}`, { cwd: root, stdio: 'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out }] });
      }
      if (name === 'analyze_lessons') {
        const wd = Number(args.window_days || 30);
        const dry = args.dry_run ? '--dry-run' : '';
        const out = execSync(`node scripts/analyze_lessons_from_history.mjs --window-days ${wd} --json ${dry}`, { cwd: root, stdio: 'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out }] });
      }
      if (name === 'list_dont_use') {
        const out = execSync('node scripts/manage_dont_use.mjs list --json', { cwd: root, stdio: 'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out || '[]' }] });
      }
      if (name === 'set_dont_use') {
        const value = String(args.value || '');
        const reason = String(args.reason || '');
        if (!value) return respondErr(id, 'set_dont_use: value required');
        const cmd = reason
          ? `node scripts/manage_dont_use.mjs add ${JSON.stringify(value)} ${JSON.stringify(reason)} --json`
          : `node scripts/manage_dont_use.mjs add ${JSON.stringify(value)} --json`;
        const out = execSync(cmd, { cwd: root, stdio: 'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out }] });
      }
      if (name === 'clear_dont_use') {
        const value = String(args.value || '');
        if (!value) return respondErr(id, 'clear_dont_use: value required');
        try {
          const out = execSync(`node scripts/manage_dont_use.mjs clear ${JSON.stringify(value)} --json`, { cwd: root, stdio: 'pipe' }).toString().trim();
          return respond(id, { content:[{ type:'text', text: out }] });
        } catch (e) {
          // exit 2 on not_found is normal — surface message anyway
          return respond(id, { content:[{ type:'text', text: (e.stdout || '').toString().trim() || JSON.stringify({ cleared: false, reason: 'not_found' }) }] });
        }
      }
      if (name === 'list_always_use') {
        const out = execSync('node scripts/manage_dont_use.mjs always list --json', { cwd: root, stdio: 'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out || '[]' }] });
      }
      if (name === 'set_always_use') {
        const cat = String(args.category || '');
        const value = String(args.value || '');
        const reason = String(args.reason || '');
        if (!cat || !value) return respondErr(id, 'set_always_use: category + value required');
        const cmd = reason
          ? `node scripts/manage_dont_use.mjs always add ${JSON.stringify(cat)} ${JSON.stringify(value)} ${JSON.stringify(reason)} --json`
          : `node scripts/manage_dont_use.mjs always add ${JSON.stringify(cat)} ${JSON.stringify(value)} --json`;
        const out = execSync(cmd, { cwd: root, stdio: 'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out }] });
      }
      if (name === 'introspect_block_ui') {
        const bid = String(args.block_id || '');
        if (!bid) return respondErr(id, 'introspect_block_ui: block_id required');
        const out = execSync(`node scripts/introspect_block_ui.mjs ${JSON.stringify(bid)} --json`, { cwd: root, stdio: 'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out }] });
      }
      if (name === 'generate_user_docs') {
        const bid = String(args.block_id || '');
        if (!bid) return respondErr(id, 'generate_user_docs: block_id required');
        const lang = args.lang ? `--lang ${JSON.stringify(String(args.lang))}` : '';
        const dry = args.dry_run ? '--dry-run' : '';
        const out = execSync(`node scripts/generate_user_docs.mjs ${JSON.stringify(bid)} --json ${lang} ${dry}`, { cwd: root, stdio: 'pipe' }).toString().trim();
        return respond(id, { content:[{ type:'text', text: out }] });
      }
      if (name === 'clear_always_use') {
        const cat = String(args.category || '');
        const value = String(args.value || '');
        if (!cat || !value) return respondErr(id, 'clear_always_use: category + value required');
        try {
          const out = execSync(`node scripts/manage_dont_use.mjs always clear ${JSON.stringify(cat)} ${JSON.stringify(value)} --json`, { cwd: root, stdio: 'pipe' }).toString().trim();
          return respond(id, { content:[{ type:'text', text: out }] });
        } catch (e) {
          return respond(id, { content:[{ type:'text', text: (e.stdout || '').toString().trim() || JSON.stringify({ cleared: false, reason: 'not_found' }) }] });
        }
      }
      if (name === 'list_failed_acceptances') {
        const dir = path.join(atlasRoot, 'acceptance_runs');
        const out = [];
        if (fs.existsSync(dir)) {
          for (const blockId of fs.readdirSync(dir)) {
            const latest = path.join(dir, blockId, '_latest.json');
            if (!fs.existsSync(latest)) continue;
            try {
              const j = JSON.parse(fs.readFileSync(latest, 'utf8'));
              if (j.verdict === 'pass') continue;
              const sample = (j.assertions || []).filter((a) => a.verdict === 'fail').slice(0, 3).map((a) => ({ id: a.id, evidence: a.evidence }));
              out.push({ block_id: blockId, verdict: j.verdict, counts: j.counts, sample_failures: sample, checked_at: j.checked_at });
            } catch {}
          }
        }
        return respond(id, { content:[{ type:'text', text: JSON.stringify(out, null, 2) }] });
      }

      return respondErr(id, `unknown tool: ${name}`);
    }
    return respondErr(id, `unknown method: ${method}`);
  } catch (e) {
    return respondErr(id, e.message || String(e));
  }
});

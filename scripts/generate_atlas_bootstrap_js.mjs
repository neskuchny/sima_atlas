#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const atlas = path.join(root, 'atlas');
const graph = JSON.parse(fs.readFileSync(path.join(atlas, 'graph.json'), 'utf8'));

function read(p){ return fs.existsSync(p) ? fs.readFileSync(p,'utf8') : ''; }
function firstText(md){ return md.split(/\r?\n/).find(l=>l.trim() && !l.startsWith('#') && !l.startsWith('-'))?.trim() || ''; }
function list(md){ return md.split(/\r?\n/).map(s=>s.trim()).filter(s=>s.startsWith('- ')).map(s=>s.replace(/^- \[.\]\s*/,'').slice(2).trim()); }

const blocks = (graph.blocks || []).map((b, i) => {
  const dir = path.join(atlas, 'blocks', b.id);
  const mission = firstText(read(path.join(dir,'mission.md')));
  const tasks = list(read(path.join(dir,'tasks.md'))).slice(0,2);
  const kpis = list(read(path.join(dir,'kpi.md'))).slice(0,2);
  return {
    id: b.id,
    title: b.title,
    status: b.status,
    mission,
    tasks,
    kpis,
    x: 120 + (i % 4) * 240,
    y: 180 + Math.floor(i / 4) * 170,
  };
});

const links = (graph.blocks || []).flatMap((b) => (b.depends_on || []).map((d, idx) => ({
  id: `${b.id}_${d}_${idx}`,
  from: b.id,
  to: d,
  label: `${b.id} depends on ${d}`,
  direction: 'to-task',
})));

const project = {
  id: 'atlas-live',
  name: 'Atlas Live Project',
  taskKind: 'продукт',
  taskTitle: 'Живая схема из Atlas',
  taskNote: 'Блоки, статусы и зависимости берутся из /atlas',
  created: new Date().toISOString().slice(0,10),
  owner: 'Cursor/Codex/Claude',
  canvas: {
    task: { id:'t1', x:540, y:40, w:420, h:100, title:'Atlas Live', subtitle:'Схема продукта и статусы из graph.json' },
    sources: blocks.map((b) => ({
      id: b.id,
      type: 'artifact',
      x: b.x,
      y: b.y,
      w: 260,
      h: 130,
      source: `status: ${b.status}`,
      title: b.title,
      meta: b.id,
      take: b.mission || 'миссия будет заполнена ingestion-пайплайном',
      tags: [`#${b.status}`, '#atlas'],
    })),
    links,
  },
  map: {
    mission: { id:'m.mission', title:'Миссия', value:'Единый контур разработки: чат -> atlas -> схема -> контекст-пак', filled:true },
    idea: { id:'m.idea', title:'Идея и фишка', value:'Каждый блок имеет задачи/KPI/checks и отображается на живой схеме.', filled:true },
    goal: { id:'m.goal', title:'Just-to-be-done', value:'Запуск одной команды обновляет схему, логи и документы.', filled:true },
    audience: { id:'m.audience', title:'Для кого', value:'Solo founder / product+AI workflows', filled:true },
    value: { id:'m.value', title:'Что даст клиенту', value:'Меньше токенов и меньше дрейфа за счёт context-first.', filled:true },
    important: { id:'m.important', title:'Важные элементы (must have)', items: blocks.slice(0,6).map(b=>({label:`${b.title} (${b.status})`, filled:true})) },
    userstory: {
      id:'m.us', title:'User Story карта',
      nodes: blocks.map((b)=>({ id:b.id, title:b.title, kind:'блок', filled:true, body:[b.mission,...b.tasks,...b.kpis].filter(Boolean).join(' · ') || b.id, hasSubschema:false, sources:[] })),
      links: (graph.blocks || []).flatMap((b)=>(b.depends_on||[]).map(d=>({from:b.id,to:d,label:'depends_on'}))),
    }
  }
};

const payload = { data: { projects: [project] }, archByProject: { 'atlas-live': { blocks: blocks.map(({mission,tasks,kpis,...rest})=>({...rest, owner:'atlas'}),), links: (graph.blocks||[]).flatMap((b)=>(b.depends_on||[]).map((d)=>({from:b.id,to:d,type:'depends'}))) } } };
const outPath = path.join(root, 'Sima (Remix)', 'atlas_bootstrap.js');
const text = `window.SIMA_BOOTSTRAP = ${JSON.stringify(payload, null, 2)};\nwindow.ARCH_BY_PROJECT = Object.assign(window.ARCH_BY_PROJECT || {}, (window.SIMA_BOOTSTRAP && window.SIMA_BOOTSTRAP.archByProject) || {});\n`;
fs.writeFileSync(outPath, text, 'utf8');
console.log(`Generated ${outPath}`);

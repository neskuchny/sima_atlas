// layer1_canvas.jsx — free canvas with task, sources, labeled links. Drag + connect + label.
// v2: adds drag-to-connect (ports on hover → drag onto another node creates link).

const TYPE_ICONS = { meet:'meet', doc:'note', audio:'mic', text:'text', artifact:'library' };
const TYPE_LABEL = { meet:'Встреча · Meetflow', doc:'Документ', audio:'Аудио', text:'Текст', artifact:'Артефакт' };

function getCenter(n){ return { x: n.x + n.w/2, y: n.y + n.h/2 }; }

function attachPoints(a, b){
  // pick the closest pair of edge midpoints (top/bottom/left/right of each)
  const ea = [
    {side:'t', x: a.x + a.w/2, y: a.y},
    {side:'b', x: a.x + a.w/2, y: a.y + a.h},
    {side:'l', x: a.x,         y: a.y + a.h/2},
    {side:'r', x: a.x + a.w,   y: a.y + a.h/2},
  ];
  const eb = [
    {side:'t', x: b.x + b.w/2, y: b.y},
    {side:'b', x: b.x + b.w/2, y: b.y + b.h},
    {side:'l', x: b.x,         y: b.y + b.h/2},
    {side:'r', x: b.x + b.w,   y: b.y + b.h/2},
  ];
  let best = null, bestD = Infinity;
  for (const pa of ea) for (const pb of eb){
    const d = (pa.x-pb.x)**2 + (pa.y-pb.y)**2;
    if (d < bestD){ bestD = d; best = { pa, pb }; }
  }
  return best;
}

function curveBetween(pa, pb){
  const dx = pb.x - pa.x, dy = pb.y - pa.y;
  // control offsets based on side
  const coff = { t:[0,-40], b:[0,40], l:[-40,0], r:[40,0] };
  const [cax, cay] = coff[pa.side] || [0,0];
  const [cbx, cby] = coff[pb.side] || [0,0];
  return `M${pa.x},${pa.y} C${pa.x+cax},${pa.y+cay} ${pb.x+cbx},${pb.y+cby} ${pb.x},${pb.y}`;
}

const CanvasNode = ({ node, isTask, selected, onClick, onDragMove, onStartConnect }) => {
  const [dragging, setDragging] = React.useState(false);
  const offsetRef = React.useRef({ x: 0, y: 0 });

  const onMouseDown = (e) => {
    if (e.target.classList.contains('port')) return;
    e.stopPropagation();
    offsetRef.current = { x: e.clientX - node.x, y: e.clientY - node.y };
    setDragging(true);
    const move = (ev) => {
      onDragMove(node.id, ev.clientX - offsetRef.current.x, ev.clientY - offsetRef.current.y);
    };
    const up = () => {
      setDragging(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const style = { left: node.x, top: node.y, width: node.w, height: node.h, cursor: dragging ? 'grabbing' : 'grab' };

  const ports = (
    <>
      <div className="port top" onMouseDown={(e)=>{e.stopPropagation();onStartConnect(node.id,e);}}/>
      <div className="port bot" onMouseDown={(e)=>{e.stopPropagation();onStartConnect(node.id,e);}}/>
    </>
  );

  if (isTask) {
    return (
      <div className={`cs-node task ${selected?'sel':''}`} style={style} data-node-id={node.id}
           onMouseDown={onMouseDown}
           onClick={(e)=>{e.stopPropagation(); onClick();}}>
        <div className="k">задача · {node.kind || 'продукт'}</div>
        <div className="t">{node.title}</div>
        <div className="s">{node.subtitle}</div>
        {ports}
      </div>
    );
  }

  return (
    <div className={`cs-node src ${selected?'sel':''}`} data-type={node.type} data-node-id={node.id} style={style}
         onMouseDown={onMouseDown}
         onClick={(e)=>{e.stopPropagation(); onClick();}}>
      <div className="k"><Icon name={TYPE_ICONS[node.type]} size={11}/> {TYPE_LABEL[node.type]}</div>
      <div className="t">{node.title}</div>
      <div className="m">{node.meta}</div>
      <div className="take">{node.take}</div>
      {ports}
    </div>
  );
};

const Layer1Canvas = ({ project, onUpdate, selectedId, setSelectedId, commentMode, onOpenSubschema }) => {
  const canvas = project.canvas;
  const stageRef = React.useRef(null);
  const [connect, setConnect] = React.useState(null); // {fromId, x,y}
  const [editingLink, setEditingLink] = React.useState(null); // linkId

  const allNodes = [{...canvas.task, _task:true}, ...canvas.sources];
  const byId = {}; allNodes.forEach(n => byId[n.id] = n);

  const onDragMove = (id, x, y) => {
    const task = canvas.task.id === id ? { ...canvas.task, x, y } : canvas.task;
    const sources = canvas.sources.map(s => s.id === id ? { ...s, x, y } : s);
    onUpdate({ ...canvas, task, sources });
  };

  const onStartConnect = (fromId, e) => {
    const rect = stageRef.current.getBoundingClientRect();
    setConnect({ fromId, x: e.clientX - rect.left, y: e.clientY - rect.top });
    const move = (ev) => {
      const r = stageRef.current.getBoundingClientRect();
      setConnect(c => c ? { ...c, x: ev.clientX - r.left, y: ev.clientY - r.top } : null);
    };
    const up = (ev) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      // find node under cursor
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = el && el.closest('[data-node-id]');
      const toId = target && target.getAttribute('data-node-id');
      if (toId && toId !== fromId){
        const newLink = {
          id: 'l' + Math.random().toString(36).slice(2,7),
          from: fromId, to: toId,
          label: 'новая связь',
          direction: toId === canvas.task.id ? 'to-task' : 'one-way',
        };
        onUpdate({ ...canvas, links: [...canvas.links, newLink] });
        setEditingLink(newLink.id);
      }
      setConnect(null);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const renderLinkPath = (link) => {
    const a = byId[link.from], b = byId[link.to];
    if (!a || !b) return null;
    const att = attachPoints(a, b);
    const d = curveBetween(att.pa, att.pb);
    const mid = { x: (att.pa.x + att.pb.x)/2, y: (att.pa.y + att.pb.y)/2 };
    return (
      <g key={link.id} style={{cursor:'pointer'}} onClick={(e)=>{e.stopPropagation();setEditingLink(link.id);}}>
        <path d={d} strokeWidth="8" stroke="transparent" style={{pointerEvents:'stroke'}}/>
        <path d={d} className={link.direction}
          markerEnd={link.direction!=='two-way'?'url(#arr)':'url(#arr)'}
          markerStart={link.direction==='two-way'?'url(#arr2)':undefined}/>
        {link.label && <text x={mid.x} y={mid.y - 4} textAnchor="middle">{link.label}</text>}
      </g>
    );
  };

  const editingLinkObj = editingLink && canvas.links.find(l=>l.id===editingLink);
  let editingPos = null;
  if (editingLinkObj){
    const a = byId[editingLinkObj.from], b = byId[editingLinkObj.to];
    if (a && b){
      const att = attachPoints(a,b);
      editingPos = { x: (att.pa.x+att.pb.x)/2, y: (att.pa.y+att.pb.y)/2 };
    }
  }

  return (
    <div className={`canvas-stage ${commentMode?'comment-mode':''}`} ref={stageRef}
         onClick={()=>{setSelectedId(null); setEditingLink(null);}}>
      <svg className="cs-svg">
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-3)"/>
          </marker>
          <marker id="arr2" viewBox="0 0 10 10" refX="2" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M10,0 L0,5 L10,10 z" fill="var(--ink-3)"/>
          </marker>
        </defs>
        {canvas.links.map(renderLinkPath)}
        {connect && (() => {
          const a = byId[connect.fromId];
          if (!a) return null;
          const ca = getCenter(a);
          return <path d={`M${ca.x},${ca.y} L${connect.x},${connect.y}`} stroke="var(--orange)" strokeWidth="1.4" strokeDasharray="4 4" fill="none"/>;
        })()}
      </svg>

      <CanvasNode node={canvas.task} isTask
        selected={selectedId==='t1'}
        onClick={()=>setSelectedId(canvas.task.id)}
        onDragMove={onDragMove}
        onStartConnect={onStartConnect}/>
      {canvas.sources.map(s => (
        <CanvasNode key={s.id} node={s}
          selected={selectedId===s.id}
          onClick={()=>setSelectedId(s.id)}
          onDragMove={onDragMove}
          onStartConnect={onStartConnect}/>
      ))}

      {editingLinkObj && editingPos && (
        <div className="link-popover" style={{left: editingPos.x - 130, top: editingPos.y + 6}}
             onClick={(e)=>e.stopPropagation()}>
          <input value={editingLinkObj.label} placeholder="подпись связи…"
            onChange={e=>{
              const next = canvas.links.map(l=>l.id===editingLinkObj.id?{...l,label:e.target.value}:l);
              onUpdate({...canvas, links: next});
            }}/>
          <div className="dir">
            {[['one-way','→'],['two-way','⇌'],['to-task','к задаче']].map(([v,lbl]) => (
              <button key={v} className={editingLinkObj.direction===v?'on':''}
                onClick={()=>{
                  const next = canvas.links.map(l=>l.id===editingLinkObj.id?{...l,direction:v}:l);
                  onUpdate({...canvas, links: next});
                }}>{lbl}</button>
            ))}
          </div>
          <button className="btn xs ghost" onClick={()=>{
            onUpdate({...canvas, links: canvas.links.filter(l=>l.id!==editingLinkObj.id)});
            setEditingLink(null);
          }}><Icon name="trash" size={9}/></button>
        </div>
      )}

      {commentMode && (
        <div style={{position:'absolute',top:10,left:10,padding:'6px 10px',background:'var(--indigo-bg)',color:'var(--indigo-ink)',borderRadius:6,fontSize:11,border:'0.5px solid var(--indigo-soft)'}}>
          <Icon name="comment" size={11}/> режим комментариев · клик по блоку добавляет заметку для ИИ
        </div>
      )}
    </div>
  );
};

const SourcePalette = () => {
  // Кликабельные действия: открыть нужную вкладку «Данные» в parent через
  // postMessage, либо вызвать прямой API.
  const fileInputRef = React.useRef(null);
  const onFileChosen = async (e) => {
    if (window.SimaAPI && e.target.files) await window.SimaAPI.uploadFiles(e.target.files);
    if (e.target) e.target.value = '';
  };
  const promptText = async () => {
    const txt = window.prompt('Вставьте текст (интервью, заметки, требования):');
    if (!txt || !txt.trim()) return;
    const name = window.prompt('Название источника:', 'Текстовый ввод') || 'Текстовый ввод';
    if (window.SimaAPI) await window.SimaAPI.uploadText(name, txt.trim());
  };
  const openSection = (section) => {
    try {
      window.parent.postMessage({ source: 'sima-remix', action: 'open-data-panel', data: { section } }, '*');
    } catch (e) {}
  };

  const items = [
    { type:'meet', name:'Встреча из Meetflow', meta:'импорт транскрипта',
      onClick: () => openSection('meetings') },
    { type:'doc', name:'Документ', meta:'Google Docs / Notion',
      onClick: () => openSection('documents') },
    { type:'audio', name:'Аудио', meta:'диктофон / загрузка',
      onClick: () => fileInputRef.current && fileInputRef.current.click() },
    { type:'text', name:'Текст', meta:'вставить вручную',
      onClick: promptText },
    { type:'artifact', name:'Артефакт из галереи', meta:'готовый блок / карта',
      onClick: () => openSection('library') },
  ];
  return (
    <div className="side-sec">
      <h4 className="sec-ttl">Добавить источник</h4>
      <div className="src-palette">
        {items.map(it => (
          <div key={it.type} className="sp-row" onClick={it.onClick}
               style={{cursor:'pointer'}}
               title={'Добавить: ' + it.name}>
            <div className="icon-wrap"><Icon name={TYPE_ICONS[it.type]} size={12}/></div>
            <div>
              <div className="sp-t">{it.name}</div>
              <div className="sp-m">{it.meta}</div>
            </div>
          </div>
        ))}
      </div>
      <input ref={fileInputRef} type="file" multiple
        accept=".txt,.csv,.json,.md,.markdown,.tsv"
        onChange={onFileChosen} style={{display:'none'}}/>
      <div className="meta" style={{marginTop:10,fontStyle:'italic',lineHeight:1.5}}>
        Клик — добавить источник. Связи — ховер на блок, тяни от кружков к другому блоку.
      </div>
    </div>
  );
};

const CanvasInspector = ({ project, selectedId, onOpenSubschema }) => {
  if (!selectedId) {
    return (
      <div className="sel-empty">
        <Icon name="cursor" size={24}/>
        <div>Кликни на блок, чтобы увидеть описание, теги и связи.</div>
        <div style={{marginTop:14,color:'var(--ink-3)'}}>
          <b>Коричневый</b> — задача.<br/>
          <b>Индиго</b> — встреча · <b>амбер</b> — документ · <b>оранжевый</b> — аудио · <b>бежевый</b> — текст · <b>оливковый</b> — артефакт.
        </div>
      </div>
    );
  }
  const task = project.canvas.task;
  const n = selectedId === task.id ? {...task, _task:true} : project.canvas.sources.find(s=>s.id===selectedId);
  if (!n) return null;
  const links = project.canvas.links.filter(l => l.from===n.id || l.to===n.id);

  return (
    <div className="cs-inspect">
      <div className="field">
        <label>Тип</label>
        <div style={{fontSize:11.5}}>{n._task ? `Задача · ${task.kind || 'продукт'}` : TYPE_LABEL[n.type]}</div>
      </div>
      <div className="field">
        <label>Название</label>
        <input defaultValue={n.title}/>
      </div>
      {!n._task && (
        <div className="field">
          <label>Что берём из этого источника</label>
          <textarea rows={3} defaultValue={n.take}/>
        </div>
      )}
      {n._task && (
        <div className="field">
          <label>Описание задачи</label>
          <textarea rows={3} defaultValue={n.subtitle}/>
        </div>
      )}
      <div className="field">
        <label>Теги</label>
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {(n.tags || []).map(t => <span key={t} className="gc-tag">{t}</span>)}
          <button className="btn xs ghost"><Icon name="plus" size={9}/> добавить</button>
        </div>
      </div>
      {n.source && (
        <div className="field">
          <label>Источник</label>
          <div className="row" style={{fontSize:11.5}}>
            <span className="dot concept"></span>
            {n.source}
          </div>
        </div>
      )}
      <div className="field">
        <label>Связи ({links.length})</label>
        <div style={{display:'flex',flexDirection:'column',gap:4}}>
          {links.map(l => {
            const other = l.from===n.id ? l.to : l.from;
            const dir = l.direction==='two-way'?'⇌':(l.from===n.id?'→':'←');
            return <div key={l.id} style={{fontSize:11,color:'var(--ink-2)',padding:'4px 6px',background:'var(--bg-1)',borderRadius:4}}>
              <span className="mono" style={{color:'var(--ink-4)'}}>{dir}</span> {other} · <i>{l.label}</i>
            </div>;
          })}
        </div>
      </div>
      <div className="row" style={{marginTop:6,gap:4,flexWrap:'wrap'}}>
        <button className="btn xs" data-sima-handled="1" onClick={async (e) => {
          e.stopPropagation();
          if (n._task) {
            if (window.SimaAPI) await window.SimaAPI.chat('Опиши задачу проекта подробнее: миссия, цель, аудитория.', 'chat');
            return;
          }
          if (window.SimaAPI) await window.SimaAPI.describeBlock(n.id);
        }}>
          <Icon name="sparkle" size={10}/> Сима, опиши
        </button>
        <button className="btn xs" data-sima-handled="1" onClick={async (e) => {
          e.stopPropagation();
          if (n._task) return;
          try {
            const r = await fetch('/api/artifacts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ kind: 'block', sourceBlockId: n.id }),
            });
            if (r.ok) alert('Сохранено в библиотеку');
            else alert('Не удалось сохранить (это, возможно, источник, а не блок)');
          } catch (e2) { alert('Ошибка сети'); }
        }}>
          <Icon name="library" size={10}/> в артефакты
        </button>
        {window.SUBSCHEMAS && window.SUBSCHEMAS[n.id] && (
          <button className="btn xs" onClick={()=>onOpenSubschema && onOpenSubschema(n.id)}>
            <Icon name="layers" size={10}/> подсхема
          </button>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { Layer1Canvas, SourcePalette, CanvasInspector, TYPE_ICONS, TYPE_LABEL });

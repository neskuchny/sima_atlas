// arch_canvas.jsx — architecture view: layers as horizontal bands, draggable blocks,
// typed connections, cross-layer drop, collapse, views (layers / flow / MVP / status).

const { useState, useRef, useMemo, useEffect } = React;

const LAYER_BAND_H = 170;      // default expanded band height
const LAYER_BAND_COLLAPSED = 36;
const LAYER_HEADER_W = 128;
const BLOCK_H = 78;
const BLOCK_H_COMPACT = 56;
const BLOCK_H_LARGE = 96;

function useArchState(projectId){
  // localStorage-backed override per project so drags persist across reloads
  const key = 'sima.arch.'+projectId;
  const base = window.ARCH_BY_PROJECT[projectId];
  const [state, setState] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        return parsed;
      }
    } catch(e){}
    return JSON.parse(JSON.stringify(base));
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch(e){}
  }, [state, key]);
  // Reset if project changes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setState(JSON.parse(raw));
      else setState(JSON.parse(JSON.stringify(base)));
    } catch(e){
      setState(JSON.parse(JSON.stringify(base)));
    }
  }, [projectId]);
  const reset = () => {
    try { localStorage.removeItem(key); } catch(e){}
    setState(JSON.parse(JSON.stringify(base)));
  };
  return [state, setState, reset];
}

// ---- Helpers -----
function measureBlock(density){
  return { h: density==='compact'?BLOCK_H_COMPACT : density==='large'?BLOCK_H_LARGE : BLOCK_H };
}

function blocksInLayer(arch, layerId){
  return arch.blocks.filter(b => b.layer === layerId);
}

// Port position for a block in world coords
function portPos(block, layerTop, side, density){
  const h = measureBlock(density).h;
  const top = layerTop + 24 + (block.row || 0)*(h+12); // we'll assign row=0 in layout; but keep flex
  return {
    l: { x: block.x, y: top + h/2 },
    r: { x: block.x + block.w, y: top + h/2 },
    t: { x: block.x + block.w/2, y: top },
    b: { x: block.x + block.w/2, y: top + h },
  }[side];
}

// Auto-choose attach points between two blocks given their layer tops
function chooseAttach(a, b, layerTops, density){
  const h = measureBlock(density).h;
  const ay = layerTops[a.layer] + 24;
  const by = layerTops[b.layer] + 24;
  const aCenter = { x: a.x + a.w/2, y: ay + h/2 };
  const bCenter = { x: b.x + b.w/2, y: by + h/2 };
  // same layer → left/right; different layer → top/bottom
  if (a.layer === b.layer){
    if (aCenter.x < bCenter.x) return { a:{x:a.x+a.w, y: ay+h/2, side:'r'}, b:{x:b.x, y: by+h/2, side:'l'} };
    return { a:{x:a.x, y: ay+h/2, side:'l'}, b:{x:b.x+b.w, y: by+h/2, side:'r'} };
  }
  if (aCenter.y < bCenter.y) return { a:{x: a.x+a.w/2, y: ay+h, side:'b'}, b:{x: b.x+b.w/2, y: by, side:'t'} };
  return { a:{x: a.x+a.w/2, y: ay, side:'t'}, b:{x: b.x+b.w/2, y: by+h, side:'b'} };
}

function curve(pa, pb){
  const dx = (pb.x - pa.x), dy = (pb.y - pa.y);
  const off = 40;
  const cax = pa.side==='l' ? -off : pa.side==='r' ? off : 0;
  const cay = pa.side==='t' ? -off : pa.side==='b' ? off : 0;
  const cbx = pb.side==='l' ? -off : pb.side==='r' ? off : 0;
  const cby = pb.side==='t' ? -off : pb.side==='b' ? off : 0;
  return `M${pa.x},${pa.y} C${pa.x+cax},${pa.y+cay} ${pb.x+cbx},${pb.y+cby} ${pb.x},${pb.y}`;
}

// ---- Block component -----
function ArchBlock({ b, layerTop, density, selected, onSelect, onMove, onRename, onStartConnect, onChangeLayer, dim, highlight }){
  const [drag, setDrag] = useState(false);
  const [editing, setEditing] = useState(false);
  const startRef = useRef(null);
  const h = measureBlock(density).h;

  const onMouseDown = (e) => {
    if (editing) return;
    if (e.target.classList && e.target.classList.contains('ab-port')) return;
    e.stopPropagation();
    startRef.current = { x: e.clientX, y: e.clientY, origX: b.x };
    setDrag(true);
    let currentLayer = b.layer;
    const move = (ev) => {
      const dx = ev.clientX - startRef.current.x;
      const dy = ev.clientY - startRef.current.y;
      // find layer under mouse for cross-layer drop
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const band = el && el.closest('[data-layer-id]');
      const targetLayer = band ? band.getAttribute('data-layer-id') : currentLayer;
      if (targetLayer !== currentLayer) currentLayer = targetLayer;
      onMove(b.id, startRef.current.origX + dx, currentLayer, dy);
    };
    const up = () => {
      setDrag(false);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const onDoubleClick = (e) => { e.stopPropagation(); setEditing(true); };

  const STATUS = window.ARCH_STATUS[b.status] || window.ARCH_STATUS.idea;

  const style = {
    position:'absolute',
    left: b.x, top: layerTop + 24,
    width: b.w, height: h,
    cursor: drag ? 'grabbing' : 'grab',
    opacity: dim ? 0.35 : 1,
  };

  return (
    <div className={`ab ${selected?'sel':''} ${highlight?'hl':''}`} style={style}
         onMouseDown={onMouseDown}
         onDoubleClick={onDoubleClick}
         onClick={(e)=>{e.stopPropagation(); onSelect(b.id);}}
         data-block-id={b.id}>
      <div className="ab-hd">
        <span className="ab-dot" style={{background: STATUS.dot}}/>
        {editing ? (
          <input autoFocus defaultValue={b.title}
            onBlur={(e)=>{ onRename(b.id, e.target.value); setEditing(false); }}
            onKeyDown={(e)=>{ if(e.key==='Enter'){ onRename(b.id, e.target.value); setEditing(false);} if(e.key==='Escape') setEditing(false); }}/>
        ) : (
          <div className="ab-ttl">{b.title}</div>
        )}
        {b.mvp && <span className="ab-mvp">MVP</span>}
      </div>
      {density !== 'compact' && <div className="ab-note">{b.note}</div>}
      {b.subschema && density !== 'compact' && <div className="ab-sub"><Icon name="layers" size={9}/> подсхема</div>}

      {/* ports on hover */}
      <div className="ab-port t" onMouseDown={(e)=>{e.stopPropagation(); onStartConnect(b.id,'t',e);}}/>
      <div className="ab-port b" onMouseDown={(e)=>{e.stopPropagation(); onStartConnect(b.id,'b',e);}}/>
      <div className="ab-port l" onMouseDown={(e)=>{e.stopPropagation(); onStartConnect(b.id,'l',e);}}/>
      <div className="ab-port r" onMouseDown={(e)=>{e.stopPropagation(); onStartConnect(b.id,'r',e);}}/>
    </div>
  );
}

// ---- Main canvas ----
function ArchCanvas({ projectId, density, view, mvpOnly, onSelectBlock, selectedBlockId, onOpenSubschema, onNote }){
  const [arch, setArch, reset] = useArchState(projectId);
  const stageRef = useRef(null);
  const [collapsed, setCollapsed] = useState({});
  const [connect, setConnect] = useState(null); // { fromId, side, x,y }
  const [editLinkId, setEditLinkId] = useState(null);

  const layers = arch.layers.map(id => window.ARCH_LAYERS[id]);
  const layerTops = useMemo(() => {
    const tops = {};
    let y = 0;
    layers.forEach(L => {
      tops[L.id] = y;
      y += collapsed[L.id] ? LAYER_BAND_COLLAPSED : LAYER_BAND_H + (density==='large'?30:0);
    });
    tops.__total = y;
    return tops;
  }, [layers, collapsed, density]);

  // compute stage width
  const stageW = useMemo(() => {
    let max = 1100;
    arch.blocks.forEach(b => { max = Math.max(max, b.x + b.w + 40); });
    return max;
  }, [arch.blocks]);

  const byId = {}; arch.blocks.forEach(b => byId[b.id] = b);

  // Filter: MVP-only
  const shownBlockIds = new Set(
    (mvpOnly ? arch.blocks.filter(b => b.mvp) : arch.blocks).map(b => b.id)
  );

  // View: by status → highlight wip/q
  const highlight = (b) => {
    if (view === 'status') return ['wip','q'].includes(b.status);
    return false;
  };
  const dim = (b) => mvpOnly && !b.mvp;

  // ─── Handlers ─────────────────────────────────────────────────────────
  const moveBlock = (id, newX, newLayer /*, dy */) => {
    setArch(s => ({
      ...s,
      blocks: s.blocks.map(b => b.id === id ? { ...b, x: Math.max(10, newX), layer: newLayer } : b),
    }));
  };
  const renameBlock = (id, title) => {
    setArch(s => ({
      ...s,
      blocks: s.blocks.map(b => b.id === id ? { ...b, title } : b),
    }));
    onNote && onNote(`Блок «${title}» переименован. Поле карты будет обновлено при следующем синке.`);
  };
  const changeBlockStatus = (id, status) => {
    setArch(s => ({
      ...s,
      blocks: s.blocks.map(b => b.id === id ? { ...b, status } : b),
    }));
  };
  const toggleMvp = (id) => {
    setArch(s => ({
      ...s,
      blocks: s.blocks.map(b => b.id === id ? { ...b, mvp: !b.mvp } : b),
    }));
  };
  const deleteBlock = (id) => {
    setArch(s => ({
      ...s,
      blocks: s.blocks.filter(b => b.id !== id),
      links: s.links.filter(l => l.from !== id && l.to !== id),
    }));
  };
  const addBlock = (layerId) => {
    const id = 'b.'+Math.random().toString(36).slice(2,6);
    const existing = blocksInLayer(arch, layerId);
    const x = 40 + existing.length * 230;
    const newB = { id, layer: layerId, x, w: 200, title:'Новый блок', note:'описание…', status:'idea', mvp:false, sources:[] };
    setArch(s => ({ ...s, blocks: [...s.blocks, newB] }));
    onSelectBlock(id);
  };

  // Drag-to-connect
  const startConnect = (fromId, side, e) => {
    const rect = stageRef.current.getBoundingClientRect();
    setConnect({ fromId, side, x: e.clientX - rect.left + stageRef.current.scrollLeft, y: e.clientY - rect.top + stageRef.current.scrollTop });
    const move = (ev) => {
      const r = stageRef.current.getBoundingClientRect();
      setConnect(c => c ? { ...c, x: ev.clientX - r.left + stageRef.current.scrollLeft, y: ev.clientY - r.top + stageRef.current.scrollTop } : null);
    };
    const up = (ev) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const target = el && el.closest('[data-block-id]');
      const toId = target && target.getAttribute('data-block-id');
      if (toId && toId !== fromId){
        const newLink = { from: fromId, to: toId, type:'data', label:'' };
        setArch(s => ({ ...s, links: [...s.links, newLink] }));
        setEditLinkId(s => (s ? s : (s.links?.length || 0)));
        // use the index of the new link
        setTimeout(()=>{
          setArch(s => {
            setEditLinkId(s.links.length - 1);
            return s;
          });
        }, 0);
      }
      setConnect(null);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const toggleLayer = (id) => setCollapsed(c => ({ ...c, [id]: !c[id] }));

  // ─── Rendering ────────────────────────────────────────────────────────
  const svgW = stageW;
  const svgH = layerTops.__total + 40;

  const renderLinks = () => {
    return arch.links.map((l, i) => {
      const a = byId[l.from], b = byId[l.to];
      if (!a || !b) return null;
      if (!shownBlockIds.has(a.id) || !shownBlockIds.has(b.id)) return null;
      const t = window.ARCH_LINK_TYPES[l.type] || window.ARCH_LINK_TYPES.data;
      const att = chooseAttach(a, b, layerTops, density);
      const d = curve(att.a, att.b);
      const mid = { x: (att.a.x + att.b.x)/2, y: (att.a.y + att.b.y)/2 };
      const isEditing = editLinkId === i;
      return (
        <g key={i} style={{cursor:'pointer'}} onClick={(e)=>{e.stopPropagation(); setEditLinkId(i);}}>
          <path d={d} stroke="transparent" strokeWidth="10" fill="none" style={{pointerEvents:'stroke'}}/>
          <path d={d} stroke={t.stroke} strokeWidth={t.width} fill="none"
                strokeDasharray={t.dash || undefined}
                markerEnd={`url(#am-${l.type})`}/>
          {l.label && (
            <g transform={`translate(${mid.x},${mid.y})`}>
              <rect x="-28" y="-8" width="56" height="15" rx="3" fill="var(--paper)" stroke="var(--line-1)" strokeWidth="0.5" opacity="0.9"/>
              <text textAnchor="middle" y="3" fontSize="10" fill="var(--ink-2)">{l.label}</text>
            </g>
          )}
          {isEditing && (
            <foreignObject x={mid.x - 110} y={mid.y + 8} width="220" height="80">
              <div className="link-edit" xmlns="http://www.w3.org/1999/xhtml">
                <input value={l.label} placeholder="подпись…"
                  onClick={(e)=>e.stopPropagation()}
                  onChange={(e)=>{
                    const v = e.target.value;
                    setArch(s => ({ ...s, links: s.links.map((x,j)=> j===i?{...x,label:v}:x) }));
                  }}/>
                <div className="types">
                  {Object.values(window.ARCH_LINK_TYPES).map(tt => (
                    <button key={tt.id} className={l.type===tt.id?'on':''}
                      onClick={(e)=>{e.stopPropagation();
                        setArch(s => ({ ...s, links: s.links.map((x,j)=> j===i?{...x,type:tt.id}:x) }));
                      }}>{tt.name}</button>
                  ))}
                </div>
                <button className="link-del" onClick={(e)=>{e.stopPropagation();
                  setArch(s => ({ ...s, links: s.links.filter((_,j)=>j!==i) }));
                  setEditLinkId(null);
                }}><Icon name="trash" size={9}/> удалить</button>
              </div>
            </foreignObject>
          )}
        </g>
      );
    });
  };

  return (
    <div className="arch-root">
      {/* Scrollable stage */}
      <div className="arch-stage" ref={stageRef} onClick={()=>{ onSelectBlock(null); setEditLinkId(null); }}>
        <div style={{position:'relative', width: LAYER_HEADER_W + svgW, height: svgH, minHeight: svgH}}>
          {/* layer bands */}
          {layers.map(L => {
            const top = layerTops[L.id];
            const bandH = collapsed[L.id] ? LAYER_BAND_COLLAPSED : (LAYER_BAND_H + (density==='large'?30:0));
            const layerBlocks = blocksInLayer(arch, L.id);
            const shown = mvpOnly ? layerBlocks.filter(b => b.mvp) : layerBlocks;
            return (
              <div key={L.id} data-layer-id={L.id} className={`arch-band ${collapsed[L.id]?'col':''}`}
                   style={{ position:'absolute', left:0, top, width: LAYER_HEADER_W + svgW, height: bandH,
                            background: L.bg, borderTop:'0.5px solid var(--line-1)' }}>
                {/* header */}
                <div className="arch-band-hd" style={{ width: LAYER_HEADER_W, height: bandH, borderRight:'0.5px solid var(--line-1)', background:'var(--paper)' }}
                     onClick={(e)=>{e.stopPropagation(); toggleLayer(L.id);}}>
                  <div className="ab-chevron" style={{color:L.hue}}>{collapsed[L.id]?'▸':'▾'}</div>
                  <div className="ab-name" style={{color:L.hue}}>{L.name}</div>
                  <div className="ab-count">{shown.length}{mvpOnly && layerBlocks.length!==shown.length?`/${layerBlocks.length}`:''}</div>
                </div>
              </div>
            );
          })}

          {/* SVG with links + connect preview */}
          <svg className="arch-svg" width={svgW} height={svgH}
               style={{ position:'absolute', left: LAYER_HEADER_W, top: 0, pointerEvents:'visible' }}>
            <defs>
              {Object.values(window.ARCH_LINK_TYPES).map(t => (
                <marker key={t.id} id={`am-${t.id}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M0,0 L10,5 L0,10 z" fill={t.stroke}/>
                </marker>
              ))}
            </defs>
            {renderLinks()}
            {connect && (() => {
              const a = byId[connect.fromId];
              if (!a) return null;
              const ay = layerTops[a.layer] + 24;
              const h = measureBlock(density).h;
              const startX = connect.side==='l' ? a.x : connect.side==='r' ? a.x + a.w : a.x + a.w/2;
              const startY = connect.side==='t' ? ay : connect.side==='b' ? ay + h : ay + h/2;
              // connect.x/y already includes scroll, and svg is offset by LAYER_HEADER_W
              return <path d={`M${startX},${startY} L${connect.x - LAYER_HEADER_W},${connect.y}`}
                stroke="var(--orange)" strokeWidth="1.4" strokeDasharray="4 3" fill="none"/>;
            })()}
          </svg>

          {/* Blocks */}
          <div style={{position:'absolute', left: LAYER_HEADER_W, top: 0, width: svgW, height: svgH, pointerEvents:'none'}}>
            {arch.blocks.map(b => {
              if (collapsed[b.layer]) return null;
              const lt = layerTops[b.layer];
              return (
                <div key={b.id} style={{pointerEvents:'auto'}}>
                  <ArchBlock b={b} layerTop={lt} density={density}
                    selected={selectedBlockId===b.id}
                    highlight={highlight(b)}
                    dim={dim(b)}
                    onSelect={onSelectBlock}
                    onMove={moveBlock}
                    onRename={renameBlock}
                    onStartConnect={startConnect}/>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Inspector ----
function ArchInspector({ projectId, selectedBlockId, onOpenSubschema, onPatch }){
  const arch = (window.__simaArchRef && window.__simaArchRef[projectId]) || window.ARCH_BY_PROJECT[projectId];
  // We read from localStorage because arch state lives in ArchCanvas
  const key = 'sima.arch.'+projectId;
  let live = arch;
  try {
    const raw = localStorage.getItem(key);
    if (raw) live = JSON.parse(raw);
  } catch(e){}
  const block = selectedBlockId ? live.blocks.find(b => b.id === selectedBlockId) : null;

  if (!block){
    return (
      <div className="sel-empty">
        <Icon name="cursor" size={22}/>
        <div>Кликни на блок архитектуры. Двойной клик — переименовать. От краёв — тяни связь.</div>
        <div style={{marginTop:14,color:'var(--ink-3)',fontSize:11,lineHeight:1.55}}>
          <b>Связи:</b><br/>
          <span style={{display:'inline-block',width:18,borderTop:'1.2px solid #29261B',verticalAlign:'middle'}}/> данные &nbsp;
          <span style={{display:'inline-block',width:18,borderTop:'1px dashed #8B8476',verticalAlign:'middle'}}/> зависимость &nbsp;
          <span style={{display:'inline-block',width:18,borderTop:'1.4px dotted #A6673A',verticalAlign:'middle'}}/> путь
        </div>
      </div>
    );
  }

  const L = window.ARCH_LAYERS[block.layer];
  const STATUS = window.ARCH_STATUS;

  return (
    <div className="arch-inspect">
      <div className="field">
        <label>Слой</label>
        <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}>
          <span className="layer-chip" style={{background:L.bg,color:L.hue,border:`0.5px solid ${L.hue}33`}}>{L.name}</span>
        </div>
      </div>
      <div className="field">
        <label>Название</label>
        <input defaultValue={block.title} key={block.id+'-t'}
          onBlur={(e)=>onPatch(block.id, { title: e.target.value })}/>
      </div>
      <div className="field">
        <label>Описание</label>
        <textarea defaultValue={block.note} rows={3} key={block.id+'-n'}
          onBlur={(e)=>onPatch(block.id, { note: e.target.value })}/>
      </div>
      <div className="field">
        <label>Статус</label>
        <div className="status-row">
          {Object.entries(STATUS).map(([k,v]) => (
            <button key={k} className={block.status===k?'on':''} onClick={()=>onPatch(block.id, { status:k })}>
              <span className="s-dot" style={{background:v.dot}}/> {v.label}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <label>Входит в MVP</label>
        <button className={`mvp-toggle ${block.mvp?'on':''}`} onClick={()=>onPatch(block.id, { mvp: !block.mvp })}>
          {block.mvp ? '✓ да, входит' : '— нет'}
        </button>
      </div>
      {block.sources && block.sources.length>0 && (
        <div className="field">
          <label>Источники ({block.sources.length})</label>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {block.sources.map(s => <span key={s} className="src">{s}</span>)}
          </div>
        </div>
      )}
      {block.subschema && (
        <button className="btn sm" onClick={()=>onOpenSubschema(block.subschema)}>
          <Icon name="layers" size={11}/> открыть подсхему
        </button>
      )}
      <div className="row" style={{gap:4,flexWrap:'wrap',marginTop:4}}>
        <button className="btn xs"><Icon name="sparkle" size={10}/> Клод, переформулируй</button>
        <button className="btn xs ghost"><Icon name="library" size={10}/> в артефакты</button>
        <button className="btn xs ghost" onClick={()=>onPatch(block.id, '__delete')}>
          <Icon name="trash" size={10}/> удалить
        </button>
      </div>
      <div className="sync-note">
        <Icon name="sparkle" size={10}/> Правка пойдёт в «Карту полей» автоматически. В ТЗ пересоберётся при клике «обновить».
      </div>
    </div>
  );
}

Object.assign(window, { ArchCanvas, ArchInspector });

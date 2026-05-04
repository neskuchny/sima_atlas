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
  // localStorage-backed override per project so drags persist across reloads.
  // PR3.5 hardening: window.ARCH_BY_PROJECT[projectId] may be undefined if the
  // bootstrap hasn't loaded yet or the projectId is unknown. Also a previous
  // run could have written the literal string "undefined" into localStorage
  // (JSON.stringify(undefined) === undefined → setItem stores "undefined"),
  // which then crashes JSON.parse on next mount with
  //   SyntaxError: "undefined" is not valid JSON
  // This was the actual UI-blocking bug. Now both paths are safe.
  const key = 'sima.arch.'+projectId;
  const EMPTY = { projectId, layers: [], blocks: [], links: [], groups: [] };
  const base = (window.ARCH_BY_PROJECT && window.ARCH_BY_PROJECT[projectId]) || EMPTY;
  function safeClone(v) {
    try { return JSON.parse(JSON.stringify(v)); } catch { return JSON.parse(JSON.stringify(EMPTY)); }
  }
  function safeParse(raw) {
    if (typeof raw !== 'string') return null;
    const t = raw.trim();
    if (!t || t === 'undefined' || t === 'null') return null;
    try {
      const parsed = JSON.parse(t);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return parsed;
    } catch { return null; }
  }
  const [state, setState] = useState(() => {
    let fromStorage = null;
    try { fromStorage = safeParse(localStorage.getItem(key)); } catch {}
    return fromStorage || safeClone(base);
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(state)); } catch(e){}
  }, [state, key]);
  // Reset if project changes
  useEffect(() => {
    let next = null;
    try { next = safeParse(localStorage.getItem(key)); } catch {}
    setState(next || safeClone(base));
  }, [projectId]);
  const reset = () => {
    try { localStorage.removeItem(key); } catch(e){}
    setState(safeClone(base));
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
function ArchBlock({ b, layerTop, density, selected, onSelect, onMove, onRename, onStartConnect, onChangeLayer, dim, highlight, syncStatus, syncIssues, onOpenSubschema }){
  // PR2.5: syncStatus is one of 'ok' | 'drift' | 'broken' | undefined.
  // We render an overlay border + a corner badge so the user sees at a glance
  // which blocks are out of sync, and a native title-tooltip lists the issues.
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

  const onDoubleClick = (e) => {
    e.stopPropagation();
    // PR-Sub: if this block carries a subschema, double-click opens it
    // instead of starting in-place rename. The user can still rename
    // through the inspector input.
    if (b.subschema && typeof onOpenSubschema === 'function') {
      onOpenSubschema(b.id, b.subschema);
      return;
    }
    setEditing(true);
  };

  const STATUS = window.ARCH_STATUS[b.status] || window.ARCH_STATUS.idea;

  // PR2.5: drift / broken visual overlay
  const SYNC_STYLE = {
    broken: { ring: '#dc2626', ringSoft: 'rgba(220,38,38,0.14)', label: '!', labelBg: '#dc2626' },
    drift:  { ring: '#d97706', ringSoft: 'rgba(217,119,6,0.14)',  label: '⚠', labelBg: '#d97706' },
  };
  const syncCfg = SYNC_STYLE[syncStatus] || null;
  const syncTooltip = syncIssues && syncIssues.length
    ? `[${syncStatus.toUpperCase()}] ${syncIssues.join('\n• ')}`
    : null;

  const style = {
    position:'absolute',
    left: b.x, top: layerTop + 24,
    width: b.w, height: h,
    cursor: drag ? 'grabbing' : 'grab',
    opacity: dim ? 0.35 : 1,
    boxShadow: syncCfg ? `0 0 0 2px ${syncCfg.ring}, 0 0 0 6px ${syncCfg.ringSoft}` : undefined,
    zIndex: syncCfg ? 2 : undefined,
  };

  return (
    <div className={`ab ${selected?'sel':''} ${highlight?'hl':''} ${syncStatus ? 'sync-'+syncStatus : ''}`} style={style}
         onMouseDown={onMouseDown}
         onDoubleClick={onDoubleClick}
         onClick={(e)=>{e.stopPropagation(); onSelect(b.id);}}
         title={syncTooltip || undefined}
         data-block-id={b.id}>
      {syncCfg && (
        <div style={{
          position: 'absolute', top: -8, right: -8,
          width: 18, height: 18, borderRadius: '50%',
          background: syncCfg.labelBg, color: '#fff',
          fontSize: 11, fontWeight: 700, lineHeight: '18px', textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)', pointerEvents: 'none',
        }}>{syncCfg.label}</div>
      )}
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
function ArchCanvas({ projectId, density, view, mvpOnly, onSelectBlock, selectedBlockId, onOpenSubschema, onNote, syncReport }){
  // PR2.5: index sync details by blockId so the canvas can highlight drift/broken.
  const syncDetailsById = React.useMemo(() => {
    const m = {};
    for (const d of (syncReport?.details || [])) m[d.blockId] = d;
    return m;
  }, [syncReport]);
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
      // PR-Conn: a link can be marked broken by the bootstrap generator when
      // depends_on requests capability that target block does not provide.
      // We paint such links red, dash them, and surface the reason via a
      // native title-tooltip + a dedicated "!" diamond at the mid-point.
      const linkStroke = l.broken ? '#dc2626' : t.stroke;
      const linkWidth = l.broken ? Math.max(t.width || 1, 1.6) : t.width;
      const linkDash = l.broken ? '6 4' : (t.dash || undefined);
      const linkTooltip = l.broken
        ? `BROKEN: ${l.broken_reason || 'capability mismatch'}`
        : (l.label ? `→ ${l.label}` : undefined);
      return (
        <g key={i} style={{cursor:'pointer'}} onClick={(e)=>{e.stopPropagation(); setEditLinkId(i);}}>
          {linkTooltip && <title>{linkTooltip}</title>}
          <path d={d} stroke="transparent" strokeWidth="10" fill="none" style={{pointerEvents:'stroke'}}/>
          <path d={d} stroke={linkStroke} strokeWidth={linkWidth} fill="none"
                strokeDasharray={linkDash}
                markerEnd={`url(#am-${l.type})`}/>
          {l.broken && (
            <g transform={`translate(${mid.x},${mid.y - 14})`}>
              <rect x="-7" y="-7" width="14" height="14" rx="2"
                    transform="rotate(45)"
                    fill="#dc2626" stroke="#fff" strokeWidth="0.8"/>
              <text textAnchor="middle" y="3.3" fontSize="9.5" fontWeight="700" fill="#fff">!</text>
            </g>
          )}
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
                    onStartConnect={startConnect}
                    syncStatus={syncDetailsById[b.id]?.status}
                    syncIssues={syncDetailsById[b.id]?.issues || []}
                    onOpenSubschema={onOpenSubschema}/>
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
function ArchInspector({ projectId, selectedBlockId, onOpenSubschema, onPatch, syncReport }){
  // PR3.5 hardening: tolerate missing project + corrupted localStorage value
  // (the literal string "undefined" / "null" / non-JSON garbage).
  const EMPTY = { projectId, layers: [], blocks: [], links: [], groups: [] };
  const arch = (window.__simaArchRef && window.__simaArchRef[projectId])
    || (window.ARCH_BY_PROJECT && window.ARCH_BY_PROJECT[projectId])
    || EMPTY;
  const key = 'sima.arch.'+projectId;
  let live = arch;
  try {
    const raw = localStorage.getItem(key);
    if (typeof raw === 'string' && raw.trim() && raw !== 'undefined' && raw !== 'null') {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) live = parsed;
    }
  } catch(e){}
  if (!live || !Array.isArray(live.blocks)) live = arch;
  const block = selectedBlockId && Array.isArray(live.blocks) ? live.blocks.find(b => b.id === selectedBlockId) : null;

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

  // PR2.5: surface this block's sync issues if any
  const blockSyncDetail = (syncReport && Array.isArray(syncReport.details))
    ? syncReport.details.find(d => d.blockId === block.id)
    : null;

  return (
    <div className="arch-inspect">
      {blockSyncDetail && (
        <div className="field" style={{
          background: blockSyncDetail.status === 'broken' ? 'rgba(220,38,38,0.06)' : 'rgba(217,119,6,0.06)',
          border: `1px solid ${blockSyncDetail.status === 'broken' ? '#fecaca' : '#fed7aa'}`,
          borderRadius: 6, padding: '8px 10px', marginBottom: 8,
        }}>
          <label style={{
            color: blockSyncDetail.status === 'broken' ? '#b91c1c' : '#9a3412',
            fontWeight: 600,
          }}>{blockSyncDetail.status === 'broken' ? '✗ broken' : '⚠ drift'} ({(blockSyncDetail.issues || []).length})</label>
          <ul style={{margin: '4px 0 0 16px', padding: 0, fontSize: 11, lineHeight: 1.4}}>
            {(blockSyncDetail.issues || []).map((issue, i) => (
              <li key={i} style={{listStyle: 'disc'}}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      <AcceptanceSection blockId={block.id}/>
      <ProfileHintsSection blockId={block.id}/>
      <UserDocsLink blockId={block.id}/>
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

function relativeTime(iso) {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms) || ms < 0) return null;
  const s = Math.floor(ms / 1000);
  if (s < 60) return s + ' sec ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

// PR-5 (b.acceptance-verifier-loop): per-block verifier verdict panel.
// Reads window.SIMA_BOOTSTRAP.acceptanceRuns[blockId] which the bootstrap
// generator populates from atlas/acceptance_runs/<block>/_latest.json.
function AcceptanceSection({ blockId }) {
  const [expanded, setExpanded] = React.useState({});
  const [copied, setCopied] = React.useState(null);
  const run = ((window.SIMA_BOOTSTRAP && window.SIMA_BOOTSTRAP.acceptanceRuns) || {})[blockId];
  if (!run) {
    return (
      <div className="field" style={{
        background: 'rgba(122,106,79,0.04)', border: '1px solid #e7e3d8',
        borderRadius: 6, padding: '8px 10px', marginBottom: 8,
      }}>
        <label style={{ color: 'var(--ink-3)', fontWeight: 600 }}>Acceptance verifier</label>
        <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>
          Прогон не запускался. Запусти: <code style={{fontSize:10}}>node scripts/verify_block_acceptance.mjs {blockId}</code>
        </div>
      </div>
    );
  }
  const verdict = run.verdict;
  const counts = run.counts || { pass: 0, fail: 0, skipped: 0 };
  const total = counts.pass + counts.fail + counts.skipped;
  const verdictColor = verdict === 'pass' ? '#059669' : verdict === 'fail' ? '#b91c1c' : '#9a3412';
  const verdictBg = verdict === 'pass' ? 'rgba(5,150,105,0.06)' : verdict === 'fail' ? 'rgba(220,38,38,0.06)' : 'rgba(217,119,6,0.06)';
  const verdictBorder = verdict === 'pass' ? '#bbf7d0' : verdict === 'fail' ? '#fecaca' : '#fed7aa';
  const verdictLabel = verdict === 'pass' ? '✓ pass' : verdict === 'fail' ? '✗ fail' : '· inconclusive';
  const summary = verdict === 'fail'
    ? counts.pass + '/' + total + ' (' + counts.fail + ' fail)'
    : counts.pass + '/' + total + (counts.skipped ? ' (' + counts.skipped + ' skipped)' : '');

  function copyRetryPrompt(a) {
    const hint = 'Acceptance assertion ' + a.id + ' of block ' + blockId + ' is failing.\n'
      + 'Assertion: ' + a.text + '\n'
      + 'Evidence: ' + (a.evidence || '') + '\n'
      + 'Reasoning: ' + (a.reasoning || '') + '\n'
      + 'Fix the underlying issue, then re-run: node scripts/verify_block_acceptance.mjs ' + blockId;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(hint);
      } else {
        const ta = document.createElement('textarea');
        ta.value = hint; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      }
      setCopied(a.id);
      setTimeout(() => setCopied(null), 1500);
    } catch (e) {}
  }

  const tick = (v) => v === 'pass' ? '✓' : v === 'fail' ? '✗' : '·';
  const tickColor = (v) => v === 'pass' ? '#059669' : v === 'fail' ? '#b91c1c' : 'var(--ink-4)';

  return (
    <div className="field" style={{
      background: verdictBg, border: '1px solid ' + verdictBorder,
      borderRadius: 6, padding: '8px 10px', marginBottom: 8,
    }}>
      <label style={{ color: verdictColor, fontWeight: 600 }}>
        Acceptance verifier · {verdictLabel} · {summary}
      </label>
      <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 1 }}>
        last run: {relativeTime(run.checked_at) || run.checked_at}
      </div>
      <ul style={{ margin: '6px 0 0 0', padding: 0, fontSize: 11, lineHeight: 1.5, listStyle: 'none' }}>
        {(run.assertions || []).map((a) => {
          const isOpen = !!expanded[a.id];
          const canExpand = a.verdict !== 'pass';
          return (
            <li key={a.id} style={{ borderTop: '1px solid rgba(0,0,0,0.04)', padding: '4px 0' }}>
              <div
                onClick={() => canExpand && setExpanded({ ...expanded, [a.id]: !isOpen })}
                style={{ cursor: canExpand ? 'pointer' : 'default', display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span style={{ color: tickColor(a.verdict), fontWeight: 600, width: 12 }}>{tick(a.verdict)}</span>
                <b style={{ width: 28 }}>{a.id}</b>
                <span style={{ fontSize: 9.5, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{a.evidence_kind}</span>
                <span style={{ flex: 1, color: 'var(--ink-3)' }}>{(a.text || '').slice(0, 60)}{(a.text || '').length > 60 ? '…' : ''}</span>
                {canExpand && <span style={{ fontSize: 9, color: 'var(--ink-4)' }}>{isOpen ? '▾' : '▸'}</span>}
              </div>
              {canExpand && isOpen && (
                <div style={{ marginLeft: 18, marginTop: 4, fontSize: 10.5, color: 'var(--ink-3)' }}>
                  {a.evidence && <div style={{ marginBottom: 4 }}><b>evidence:</b> {a.evidence}</div>}
                  {a.reasoning && <div style={{ marginBottom: 6 }}><b>reasoning:</b> {a.reasoning}</div>}
                  {a.verdict === 'fail' && (
                    <button className="btn xs" onClick={(e) => { e.stopPropagation(); copyRetryPrompt(a); }}
                      style={{ fontSize: 10 }}>
                      {copied === a.id ? '✓ Скопировано' : '📋 Скопировать как prompt для retry'}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// PR-6 (b.operator-profile-learner): per-block profile hints panel.
// - warming_up → quiet status with N/M counters
// - live → list 3-5 hints from profile.work_style + tech_stack_history +
//          recent lessons; click on a hint reveals its evidence (block_ids
//          from history) and offers «Снять запрет» / «Забыть паттерн» when
//          that hint is a dont_use entry or a personal-history-derived rule.
function ProfileHintsSection({ blockId }) {
  const [openId, setOpenId] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const profile = (window.SIMA_BOOTSTRAP && window.SIMA_BOOTSTRAP.operatorProfile) || null;
  const lessons = (window.SIMA_BOOTSTRAP && window.SIMA_BOOTSTRAP.operatorLessons) || [];
  const dontUse = (window.SIMA_BOOTSTRAP && window.SIMA_BOOTSTRAP.operatorDontUse) || [];

  if (!profile) return null;
  if (profile._status === 'warming_up') {
    const pv = profile._preview || {};
    const md = profile._min_data || {};
    return (
      <div className="field" style={{
        background: 'rgba(122,106,79,0.04)', border: '1px solid #e7e3d8',
        borderRadius: 6, padding: '8px 10px', marginBottom: 8,
      }}>
        <label style={{ color: 'var(--ink-3)', fontWeight: 600 }}>Подсказки от профиля</label>
        <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>
          Профиль ещё учится: {pv.total_done || 0}/{md.done_required || 5} done,{' '}
          {pv.total_invocations || 0}/{md.invocations_required || 10} invocations.
        </div>
      </div>
    );
  }

  const hints = [];
  const ws = profile.work_style || {};
  if (ws.median_time_idea_to_done_h) {
    hints.push({
      id: 'h-median',
      kind: 'info',
      text: `Обычно проходит idea→done за ~${Math.round(ws.median_time_idea_to_done_h * 10) / 10}h.`,
      evidence: [`${ws.total_done || 0} done transitions`],
      revocable: false,
    });
  }
  if (typeof ws.rollback_rate === 'number' && ws.rollback_rate > 0.1) {
    hints.push({
      id: 'h-rollback',
      kind: 'warn',
      text: `Rollback-rate ${Math.round(ws.rollback_rate * 100)}% — будь осторожен с непроверенными решениями.`,
      evidence: [`${ws.total_broken || 0} broken / ${ws.total_done || 0} done`],
      revocable: false,
    });
  }
  const techHist = profile.tech_stack_history || {};
  for (const scope of ['frontend', 'backend', 'testing']) {
    const top = (techHist[scope] || []).filter((x) => x.uses >= 2 && x.satisfaction === 'high').slice(0, 3);
    if (top.length) {
      hints.push({
        id: `h-tech-${scope}`,
        kind: 'info',
        text: `${scope}: предпочитает ${top.map((x) => x.name).join(', ')}.`,
        evidence: top.flatMap((x) => x.evidence || []).slice(0, 6),
        revocable: true,
        revokeKind: 'forget_pattern',
        revokePayload: { scope, items: top.map((x) => x.name) },
      });
    }
  }
  if (Array.isArray(profile.dont_use) && profile.dont_use.length) {
    hints.push({
      id: 'h-dont-use-profile',
      kind: 'block',
      text: `НИКОГДА не использует: ${profile.dont_use.join(', ')}.`,
      evidence: ['profile.dont_use'],
      revocable: true,
      revokeKind: 'clear_dont_use',
      revokePayload: { items: profile.dont_use },
    });
  }
  if (dontUse.length) {
    hints.push({
      id: 'h-dont-use-explicit',
      kind: 'block',
      text: `Запреты оператора: ${dontUse.join(', ')}.`,
      evidence: ['operator_profile/dont_use.json'],
      revocable: true,
      revokeKind: 'clear_dont_use',
      revokePayload: { items: dontUse },
    });
  }
  // Lessons (unexpired, last 3) — also revocable
  const now = Date.now();
  const fresh = lessons.filter((l) => !l.expires_at || Date.parse(l.expires_at) > now);
  for (const l of fresh.slice(-3)) {
    hints.push({
      id: 'h-lesson-' + (l.id || l.lesson || '').slice(0, 24),
      kind: 'lesson',
      text: l.lesson,
      evidence: l.evidence || [],
      revocable: !!l.id,
      revokeKind: 'revoke_lesson',
      revokePayload: { lesson_id: l.id },
    });
  }

  if (!hints.length) return null;

  async function callMcp(path_, body) {
    setBusy(true);
    try {
      const r = await fetch('http://localhost:8787' + path_, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      await r.json().catch(() => ({}));
    } catch (e) {} finally { setBusy(false); }
  }

  function colorFor(kind) {
    if (kind === 'block') return { bg: 'rgba(220,38,38,0.05)', bd: '#fecaca', tx: '#b91c1c', dot: '⛔' };
    if (kind === 'warn') return { bg: 'rgba(217,119,6,0.06)', bd: '#fed7aa', tx: '#9a3412', dot: '⚠' };
    if (kind === 'lesson') return { bg: 'rgba(30,64,175,0.05)', bd: '#bfdbfe', tx: '#1e3a8a', dot: '📘' };
    return { bg: 'rgba(5,150,105,0.05)', bd: '#bbf7d0', tx: '#065f46', dot: '✓' };
  }

  return (
    <div className="field" style={{
      background: 'rgba(122,106,79,0.04)', border: '1px solid #e7e3d8',
      borderRadius: 6, padding: '8px 10px', marginBottom: 8,
    }}>
      <label style={{ color: 'var(--ink-3)', fontWeight: 600 }}>Подсказки от профиля</label>
      <ul style={{ margin: '6px 0 0 0', padding: 0, listStyle: 'none', fontSize: 11, lineHeight: 1.5 }}>
        {hints.map((h) => {
          const c = colorFor(h.kind);
          const open = openId === h.id;
          return (
            <li key={h.id} style={{
              background: c.bg, border: '1px solid ' + c.bd, borderRadius: 5,
              padding: '4px 6px', marginBottom: 4, cursor: 'pointer',
            }} onClick={() => setOpenId(open ? null : h.id)}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, color: c.tx }}>
                <span>{c.dot}</span><span>{h.text}</span>
                <span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--ink-4)' }}>{open ? '▾' : '▸'}</span>
              </div>
              {open && (
                <div style={{ marginLeft: 18, marginTop: 4, fontSize: 10.5, color: 'var(--ink-3)' }}>
                  {h.evidence.length > 0 && (
                    <div><b>evidence:</b> {h.evidence.slice(0, 6).join(', ')}</div>
                  )}
                  {h.revocable && (
                    <button className="btn xs" disabled={busy} style={{ marginTop: 6, fontSize: 10 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (h.revokeKind === 'revoke_lesson' && h.revokePayload?.lesson_id) {
                          callMcp('/lessons/revoke', h.revokePayload);
                        } else if (h.revokeKind === 'clear_dont_use') {
                          callMcp('/profile/forget', { kind: 'dont_use', items: h.revokePayload.items });
                        } else if (h.revokeKind === 'forget_pattern') {
                          callMcp('/profile/forget', { kind: 'pattern', scope: h.revokePayload.scope, items: h.revokePayload.items });
                        }
                      }}>
                      {h.kind === 'block' ? '🔓 Снять запрет' :
                        h.kind === 'lesson' ? '🗑 Забыть урок' :
                        '🗑 Забыть паттерн'}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div style={{ fontSize: 9.5, color: 'var(--ink-4)', marginTop: 6, fontStyle: 'italic' }}>
        Source: aggregate_operator_profile + analyze_lessons. Подсказки тихие — учитывай, не диктуй.
      </div>
    </div>
  );
}

// PR-4 (b.user-docs-generator): tiny inspector affordance — link to the
// auto-generated end-user tutorial markdown when one exists. The user
// reads it with their editor / GitHub preview / their browser; we don't
// embed the markdown inline (would crowd the inspector).
function UserDocsLink({ blockId }) {
  const reg = (window.SIMA_BOOTSTRAP && window.SIMA_BOOTSTRAP.userDocsByBlock) || {};
  const entry = reg[blockId];
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState(null);
  if (!entry) {
    return null; // no doc → no link; the regenerator will create one on next done
  }
  async function regenerate() {
    setBusy(true);
    try {
      const r = await fetch('http://localhost:8787/run-block', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ block_id: blockId, prompt: '__regenerate_user_docs__' }),
      }).catch(() => null);
      // Server may not handle this prompt yet — fall back to direct regen MCP path
      if (!r || !r.ok) {
        await fetch('http://localhost:8787/user-docs/regenerate', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ block_id: blockId }),
        }).catch(() => null);
      }
      setMsg('Regen requested — refresh proposals/state to see updated meta.');
    } finally { setBusy(false); }
  }
  async function toggleLock() {
    setBusy(true);
    try {
      await fetch('http://localhost:8787/user-docs/lock', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ block_id: blockId, locked: !entry.locked }),
      }).catch(() => null);
      setMsg(entry.locked ? 'Снят lock — следующий regen перепишет markdown.' : 'Lock включён — ручные правки сохранятся.');
    } finally { setBusy(false); }
  }
  return (
    <div className="field" style={{
      background: 'rgba(30,64,175,0.04)', border: '1px solid #bfdbfe',
      borderRadius: 6, padding: '8px 10px', marginBottom: 8,
    }}>
      <label style={{ color: '#1e3a8a', fontWeight: 600 }}>End-user docs</label>
      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2, fontFamily: 'monospace' }}>
        {entry.file}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 1 }}>
        hash {entry.hash} · {entry.lang || 'ru'}
        {entry.locked && <span style={{ marginLeft: 6, color: '#9a3412' }}>· 🔒 locked</span>}
        {entry.generated_at && <span> · {relativeTime(entry.generated_at)}</span>}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <a className="btn xs" href={'/' + entry.file} target="_blank" rel="noreferrer"
           style={{ textDecoration: 'none', display: 'inline-block' }}>
          📖 Открыть туториал
        </a>
        <button className="btn xs ghost" disabled={busy} onClick={regenerate}>
          🔁 Regenerate
        </button>
        <button className="btn xs ghost" disabled={busy} onClick={toggleLock}>
          {entry.locked ? '🔓 Unlock' : '🔒 Lock'}
        </button>
      </div>
      {msg && <div style={{ marginTop: 6, fontSize: 10, color: 'var(--ink-3)' }}>{msg}</div>}
    </div>
  );
}

Object.assign(window, { ArchCanvas, ArchInspector, AcceptanceSection, ProfileHintsSection, UserDocsLink });

// graph_view.jsx — free-form connective graph
// * drag nodes
// * drag from a node port to another node to create a connection
// * edit connection label ("что взять")
// * click a node -> edit list of "что взять" extractions inside it
const { useState, useEffect, useRef, useMemo } = React;

const ACCENT_FILL   = { orange:'var(--orange-soft)', indigo:'var(--indigo-soft)', amber:'var(--amber-soft)', olive:'var(--olive-soft)', neutral:'var(--ink-5)' };
const ACCENT_STROKE = { orange:'var(--orange)', indigo:'var(--indigo)', amber:'var(--amber)', olive:'var(--olive)', neutral:'var(--ink-3)' };

function seedLayout(project, cubes) {
  const nodes = [];
  // source cubes at top
  const libSrc = new Set();
  project.layers.forEach(l => l.nodes.forEach(n => (n.sources||[]).forEach(s => libSrc.add(s))));
  Array.from(libSrc).forEach((id, i) => {
    const c = cubes.find(x => x.id === id); if (!c) return;
    nodes.push({ id, x: 120 + i * 220, y: 60, title: c.title, type: c.type, accent: c.accent || 'neutral', kind: 'source', body: c.body, meta: c.meta, takes: [], width: 190 });
  });
  // schema nodes, arranged by layer rows
  project.layers.forEach((l, li) => {
    l.nodes.forEach((n, ni) => {
      nodes.push({
        id: n.id,
        x: 80 + ni * 240 + (li % 2) * 40,
        y: 240 + li * 150,
        title: n.title,
        type: n.type,
        accent: n.accent || 'indigo',
        kind: 'schema',
        body: n.body,
        kindLabel: n.kind,
        takes: [], // what this node extracts from its sources — user editable
        width: 200
      });
    });
  });
  const connections = [];
  project.layers.forEach(l => l.nodes.forEach(n => (n.sources||[]).forEach(s => {
    connections.push({ id: `${s}->${n.id}`, from: s, to: n.id, label: '', kind: 'live' });
  })));
  SIMA_DATA.conns.forEach((c, i) => connections.push({ id: `i${i}`, from: c.from, to: c.to, label: '', kind: c.kind }));
  return { nodes, connections };
}

function GraphView({ project, cubes, onPickCube }) {
  const [{ nodes, connections }, setGraph] = useState(() => seedLayout(project, cubes));
  const [selected, setSelected] = useState(null);
  const [selectedConn, setSelectedConn] = useState(null);
  const [drag, setDrag] = useState(null);
  const [wire, setWire] = useState(null);
  const [editingConn, setEditingConn] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0, scale: 1 });
  const svgRef = useRef(null);

  const updateNode = (id, patch) => setGraph(g => ({ ...g, nodes: g.nodes.map(n => n.id === id ? { ...n, ...patch } : n) }));
  const updateConn = (id, patch) => setGraph(g => ({ ...g, connections: g.connections.map(c => c.id === id ? { ...c, ...patch } : c) }));
  const deleteConn = (id) => setGraph(g => ({ ...g, connections: g.connections.filter(c => c.id !== id) }));

  // POINTER events — use svg coords
  const toSvgCoords = (clientX, clientY) => {
    const svg = svgRef.current; if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM(); if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const onPointerMove = (e) => {
    const { x, y } = toSvgCoords(e.clientX, e.clientY);
    if (drag) {
      const { id, dx, dy, startX, startY, moved } = drag;
      if (!moved && Math.hypot(x - startX, y - startY) < 4) return;
      if (!moved) setDrag(d => ({ ...d, moved: true }));
      updateNode(id, { x: x - dx, y: y - dy });
    } else if (wire) {
      setWire(w => ({ ...w, mx: x, my: y }));
    }
  };
  const onPointerUp = (e) => {
    if (wire) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      let target = el;
      while (target && !target.dataset?.nodeId && target !== document.body) target = target.parentElement;
      if (target && target.dataset?.nodeId && target.dataset.nodeId !== wire.fromId) {
        const newId = `${wire.fromId}->${target.dataset.nodeId}:${Date.now()}`;
        setGraph(g => ({ ...g, connections: [...g.connections, { id: newId, from: wire.fromId, to: target.dataset.nodeId, label: '', kind: 'semantic' }] }));
        setEditingConn(newId);
        setSelectedConn(newId);
      }
    }
    if (drag && !drag.moved) {
      setSelected(drag.id); setSelectedConn(null);
    }
    setDrag(null); setWire(null);
  };

  const nodeById = useMemo(() => Object.fromEntries(nodes.map(n => [n.id, n])), [nodes]);

  // bounding box
  const bbox = useMemo(() => {
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    const maxW = Math.max(...nodes.map(n => n.width));
    return { minX: Math.min(...xs) - 40, maxX: Math.max(...xs) + maxW + 40, minY: Math.min(...ys) - 40, maxY: Math.max(...ys) + 200 };
  }, [nodes]);

  const selNode = selected && nodeById[selected];

  return (
    <div className="canvas-wrap" style={{padding:0,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 22px',borderBottom:'0.5px solid var(--line-1)'}}>
        <div>
          <div style={{fontSize:17,fontWeight:500}}>Граф проекта</div>
          <div className="meta" style={{marginTop:2}}>{nodes.length} кубиков · {connections.length} связей · <span style={{color:'var(--orange-ink)'}}>потяните за точку на краю кубика чтобы связать</span></div>
        </div>
        <span className="grow"></span>
        <button className="chip active">все</button>
        <button className="chip">только live</button>
        <button className="chip">семантика</button>
        <span className="sep" style={{height:14,width:1,background:'var(--line-2)'}}></span>
        <button className="btn sm ghost" onClick={() => setGraph(seedLayout(project, cubes))}><Icon name="expand" size={11}/> авто-раскладка</button>
      </div>

      <div style={{flex:1,position:'relative',overflow:'hidden',background:`
        radial-gradient(circle at 1px 1px, var(--line-1) 1px, transparent 1px) 0 0 / 24px 24px,
        var(--bg-0)`}}>
        <svg ref={svgRef}
          viewBox={`${bbox.minX} ${bbox.minY} ${bbox.maxX - bbox.minX} ${bbox.maxY - bbox.minY}`}
          preserveAspectRatio="xMidYMid meet"
          style={{width:'100%',height:'100%',display:'block',cursor: drag ? 'grabbing' : 'default'}}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onClick={(e) => { if (e.target === svgRef.current) { setSelected(null); setSelectedConn(null); setEditingConn(null); } }}>

          <defs>
            <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--ink-4)"/>
            </marker>
            <marker id="arr-live" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--olive)"/>
            </marker>
            <marker id="arr-sel" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--orange)"/>
            </marker>
          </defs>

          {/* swimlane for sources */}
          <g>
            <rect x={bbox.minX} y={bbox.minY} width={bbox.maxX - bbox.minX} height={160} fill="var(--amber-bg)" opacity="0.35"/>
            <line x1={bbox.minX} y1={bbox.minY + 160} x2={bbox.maxX} y2={bbox.minY + 160} stroke="var(--line-2)" strokeWidth="0.5" strokeDasharray="4 3"/>
            <rect x={bbox.minX + 14} y={bbox.minY + 14} width={160} height={22} rx={4} fill="var(--paper)" stroke="var(--line-2)" strokeWidth="0.5"/>
            <text x={bbox.minX + 24} y={bbox.minY + 29} style={{fontSize:10,fill:'var(--ink-2)',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:500}}>
              входящие · источники
            </text>
            <text x={bbox.minX + bbox.maxX - bbox.minX - 14} y={bbox.minY + 29} textAnchor="end" style={{fontSize:10,fill:'var(--amber-ink)',fontStyle:'italic'}}>
              кубики из библиотеки — сырой контекст
            </text>
          </g>
          {/* swimlanes per schema layer */}
          {project.layers.map((l, li) => {
            const y0 = 220 + li * 150;
            const bandColors = ['var(--indigo-bg)', 'var(--olive-bg)', 'var(--orange-bg)', 'var(--amber-bg)', 'var(--ink-5)'];
            const inkColors  = ['var(--indigo-ink)', 'var(--olive-ink)', 'var(--orange-ink)', 'var(--amber-ink)', 'var(--ink-2)'];
            return (
              <g key={l.id}>
                <rect x={bbox.minX} y={y0} width={bbox.maxX - bbox.minX} height={130} fill={bandColors[li % bandColors.length]} opacity={li % 2 === 0 ? 0.22 : 0.32}/>
                <line x1={bbox.minX} y1={y0 + 130} x2={bbox.maxX} y2={y0 + 130} stroke="var(--line-2)" strokeWidth="0.5" strokeDasharray="4 3"/>
                <rect x={bbox.minX + 14} y={y0 + 10} width={210} height={22} rx={4} fill="var(--paper)" stroke="var(--line-2)" strokeWidth="0.5"/>
                <text x={bbox.minX + 24} y={y0 + 25} style={{fontSize:10,fill:inkColors[li % inkColors.length],textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:500}}>
                  {l.num} · {l.title}
                </text>
                <text x={bbox.maxX - 14} y={y0 + 25} textAnchor="end" style={{fontSize:10,fill:'var(--ink-4)',fontStyle:'italic'}}>
                  {l.kind || ''}
                </text>
              </g>
            );
          })}

          {/* connections */}
          {connections.map(c => {
            const a = nodeById[c.from], b = nodeById[c.to]; if (!a || !b) return null;
            const ax = a.x + a.width / 2, ay = a.y + 40 + 20; // node body ~ 60px tall
            const bx = b.x + b.width / 2, by = b.y;
            const dy = Math.max(40, Math.abs(by - ay) * 0.4);
            const d = `M ${ax} ${ay} C ${ax} ${ay + dy}, ${bx} ${by - dy}, ${bx} ${by}`;
            const isSel = selectedConn === c.id;
            const midX = (ax + bx) / 2, midY = (ay + by) / 2 + (Math.abs(ay - by) < 80 ? 0 : 10);
            const stroke = isSel ? 'var(--orange)' : (c.kind === 'live' ? 'var(--olive-soft)' : c.kind === 'semantic' ? 'var(--ink-5)' : 'var(--ink-4)');
            return (
              <g key={c.id} style={{cursor:'pointer'}} onClick={(e) => { e.stopPropagation(); setSelectedConn(c.id); setSelected(null); }}>
                <path d={d} fill="none" stroke="transparent" strokeWidth="16"/>
                <path d={d} fill="none" stroke={stroke}
                  strokeWidth={isSel ? 2 : 1.1}
                  strokeDasharray={c.kind === 'semantic' ? '4 4' : 'none'}
                  markerEnd={isSel ? 'url(#arr-sel)' : (c.kind === 'live' ? 'url(#arr-live)' : 'url(#arr)')}
                  opacity={0.9}/>
                {(c.label || isSel) && (
                  <g transform={`translate(${midX} ${midY})`}>
                    <rect x={-Math.max(40, (c.label || 'связь...').length * 3.3)} y={-9} width={Math.max(80, (c.label || 'связь...').length * 6.6)} height={18} rx={9}
                      fill="var(--paper)" stroke={isSel ? 'var(--orange)' : 'var(--line-2)'} strokeWidth="0.5"/>
                    <text textAnchor="middle" y={4} style={{fontSize:10,fill: c.label ? 'var(--ink-1)' : 'var(--ink-4)', fontStyle: c.label ? 'normal' : 'italic'}}>
                      {c.label || 'без подписи'}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* wire being dragged */}
          {wire && (() => {
            const a = nodeById[wire.fromId]; if (!a) return null;
            const ax = a.x + a.width / 2, ay = a.y + 60;
            const d = `M ${ax} ${ay} C ${ax} ${ay + 40}, ${wire.mx} ${wire.my - 40}, ${wire.mx} ${wire.my}`;
            return <path d={d} fill="none" stroke="var(--orange)" strokeWidth="1.5" strokeDasharray="4 3" markerEnd="url(#arr-sel)"/>;
          })()}

          {/* nodes */}
          {nodes.map(n => {
            const isSel = selected === n.id;
            const w = n.width, h = 60;
            return (
              <g key={n.id} data-node-id={n.id} transform={`translate(${n.x} ${n.y})`}
                 style={{cursor: drag?.id === n.id ? 'grabbing' : 'grab'}}>
                <rect width={w} height={h} rx={8}
                  fill="var(--paper)"
                  stroke={isSel ? 'var(--orange)' : 'var(--line-2)'}
                  strokeWidth={isSel ? 1.4 : 0.7}
                  filter={isSel ? '' : ''}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    const { x, y } = toSvgCoords(e.clientX, e.clientY);
                    setDrag({ id: n.id, dx: x - n.x, dy: y - n.y, startX: x, startY: y, moved: false });
                    setSelectedConn(null);
                  }}
                  onClick={(e) => e.stopPropagation()}/>
                {/* accent strip */}
                <rect width={3} height={h} rx={1} fill={ACCENT_STROKE[n.accent] || 'var(--ink-4)'}/>
                <text x={12} y={18} style={{fontSize:9,fill:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'0.06em',pointerEvents:'none'}}>
                  {typeLabel[n.type]}{n.kindLabel ? ' · ' + n.kindLabel : ''}
                </text>
                <foreignObject x={10} y={22} width={w - 20} height={34} style={{pointerEvents:'none'}}>
                  <div xmlns="http://www.w3.org/1999/xhtml" style={{fontSize:12,fontWeight:500,color:'var(--ink-1)',lineHeight:1.3,fontFamily:'var(--font-sans)',overflow:'hidden',textOverflow:'ellipsis',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>
                    {n.title}
                  </div>
                </foreignObject>
                {/* ports */}
                <circle cx={w/2} cy={0} r={4} fill="var(--paper)" stroke="var(--line-3)" strokeWidth="1" style={{cursor:'crosshair'}}
                  onPointerDown={(e) => { e.stopPropagation(); const { x, y } = toSvgCoords(e.clientX, e.clientY); setWire({ fromId: n.id, mx: x, my: y }); }}/>
                <circle cx={w/2} cy={h} r={4} fill="var(--paper)" stroke="var(--line-3)" strokeWidth="1" style={{cursor:'crosshair'}}
                  onPointerDown={(e) => { e.stopPropagation(); const { x, y } = toSvgCoords(e.clientX, e.clientY); setWire({ fromId: n.id, mx: x, my: y }); }}/>

                {/* count of "takes" if any */}
                {n.takes && n.takes.length > 0 && (
                  <g transform={`translate(${w - 36} ${h - 16})`}>
                    <rect width={30} height={14} rx={7} fill="var(--amber-bg)"/>
                    <text x={15} y={10} textAnchor="middle" style={{fontSize:9,fill:'var(--amber-ink)',fontWeight:500,pointerEvents:'none'}}>
                      взять · {n.takes.length}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>

        {/* legend */}
        <div style={{position:'absolute',bottom:14,left:14,background:'var(--paper)',border:'0.5px solid var(--line-2)',borderRadius:6,padding:'8px 12px',display:'flex',gap:14,alignItems:'center',fontSize:11,color:'var(--ink-3)'}}>
          <span style={{display:'flex',alignItems:'center',gap:5}}><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--olive-soft)" strokeWidth="1.2"/></svg> live</span>
          <span style={{display:'flex',alignItems:'center',gap:5}}><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--ink-5)" strokeWidth="1.2" strokeDasharray="3 3"/></svg> семантика</span>
          <span style={{display:'flex',alignItems:'center',gap:5}}><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="var(--ink-4)" strokeWidth="1.2"/></svg> пользовательская</span>
        </div>

        {/* connection editor popover */}
        {selectedConn && (() => {
          const c = connections.find(x => x.id === selectedConn); if (!c) return null;
          const a = nodeById[c.from], b = nodeById[c.to]; if (!a || !b) return null;
          return (
            <div style={{position:'absolute',right:14,top:14,width:300,background:'var(--paper)',border:'0.5px solid var(--line-2)',borderRadius:8,padding:14,boxShadow:'0 10px 30px rgba(0,0,0,0.06)'}}>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
                <Icon name="link" size={12} color="var(--orange)"/>
                <div style={{fontSize:11,fontWeight:500,letterSpacing:'0.04em',textTransform:'uppercase',color:'var(--ink-3)',flex:1}}>связь</div>
                <button className="rail-btn" onClick={() => setSelectedConn(null)} style={{width:22,height:22}}><Icon name="close" size={10}/></button>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10,fontSize:12}}>
                <span className="truncate" style={{maxWidth:110,fontWeight:500}}>{a.title}</span>
                <Icon name="arrow" size={11} color="var(--ink-4)"/>
                <span className="truncate" style={{maxWidth:110,fontWeight:500}}>{b.title}</span>
              </div>
              <label style={{fontSize:10,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'0.05em'}}>что берётся из источника</label>
              <textarea autoFocus={editingConn === c.id} value={c.label} onChange={e => updateConn(c.id, { label: e.target.value })}
                placeholder="например: определение миссии · три ключевые метрики · цитата про контекст"
                rows={3}
                style={{width:'100%',marginTop:6,background:'var(--bg-1)',border:'0.5px solid var(--line-2)',borderRadius:5,padding:'8px 10px',fontSize:12,color:'var(--ink-1)',fontFamily:'var(--font-sans)',outline:'none',resize:'vertical'}}/>
              <div style={{display:'flex',gap:6,marginTop:10,alignItems:'center'}}>
                <span style={{fontSize:10,color:'var(--ink-4)'}}>тип:</span>
                {['live','semantic','manual'].map(k => (
                  <button key={k} className={`chip ${c.kind === k ? 'active' : ''}`} onClick={() => updateConn(c.id, { kind: k })}>
                    {k === 'live' ? 'live' : k === 'semantic' ? 'семантика' : 'вручную'}
                  </button>
                ))}
                <span className="grow"></span>
                <button className="btn xs" onClick={() => { deleteConn(c.id); setSelectedConn(null); }} title="удалить">
                  <Icon name="close" size={10}/>
                </button>
              </div>
            </div>
          );
        })()}

        {/* node editor popover (what to take INSIDE the cube) */}
        {selNode && (
          <div style={{position:'absolute',right:14,top:14,width:320,background:'var(--paper)',border:'0.5px solid var(--line-2)',borderRadius:8,padding:14,boxShadow:'0 10px 30px rgba(0,0,0,0.06)'}}>
            <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:10}}>
              <Badge type={selNode.type} kind={selNode.kindLabel}/>
              <span className="grow"></span>
              <button className="rail-btn" onClick={() => setSelected(null)} style={{width:22,height:22}}><Icon name="close" size={10}/></button>
            </div>
            <div style={{fontSize:14,fontWeight:500,lineHeight:1.3,marginBottom:6}}>{selNode.title}</div>
            {selNode.body && <div className="meta" style={{lineHeight:1.5,marginBottom:10}}>{selNode.body}</div>}

            <div style={{borderTop:'0.5px solid var(--line-1)',paddingTop:10}}>
              <label style={{fontSize:10,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'0.05em'}}>что брать из этого кубика</label>
              <div style={{fontSize:11,color:'var(--ink-3)',marginTop:3,marginBottom:8,lineHeight:1.45}}>список конкретных смысловых «изюмин» — их можно показать на исходящих связях</div>
              <div className="col" style={{gap:5}}>
                {(selNode.takes || []).map((t, i) => (
                  <div key={i} style={{display:'flex',gap:6,alignItems:'flex-start',padding:'5px 8px',background:'var(--amber-bg)',borderRadius:5}}>
                    <span style={{fontSize:9,color:'var(--amber-ink)',marginTop:3,fontFamily:'var(--font-mono)'}}>{String(i+1).padStart(2,'0')}</span>
                    <input value={t} onChange={e => {
                      const nx = [...selNode.takes]; nx[i] = e.target.value; updateNode(selNode.id, { takes: nx });
                    }} style={{flex:1,fontSize:12,border:'none',background:'transparent',color:'var(--amber-ink)',outline:'none',fontFamily:'var(--font-sans)'}}/>
                    <button className="rail-btn" onClick={() => { const nx = selNode.takes.filter((_, j) => j !== i); updateNode(selNode.id, { takes: nx }); }} style={{width:18,height:18}}><Icon name="close" size={9}/></button>
                  </div>
                ))}
                <button className="btn xs" style={{alignSelf:'flex-start'}} onClick={() => updateNode(selNode.id, { takes: [...(selNode.takes||[]), ''] })}>
                  <Icon name="plus" size={10}/> добавить
                </button>
              </div>
            </div>

            <div style={{borderTop:'0.5px solid var(--line-1)',marginTop:12,paddingTop:10,display:'flex',gap:6,flexWrap:'wrap'}}>
              <button className="btn xs"><Icon name="link" size={10}/> связать с другим</button>
              <button className="btn xs"><Icon name="sparkle" size={10}/> Сима предложит</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

window.GraphView = GraphView;

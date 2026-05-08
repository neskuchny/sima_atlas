// canvas_tools.jsx — universal annotation overlay with element-targeted comments.
// Picks up elements marked [data-node-id], [data-block-id], [data-pickable].
// Tools: cursor, comment (pin attached to block), note (floating sticker),
// lasso (rectangle, free or snap-to-block), pen (freehand), arrow.

const { useState, useEffect, useRef, useMemo, useLayoutEffect } = React;

const TOOLS = [
  { id: 'cursor',  icon: 'cursor',      label: 'курсор',   hint: 'обычная работа с блоками' },
  { id: 'comment', icon: 'comment',     label: 'коммент',  hint: 'наведи на блок и кликни — булавка привяжется' },
  { id: 'note',    icon: 'note',        label: 'стикер',   hint: 'поставь заметку на холсте' },
  { id: 'lasso',   icon: 'lasso',       label: 'обвести',  hint: 'клик по блоку — обводка, либо протяни рамку' },
  { id: 'pen',     icon: 'pen',         label: 'от руки',  hint: 'рисуй маркером' },
  { id: 'arrow',   icon: 'arrow-tool',  label: 'стрелка',  hint: 'нарисуй стрелку с подписью' },
];

const PEN_COLORS = ['var(--orange)','var(--indigo)','var(--olive)','var(--amber-ink)','var(--ink-1)'];

// --- helpers to resolve a target element from the DOM under pointer ---
function findTarget(el, layer) {
  let node = el;
  while (node && node !== layer && node !== document.body) {
    if (node.dataset) {
      if (node.dataset.nodeId)  return { kind: 'node',  id: node.dataset.nodeId,  el: node };
      if (node.dataset.blockId) return { kind: 'block', id: node.dataset.blockId, el: node };
      if (node.dataset.pickable) return { kind: 'pickable', id: node.dataset.pickable, el: node };
    }
    node = node.parentNode;
  }
  return null;
}

function targetSelector(t) {
  if (t.kind === 'node') return `[data-node-id="${t.id}"]`;
  if (t.kind === 'block') return `[data-block-id="${t.id}"]`;
  return `[data-pickable="${t.id}"]`;
}

function resolveRect(selector, layerEl) {
  if (!layerEl) return null;
  const root = layerEl.parentElement;
  if (!root) return null;
  const el = root.querySelector(selector);
  if (!el) return null;
  const er = el.getBoundingClientRect();
  const lr = layerEl.getBoundingClientRect();
  return { x: er.left - lr.left, y: er.top - lr.top, w: er.width, h: er.height };
}

function CanvasTools({ storageKey = 'sima-annots', children, initialTool = 'cursor' }) {
  const [tool, setTool] = useState(initialTool);
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [annots, setAnnots] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
  });
  const [editing, setEditing] = useState(null);
  const [drawing, setDrawing] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [hoverTarget, setHoverTarget] = useState(null); // { kind, id, rect }
  const [, tick] = useState(0); // force re-resolve rects on resize
  const layerRef = useRef(null);

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(annots)); } catch {}
  }, [annots, storageKey]);

  // re-resolve on resize / scroll
  useEffect(() => {
    const f = () => tick(n => n + 1);
    window.addEventListener('resize', f);
    const obs = new MutationObserver(f);
    if (layerRef.current?.parentElement) obs.observe(layerRef.current.parentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['transform','style','x','y'] });
    const int = setInterval(f, 500); // cheap sync for svg transforms
    return () => { window.removeEventListener('resize', f); obs.disconnect(); clearInterval(int); };
  }, []);

  const add = (a) => {
    const id = a.id || `a${Date.now()}${Math.random().toString(36).slice(2,6)}`;
    setAnnots(prev => [...prev, { id, ...a }]);
    return id;
  };
  const update = (id, patch) => setAnnots(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a));
  const remove = (id) => setAnnots(prev => prev.filter(a => a.id !== id));

  const getPoint = (e) => {
    const rect = layerRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // hover highlight while using pick-aware tools
  const onPointerMoveLayer = (e) => {
    if (drawing) {
      const p = getPoint(e);
      if (drawing.kind === 'lasso') setDrawing({ ...drawing, w: p.x - drawing.x, h: p.y - drawing.y });
      else if (drawing.kind === 'pen') setDrawing({ ...drawing, pts: [...drawing.pts, p] });
      else if (drawing.kind === 'arrow') setDrawing({ ...drawing, x2: p.x, y2: p.y });
      return;
    }
    if (tool === 'comment' || tool === 'lasso') {
      // pass-through query: temporarily turn off pointer-events on overlay
      const prev = layerRef.current.style.pointerEvents;
      layerRef.current.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      layerRef.current.style.pointerEvents = prev;
      const t = el ? findTarget(el, layerRef.current) : null;
      if (t) {
        const r = resolveRect(targetSelector(t), layerRef.current);
        if (r) setHoverTarget({ ...t, rect: r });
        else setHoverTarget(null);
      } else setHoverTarget(null);
    } else if (hoverTarget) {
      setHoverTarget(null);
    }
  };

  const onPointerDown = (e) => {
    if (tool === 'cursor') return;
    if (e.target.closest('[data-annot]') && !['pen','lasso','arrow'].includes(tool)) return;
    e.stopPropagation();

    // element-aware COMMENT
    if (tool === 'comment') {
      // Prefer targeted element
      const prev = layerRef.current.style.pointerEvents;
      layerRef.current.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      layerRef.current.style.pointerEvents = prev;
      const t = el ? findTarget(el, layerRef.current) : null;
      const p = getPoint(e);
      const id = add(t
        ? { kind: 'comment', target: { kind: t.kind, id: t.id }, ox: 0, oy: 0, text: '', author: 'вы', ts: Date.now(), color }
        : { kind: 'comment', x: p.x, y: p.y, text: '', author: 'вы', ts: Date.now(), color });
      setEditing(id);
      setTool('cursor');
      return;
    }

    // element-aware LASSO: if clicking on a block, snap-outline it
    if (tool === 'lasso') {
      const prev = layerRef.current.style.pointerEvents;
      layerRef.current.style.pointerEvents = 'none';
      const el = document.elementFromPoint(e.clientX, e.clientY);
      layerRef.current.style.pointerEvents = prev;
      const t = el ? findTarget(el, layerRef.current) : null;
      if (t) {
        const id = add({ kind: 'lasso', target: { kind: t.kind, id: t.id }, padding: 6, color, label: '' });
        setEditing(id);
        setTool('cursor');
        return;
      }
      const p = getPoint(e);
      setDrawing({ kind: 'lasso', x: p.x, y: p.y, w: 0, h: 0, color });
      return;
    }

    const p = getPoint(e);
    if (tool === 'note') {
      const id = add({ kind: 'note', x: p.x, y: p.y, w: 180, h: 120, text: '' });
      setEditing(id);
      setTool('cursor');
      return;
    }
    if (tool === 'pen') {
      setDrawing({ kind: 'pen', pts: [p], color });
      return;
    }
    if (tool === 'arrow') {
      setDrawing({ kind: 'arrow', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color, label: '' });
      return;
    }
  };

  const onPointerUp = () => {
    if (!drawing) return;
    if (drawing.kind === 'lasso' && (Math.abs(drawing.w) > 8 && Math.abs(drawing.h) > 8)) {
      const x = drawing.w < 0 ? drawing.x + drawing.w : drawing.x;
      const y = drawing.h < 0 ? drawing.y + drawing.h : drawing.y;
      const w = Math.abs(drawing.w), h = Math.abs(drawing.h);
      const id = add({ kind: 'lasso', x, y, w, h, color: drawing.color, label: '' });
      setEditing(id);
    } else if (drawing.kind === 'pen' && drawing.pts.length > 2) {
      add({ kind: 'pen', pts: drawing.pts, color: drawing.color });
    } else if (drawing.kind === 'arrow' && (Math.hypot(drawing.x2 - drawing.x1, drawing.y2 - drawing.y1) > 10)) {
      const id = add({ ...drawing });
      setEditing(id);
    }
    setDrawing(null);
    if (tool !== 'pen') setTool('cursor');
  };

  const toolPrompt = TOOLS.find(t => t.id === tool);

  // resolve rects for targeted annots
  const resolvedAnnots = useMemo(() => annots.map(a => {
    if (a.target) {
      const sel = targetSelector({ kind: a.target.kind, id: a.target.id });
      const r = resolveRect(sel, layerRef.current);
      return { ...a, _rect: r };
    }
    return a;
  }), [annots, layerRef.current, hoverTarget /* re-eval on hover */]);

  return (
    <div style={{position:'relative',width:'100%',height:'100%',overflow:'hidden'}}>
      {children}

      {/* annotation layer */}
      <div ref={layerRef}
        data-annot-layer
        style={{
          position:'absolute',inset:0,
          pointerEvents: tool === 'cursor' ? 'none' : 'auto',
          cursor: tool === 'cursor' ? 'default' :
                  (tool === 'comment' || tool === 'lasso') ? (hoverTarget ? 'pointer' : 'crosshair') :
                  tool === 'note' ? 'cell' :
                  tool === 'pen' ? 'crosshair' :
                  tool === 'arrow' ? 'crosshair' : 'default',
          userSelect:'none',
          background: (tool === 'comment' || tool === 'lasso') ? 'rgba(0,0,0,0.02)' : 'transparent'
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMoveLayer}
        onPointerUp={onPointerUp}
        onPointerLeave={(e) => { setHoverTarget(null); onPointerUp(e); }}
      >
        <svg style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',overflow:'visible'}}>
          <defs>
            <marker id="ct-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="currentColor"/>
            </marker>
          </defs>

          {/* HOVER highlight while picking */}
          {hoverTarget && (tool === 'comment' || tool === 'lasso') && (
            <g style={{color: color}}>
              <rect x={hoverTarget.rect.x - 4} y={hoverTarget.rect.y - 4}
                width={hoverTarget.rect.w + 8} height={hoverTarget.rect.h + 8}
                rx={10} fill={color} fillOpacity="0.08" stroke={color} strokeWidth="1.5" strokeDasharray="5 4"/>
              <rect x={hoverTarget.rect.x - 4} y={hoverTarget.rect.y - 4}
                width={hoverTarget.rect.w + 8} height={hoverTarget.rect.h + 8}
                rx={10} fill="none" stroke={color} strokeWidth="3" opacity="0.15"/>
            </g>
          )}

          {!hidden && resolvedAnnots.filter(a => a.kind === 'pen').map(a => (
            <polyline key={a.id} data-annot points={a.pts.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none" stroke={a.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity="0.85"
              style={{pointerEvents:'stroke',cursor:'pointer'}}
              onPointerDown={(e) => { if (tool !== 'cursor') return; e.stopPropagation(); setEditing(a.id); }}/>
          ))}

          {/* LASSO — either free (x/y/w/h) or target-bound (a._rect) */}
          {!hidden && resolvedAnnots.filter(a => a.kind === 'lasso').map(a => {
            const pad = a.padding || 0;
            const r = a.target ? a._rect : { x: a.x, y: a.y, w: a.w, h: a.h };
            if (!r) return null;
            const x = r.x - pad, y = r.y - pad, w = r.w + 2*pad, h = r.h + 2*pad;
            return (
              <g key={a.id} data-annot style={{color: a.color, pointerEvents: 'auto', cursor: 'pointer'}}
                 onPointerDown={(e) => { if (tool !== 'cursor') return; e.stopPropagation(); setEditing(a.id); }}>
                <rect x={x} y={y} width={w} height={h} rx={10}
                  fill={a.color} fillOpacity="0.06" stroke={a.color} strokeWidth="1.6" strokeDasharray="6 4"/>
                {a.label && (
                  <g>
                    <rect x={x + 10} y={y - 10} width={a.label.length * 7 + 16} height={18} rx={9} fill="var(--paper)" stroke={a.color} strokeWidth="0.6"/>
                    <text x={x + 18} y={y + 3} style={{fontSize:11, fill:a.color, fontWeight:500}}>{a.label}</text>
                  </g>
                )}
              </g>
            );
          })}

          {!hidden && resolvedAnnots.filter(a => a.kind === 'arrow').map(a => {
            const mx = (a.x1 + a.x2)/2, my = (a.y1 + a.y2)/2;
            return (
              <g key={a.id} data-annot style={{color: a.color, pointerEvents: 'auto', cursor: 'pointer'}}
                 onPointerDown={(e) => { if (tool !== 'cursor') return; e.stopPropagation(); setEditing(a.id); }}>
                <line x1={a.x1} y1={a.y1} x2={a.x2} y2={a.y2} stroke={a.color} strokeWidth="2" markerEnd="url(#ct-arrow)"/>
                {a.label && (
                  <g>
                    <rect x={mx - (a.label.length * 3.3 + 10)} y={my - 10} width={a.label.length * 6.6 + 20} height={18} rx={9} fill="var(--paper)" stroke={a.color} strokeWidth="0.6"/>
                    <text x={mx} y={my + 3} textAnchor="middle" style={{fontSize:11,fill:a.color,fontWeight:500}}>{a.label}</text>
                  </g>
                )}
              </g>
            );
          })}

          {drawing && drawing.kind === 'lasso' && (
            <rect x={drawing.w < 0 ? drawing.x + drawing.w : drawing.x}
                  y={drawing.h < 0 ? drawing.y + drawing.h : drawing.y}
                  width={Math.abs(drawing.w)} height={Math.abs(drawing.h)} rx={10}
                  fill={drawing.color} fillOpacity="0.06" stroke={drawing.color} strokeWidth="1.6" strokeDasharray="6 4"/>
          )}
          {drawing && drawing.kind === 'pen' && (
            <polyline points={drawing.pts.map(p => `${p.x},${p.y}`).join(' ')}
              fill="none" stroke={drawing.color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          )}
          {drawing && drawing.kind === 'arrow' && (
            <line x1={drawing.x1} y1={drawing.y1} x2={drawing.x2} y2={drawing.y2} stroke={drawing.color} strokeWidth="2" markerEnd="url(#ct-arrow)"/>
          )}
        </svg>

        {/* HTML annotations (notes + comments) */}
        {!hidden && resolvedAnnots.filter(a => a.kind === 'note').map(a => (
          <Note key={a.id} a={a} onEdit={() => setEditing(a.id)} onChange={(patch) => update(a.id, patch)} onRemove={() => remove(a.id)} editing={editing === a.id} closeEdit={() => setEditing(null)}/>
        ))}
        {!hidden && resolvedAnnots.filter(a => a.kind === 'comment').map(a => (
          <CommentPin key={a.id} a={a} editing={editing === a.id} onEdit={() => setEditing(a.id)} onChange={(patch) => update(a.id, patch)} onRemove={() => remove(a.id)} closeEdit={() => setEditing(null)}/>
        ))}

        {/* label popover for lasso/arrow */}
        {editing && annots.find(a => a.id === editing && (a.kind === 'lasso' || a.kind === 'arrow')) && (() => {
          const a = resolvedAnnots.find(x => x.id === editing);
          let x, y;
          if (a.kind === 'lasso') {
            const r = a.target ? a._rect : { x: a.x, y: a.y, w: a.w, h: a.h };
            if (!r) return null;
            x = r.x + r.w/2; y = r.y - 46;
          } else {
            x = (a.x1 + a.x2) / 2; y = (a.y1 + a.y2) / 2 - 46;
          }
          return (
            <div data-annot style={{position:'absolute',left:Math.max(8, x - 130),top:Math.max(8, y),zIndex:5,background:'var(--paper)',border:'0.5px solid var(--line-2)',borderRadius:8,padding:'8px 10px',boxShadow:'0 10px 24px rgba(0,0,0,0.08)',display:'flex',gap:6,alignItems:'center',pointerEvents:'auto'}}>
              <input autoFocus value={a.label || ''} onChange={e => update(a.id, { label: e.target.value })} placeholder="подпись…"
                style={{border:'none',outline:'none',fontSize:12,minWidth:160,background:'transparent'}}/>
              <div style={{display:'flex',gap:3}}>
                {PEN_COLORS.map(c => (
                  <button key={c} onClick={() => update(a.id, { color: c })} style={{width:14,height:14,borderRadius:'50%',border: a.color === c ? '2px solid var(--ink-1)' : '0.5px solid var(--line-2)',background:c,padding:0,cursor:'pointer'}}/>
                ))}
              </div>
              <button className="rail-btn" style={{width:22,height:22}} onClick={() => { remove(a.id); setEditing(null); }}><Icon name="trash" size={10}/></button>
              <button className="rail-btn" style={{width:22,height:22}} onClick={() => setEditing(null)}><Icon name="check" size={11}/></button>
            </div>
          );
        })()}
      </div>

      {/* floating toolbar */}
      <div style={{position:'absolute',left:'50%',bottom:14,transform:'translateX(-50%)',zIndex:10,display:'flex',gap:2,background:'var(--paper)',border:'0.5px solid var(--line-2)',borderRadius:10,padding:4,boxShadow:'0 6px 20px rgba(0,0,0,0.08)',pointerEvents:'auto'}}>
        {TOOLS.map(t => (
          <button key={t.id} title={`${t.label} — ${t.hint}`} onClick={() => setTool(t.id)}
            style={{
              width:34,height:34,borderRadius:6,border:'none',
              background: tool === t.id ? 'var(--ink-1)' : 'transparent',
              color: tool === t.id ? 'var(--paper)' : 'var(--ink-2)',
              cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'
            }}>
            <Icon name={t.icon} size={14} color="currentColor"/>
          </button>
        ))}
        <span style={{width:1,background:'var(--line-2)',margin:'4px 4px'}}></span>
        <div style={{display:'flex',gap:3,alignItems:'center',padding:'0 6px'}}>
          {PEN_COLORS.map(c => (
            <button key={c} title="цвет" onClick={() => setColor(c)}
              style={{width:16,height:16,borderRadius:'50%',border: color === c ? '2px solid var(--ink-1)' : '0.5px solid var(--line-2)',background:c,padding:0,cursor:'pointer'}}/>
          ))}
        </div>
        <span style={{width:1,background:'var(--line-2)',margin:'4px 4px'}}></span>
        <button title={hidden ? 'показать аннотации' : 'скрыть аннотации'} onClick={() => setHidden(h => !h)}
          style={{width:34,height:34,borderRadius:6,border:'none',background:'transparent',color:'var(--ink-2)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <Icon name={hidden ? 'focus' : 'layers'} size={13} color="currentColor"/>
        </button>
        <button title="очистить все" onClick={() => { if (confirm('удалить все аннотации на этом холсте?')) setAnnots([]); }}
          style={{width:34,height:34,borderRadius:6,border:'none',background:'transparent',color:'var(--ink-3)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <Icon name="trash" size={13} color="currentColor"/>
        </button>
      </div>

      {tool !== 'cursor' && (
        <div style={{position:'absolute',left:'50%',bottom:62,transform:'translateX(-50%)',zIndex:10,background:'var(--ink-1)',color:'var(--paper)',fontSize:11,padding:'4px 10px',borderRadius:4,pointerEvents:'none',fontWeight:500,letterSpacing:'0.02em'}}>
          {toolPrompt.label}{hoverTarget && (tool === 'comment' || tool === 'lasso') ? ' · привязать к блоку' : ' · ' + toolPrompt.hint}
        </div>
      )}

      {annots.length > 0 && (
        <div style={{position:'absolute',right:14,bottom:14,zIndex:9,background:'var(--paper)',border:'0.5px solid var(--line-2)',borderRadius:999,padding:'5px 12px',fontSize:11,color:'var(--ink-3)',display:'flex',alignItems:'center',gap:6}}>
          <Icon name="comment" size={10} color="var(--ink-3)"/>
          {annots.length} {annots.length === 1 ? 'заметка' : 'заметок'}
        </div>
      )}
    </div>
  );
}

function CommentPin({ a, editing, onEdit, onChange, onRemove, closeEdit }) {
  const [drag, setDrag] = useState(null);
  // position: either anchored to target rect's top-right + offset, or at absolute x/y
  let cx, cy;
  if (a.target && a._rect) {
    cx = a._rect.x + a._rect.w + (a.ox || 0) - 10;
    cy = a._rect.y + (a.oy || 0) - 10;
  } else {
    cx = (a.x || 0) - 10; cy = (a.y || 0) - 20;
  }
  const pinColor = a.color || 'var(--orange)';

  return (
    <div data-annot
      style={{position:'absolute',left:cx,top:cy,zIndex:4}}
      onPointerDown={(e) => {
        e.stopPropagation();
        if (!a.target) {
          const startX = e.clientX, startY = e.clientY, ax = a.x || 0, ay = a.y || 0;
          setDrag({ startX, startY, ax, ay, mode: 'xy' });
        } else {
          const startX = e.clientX, startY = e.clientY, ox = a.ox || 0, oy = a.oy || 0;
          setDrag({ startX, startY, ox, oy, mode: 'offset' });
        }
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        if (drag.mode === 'xy') onChange({ x: drag.ax + (e.clientX - drag.startX), y: drag.ay + (e.clientY - drag.startY) });
        else onChange({ ox: drag.ox + (e.clientX - drag.startX), oy: drag.oy + (e.clientY - drag.startY) });
      }}
      onPointerUp={() => setDrag(null)}>
      <div style={{
        width:26,height:26,
        borderRadius:'50% 50% 50% 3px',transform:'rotate(-10deg)',
        background:pinColor,color:'var(--paper)',
        display:'flex',alignItems:'center',justifyContent:'center',
        fontSize:11,fontWeight:600,boxShadow:'0 3px 8px rgba(0,0,0,0.18)',
        cursor: drag ? 'grabbing' : 'grab',
        border:'2px solid var(--paper)'
      }} onClick={(e) => { e.stopPropagation(); if (!drag) onEdit(); }}>
        <Icon name="comment" size={11} color="currentColor"/>
      </div>
      {(editing || a.text) && (
        <div style={{marginLeft:28,marginTop:-18,background:'var(--paper)',border:'0.5px solid var(--line-2)',borderRadius:8,padding:10,width:230,boxShadow:'0 8px 20px rgba(0,0,0,0.08)'}}>
          <div style={{fontSize:10,color:'var(--ink-4)',marginBottom:4,display:'flex',alignItems:'center',gap:4}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:pinColor}}></span>
            <span style={{fontWeight:500,color:'var(--ink-2)'}}>{a.author || 'вы'}</span>
            {a.target && <span style={{color:'var(--ink-4)'}}>· привязан к блоку</span>}
            <span className="grow"></span>
            <button className="rail-btn" style={{width:18,height:18}} onClick={onRemove}><Icon name="close" size={9}/></button>
          </div>
          {editing ? (
            <textarea autoFocus value={a.text} onChange={e => onChange({ text: e.target.value })}
              onBlur={closeEdit}
              onKeyDown={e => { if (e.key === 'Escape') closeEdit(); if (e.key === 'Enter' && e.metaKey) closeEdit(); }}
              placeholder="комментарий…"
              style={{width:'100%',minHeight:54,border:'none',outline:'none',resize:'none',fontSize:12,fontFamily:'var(--font-sans)',color:'var(--ink-1)',background:'transparent',lineHeight:1.4}}/>
          ) : (
            <div style={{fontSize:12,color:'var(--ink-1)',lineHeight:1.4,whiteSpace:'pre-wrap',cursor:'text'}} onClick={onEdit}>
              {a.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Note({ a, editing, onEdit, onChange, onRemove, closeEdit }) {
  const [drag, setDrag] = useState(null);
  return (
    <div data-annot
      style={{
        position:'absolute',left:a.x,top:a.y,width:a.w,minHeight:a.h,zIndex:3,
        background:'#fef3c7',border:'0.5px solid #fbbf24',
        boxShadow:'0 4px 12px rgba(120,80,0,0.1)',borderRadius:4,padding:10,
        transform:'rotate(-0.8deg)',fontFamily:'var(--font-sans)'
      }}
      onPointerDown={(e) => {
        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'BUTTON') return;
        e.stopPropagation();
        const startX = e.clientX, startY = e.clientY, ax = a.x, ay = a.y;
        setDrag({ startX, startY, ax, ay });
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        onChange({ x: drag.ax + (e.clientX - drag.startX), y: drag.ay + (e.clientY - drag.startY) });
      }}
      onPointerUp={() => setDrag(null)}>
      <div style={{display:'flex',gap:4,marginBottom:6,alignItems:'center'}}>
        <div style={{fontSize:9,color:'#92400e',textTransform:'uppercase',letterSpacing:'0.08em',fontWeight:600}}>стикер</div>
        <span className="grow"></span>
        <button className="rail-btn" style={{width:18,height:18,color:'#92400e'}} onClick={onRemove}><Icon name="close" size={9} color="currentColor"/></button>
      </div>
      {editing ? (
        <textarea autoFocus value={a.text} onChange={e => onChange({ text: e.target.value })}
          onBlur={closeEdit}
          placeholder="идея, напоминание, связь…"
          style={{width:'100%',minHeight:60,border:'none',outline:'none',resize:'none',background:'transparent',fontSize:13,lineHeight:1.4,color:'#7c2d12',fontFamily:'var(--font-sans)'}}/>
      ) : (
        <div onClick={(e) => { e.stopPropagation(); onEdit(); }} style={{fontSize:13,color:'#7c2d12',lineHeight:1.4,whiteSpace:'pre-wrap',cursor:'text',minHeight:60}}>
          {a.text || <span style={{color:'#b45309',fontStyle:'italic'}}>клик — писать</span>}
        </div>
      )}
    </div>
  );
}

window.CanvasTools = CanvasTools;

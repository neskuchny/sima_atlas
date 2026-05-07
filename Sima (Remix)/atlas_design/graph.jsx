// SIMA Atlas — graph canvas with lanes, drag, sticky notes, edge labels, drill-down
const { useState, useRef, useEffect, useMemo, useCallback } = React;

function nodeWidth(size, detailed) { const base = size === "lg" ? 220 : size === "sm" ? 170 : 195; return detailed ? base + 30 : base; }
function nodeHeight(size, detailed, expandedSubs) {
  const base = detailed ? (size === "lg" ? 175 : size === "sm" ? 140 : 155) : (size === "lg" ? 78 : size === "sm" ? 64 : 72);
  return base + (expandedSubs ? Math.min(expandedSubs.length, 5) * 22 + 8 : 0);
}

function edgeMidpoint(a, b, awSize, bwSize, detailed) {
  const aw = nodeWidth(a.size, detailed), ah = nodeHeight(a.size, detailed);
  const bw = nodeWidth(b.size, detailed), bh = nodeHeight(b.size, detailed);
  const ax = a.x + aw / 2, ay = a.y + ah / 2;
  const bx = b.x + bw / 2, by = b.y + bh / 2;
  return { x: (ax + bx) / 2, y: (ay + by) / 2, ax, ay, bx, by };
}

function GraphCanvas({
  data, modules, edges, notes, onUpdateModule, onUpdateEdge, onAddNote, onUpdateNote, onDeleteNote, onAddEdge, onDeleteEdge,
  onAddModule,
  selectedId, onSelect, onDrillDown, hoveredId, setHoveredId,
  filters, scanState, desyncResolved, activeFlash, detailed, showLanes, showLabels,
  schemaTitle, onUpdateSchemaTitle, onSimaGenerate, onLaneResize,
}) {
  const wrapRef = useRef(null);
  const [tx, setTx] = useState({ x: 30, y: 20, k: 0.7 });
  const drag = useRef({ active: false, mode: null, sx: 0, sy: 0, ox: 0, oy: 0, id: null });
  const [ctxMenu, setCtxMenu] = useState(null);
  // R-7.28 — Shift+drag from node creates an edge: track temp line tip
  // (in canvas coords) so we can draw a hint while the operator drags.
  const [edgeDraft, setEdgeDraft] = useState(null); // { fromId, x, y } or null
  const [editingEdge, setEditingEdge] = useState(null);

  const screenToCanvas = (sx, sy) => {
    const rect = wrapRef.current.getBoundingClientRect();
    return { x: (sx - rect.left - tx.x) / tx.k, y: (sy - rect.top - tx.y) / tx.k };
  };

  const onMouseDown = (e) => {
    // R-7.26 — .ctx-menu добавлен в early-return: при клике на кнопку
    // внутри меню mousedown канваса срабатывал РАНЬШЕ click и сбрасывал
    // ctxMenu=null → меню анмаунтилось → кнопка не успевала вызвать onClick.
    // (Поэтому через right-click не работала ни одна кнопка меню.)
    if (e.target.closest('.node, .canvas-tools, .canvas-overlay-top, .sticky-note, .lane-label, .edge-label, .schema-title, .ctx-menu')) return;
    drag.current = { active: true, mode: 'pan', sx: e.clientX, sy: e.clientY, ox: tx.x, oy: tx.y };
    setCtxMenu(null);
  };

  const startNodeDrag = (e, m) => {
    e.stopPropagation();
    // R-7.28 — Shift-mod = create edge (источник = текущая нода). Без shift —
    // обычное перемещение ноды. Курсор и логика hit-test'а target-ноды
    // делается в onUp ниже через elementFromPoint.
    if (e.shiftKey) {
      const c = screenToCanvas(e.clientX, e.clientY);
      drag.current = { active: true, mode: 'edge', id: m.id, sx: e.clientX, sy: e.clientY, moved: false };
      setEdgeDraft({ fromId: m.id, x: c.x, y: c.y });
      return;
    }
    drag.current = { active: true, mode: 'node', id: m.id, sx: e.clientX, sy: e.clientY, ox: m.x, oy: m.y, moved: false };
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!drag.current.active) return;
      if (drag.current.mode === 'pan') {
        const dx = e.clientX - drag.current.sx;
        const dy = e.clientY - drag.current.sy;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true;
        setTx(t => ({ ...t, x: drag.current.ox + dx, y: drag.current.oy + dy }));
      } else if (drag.current.mode === 'node') {
        const dx = (e.clientX - drag.current.sx) / tx.k;
        const dy = (e.clientY - drag.current.sy) / tx.k;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.current.moved = true;
        onUpdateModule(drag.current.id, { x: drag.current.ox + dx, y: drag.current.oy + dy });
      } else if (drag.current.mode === 'edge') {
        // R-7.28: тянем виртуальную линию от источника до курсора
        const c = screenToCanvas(e.clientX, e.clientY);
        if (Math.abs(e.clientX - drag.current.sx) > 3 || Math.abs(e.clientY - drag.current.sy) > 3) drag.current.moved = true;
        setEdgeDraft((d) => d ? { ...d, x: c.x, y: c.y } : null);
      }
    };
    const onUp = (e) => {
      // R-7.30: edge-mode завершился. Курсор может быть над SVG-листом
      // (внутри которого летает temp-edge), а не над node-DIV — тогда
      // e.target.closest('.node') ничего не найдёт. elementFromPoint
      // отдаёт ВЕРХНИЙ visible элемент в точке курсора, скипая
      // pointer-events:none (что у нас как раз temp edge), поэтому
      // нода-цель находится надёжно.
      if (drag.current.mode === 'edge' && drag.current.moved) {
        const fromId = drag.current.id;
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        const target = hit?.closest?.('.node');
        const toId = target?.getAttribute('data-mid') || null;
        if (toId && toId !== fromId && onAddEdge) {
          onAddEdge({ from: fromId, to: toId, label: '' });
        }
        setEdgeDraft(null);
      }
      // Remember whether the just-finished drag actually moved. The next
      // click handler reads `recentlyDragged` and bails out — this fixes
      // the bug where drag-end-on-node also opened the detail panel.
      drag.current.recentlyDragged = drag.current.moved;
      drag.current.active = false;
      drag.current.mode = null;
      drag.current.moved = false;
      // Clear the "just dragged" flag after the click event has had a
      // chance to fire (clicks fire immediately after mouseup).
      setTimeout(() => { drag.current.recentlyDragged = false; }, 0);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [tx.k, modules, detailed, data.lanes]);

  const onWheel = (e) => {
    if (!wrapRef.current) return;
    e.preventDefault();
    const rect = wrapRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.08 : 0.92;
    const newK = Math.max(0.25, Math.min(1.8, tx.k * factor));
    const k = newK / tx.k;
    setTx(t => ({ k: newK, x: mx - (mx - t.x) * k, y: my - (my - t.y) * k }));
  };

  const connected = useMemo(() => {
    const target = hoveredId || selectedId;
    if (!target) return null;
    const s = new Set([target]);
    edges.forEach(e => {
      if (e.from === target) s.add(e.to);
      if (e.to === target) s.add(e.from);
    });
    return s;
  }, [hoveredId, selectedId, edges]);

  const visible = useMemo(() => {
    if (!filters || filters.size === 0) return new Set(modules.map(m => m.id));
    return new Set(modules.filter(m => filters.has(m.status)).map(m => m.id));
  }, [filters, modules]);

  const moduleById = useMemo(() => Object.fromEntries(modules.map(m => [m.id, m])), [modules]);

  const edgePath = (a, b) => {
    const aw = nodeWidth(a.size, detailed), ah = nodeHeight(a.size, detailed);
    const bw = nodeWidth(b.size, detailed), bh = nodeHeight(b.size, detailed);
    const ax = a.x + aw / 2, ay = a.y + ah / 2;
    const bx = b.x + bw / 2, by = b.y + bh / 2;
    const dx = (bx - ax) * 0.45;
    return `M ${ax} ${ay} C ${ax + dx} ${ay} ${bx - dx} ${by} ${bx} ${by}`;
  };

  const onCanvasContextMenu = (e) => {
    if (e.target.closest('.node')) return;
    e.preventDefault();
    const c = screenToCanvas(e.clientX, e.clientY);
    setCtxMenu({ x: e.clientX, y: e.clientY, cx: c.x, cy: c.y, moduleId: null });
  };

  const onNodeContextMenu = (e, m) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, moduleId: m.id });
  };

  const subModuleProgress = (mId) => {
    const subs = data.submodules[mId] || [];
    if (!subs.length) return null;
    const done = subs.filter(s => s.status === 'done').length;
    return { done, total: subs.length };
  };

  const taskProgress = (mId) => {
    const t = data.tasks[mId] || [];
    if (!t.length) return null;
    const done = t.filter(x => x.status === 'done').length;
    return { done, total: t.length };
  };

  return (
    <div
      ref={wrapRef}
      className="canvas-wrap"
      onMouseDown={onMouseDown}
      onWheel={onWheel}
      onContextMenu={onCanvasContextMenu}
      onClick={() => { setCtxMenu(null); setEditingEdge(null); }}
      style={{ cursor: drag.current.active ? 'grabbing' : 'grab' }}
    >
      <div className="canvas-grid" />

      {/* Schema title (editable, top-left of canvas) */}
      <div className="schema-title" style={{
        position: 'absolute', top: 14, left: 60, zIndex: 4,
        background: 'var(--card)', border: '1px solid var(--rule)',
        borderRadius: 8, padding: '6px 12px', fontFamily: 'Newsreader, serif',
        fontSize: 18, fontStyle: 'italic', color: 'var(--ink)', boxShadow: 'var(--shadow-1)',
      }}>
        <EditableText
          value={schemaTitle}
          onChange={onUpdateSchemaTitle}
          placeholder="Название схемы…"
          style={{ fontFamily: 'inherit', fontSize: 'inherit', fontStyle: 'inherit' }}
        />
      </div>

      {/* Lanes */}
      {showLanes && (
        <div className="canvas-content lanes-layer" style={{ transform: `translate(${tx.x}px, ${tx.y}px) scale(${tx.k})`, pointerEvents: 'none' }}>
          {data.lanes.map(l => (
            <div key={l.id} className={`lane lane-${l.color}`} style={{
              position: 'absolute',
              left: -200, top: l.y,
              width: 3000, height: l.height,
              borderTop: '1px dashed var(--rule-2)',
              borderBottom: '1px dashed var(--rule-2)',
              background: `color-mix(in oklch, transparent, var(--layer-${l.color}) 5%)`,
              pointerEvents: 'none',
            }}>
              <div className="lane-label" style={{
                position: 'absolute', left: 220, top: 8,
                fontFamily: 'Newsreader, serif', fontStyle: 'italic',
                fontSize: 12, color: `var(--layer-${l.color})`,
                letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 600,
                background: 'var(--paper)', padding: '2px 8px', borderRadius: 4,
                pointerEvents: 'auto', display: 'inline-block',
              }}>{l.title}</div>
              {onLaneResize && (
                <div className="lane-resize" onMouseDown={(e) => {
                  e.stopPropagation(); e.preventDefault();
                  const startY = e.clientY; const k = tx.k;
                  const move = (ev) => onLaneResize(l.id, (ev.clientY - startY) / k);
                  const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
                  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
                }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edges (SVG) */}
      <svg className="canvas-svg">
        <g style={{ transform: `translate(${tx.x}px, ${tx.y}px) scale(${tx.k})`, transformOrigin: '0 0' }}>
          {edges.map((e, i) => {
            const a = moduleById[e.from], b = moduleById[e.to];
            if (!a || !b) return null;
            if (!visible.has(a.id) || !visible.has(b.id)) return null;
            const target = hoveredId || selectedId;
            const hot = target && (e.from === target || e.to === target);
            const dim = target && !hot;
            const isDesync = e.desync && !desyncResolved;
            const cls = ['edge'];
            if (hot) cls.push('hot');
            if (dim) cls.push('dim');
            if (isDesync) cls.push('desync');
            if (scanState === 'scanning') cls.push('scanning');
            return <path key={i} d={edgePath(a, b)} className={cls.join(' ')} onClick={(ev) => { ev.stopPropagation(); setEditingEdge(i); }} style={{ pointerEvents: 'stroke', strokeWidth: 8, stroke: 'transparent' }} />;
          })}
          {edges.map((e, i) => {
            const a = moduleById[e.from], b = moduleById[e.to];
            if (!a || !b) return null;
            if (!visible.has(a.id) || !visible.has(b.id)) return null;
            const target = hoveredId || selectedId;
            const hot = target && (e.from === target || e.to === target);
            const dim = target && !hot;
            const isDesync = e.desync && !desyncResolved;
            const cls = ['edge'];
            if (hot) cls.push('hot');
            if (dim) cls.push('dim');
            if (isDesync) cls.push('desync');
            if (scanState === 'scanning') cls.push('scanning');
            return <path key={`v${i}`} d={edgePath(a, b)} className={cls.join(' ')} style={{ pointerEvents: 'none' }} />;
          })}
          {/* R-7.28 — temporary line while shift+dragging from a node */}
          {edgeDraft && (() => {
            const a = moduleById[edgeDraft.fromId];
            if (!a) return null;
            const aw = nodeWidth(a.size, detailed);
            const ah = nodeHeight(a.size, detailed);
            const ax = a.x + aw / 2;
            const ay = a.y + ah / 2;
            return (
              <path
                d={`M ${ax} ${ay} L ${edgeDraft.x} ${edgeDraft.y}`}
                stroke="var(--ink-3)"
                strokeWidth="2"
                strokeDasharray="6 4"
                fill="none"
                style={{ pointerEvents: 'none' }}
              />
            );
          })()}
        </g>
      </svg>

      {/* Edge labels (HTML for easier interaction) */}
      <div className="canvas-content" style={{ transform: `translate(${tx.x}px, ${tx.y}px) scale(${tx.k})`, pointerEvents: 'none' }}>
        {(showLabels || hoveredId || selectedId || editingEdge !== null) && edges.map((e, i) => {
          const a = moduleById[e.from], b = moduleById[e.to];
          if (!a || !b) return null;
          if (!visible.has(a.id) || !visible.has(b.id)) return null;
          const target = hoveredId || selectedId;
          const isHot = target && (e.from === target || e.to === target);
          const isEdit = editingEdge === i;
          if (!showLabels && !isHot && !isEdit) return null;
          const mid = edgeMidpoint(a, b, null, null, detailed);
          const isDesync = e.desync && !desyncResolved;
          return (
            <div key={i} className="edge-label" style={{
              position: 'absolute', left: mid.x, top: mid.y,
              transform: 'translate(-50%, -50%)',
              background: isDesync ? 'var(--st-desync)' : 'var(--card)',
              color: isDesync ? 'white' : 'var(--ink-2)',
              border: isDesync ? 0 : '1px solid var(--rule-2)',
              borderRadius: 4, padding: '2px 7px', fontSize: 10.5,
              maxWidth: 180, fontWeight: 500,
              boxShadow: isHot || isEdit ? 'var(--shadow-2)' : 'var(--shadow-1)',
              pointerEvents: 'auto', cursor: 'pointer',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              zIndex: isEdit ? 10 : 2,
            }} onClick={(ev) => { ev.stopPropagation(); setEditingEdge(i); }}>
              {isEdit ? (
                <div style={{ minWidth: 240, whiteSpace: 'normal' }}>
                  <EditableText autoStart value={e.label || ''} onChange={(v) => onUpdateEdge(i, { label: v })} placeholder="что эта связь делает…" style={{ fontWeight: 600 }} />
                  <div style={{ fontSize: 10.5, marginTop: 4, color: isDesync ? '#fff8' : 'var(--ink-3)' }}>
                    <EditableText value={e.biz || ''} onChange={(v) => onUpdateEdge(i, { biz: v })} placeholder="Зачем эта связь, бизнес-смысл…" multiline />
                  </div>
                  <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                    <button className="mini-btn sima" onClick={(ev) => { ev.stopPropagation(); onSimaGenerate('edge', i); }}>✨ sima предложит</button>
                    <button className="mini-btn" onClick={(ev) => { ev.stopPropagation(); onDeleteEdge(i); setEditingEdge(null); }}>удалить</button>
                  </div>
                </div>
              ) : (
                <span>{e.label || e.kind}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Sticky notes */}
      <div className="canvas-content" style={{ transform: `translate(${tx.x}px, ${tx.y}px) scale(${tx.k})` }}>
        {notes.map(n => (
          <StickyNote key={n.id} note={n} onUpdate={onUpdateNote} onDelete={onDeleteNote} />
        ))}
      </div>

      {/* Modules */}
      <div className="canvas-content" style={{ transform: `translate(${tx.x}px, ${tx.y}px) scale(${tx.k})` }}>
        {modules.map(m => {
          if (!visible.has(m.id)) return null;
          const target = hoveredId || selectedId;
          const isConnected = connected && connected.has(m.id);
          const dim = target && !isConnected;
          const isWarn = (m.status === 'desync' && !desyncResolved) || m.status === 'fail';
          const flash = activeFlash === m.id;
          const status = (m.id === 'metrics' && desyncResolved) ? 'progress' : m.status;
          // Phase R-5 — empty/legacy payloads may not have these maps.
          // Optional-chain so a partial backend never blanks the canvas.
          const subs = data.submodules?.[m.id] || [];
          const tasks = data.tasks?.[m.id] || [];
          const tProg = taskProgress(m.id);
          const sProg = subModuleProgress(m.id);
          const desc = data.moduleDocs?.[m.id] || {};
          return (
            <div
              key={m.id}
              className={[
                'node',
                `size-${m.size}`,
                detailed ? 'detailed' : 'compact',
                m.id === selectedId ? 'selected' : '',
                isConnected && m.id !== selectedId ? 'connected' : '',
                dim ? 'dimmed' : '',
                isWarn ? 'warn' : '',
              ].join(' ')}
              data-st={status}
              data-layer={m.layer}
              data-mid={m.id}
              style={{
                left: m.x, top: m.y,
                width: nodeWidth(m.size, detailed),
                minHeight: nodeHeight(m.size, detailed),
                transform: flash ? 'translateY(-3px) scale(1.03)' : undefined,
                transition: flash ? 'transform 0.3s' : (drag.current.active && drag.current.id === m.id ? 'none' : 'box-shadow 0.18s, border-color 0.18s'),
                cursor: drag.current.active && drag.current.id === m.id ? 'grabbing' : 'grab',
              }}
              onMouseDown={(e) => startNodeDrag(e, m)}
              onClick={(e) => {
                e.stopPropagation();
                // If the user just finished a drag with movement, swallow
                // the click — it shouldn't open the detail panel.
                if (drag.current && drag.current.recentlyDragged) return;
                onSelect(m.id);
              }}
              onDoubleClick={(e) => { e.stopPropagation(); onDrillDown(m.id); }}
              onMouseEnter={() => setHoveredId(m.id)}
              onMouseLeave={() => setHoveredId(null)}
              onContextMenu={(e) => onNodeContextMenu(e, m)}
            >
              <div className="ntag mono">
                <span>@{m.tag}</span>
                {m.contract && m.contract.score < 1 && (
                  <span
                    className={`contract-dot ${m.contract.score === 0 ? 'empty' : 'weak'}`}
                    title={`Контракт: ${m.contract.filled}/${m.contract.total} заполнено (отсутствует: ${(m.contract.missing || []).join(', ')})`}
                  >!</span>
                )}
                <span className="lvl">L{m.layer === 'frontend' ? 3 : m.layer === 'logic' ? 2 : m.layer === 'tests' ? 4 : 1}</span>
              </div>
              {detailed && m.progress && (m.progress.tasks.total > 0 || m.progress.kpi.total > 0) && (
                <div className="nprogress mono" title="Задачи · KPI">
                  {m.progress.tasks.total > 0 && (
                    <span className={`np-pill ${m.progress.tasks.done === m.progress.tasks.total ? 'done' : ''}`}>
                      ✓ {m.progress.tasks.done}/{m.progress.tasks.total}
                    </span>
                  )}
                  {m.progress.kpi.total > 0 && (
                    <span className={`np-pill ${m.progress.kpi.checked === m.progress.kpi.total ? 'done' : ''}`}>
                      ◎ {m.progress.kpi.checked}/{m.progress.kpi.total} KPI
                    </span>
                  )}
                </div>
              )}
              <div className="nhead">
                <span className="status-dot" />
                <EditableText
                  value={m.title}
                  onChange={(v) => onUpdateModule(m.id, { title: v })}
                  className="ntitle"
                  stopPropagation
                />
              </div>
              {detailed && (
                <>
                  <div className="ndesc">
                    <EditableText
                      value={desc.short || ''}
                      onChange={(v) => onUpdateModule(m.id, { _short: v })}
                      placeholder="короткое описание блока…"
                      multiline
                      stopPropagation
                    />
                  </div>
                  {tProg && (
                    <div className="nprog">
                      <div className="nprog-bar"><div className="nprog-fill" style={{ width: `${(tProg.done / tProg.total) * 100}%` }} /></div>
                      <span className="nprog-txt">{tProg.done}/{tProg.total} задач</span>
                    </div>
                  )}
                  {sProg && (
                    <div className="nsubs">
                      {subs.slice(0, 4).map(s => (
                        <div key={s.id} className="nsub-row">
                          <span className="status-dot tiny" style={{ background: `var(--st-${s.id === 'metrics-ast' && desyncResolved ? 'progress' : s.status})` }} />
                          <span>{s.title}</span>
                        </div>
                      ))}
                      {subs.length > 4 && <div className="nsub-more">+{subs.length - 4} ещё · 2× клик</div>}
                    </div>
                  )}
                </>
              )}
              <div className="nfoot">
                <span className="priority">P{m.priority}</span>
                <span className="nstatus">{statusLabel(status)}</span>
                {detailed && tasks.length > 0 && <span className="nfoot-icon" title="2× клик — открыть подмодули">⌄ детали</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Context menu */}
      {ctxMenu && (
        <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }} onClick={(e) => e.stopPropagation()}>
          {ctxMenu.moduleId ? (
            <>
              <button onClick={() => { onSelect(ctxMenu.moduleId); setCtxMenu(null); }}>📂 Открыть детали</button>
              <button onClick={() => { onDrillDown(ctxMenu.moduleId); setCtxMenu(null); }}>🔍 Провалиться внутрь (подсистема)</button>
              <button onClick={() => { onSimaGenerate('module', ctxMenu.moduleId); setCtxMenu(null); }}>✨ Sima: дополнить описание</button>
              <hr/>
              <button onClick={() => setCtxMenu(null)}>📤 Отправить в агента…</button>
              <button onClick={() => setCtxMenu(null)}>🧪 Запустить проверки</button>
              {/* Phase R-7.21 — удаление блока через context-menu. API
                  /atlas/blocks/delete уже client-aware (R-6); UI просто
                  не предлагал кнопку. confirm обязательно — действие
                  необратимое, плюс blocks dir на диске может содержать
                  history. */}
              <hr/>
              <button onClick={async () => {
                const id = ctxMenu.moduleId;
                setCtxMenu(null);
                if (!window.SIMA_API?.deleteBlock) return;
                if (!window.confirm(`Удалить блок ${id}? Запись в graph.json и директория atlas/clients/<...>/blocks/${id}/ будут удалены. Действие необратимо (но файлы остаются в git-истории).`)) return;
                const r = await window.SIMA_API.deleteBlock(id, true /* hard */);
                if (r?.ok) {
                  try { window.dispatchEvent(new CustomEvent('sima-log-push', { detail: { agent: 'SIMA Core', kind: 'ok', msg: `🗑 Удалён блок ${id}` } })); } catch {}
                } else {
                  try { window.dispatchEvent(new CustomEvent('sima-log-push', { detail: { agent: 'SIMA Core', kind: 'fail', msg: `Удаление ${id} не удалось: ${r?.error || 'unknown'}` } })); } catch {}
                }
              }} style={{ color: 'var(--st-fail, #c33)' }}>🗑 Удалить блок</button>
            </>
          ) : (
            <>
              <button onClick={() => { onAddNote({ x: ctxMenu.cx, y: ctxMenu.cy, w: 200, color: 'yellow', text: 'Заметка…' }); setCtxMenu(null); }}>📝 Добавить заметку</button>
              <button onClick={() => { if (onAddModule) onAddModule({ x: ctxMenu.cx, y: ctxMenu.cy }); setCtxMenu(null); }}>＋ Новый модуль</button>
              <button onClick={() => setCtxMenu(null)}>📐 Авто-разместить по линиям</button>
              <hr/>
              <button onClick={() => { setTx({ x: 30, y: 20, k: 0.7 }); setCtxMenu(null); }}>↻ Сбросить вид</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function StickyNote({ note, onUpdate, onDelete }) {
  const drag = useRef({ active: false });
  const onDown = (e) => {
    e.stopPropagation();
    drag.current = { active: true, sx: e.clientX, sy: e.clientY, ox: note.x, oy: note.y };
    const move = (ev) => {
      if (!drag.current.active) return;
      onUpdate(note.id, { x: drag.current.ox + (ev.clientX - drag.current.sx), y: drag.current.oy + (ev.clientY - drag.current.sy) });
    };
    const up = () => { drag.current.active = false; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };
  return (
    <div className={`sticky-note color-${note.color}`} style={{ left: note.x, top: note.y, width: note.w }} onMouseDown={onDown}>
      <button className="sticky-x" onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}>×</button>
      <EditableText value={note.text} onChange={(v) => onUpdate(note.id, { text: v })} multiline placeholder="заметка…" />
    </div>
  );
}

function EditableText({ value, onChange, placeholder, multiline, className, style, stopPropagation, autoStart, editOnClick }) {
  // R-7.30 — autoStart=true: компонент сразу в режиме editing.
  // R-7.31 — editOnClick=true: одиночный клик активирует edit (вместо
  // двойного). Для контекст-rail полей (title/subtitle/goal/mission)
  // пользователю было непонятно, что нужен double-click.
  const [editing, setEditing] = useState(!!autoStart);
  const [tmp, setTmp] = useState(value);
  useEffect(() => { setTmp(value); }, [value]);
  const ref = useRef();
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select?.(); } }, [editing]);
  const onBlur = () => { setEditing(false); if (tmp !== value) onChange(tmp); };
  const onKey = (e) => {
    if (stopPropagation) e.stopPropagation();
    if (!multiline && e.key === 'Enter') { e.preventDefault(); ref.current.blur(); }
    if (e.key === 'Escape') { setTmp(value); setEditing(false); }
  };
  if (editing) {
    return multiline ? (
      <textarea ref={ref} value={tmp} onChange={e => setTmp(e.target.value)} onBlur={onBlur} onKeyDown={onKey} onClick={e => e.stopPropagation()} className={className} style={{...style, width: '100%', resize: 'none', minHeight: 40, fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', background: 'transparent', border: 0, outline: 'none' }} />
    ) : (
      <input ref={ref} value={tmp} onChange={e => setTmp(e.target.value)} onBlur={onBlur} onKeyDown={onKey} onClick={e => e.stopPropagation()} className={className} style={{...style, fontFamily: 'inherit', fontSize: 'inherit', color: 'inherit', background: 'transparent', border: 0, outline: 'none', width: '100%', padding: 0 }} />
    );
  }
  const startEdit = (e) => { if (stopPropagation) e.stopPropagation(); setEditing(true); };
  const handlers = editOnClick ? { onClick: startEdit } : { onDoubleClick: startEdit };
  return (
    <span
      className={`${className || ''} editable-hint`}
      style={{...style, cursor: 'text' }}
      title={editOnClick ? 'Клик — редактировать' : 'Двойной клик — редактировать'}
      {...handlers}
    >
      {value || <span style={{ color: 'var(--ink-4)', fontStyle: 'italic' }}>{placeholder}</span>}
    </span>
  );
}

function statusLabel(s) {
  return ({ done: 'готово', progress: 'в работе', todo: 'в очереди', blocked: 'заблок.', fail: 'ошибка', desync: 'рассинхрон' })[s] || s;
}

window.GraphCanvas = GraphCanvas;
window.statusLabel = statusLabel;
window.nodeWidth = nodeWidth;
window.nodeHeight = nodeHeight;
window.EditableText = EditableText;

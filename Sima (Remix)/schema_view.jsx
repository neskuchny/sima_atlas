// schema_view.jsx — the main project schema (mission + stacked layers with live connections)

function ConnectionLayer({ conns, containerRef, version }) {
  const [paths, setPaths] = React.useState([]);
  React.useEffect(() => {
    const compute = () => {
      const c = containerRef.current;
      if (!c) return;
      const box = c.getBoundingClientRect();
      const nodeEls = c.querySelectorAll('[data-node-id]');
      const map = {};
      nodeEls.forEach(el => {
        const r = el.getBoundingClientRect();
        map[el.dataset.nodeId] = {
          x: r.left - box.left + r.width / 2,
          y: r.top - box.top + r.height / 2,
          top: r.top - box.top,
          bot: r.top - box.top + r.height,
          left: r.left - box.left,
          right: r.left - box.left + r.width,
        };
      });
      const next = conns.map((c, i) => {
        const a = map[c.from]; const b = map[c.to];
        if (!a || !b) return null;
        const x1 = a.x, y1 = a.bot;
        const x2 = b.x, y2 = b.top;
        const dy = Math.max(40, Math.abs(y2 - y1) * 0.45);
        const d = `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
        return { d, kind: c.kind, key: i };
      }).filter(Boolean);
      setPaths(next);
    };
    compute();
    const t = setTimeout(compute, 30);
    window.addEventListener('resize', compute);
    return () => { clearTimeout(t); window.removeEventListener('resize', compute); };
  }, [conns, containerRef, version]);

  return (
    <svg className="conn-layer" style={{overflow:'visible'}}>
      {paths.map(p => <path key={p.key} d={p.d} className={p.kind} />)}
    </svg>
  );
}

function MissionCard({ project }) {
  return (
    <div className="mission">
      <div>
        <div className="lbl">Миссия проекта</div>
        <div className="stmt">{project.mission}</div>
        <div className="sub">{project.why}</div>
      </div>
      <div className="sig">
        <div className="lbl" style={{margin:0}}>На что влияет</div>
        <div style={{color:'var(--ink-2)',fontSize:12,textAlign:'right',lineHeight:1.4}}>{project.impact}</div>
        <div style={{marginTop:'auto',display:'flex',gap:8,alignItems:'center'}}>
          <span className="dot" style={{background:'var(--olive)'}}></span>
          <span>владелец <b>{project.owner}</b></span>
        </div>
        <div style={{color:'var(--ink-4)',fontSize:10}}>{project.status} · {project.created}</div>
      </div>
    </div>
  );
}

function SchemaView({ project, cubes, onPickSource, onFocusNode, onFocusLayer, density }) {
  const ref = React.useRef(null);
  const [hoverLayer, setHoverLayer] = React.useState(null);
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    setV(x => x + 1);
  }, [density]);

  return (
    <div className="canvas-wrap">
      <MissionCard project={project} />
      <div ref={ref} style={{position:'relative'}} data-schema-root>
        <ConnectionLayer conns={SIMA_DATA.conns} containerRef={ref} version={v}/>
        {project.layers.map(layer => (
          <LayerBlock key={layer.id} layer={layer} allCubes={cubes}
            onPickSource={onPickSource}
            onFocusNode={onFocusNode}
            onFocusLayer={onFocusLayer}
            compact={density === 'compact'} />
        ))}
      </div>

      <div style={{display:'flex',gap:8,alignItems:'center',marginTop:20,paddingTop:14,borderTop:'0.5px solid var(--line-1)'}}>
        <span className="meta">{project.layers.length} слоёв · {project.layers.reduce((s,l)=>s+l.nodes.length,0)} кубиков · {SIMA_DATA.conns.length} связей</span>
        <span className="grow"></span>
        <span className="meta"><span className="dot" style={{background:'var(--olive)'}}></span> live</span>
        <span className="meta"><svg width="20" height="6"><line x1="0" y1="3" x2="20" y2="3" stroke="var(--ink-5)" strokeDasharray="3 3"/></svg> семантика</span>
      </div>
    </div>
  );
}

Object.assign(window, { SchemaView, MissionCard, ConnectionLayer });

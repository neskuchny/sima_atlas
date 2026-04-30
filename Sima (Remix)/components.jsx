// components.jsx — shared pieces: nodes, chips, library item, rail, topbar

const typeLabel = { doc:'документ', layer:'слой', concept:'концепт', extract:'извлечение', result:'результат' };

function Badge({ type, text, kind }) {
  const label = text || (kind ? `${typeLabel[type] || ''} · ${kind}` : (typeLabel[type] || ''));
  return <span className={`badge ${type}`}>{label}</span>;
}

function Dot({ type }) {
  return <span className={`dot ${type}`}></span>;
}

function SourceChip({ cube, live, onClick }) {
  if (!cube) return null;
  return (
    <span className={`src ${live ? 'live' : ''}`} title={cube.title} onClick={onClick}>
      <span className={`dot ${cube.type}`}></span>{cube.title}
    </span>
  );
}

function SchemaNode({ node, allCubes, highlighted, onPick, onFocus, compact }) {
  const srcCubes = (node.sources || []).map(id => allCubes.find(c => c.id === id)).filter(Boolean);
  return (
    <div className={`node accent-${node.accent || 'orange'}`} data-node-id={node.id} onClick={() => onFocus && onFocus(node)} style={{cursor:'pointer'}}>
      <div className="port top"></div>
      <div className="port bot"></div>
      <div className="n-hd">
        <Badge type={node.type} kind={node.kind} />
        <span className="grow"></span>
        {highlighted && <span style={{fontSize:9,color:'var(--orange-ink)',background:'var(--orange-bg)',padding:'1px 6px',borderRadius:8,fontWeight:500}}>связан</span>}
      </div>
      <div className="n-ttl">{node.title}</div>
      {!compact && <div className="n-body">{node.body}</div>}
      {srcCubes.length > 0 && (
        <div className="srcs">
          <span className="meta" style={{alignSelf:'center',marginRight:2}}>←</span>
          {srcCubes.map(c => <SourceChip key={c.id} cube={c} live={true} onClick={(e) => { e.stopPropagation(); onPick && onPick(c); }} />)}
        </div>
      )}
    </div>
  );
}

function LayerBlock({ layer, allCubes, onPickSource, onFocusNode, onFocusLayer, highlightedIds, compact }) {
  return (
    <div className="layer-block" data-layer-id={layer.id}>
      <div className="lb-hd">
        <span className="lb-num">{layer.num}</span>
        <span className="lb-ttl">{layer.title}</span>
        <span className="lb-k">· {layer.kind}</span>
        <span className="lb-actions">
          <button className="btn xs ghost" onClick={() => onFocusLayer && onFocusLayer(layer)}><Icon name="focus" size={10}/> фокус</button>
        </span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:`repeat(${Math.min(3, layer.nodes.length)}, minmax(0,1fr))`,gap:10}}>
        {layer.nodes.map(n => (
          <SchemaNode key={n.id} node={n} allCubes={allCubes}
            highlighted={highlightedIds && highlightedIds.has(n.id)}
            onPick={onPickSource}
            onFocus={onFocusNode}
            compact={compact} />
        ))}
      </div>
    </div>
  );
}

function LibItem({ cube, picked, onClick, draggable }) {
  return (
    <div className={`lib-item ${picked ? 'picked' : ''}`}
         draggable={!!draggable}
         onClick={() => onClick && onClick(cube)}
         title={cube.body}>
      <Dot type={cube.type} />
      <div className="li-t">
        <div className="li-ttl truncate">{cube.title}</div>
        <div className="li-m truncate">{typeLabel[cube.type]}{cube.kind ? ` · ${cube.kind}` : ''}{cube.meta ? ' · ' + cube.meta.split('·')[0].trim() : ''}</div>
      </div>
    </div>
  );
}

function Rail({ view, setView, onOpenCompose }) {
  const btn = (key, icon, label) => (
    <button className={`rail-btn ${view === key ? 'active' : ''}`} title={label} onClick={() => setView(key)}>
      <Icon name={icon} size={16}/>
    </button>
  );
  return (
    <div className="rail">
      <div style={{fontFamily:'var(--font-serif)',fontSize:18,fontWeight:500,color:'var(--ink-1)',margin:'2px 0 12px',letterSpacing:'-0.02em'}}>с</div>
      {btn('schema','schema','Схема')}
      {btn('graph','graph','Граф')}
      {btn('library','library','Библиотека')}
      <div className="rail-divider"></div>
      <button className="rail-btn" title="Синтезировать" onClick={onOpenCompose} style={{color:'var(--orange)'}}>
        <Icon name="compose" size={16}/>
      </button>
      <div className="rail-spacer"></div>
      <button className="rail-btn" title="Tweaks" onClick={() => window.dispatchEvent(new CustomEvent('sima-tweaks-toggle'))}>
        <Icon name="tweak" size={16}/>
      </button>
    </div>
  );
}

function TopBar({ project, view, setView, onOpenCompose }) {
  return (
    <div className="topbar">
      <div className="crumb">
        <span>Мои проекты</span>
        <span className="sep">/</span>
        <b>{project.name}</b>
        <span className="meta" style={{marginLeft:8,padding:'2px 7px',background:'var(--bg-2)',borderRadius:9}}>{project.kind}</span>
      </div>
      <div className="spacer"></div>
      <div className="row" style={{gap:2,border:'0.5px solid var(--line-2)',borderRadius:6,padding:2}}>
        <button className={`btn xs ${view==='schema' ? '' : 'ghost'}`} style={{border:'none',background: view==='schema'?'var(--bg-2)':'transparent'}} onClick={() => setView('schema')}>
          <Icon name="schema" size={11}/> схема
        </button>
        <button className={`btn xs ${view==='graph' ? '' : 'ghost'}`} style={{border:'none',background: view==='graph'?'var(--bg-2)':'transparent'}} onClick={() => setView('graph')}>
          <Icon name="graph" size={11}/> граф
        </button>
        <button className={`btn xs ${view==='library' ? '' : 'ghost'}`} style={{border:'none',background: view==='library'?'var(--bg-2)':'transparent'}} onClick={() => setView('library')}>
          <Icon name="library" size={11}/> библиотека
        </button>
      </div>
      <div className="sep"></div>
      <button className="btn sm ghost"><Icon name="upload" size={11}/> импорт</button>
      <button className="btn sm pri" onClick={onOpenCompose}><Icon name="sparkle" size={11}/> синтезировать</button>
    </div>
  );
}

Object.assign(window, { Badge, Dot, SourceChip, SchemaNode, LayerBlock, LibItem, Rail, TopBar, typeLabel });

// layer2_map.jsx — product/book/idea map with pre-filled fields, gap indicators,
// "Сима, помоги" button, and an inner User Story map.

const MapField = ({ field, sources, onFill, onSelect }) => {
  if (field.gap) {
    return (
      <div className="mp-card gap" onClick={()=>onSelect && onSelect(field)}>
        <div className="mp-lbl"><span className="mp-bang">!</span> {field.title}</div>
        <div className="mp-val">не найдено в источниках</div>
        <div className="mp-meta">{field.hint}</div>
        <button className="mp-fill" onClick={(e)=>{e.stopPropagation(); onFill && onFill(field);}}>
          <Icon name="sparkle" size={11}/> Сима, помоги заполнить
        </button>
        <div className="node-tools">
          <button title="редактировать"><Icon name="pen" size={10}/></button>
          <button title="комментарий для ИИ" className="claude"><Icon name="sparkle" size={10}/></button>
          <button title="добавить документ"><Icon name="upload" size={10}/></button>
        </div>
      </div>
    );
  }
  return (
    <div className="mp-card" onClick={()=>onSelect && onSelect(field)}>
      <div className="mp-lbl"><span className="mp-check"><Icon name="check" size={9}/></span> {field.title}</div>
      <div className="mp-val">{field.value}</div>
      {field.metaphor && <div className="mp-meta">метафора: {field.metaphor}</div>}
      {field.sources && field.sources.length>0 && (
        <div className="mp-src">{field.sources.map(sid => <span key={sid} className="src">{sid}</span>)}</div>
      )}
      <div className="mp-edit">
        <button title="редактировать"><Icon name="pen" size={10}/></button>
        <button title="Клод-правка"><Icon name="sparkle" size={10}/></button>
      </div>
      <div className="node-tools">
        <button title="редактировать"><Icon name="pen" size={10}/></button>
        <button title="комментарий для ИИ" className="claude"><Icon name="sparkle" size={10}/></button>
        <button title="добавить документ"><Icon name="upload" size={10}/></button>
      </div>
    </div>
  );
};

const ImportantList = ({ field, onFill }) => (
  <div className="mp-card full">
    <div className="mp-lbl">
      <Icon name="check" size={11}/>
      {field.title}
    </div>
    <div className="mp-list">
      {field.items.map((it, i) => (
        <div key={i} className={`mp-item ${it.gap?'gap':''}`}>
          {it.gap ? <span className="mp-bang" style={{width:14,height:14,fontSize:9}}>!</span> :
                     <span className="mp-check"><Icon name="check" size={8}/></span>}
          <span style={{flex:1}}>{it.label}</span>
          {it.hint && <span className="mp-hint">{it.hint}</span>}
          {it.gap && <button className="btn xs" onClick={()=>onFill && onFill(it)}>
            <Icon name="sparkle" size={9}/> заполнить
          </button>}
        </div>
      ))}
    </div>
  </div>
);

const UserStoryMap = ({ field, onSelectNode, selectedId, onOpenSubschema }) => {
  // PR4.4: defensive defaults so the component never crashes when the bootstrap
  // omits a field. Empty userstory → renders an empty flow with a hint.
  const safe = field || {};
  const nodes = Array.isArray(safe.nodes) ? safe.nodes : [];
  // Some generators emit `edges: [[from,to]]`, others emit `links: [{from,to}]`.
  // Accept both forms and normalize to [from, to] tuples.
  const edges = Array.isArray(safe.edges)
    ? safe.edges
    : Array.isArray(safe.links)
      ? safe.links.map((l) => [l.from, l.to])
      : [];
  const title = safe.title || 'User Story';
  const byId = {};
  nodes.forEach(n => { if (n && n.id) byId[n.id] = n; });
  if (!nodes.length) {
    return (
      <div className="us-map">
        <h3>{title}</h3>
        <div style={{fontSize:12,color:'var(--ink-4)',padding:'18px 0'}}>
          User-story для этого проекта пока не сгенерирована.
          Перегенери bootstrap (<code>node scripts/generate_atlas_bootstrap_js.mjs</code>) или открой
          вкладку «Архитектура» — там полная многослойная схема.
        </div>
      </div>
    );
  }
  // simple row rendering — we already have "sources" panel on right; nodes in order
  return (
    <div className="us-map">
      <h3>{title}</h3>
      <div className="us-flow">
        {nodes.map((n, i) => (
          <React.Fragment key={n.id}>
            <div className={`us-node ${n.filled?'':'gap'} ${selectedId===n.id?'sel':''}`}
                 onClick={()=>onSelectNode(n)}>
              <div className="us-kind">{n.kind}{n.hasSubschema? ' · подсхема':''}</div>
              <div className="us-ttl">{n.title}</div>
              <div className="us-body">{n.body}</div>
              {n.hasSubschema && <div className="us-sub" onClick={(e)=>{e.stopPropagation(); onOpenSubschema && onOpenSubschema(n.id);}}><Icon name="layers" size={10}/> открыть подсхему</div>}
              <div className="node-tools">
                <button title="редактировать"><Icon name="pen" size={10}/></button>
                <button title="комментарий ИИ" className="claude"><Icon name="sparkle" size={10}/></button>
                <button title="добавить документ"><Icon name="upload" size={10}/></button>
              </div>
            </div>
            {i < nodes.length - 1 && <Icon name="arrow" size={14} className="us-arrow"/>}
          </React.Fragment>
        ))}
      </div>
      <div style={{fontSize:10,color:'var(--ink-4)',marginTop:10}}>
        Связи: {edges.map(([a,b],i) => <span key={i} className="mono" style={{marginRight:8}}>{a}→{b}</span>)}
      </div>
    </div>
  );
};

const Layer2Map = ({ project, onFill, onSelectNode, selectedNodeId, onOpenSubschema }) => {
  const m = project.map;
  return (
    <div style={{maxWidth:1200,margin:'0 auto'}}>
      <div className="advice-bar">
        <div className="ab-ico"><Icon name="sparkle" size={12}/></div>
        <div><b>Совет Клода:</b> 3 поля в карте пустые — «что даст клиенту», метрики, модель ролей. Нажми «Сима, помоги» на каждом или дай команду мне разом.</div>
        <div className="ab-spacer"/>
        <button className="btn sm"><Icon name="sparkle" size={11}/> заполнить все пропуски</button>
      </div>

      <div className="map-head">
        <div className="mh-title">
          <span className="mh-kind">карта · {project.taskKind}</span>
          <h1>{m.mission.value ? m.mission.value.split('—')[0].trim() : project.taskTitle}</h1>
          <div className="mh-note">{project.taskNote}</div>
        </div>
        <button className="btn"><Icon name="download" size={11}/> в артефакты</button>
        <button className="btn"><Icon name="expand" size={11}/> во весь экран</button>
      </div>

      <div className="mp-grid">
        <MapField field={m.mission} onFill={onFill} onSelect={onSelectNode}/>
        <MapField field={m.idea} onFill={onFill} onSelect={onSelectNode}/>
        <MapField field={m.goal} onFill={onFill} onSelect={onSelectNode}/>
        <MapField field={m.audience} onFill={onFill} onSelect={onSelectNode}/>
        <MapField field={m.value} onFill={onFill} onSelect={onSelectNode}/>
        <ImportantList field={m.important} onFill={onFill}/>
      </div>

      <UserStoryMap field={m.userstory} onSelectNode={onSelectNode} selectedId={selectedNodeId} onOpenSubschema={onOpenSubschema}/>
    </div>
  );
};

Object.assign(window, { Layer2Map, MapField });

// layer3_tz.jsx — TZ document with export targets

const Layer3TZ = ({ project, onSave }) => {
  const tz = project.tz;
  return (
    <div className="tz-page">
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:4}}>
        <span className="badge extract">ТЗ v3</span>
        <span className="meta">собрано из {project.canvas.sources.length} источников и {Object.keys(project.map).length} блоков карты</span>
      </div>
      <h1>{tz.title}</h1>
      <div className="tz-ver">{tz.version} · автор: {project.owner}</div>

      {tz.sections.map(sec => (
        <div key={sec.id} className={`tz-sec ${sec.gap?'gap':''}`}>
          <h2><span className="n">{sec.num}</span>{sec.title}</h2>
          {sec.body && <p>{sec.body}</p>}
          {sec.list && <ul>{sec.list.map((li,i) => <li key={i}>{li}</li>)}</ul>}
          {sec.embedsMap && (
            <div className="tz-embed">
              <Icon name="layers" size={12}/>
              <span>сюда вкладывается карта User Story (слой 2)</span>
              <span className="grow"/>
              <button className="btn xs ghost"><Icon name="expand" size={9}/></button>
            </div>
          )}
          {sec.sources && sec.sources.length > 0 && (
            <div className="tz-srcs">
              <span className="meta">источники: </span>
              {sec.sources.map(sid => <span key={sid} className="src" style={{marginRight:4}}>{sid}</span>)}
            </div>
          )}
        </div>
      ))}

      <div className="tz-actions">
        <button className="tz-export gdocs"><span className="ex-logo">G</span> Google Docs</button>
        <button className="tz-export notion"><span className="ex-logo">N</span> Notion</button>
        <button className="tz-export cc"><span className="ex-logo">CC</span> Claude Code → реализация</button>
        <button className="tz-export cursor"><span className="ex-logo">↗</span> Cursor</button>
        <span style={{flex:1}}/>
        <button className="tz-export save" onClick={onSave}><span className="ex-logo">✓</span> сохранить как артефакт</button>
        <button className="tz-export copy"><span className="ex-logo">⎘</span> копия на ревью</button>
      </div>
    </div>
  );
};

Object.assign(window, { Layer3TZ });

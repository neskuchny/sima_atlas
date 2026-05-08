// layer4_impl.jsx — implementation status

const Layer4Impl = ({ project }) => {
  const im = project.impl;
  const done = im.items.filter(i=>i.status==='done').length;
  const total = im.items.length;
  const pct = Math.round((done/total)*100);

  return (
    <div className="impl-wrap">
      <div className="impl-top">
        <div>
          <div className="it-kind">статус реализации · {project.taskKind}</div>
          <h2 style={{margin:'4px 0 0',fontFamily:'var(--font-serif)',fontSize:20,fontWeight:500}}>{project.name}</h2>
        </div>
        <div className="it-spacer"/>
        <div style={{textAlign:'right'}}>
          <div className="it-progress">{done} из {total} доделано · {pct}%</div>
          <div className="it-bar"><span style={{width:pct+'%'}}/></div>
        </div>
        <div className="sep" style={{height:32,width:0.5,background:'var(--line-2)'}}/>
        <div>
          <div className="it-kind">инструмент</div>
          <div style={{marginTop:4}}><span className="it-tool"><Icon name="sparkle" size={11}/> {im.tool}</span></div>
        </div>
      </div>

      <div className="impl-grid">
        <div className="impl-list">
          {im.items.map(it => (
            <div key={it.id} className="impl-item">
              <span className={`stt ${it.status}`}>
                {it.status==='done' ? <Icon name="check" size={11}/> :
                 it.status==='in-progress' ? <Icon name="dots" size={11}/> :
                 it.status==='skipped' ? <Icon name="close" size={10}/> :
                 <Icon name="cursor" size={10}/>}
              </span>
              <div>
                <div className="lb">{it.label}</div>
                <div className="nt">{it.note}</div>
              </div>
              <span className={`status-chip ${it.status}`}>
                {it.status==='done'?'готово':
                 it.status==='in-progress'?'в работе':
                 it.status==='skipped'?'пропущено':'в очереди'}
              </span>
            </div>
          ))}
        </div>

        <div className="impl-log">
          <h4>Лог Claude Code</h4>
          {im.log.map((l,i) => (
            <div key={i} className="lg">
              <span className="at">{l.at}</span>
              <span>{l.text}</span>
            </div>
          ))}
          <div style={{marginTop:14,display:'flex',flexDirection:'column',gap:6}}>
            <button className="btn sm"><Icon name="sparkle" size={11}/> продолжить доработку</button>
            <button className="btn sm ghost"><Icon name="note" size={11}/> вернуть в регламент</button>
            <button className="btn sm ghost"><Icon name="library" size={11}/> сохранить вики-инструкцию</button>
          </div>
          <div style={{marginTop:14,padding:10,background:'var(--olive-bg)',borderRadius:6,fontSize:11,color:'var(--olive-ink)',lineHeight:1.5}}>
            <b>Следующий шаг:</b> после того как в работе закроется F3/F4/F7, Сима проверит соответствие ТЗ и составит черновик вики-инструкции для новых пользователей — по тем же кубикам, которыми создавали продукт.
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { Layer4Impl });

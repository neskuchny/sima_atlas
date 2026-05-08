// sidecol.jsx — the right panel: details of selected cube OR focus mode on a layer
function SideCol({ picked, focusNode, focusLayer, cubes, onOpenCompose, onClose }) {
  if (focusLayer) return <FocusLayer layer={focusLayer} cubes={cubes} onClose={onClose}/>;
  if (focusNode) return <FocusNode node={focusNode} cubes={cubes} onClose={onClose}/>;
  if (picked) return <CubeDetails cube={picked} cubes={cubes} onClose={onClose}/>;
  return <OverviewPanel onOpenCompose={onOpenCompose}/>;
}

function OverviewPanel({ onOpenCompose }) {
  return (
    <>
      <div className="side-sec">
        <div className="sec-ttl">проект</div>
        <div style={{fontSize:12,color:'var(--ink-2)',lineHeight:1.55}}>
          Это не документ, а <b>схема</b>. Каждый прямоугольник — кубик из библиотеки или производное от него. Связи показывают, откуда берётся смысл и куда он ведёт дальше.
        </div>
      </div>
      <div className="side-sec">
        <div className="sec-ttl">как работать</div>
        <ol style={{margin:0,paddingLeft:18,fontSize:12,color:'var(--ink-2)',lineHeight:1.6}}>
          <li>Кликните на любой узел — он откроется справа с родословной и связями.</li>
          <li>«Синтезировать» — запустить композитор: выбрать кубики или надиктовать и получить новый слой или кубик.</li>
          <li>Переключайтесь между <b>схема</b> / <b>граф</b> / <b>библиотека</b> — это разные срезы одних данных.</li>
        </ol>
      </div>
      <div className="side-sec">
        <div className="sec-ttl">предложения симы</div>
        <div className="col" style={{gap:8}}>
          <div style={{padding:10,background:'var(--paper)',border:'0.5px solid var(--line-2)',borderRadius:6}}>
            <div style={{fontSize:11.5,fontWeight:500,color:'var(--ink-1)'}}>Слой «Риски» пуст</div>
            <div className="meta" style={{marginTop:3,lineHeight:1.5}}>Из встречи 18 марта можно извлечь 3 потенциальных риска. Добавить?</div>
            <div style={{display:'flex',gap:6,marginTop:8}}>
              <button className="btn xs">посмотреть</button>
              <button className="btn xs pri">добавить слой</button>
            </div>
          </div>
          <div style={{padding:10,background:'var(--paper)',border:'0.5px solid var(--line-2)',borderRadius:6}}>
            <div style={{fontSize:11.5,fontWeight:500,color:'var(--ink-1)'}}>2 кубика близки по смыслу</div>
            <div className="meta" style={{marginTop:3,lineHeight:1.5}}>«Karpathy wiki» ↔ «Vibe-coding» — связь не зафиксирована. Связать?</div>
            <div style={{display:'flex',gap:6,marginTop:8}}>
              <button className="btn xs">показать</button>
              <button className="btn xs">связать</button>
            </div>
          </div>
        </div>
      </div>
      <div className="side-sec">
        <div className="sec-ttl">быстрый старт</div>
        <button className="btn pri" style={{width:'100%'}} onClick={onOpenCompose}>
          <Icon name="sparkle" size={11}/> синтезировать новый слой
        </button>
        <button className="btn" style={{width:'100%',marginTop:6}}>
          <Icon name="mic" size={11}/> быстрая диктовка
        </button>
      </div>
    </>
  );
}

function CubeDetails({ cube, cubes, onClose }) {
  const usedIn = cubes.filter(c => false); // placeholder
  return (
    <>
      <div className="side-sec" style={{display:'flex',alignItems:'flex-start',gap:8}}>
        <div style={{flex:1}}>
          <Badge type={cube.type} kind={cube.kind}/>
          <div style={{fontSize:15,fontWeight:500,color:'var(--ink-1)',marginTop:8,lineHeight:1.35}}>{cube.title}</div>
          <div className="meta" style={{marginTop:4}}>{cube.meta}</div>
        </div>
        <button className="rail-btn" onClick={onClose} style={{width:26,height:26,marginTop:-4}}><Icon name="close" size={10}/></button>
      </div>
      <div className="side-sec">
        <div className="sec-ttl">содержимое</div>
        <div style={{fontSize:12,color:'var(--ink-2)',lineHeight:1.55}}>{cube.body}</div>
      </div>
      <div className="side-sec">
        <div className="sec-ttl">метки</div>
        <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
          {(cube.tags||[]).map(t => <span key={t} className="chip" style={{padding:'2px 8px'}}>{t}</span>)}
        </div>
      </div>
      <div className="side-sec">
        <div className="sec-ttl">родословная</div>
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          <div className="meta">появился из встречи 12 марта</div>
          <div className="meta">использован в 3 композициях</div>
          <div className="meta">связан с 5 другими кубиками</div>
        </div>
      </div>
      <div className="side-sec">
        <div className="sec-ttl">действия</div>
        <div className="col" style={{gap:6}}>
          <button className="btn sm"><Icon name="focus" size={11}/> открыть в фокусе</button>
          <button className="btn sm"><Icon name="link" size={11}/> связать с другим</button>
          <button className="btn sm"><Icon name="sparkle" size={11}/> добавить в синтез</button>
        </div>
      </div>
    </>
  );
}

function FocusNode({ node, cubes, onClose }) {
  const srcCubes = (node.sources||[]).map(id => cubes.find(c => c.id===id)).filter(Boolean);
  return (
    <>
      <div className="side-sec" style={{display:'flex',alignItems:'flex-start',gap:8}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <Icon name="focus" size={11} color="var(--orange)"/>
            <span className="meta" style={{color:'var(--orange-ink)'}}>фокус на узле</span>
          </div>
          <Badge type={node.type} kind={node.kind}/>
          <div style={{fontSize:15,fontWeight:500,marginTop:8,lineHeight:1.35}}>{node.title}</div>
        </div>
        <button className="rail-btn" onClick={onClose} style={{width:26,height:26}}><Icon name="close" size={10}/></button>
      </div>
      <div className="side-sec">
        <div className="sec-ttl">что это</div>
        <div style={{fontSize:12,color:'var(--ink-2)',lineHeight:1.55}}>{node.body}</div>
      </div>
      <div className="side-sec">
        <div className="sec-ttl">собран из</div>
        <div className="col" style={{gap:6}}>
          {srcCubes.map(c => (
            <div key={c.id} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'7px 9px',background:'var(--paper)',border:'0.5px solid var(--line-2)',borderRadius:5}}>
              <Dot type={c.type}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11.5,fontWeight:500}} className="truncate">{c.title}</div>
                <div className="meta truncate">{typeLabel[c.type]} · {c.meta}</div>
              </div>
              <span className="meta" style={{color:'var(--olive-ink)'}}>live</span>
            </div>
          ))}
          {srcCubes.length === 0 && <div className="meta">нет источников</div>}
        </div>
      </div>
      <div className="side-sec">
        <div className="sec-ttl">правка</div>
        <div className="col" style={{gap:6}}>
          <button className="btn sm"><Icon name="sparkle" size={11}/> пересобрать из источников</button>
          <button className="btn sm"><Icon name="mic" size={11}/> надиктовать дополнение</button>
          <button className="btn sm"><Icon name="text" size={11}/> редактировать вручную</button>
        </div>
      </div>
    </>
  );
}

function FocusLayer({ layer, cubes, onClose }) {
  return (
    <>
      <div className="side-sec" style={{display:'flex',alignItems:'flex-start',gap:8}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <Icon name="focus" size={11} color="var(--orange)"/>
            <span className="meta" style={{color:'var(--orange-ink)'}}>фокус на слое</span>
          </div>
          <div style={{fontSize:10,color:'var(--ink-4)',marginTop:6,fontFamily:'var(--font-mono)'}}>{layer.num}</div>
          <div style={{fontSize:15,fontWeight:500,lineHeight:1.35}}>{layer.title}</div>
          <div className="meta" style={{marginTop:2}}>{layer.kind}</div>
        </div>
        <button className="rail-btn" onClick={onClose} style={{width:26,height:26}}><Icon name="close" size={10}/></button>
      </div>
      <div className="side-sec">
        <div className="sec-ttl">узлы слоя · {layer.nodes.length}</div>
        <div className="col" style={{gap:6}}>
          {layer.nodes.map(n => (
            <div key={n.id} style={{padding:'8px 10px',background:'var(--paper)',border:'0.5px solid var(--line-2)',borderRadius:5}}>
              <Badge type={n.type} kind={n.kind}/>
              <div style={{fontSize:11.5,fontWeight:500,marginTop:4}}>{n.title}</div>
              <div className="meta" style={{marginTop:2,lineHeight:1.45}}>{n.body}</div>
              <div style={{display:'flex',gap:4,marginTop:6,flexWrap:'wrap'}}>
                {(n.sources||[]).slice(0,3).map(sid => {
                  const s = cubes.find(c=>c.id===sid); if (!s) return null;
                  return <span key={sid} className="src"><Dot type={s.type}/>{s.title}</span>;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="side-sec">
        <div className="sec-ttl">расширить слой</div>
        <div className="col" style={{gap:6}}>
          <button className="btn sm"><Icon name="plus" size={11}/> добавить узел</button>
          <button className="btn sm"><Icon name="sparkle" size={11}/> предложить из библиотеки</button>
        </div>
      </div>
    </>
  );
}

Object.assign(window, { SideCol, OverviewPanel, CubeDetails, FocusNode, FocusLayer });

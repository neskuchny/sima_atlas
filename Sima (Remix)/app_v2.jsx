// app_v2.jsx — new shell with project tabs + layer switcher + gallery
// Uses data from window.SIMA_DATA_V2

const { useState, useMemo } = React;

function computeArchSummary(arch, atlas){
  const blocks = arch?.blocks || [];
  const totals = { total: blocks.length, tasksDone: 0, tasksTotal: 0, kpiPassed: 0, kpiTotal: 0 };
  blocks.forEach((b) => {
    const entry = atlas?.blocks?.[b.id];
    if (!entry || !window.SIMA_ATLAS_CORE) return;
    const p = window.SIMA_ATLAS_CORE.blockProgress(entry);
    totals.tasksDone += p.tasksDone;
    totals.tasksTotal += p.tasksTotal;
    totals.kpiPassed += p.kpiPassed;
    totals.kpiTotal += p.kpiTotal;
  });
  return totals;
}


const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "regular",
  "accent": "brown",
  "commentMode": false,
  "showGrid": true,
  "showRuler": false,
  "artifactsView": "grid",
  "archDensity": "regular"
}/*EDITMODE-END*/;

const ACCENTS = {
  brown:  { o:'#a6673a', oSoft:'#f2d9c2' },
  indigo: { o:'#4a5ca8', oSoft:'#d6dcf1' },
  olive:  { o:'#6b7a3d', oSoft:'#dae1c1' },
  amber:  { o:'#b47a1f', oSoft:'#f2dfb3' },
};

const LAYERS = [
  { id:'canvas',  n:'1', name:'Канвас · источники' },
  { id:'map',     n:'2', name:'Карта продукта' },
  { id:'tz',      n:'3', name:'ТЗ' },
  { id:'impl',    n:'4', name:'Реализация' },
  { id:'gallery', n:'A', name:'Артефакты' },
];

function AppV2(){
  const data = window.SIMA_DATA_V2;
  const [projId, setProjId] = useState(data.projects[0].id);
  const [layer, setLayer] = useState('canvas');
  const [selectedCanvasId, setSelectedCanvasId] = useState(null);
  const [selectedMapNode, setSelectedMapNode] = useState(null);
  const [subschemaId, setSubschemaId] = useState(null);
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // Layer 2 sub-view: 'fields' | 'arch'
  const [mapView, setMapView] = useState('fields');
  const [archView, setArchView] = useState('layers'); // layers | flow | status
  const [archMvpOnly, setArchMvpOnly] = useState(false);
  const [archSelectedId, setArchSelectedId] = useState(null);
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(()=>setToast(null), 2800); };

  const [atlasState, setAtlasState] = useState(null);
  const [syncReport, setSyncReport] = useState(null);

  React.useEffect(() => {
    if (!window.SIMA_ATLAS_CORE || !window.ARCH_BY_PROJECT) return;
    const arch = window.ARCH_BY_PROJECT[projId];
    const loaded = window.SIMA_ATLAS_CORE.loadAtlas(projId, arch);
    setAtlasState(loaded);
    setSyncReport(window.SIMA_ATLAS_CORE.syncCheck(loaded, arch));
  }, [projId]);

  const runSyncCheck = () => {
    if (!window.SIMA_ATLAS_CORE || !window.ARCH_BY_PROJECT || !atlasState) return;
    const arch = window.ARCH_BY_PROJECT[projId];
    const saved = window.SIMA_ATLAS_CORE.saveAtlas(projId, atlasState);
    const report = window.SIMA_ATLAS_CORE.syncCheck(saved, arch);
    setAtlasState(saved);
    setSyncReport(report);
    showToast(`Sync: OK ${report.synchronized}, drift ${report.drift}, broken ${report.broken}`);
  };

  const markDemoProgress = () => {
    if (!atlasState) return;
    const ids = Object.keys(atlasState.blocks || {});
    if (!ids.length) return;
    const first = ids[0];
    const patch = structuredClone(atlasState);
    const block = patch.blocks[first];
    if (block.tasks?.length) block.tasks[0].done = true;
    if (block.kpi?.length) block.kpi[0].passed = true;
    block.checks = [...(block.checks||[]), { at: new Date().toISOString(), test: 'manual/demo', result: 'pass' }];
    setAtlasState(patch);
    showToast(`Для блока ${first} зафиксирован прогресс (task+KPI).`);
  };


  // Apply density + accent to document
  React.useEffect(() => {
    document.body.setAttribute('data-density', t.density);
    const a = ACCENTS[t.accent] || ACCENTS.brown;
    document.documentElement.style.setProperty('--orange', a.o);
    document.documentElement.style.setProperty('--orange-soft', a.oSoft);
  }, [t.density, t.accent]);

  // Editable canvases stored in state per project
  const [canvasOverrides, setCanvasOverrides] = useState({});

  const project = useMemo(() => {
    const base = data.projects.find(p => p.id === projId);
    if (!base) return data.projects[0];
    const override = canvasOverrides[projId];
    return override ? { ...base, canvas: override } : base;
  }, [projId, canvasOverrides]);

  const updateCanvas = (newCanvas) => {
    setCanvasOverrides(prev => ({ ...prev, [projId]: newCanvas }));
  };

  const selectedId = selectedCanvasId;
  const setSelectedId = setSelectedCanvasId;

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100vh'}}>
      {/* TOP — brand + projects + layer switcher */}
      <div className="l2-top">
        <div className="l2-brand">
          <div className="logo">С</div>
          Сима
        </div>

        <div style={{display:'flex',gap:2}}>
          {data.projects.map(p => (
            <button key={p.id}
              className={`l2-proj ${p.id===projId?'on':''}`}
              onClick={()=>{ setProjId(p.id); setSelectedCanvasId(null); setSelectedMapNode(null); }}>
              <span className="kind">{p.taskKind}</span>
              <span>{p.name}</span>
            </button>
          ))}
          <button className="l2-proj" style={{color:'var(--ink-4)'}}>
            <Icon name="plus" size={10}/> новый
          </button>
        </div>

        <div className="l2-spacer"/>

        <div className="l2-layers">
          {LAYERS.map(L => (
            <button key={L.id}
              className={`l2-layer ${L.id===layer?'on':''}`}
              onClick={()=>setLayer(L.id)}>
              <span className="n">{L.n}</span>
              <span>{L.name}</span>
            </button>
          ))}
        </div>

        <button className="btn ghost sm"><Icon name="tweak" size={11}/> настройки</button>
      </div>

      {/* SUB — breadcrumb */}
      <div className="l2-sub">
        <div className="path">
          <Icon name="layers" size={11}/>
          <b>{project.name}</b>
          <span style={{color:'var(--ink-5)'}}>→</span>
          <span>{LAYERS.find(L=>L.id===layer).name}</span>
          {layer==='canvas' && <span style={{color:'var(--ink-5)'}}>· 1 задача + {project.canvas.sources.length} источников · {project.canvas.links.length} связей</span>}
          {layer==='map' && (()=>{
            const gaps = Object.values(project.map).filter(f => f.gap).length + (project.map.important?.items?.filter(i=>i.gap).length||0);
            return <span style={{color:'var(--ink-5)'}}>· {gaps} пропусков требуют внимания</span>;
          })()}
        </div>
        <div className="grow"/>
        <span className="meta">{project.created}</span>
        <span style={{margin:'0 6px',color:'var(--line-3)'}}>·</span>
        <span className="meta">{project.owner}</span>
        {syncReport && (<>
          <span style={{margin:'0 6px',color:'var(--line-3)'}}>·</span>
          <span className="meta">sync ok {syncReport.synchronized}/{syncReport.total}</span>
        </>)}
      </div>

      {/* WORK AREA */}
      <div className="workarea" style={{flex:1,minHeight:0}}>
        <div className="canvas-wrap" style={layer==='map' ? {padding:0, overflow:'hidden'} : undefined}>
          {layer==='canvas' && (
            <Layer1Canvas project={project} onUpdate={updateCanvas}
              selectedId={selectedCanvasId} setSelectedId={setSelectedCanvasId}
              commentMode={t.commentMode}
              onOpenSubschema={setSubschemaId}/>
          )}
          {layer==='map' && (
            <div className="map-wrap" style={{height:'100%',display:'flex',flexDirection:'column',overflow:'hidden'}}>
              {/* fixed view toggle bar */}
              <div className="arch-toolbar">
                <div className="l2-view-toggle" style={{margin:0}}>
                  <button className={mapView==='fields'?'on':''} onClick={()=>setMapView('fields')}>
                    <Icon name="grid" size={11}/> Поля карты
                  </button>
                  <button className={mapView==='arch'?'on':''} onClick={()=>setMapView('arch')}>
                    <Icon name="layers" size={11}/> Архитектура
                  </button>
                  <button className={mapView==='landscape'?'on':''} onClick={()=>setMapView('landscape')}>
                    <Icon name="grid" size={11}/> Ландшафт
                  </button>
                </div>
                {mapView==='arch' && (
                  <>
                    <span style={{color:'var(--line-3)'}}>·</span>
                    <span className="lbl">вид:</span>
                    <div className="seg">
                      {[
                        ['layers','по слоям','layers'],
                        ['flow','по пути','arrow'],
                        ['status','по статусу','check'],
                      ].map(([v,lbl,icn]) => (
                        <button key={v} className={archView===v?'on':''} onClick={()=>setArchView(v)}>
                          <Icon name={icn} size={10}/> {lbl}
                        </button>
                      ))}
                    </div>
                    <span style={{color:'var(--line-3)'}}>·</span>
                    <button className={`btn xs ${archMvpOnly?'':'ghost'}`} onClick={()=>setArchMvpOnly(v=>!v)}>
                      <Icon name="check" size={10}/> только MVP
                    </button>
                    <div className="grow"/>
                    <button className="btn xs ghost" onClick={runSyncCheck}>
                      <Icon name="sparkle" size={10}/> sync-check
                    </button>
                    <button className="btn xs ghost" onClick={markDemoProgress}>
                      <Icon name="check" size={10}/> отметить прогресс
                    </button>
                  </>
                )}
                {mapView==='landscape' && (
                  <>
                    <span style={{color:'var(--line-3)'}}>·</span>
                    <span className="lbl" style={{fontStyle:'italic',color:'var(--ink-3)'}}>
                      пространственный режим · читает ту же архитектуру
                    </span>
                    <div className="grow"/>
                    <span className="meta" style={{fontSize:10}}>
                      Долина → Поселение → Здание
                    </span>
                  </>
                )}
              </div>
              {mapView==='fields' && (
                <div style={{flex:1,overflow:'auto',padding:'14px 24px 24px'}}>
                  <Layer2Map project={project}
                    onFill={(f)=>alert('Сима заполнит «'+f.title+'» на основе источников.')}
                    onSelectNode={setSelectedMapNode}
                    selectedNodeId={selectedMapNode && selectedMapNode.id}
                    onOpenSubschema={setSubschemaId}/>
                </div>
              )}
              {mapView==='arch' && (
                <ArchCanvas projectId={projId}
                  density={t.archDensity || 'regular'}
                  view={archView}
                  mvpOnly={archMvpOnly}
                  selectedBlockId={archSelectedId}
                  onSelectBlock={setArchSelectedId}
                  onOpenSubschema={setSubschemaId}
                  onNote={showToast}/>
              )}
              {mapView==='landscape' && (
                <LandscapeView projectId={projId}
                  project={project}
                  selectedBlockId={archSelectedId}
                  onSelectBlock={setArchSelectedId}/>
              )}
            </div>
          )}
          {layer==='tz' && (
            <Layer3TZ project={project} onSave={()=>alert('ТЗ сохранено в галерею как артефакт.')}/>
          )}
          {layer==='impl' && (
            <Layer4Impl project={project}/>
          )}
          {layer==='gallery' && (
            <GalleryV2 artifacts={data.artifacts}
              onPick={(a)=>alert('Артефакт «'+a.title+'» — можно вставить в текущий проект как блок или карту.')}/>
          )}
        </div>

        <div className="sidecol">
          {layer==='canvas' && (
            <>
              <SourcePalette/>
              <div className="side-sec" style={{flex:1,padding:0}}>
                <div style={{padding:'12px 16px 4px'}}>
                  <h4 className="sec-ttl">Инспектор</h4>
                </div>
                <CanvasInspector project={project} selectedId={selectedCanvasId} onOpenSubschema={setSubschemaId}/>
              </div>
            </>
          )}
          {layer==='map' && mapView==='fields' && (
            <div className="side-sec" style={{flex:1}}>
              <h4 className="sec-ttl">Описание блока</h4>
              {selectedMapNode ? (
                <div style={{display:'flex',flexDirection:'column',gap:10}}>
                  <div>
                    <div className="sp-kind" style={{fontSize:10,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'0.08em'}}>{selectedMapNode.kind || 'поле карты'}</div>
                    <h3 style={{margin:'4px 0 0',fontSize:14,fontWeight:500}}>{selectedMapNode.title}</h3>
                  </div>
                  <div style={{fontSize:12,color:'var(--ink-2)',lineHeight:1.5}}>
                    {selectedMapNode.body || selectedMapNode.value || selectedMapNode.hint}
                  </div>
                  {selectedMapNode.sources && selectedMapNode.sources.length>0 && (
                    <div>
                      <div className="meta">взято из источников:</div>
                      <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:4}}>
                        {selectedMapNode.sources.map(s => <span key={s} className="src">{s}</span>)}
                      </div>
                    </div>
                  )}
                  {selectedMapNode.hasSubschema && (
                    <button className="btn sm" onClick={()=>setSubschemaId(selectedMapNode.id)}>
                      <Icon name="layers" size={11}/> открыть подсхему
                    </button>
                  )}
                  <div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:4}}>
                    <button className="btn xs"><Icon name="pen" size={10}/> править</button>
                    <button className="btn xs"><Icon name="sparkle" size={10}/> Клод, перепиши</button>
                    <button className="btn xs ghost"><Icon name="upload" size={10}/> + документ</button>
                    <button className="btn xs ghost"><Icon name="library" size={10}/> в артефакты</button>
                  </div>
                </div>
              ) : (
                <div className="sel-empty">
                  <Icon name="cursor" size={22}/>
                  <div>Кликни на карточку карты, чтобы увидеть описание, источники и инструменты.</div>
                </div>
              )}

              <div style={{marginTop:18,padding:12,background:'var(--bg-2)',borderRadius:8,fontSize:11.5,color:'var(--ink-2)',lineHeight:1.5}}>
                <b>Как устроена карта.</b> Каждое поле либо заполнено из источников, либо подсвечено красным. Подсвеченное — нужно подтянуть руками или попросить Симу. Подсхема (две полоски) раскрывается в новый слой.
              </div>
            </div>
          )}
          {layer==='map' && (mapView==='arch' || mapView==='landscape') && (
            <div className="side-sec" style={{flex:1}}>
              <h4 className="sec-ttl">Блок архитектуры</h4>
              <ArchInspector projectId={projId}
                selectedBlockId={archSelectedId}
                onOpenSubschema={setSubschemaId}
                onPatch={(id, patch) => {
                  const key = 'sima.arch.'+projId;
                  try {
                    const raw = localStorage.getItem(key);
                    const s = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(window.ARCH_BY_PROJECT[projId]));
                    if (patch === '__delete'){
                      s.blocks = s.blocks.filter(b => b.id !== id);
                      s.links = s.links.filter(l => l.from !== id && l.to !== id);
                      setArchSelectedId(null);
                    } else {
                      s.blocks = s.blocks.map(b => b.id === id ? { ...b, ...patch } : b);
                    }
                    localStorage.setItem(key, JSON.stringify(s));
                    window.dispatchEvent(new Event('storage'));
                    if (patch !== '__delete' && patch.title) showToast('«Карта полей» пометила блок как обновлённый.');
                  } catch(e){ console.error(e); }
                }}/>
              <div style={{marginTop:18,padding:12,background:'var(--bg-2)',borderRadius:8,fontSize:11,color:'var(--ink-2)',lineHeight:1.55}}>
                {mapView==='arch' ? (
                  <><b>Архитектура — ведущая.</b> Таскай блоки между слоями, переименовывай двойным кликом, связывай с круглых портов по краям. Карта полей и ТЗ пересоберутся по кнопке «синк в карту».</>
                ) : (
                  <>
                    <b>Ландшафт — это та же архитектура.</b> Слои стали поселениями, кубики — зданиями со своим архетипом по типу слоя, связи — трубами/опорами/тропами. Три уровня: <b>Долина</b> → <b>Поселение</b> → <b>Здание</b> (разрез). Правки идут только через инспектор архитектуры — здесь ты гуляешь и смотришь.
                    <div style={{marginTop:8,paddingTop:8,borderTop:'0.5px solid var(--line-1)'}}>
                      <div style={{fontSize:10,color:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:5}}>тип слоя → силуэт здания</div>
                      <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:'3px 8px',fontSize:10.5}}>
                        <span style={{color:'var(--ink-4)'}}>логика</span><span>каменная башня</span>
                        <span style={{color:'var(--ink-4)'}}>фронтенд</span><span>стеклянный фасад</span>
                        <span style={{color:'var(--ink-4)'}}>ИИ</span><span>мастерская с трубой</span>
                        <span style={{color:'var(--ink-4)'}}>интеграции</span><span>мост · причал</span>
                        <span style={{color:'var(--ink-4)'}}>контент · данные</span><span>амбар · архив</span>
                        <span style={{color:'var(--ink-4)'}}>пользователь</span><span>площадь с фонтаном</span>
                        <span style={{color:'var(--ink-4)'}}>маркет</span><span>городские ворота</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {layer==='tz' && (
            <div className="side-sec">
              <h4 className="sec-ttl">ТЗ · мета</h4>
              <div style={{fontSize:12,color:'var(--ink-2)',lineHeight:1.6}}>
                Документ собирается из карты и канваса. Каждый раздел трассируется до источника — в экспорте будут сноски. При правке карты ТЗ пересобирается.
              </div>
              <div style={{height:14}}/>
              <h4 className="sec-ttl">Оглавление</h4>
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                {project.tz.sections.map(s => (
                  <div key={s.id} style={{fontSize:11.5,color:'var(--ink-2)',padding:'4px 0',display:'flex',gap:6}}>
                    <span className="mono" style={{color:'var(--ink-4)',minWidth:18}}>{s.num}</span>
                    <span>{s.title}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {layer==='impl' && (
            <div className="side-sec">
              <h4 className="sec-ttl">Сима ↔ Claude Code</h4>
              <div style={{fontSize:12,color:'var(--ink-2)',lineHeight:1.55}}>
                Сима хранит ТЗ и карту. Claude Code читает ТЗ и реализует. После каждой итерации Сима проверяет, какой элемент схемы доделан, и отмечает галочкой.
              </div>
              <div style={{height:14}}/>
              <h4 className="sec-ttl">Доп. действия</h4>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                <button className="btn sm ghost"><Icon name="note" size={11}/> сравнить с ТЗ</button>
                <button className="btn sm ghost"><Icon name="library" size={11}/> собрать вики</button>
                <button className="btn sm ghost"><Icon name="sparkle" size={11}/> обучающий материал</button>
                <button className="btn sm ghost"><Icon name="layers" size={11}/> добавить в экосистему</button>
              </div>
            </div>
          )}
          {layer==='gallery' && (
            <div className="side-sec">
              <h4 className="sec-ttl">Как работают артефакты</h4>
              <div style={{fontSize:12,color:'var(--ink-2)',lineHeight:1.55}}>
                Любой блок, подсхема, карта или ТЗ сохраняются как артефакт. Тегируются продуктом и типом. При создании нового проекта можно вставить готовый артефакт как кубик на канвас.
              </div>
              <div style={{height:14}}/>
              <h4 className="sec-ttl">Статистика</h4>
              <div style={{fontSize:11.5,color:'var(--ink-2)'}}>
                <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'0.5px solid var(--line-1)'}}>
                  <span>всего артефактов</span><b>{data.artifacts.length}</b>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0',borderBottom:'0.5px solid var(--line-1)'}}>
                  <span>переиспользуется в ≥2 проектах</span><b>{data.artifacts.filter(a=>a.usedIn.length>=2).length}</b>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',padding:'4px 0'}}>
                  <span>блоков</span><b>{data.artifacts.filter(a=>a.type==='block').length}</b>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Subschema modal */}
      {subschemaId && <SubschemaModal nodeId={subschemaId} onClose={()=>setSubschemaId(null)}/>}

      {/* Tweaks panel */}
      <TweaksUI t={t} setTweak={setTweak}/>

      {/* toast */}
      {toast && <div className="sync-toast"><Icon name="sparkle" size={11}/> {toast}</div>}
    </div>
  );
}

function TweaksUI({ t, setTweak }){
  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="Вид"/>
      <TweakRadio label="Плотность" value={t.density}
        options={['compact','regular','comfy']}
        onChange={v=>setTweak('density',v)}/>
      <TweakRadio label="Акцент" value={t.accent}
        options={['brown','indigo','olive','amber']}
        onChange={v=>setTweak('accent',v)}/>
      <TweakSection label="Канвас"/>
      <TweakToggle label="Режим комментариев для ИИ" value={t.commentMode}
        onChange={v=>setTweak('commentMode',v)}/>
      <TweakToggle label="Сетка" value={t.showGrid}
        onChange={v=>setTweak('showGrid',v)}/>
      <TweakToggle label="Линейка расстояний" value={t.showRuler}
        onChange={v=>setTweak('showRuler',v)}/>
      <TweakSection label="Архитектура"/>
      <TweakRadio label="Плотность блоков" value={t.archDensity}
        options={['compact','regular','large']}
        onChange={v=>setTweak('archDensity',v)}/>
      <TweakSection label="Галерея"/>
      <TweakRadio label="Вид артефактов" value={t.artifactsView}
        options={['grid','list']}
        onChange={v=>setTweak('artifactsView',v)}/>
    </TweaksPanel>
  );
}

function AppV2Root(){
  return <AppV2/>;
}

// Render — AppV2 hosts Tweaks + Subschema inside its tree
ReactDOM.createRoot(document.getElementById('root')).render(<AppV2/>);

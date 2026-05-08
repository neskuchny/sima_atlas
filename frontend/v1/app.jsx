// app.jsx — main Sima prototype shell
const { useState, useEffect, useMemo, useRef } = React;

const DEFAULTS = /*EDITMODE-BEGIN*/{
  "layout": "stack",
  "density": "regular",
  "conn": "regular",
  "theme": "light",
  "projectType": "\u0418\u0434\u0435\u044f \u043f\u0440\u043e\u0434\u0443\u043a\u0442\u0430"
}/*EDITMODE-END*/;

function App() {
  const [view, setView] = useState('schema');
  const setViewSafe = (v) => { setView(v); setResultFw(null); };
  const [picked, setPicked] = useState(null);
  const [focusNode, setFocusNode] = useState(null);
  const [focusLayer, setFocusLayer] = useState(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [resultFw, setResultFw] = useState(null);
  const [resultSourceCount, setResultSourceCount] = useState(0);
  const [tweaksOpen, setTweaksOpen] = useState(false);
  const [tweaks, setTweaks] = useState(DEFAULTS);

  const { cubes, project } = SIMA_DATA;

  // persist tweaks via host
  const updateTweak = (k, v) => {
    const next = { ...tweaks, [k]: v };
    setTweaks(next);
    try { window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*'); } catch {}
  };

  // apply body attrs from tweaks
  useEffect(() => {
    document.body.setAttribute('data-density', tweaks.density || 'regular');
    document.body.setAttribute('data-conn', tweaks.conn || 'regular');
    document.body.setAttribute('data-theme', tweaks.theme || 'light');
    document.documentElement.setAttribute('data-theme', tweaks.theme || 'light');
  }, [tweaks]);

  // tweaks toggle via rail + host
  useEffect(() => {
    const handler = () => setTweaksOpen(v => !v);
    window.addEventListener('sima-tweaks-toggle', handler);

    const onMsg = (ev) => {
      if (!ev.data || typeof ev.data !== 'object') return;
      if (ev.data.type === '__activate_edit_mode') setTweaksOpen(true);
      if (ev.data.type === '__deactivate_edit_mode') setTweaksOpen(false);
    };
    window.addEventListener('message', onMsg);
    try { window.parent.postMessage({ type: '__edit_mode_available' }, '*'); } catch {}

    return () => { window.removeEventListener('sima-tweaks-toggle', handler); window.removeEventListener('message', onMsg); };
  }, []);

  const pickCube = (c) => { setPicked(c); setFocusNode(null); setFocusLayer(null); };
  const focusOnNode = (n) => { setFocusNode(n); setFocusLayer(null); setPicked(null); };
  const focusOnLayer = (l) => { setFocusLayer(l); setFocusNode(null); setPicked(null); };
  const closeSide = () => { setFocusNode(null); setFocusLayer(null); setPicked(null); };

  const handleSynth = (conf) => {
    setComposerOpen(false);
    // pick a framework by project type
    const typeToFw = {
      'Книга': 'book', 'Книга / глава': 'book',
      'Продукт': 'product', 'Идея продукта': 'product',
      'Идея': 'idea',
    };
    const fw = typeToFw[conf.projType] || 'product';
    setResultFw(fw);
    setResultSourceCount(conf.picks?.length || 0);
  };

  const mainView = (
    resultFw ? <CanvasTools storageKey={`sima-result-${resultFw}-annots`}><ResultView framework={resultFw} sourceCount={resultSourceCount} onClose={() => setResultFw(null)}/></CanvasTools> :
    view === 'schema' ? <SchemaView project={project} cubes={cubes}
        onPickSource={pickCube} onFocusNode={focusOnNode} onFocusLayer={focusOnLayer} density={tweaks.density}/> :
    view === 'graph' ? <CanvasTools storageKey="sima-graph-annots"><GraphView project={project} cubes={cubes} onPickCube={pickCube}/></CanvasTools> :
    <LibraryView cubes={cubes} onPickCube={pickCube}/>
  );

  return (
    <div className="app">
      <Rail view={view} setView={setViewSafe} onOpenCompose={() => setComposerOpen(true)}/>
      <div className="main">
        <TopBar project={project} view={view} setView={setViewSafe} onOpenCompose={() => setComposerOpen(true)}/>
        <div className="workarea">
          {mainView}
          {!resultFw && (
            <div className="sidecol">
              <SideCol picked={picked} focusNode={focusNode} focusLayer={focusLayer} cubes={cubes}
                onOpenCompose={() => setComposerOpen(true)} onClose={closeSide}/>
            </div>
          )}
        </div>
      </div>

      <Composer open={composerOpen} onClose={() => setComposerOpen(false)} cubes={cubes} onSynth={handleSynth}/>

      {/* Tweaks panel */}
      <div className={`tweaks ${tweaksOpen ? 'open' : ''}`}>
        <div style={{display:'flex',alignItems:'center',marginBottom:10}}>
          <h4 style={{margin:0,flex:1}}>Tweaks</h4>
          <button className="rail-btn" onClick={()=>setTweaksOpen(false)} style={{width:22,height:22}}><Icon name="close" size={10}/></button>
        </div>
        <div className="tweak">
          <label>Тема</label>
          <div className="seg">
            {['light','dark'].map(x => <button key={x} className={tweaks.theme===x?'on':''} onClick={()=>updateTweak('theme',x)}>{x==='light'?'светлая':'тёмная'}</button>)}
          </div>
        </div>
        <div className="tweak">
          <label>Плотность</label>
          <div className="seg">
            {['compact','regular','airy'].map(x => <button key={x} className={tweaks.density===x?'on':''} onClick={()=>updateTweak('density',x)}>{x==='compact'?'плотно':x==='regular'?'обычно':'воздух'}</button>)}
          </div>
        </div>
        <div className="tweak">
          <label>Связи</label>
          <div className="seg">
            {['regular','thick','animated'].map(x => <button key={x} className={tweaks.conn===x?'on':''} onClick={()=>updateTweak('conn',x)}>{x==='regular'?'обычно':x==='thick'?'жирно':'анимация'}</button>)}
          </div>
        </div>
        <div className="tweak">
          <label>Тип проекта-демо</label>
          <div className="seg" style={{flexDirection:'column'}}>
            {['Идея продукта','Исследование','Регламент','Стратегия'].map(x => <button key={x} className={tweaks.projectType===x?'on':''} onClick={()=>updateTweak('projectType',x)} style={{padding:'5px 8px',textAlign:'left'}}>{x}</button>)}
          </div>
          <div className="meta" style={{marginTop:6,lineHeight:1.4}}>в прототипе показан один тип — переключение типа меняет каркас схемы в реальном продукте</div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`toast show`}>
          <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
            <Icon name="check" size={14} color="var(--olive)"/>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:500,color:'var(--ink-1)'}}>{toast.title}</div>
              <div className="meta" style={{marginTop:3,lineHeight:1.45}}>{toast.body}</div>
              <div style={{display:'flex',gap:6,marginTop:8}}>
                <button className="btn xs">открыть</button>
                <button className="btn xs" onClick={()=>setToast(null)}>скрыть</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);

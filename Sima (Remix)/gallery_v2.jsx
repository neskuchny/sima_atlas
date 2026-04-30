// gallery_v2.jsx — artifact gallery wired to real /api/artifacts.
// Loads from server, renders real cards, supports insert into current project.

const GalleryV2 = ({ artifacts, onPick }) => {
  const [filter, setFilter] = React.useState('all');
  const [q, setQ] = React.useState('');
  const [serverArtifacts, setServerArtifacts] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [insertingId, setInsertingId] = React.useState(null);

  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ kind: 'block' });
      if (q) params.set('search', q);
      const r = await fetch('/api/artifacts?' + params.toString());
      if (r.ok) {
        const j = await r.json();
        setServerArtifacts(Array.isArray(j.artifacts) ? j.artifacts : []);
      }
    } catch (e) { console.warn('gallery load:', e); }
    finally { setLoading(false); }
  }, [q]);

  React.useEffect(() => { reload(); }, [reload]);

  // Маппим серверные артефакты в формат прототипа (для фильтра/тегов)
  const liveItems = serverArtifacts.map(a => ({
    id: a.id,
    type: a.kind === 'block' ? 'block' : a.kind,
    kind: a.blockType ? a.blockType : a.kind,
    title: a.name,
    body: a.description || '',
    tags: a.tags ? a.tags.split(',').map(s => s.trim()).filter(Boolean) : [],
    savedAt: a.createdAt ? new Date(a.createdAt).toLocaleDateString('ru-RU', { day:'numeric', month:'short' }) : '',
    usedIn: [],
    sourceProjectId: a.sourceProjectId,
    blockLayer: a.blockLayer,
  }));

  // Объединяем с прототипными (если есть статические демо-артефакты — они идут после реальных).
  const merged = [...liveItems, ...(artifacts || []).map(a => ({ ...a, _isMock: true }))];

  const types = ['all','block','subschema','map','tz','wiki'];
  const typeLabels = { all:'всё', block:'блоки', subschema:'подсхемы', map:'карты', tz:'ТЗ', wiki:'вики' };

  let items = merged;
  if (filter !== 'all') items = items.filter(a => a.type === filter);
  if (q) {
    items = items.filter(a => ((a.title||'') + ' ' + (a.body||'') + ' ' + (a.tags||[]).join(' '))
      .toLowerCase().includes(q.toLowerCase()));
  }

  const insertArtifact = async (a, e) => {
    if (e) e.stopPropagation();
    if (a._isMock) {
      // Прототипные демо-артефакты — оставляем старое поведение
      if (onPick) onPick(a);
      return;
    }
    if (!window.SimaAPI || !window.SIMA_REMIX_PROJECT_ID) {
      alert('Не удалось определить проект для вставки.');
      return;
    }
    setInsertingId(a.id);
    try {
      const r = await fetch('/api/artifacts/' + encodeURIComponent(a.id) + '/insert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: window.SIMA_REMIX_PROJECT_ID,
          positionX: 100 + Math.random() * 200,
          positionY: 100 + Math.random() * 200,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        alert(err.error || 'Не удалось вставить');
        return;
      }
      // Перегружаем iframe — артефакт появится на схеме как блок
      if (window.SimaAPI && window.SimaAPI.reload) window.SimaAPI.reload();
    } catch (err) {
      alert('Ошибка сети');
    } finally {
      setInsertingId(null);
    }
  };

  const deleteArtifact = async (a, e) => {
    if (e) e.stopPropagation();
    if (a._isMock) return;
    if (!window.confirm('Удалить артефакт «' + a.title + '» из библиотеки?')) return;
    try {
      await fetch('/api/artifacts?id=' + encodeURIComponent(a.id), { method: 'DELETE' });
      setServerArtifacts(prev => prev.filter(x => x.id !== a.id));
    } catch (err) { alert('Ошибка сети'); }
  };

  return (
    <div style={{maxWidth:1200,margin:'0 auto'}}>
      <div className="gal-head">
        <div>
          <h2 style={{margin:0,fontFamily:'var(--font-serif)',fontSize:22,fontWeight:500,letterSpacing:'-0.01em'}}>Галерея артефактов</h2>
          <div className="meta">блоки, подсхемы, карты, ТЗ и вики — переиспользуются между проектами</div>
        </div>
        <div className="grow"/>
        <div className="row" style={{gap:6}}>
          <Icon name="search" size={12} color="var(--ink-4)"/>
          <input placeholder="поиск по артефактам, тегам…" value={q} onChange={e=>setQ(e.target.value)}
            style={{border:'0.5px solid var(--line-2)',background:'var(--paper)',borderRadius:6,padding:'6px 10px',fontSize:12,minWidth:220,fontFamily:'inherit'}}/>
          <button className="btn xs ghost" onClick={reload} title="Обновить" data-sima-handled="1">
            <Icon name="refresh" size={11}/>
          </button>
        </div>
      </div>

      <div className="gal-filter">
        {types.map(t => (
          <button key={t} className={`chip ${filter===t?'active':''}`} data-sima-handled="1" onClick={()=>setFilter(t)}>
            {typeLabels[t]} {t!=='all' && <span className="meta">· {merged.filter(a=>a.type===t).length}</span>}
          </button>
        ))}
        <span className="grow"/>
        <span className="meta">{loading ? 'загрузка…' : (liveItems.length + ' в библиотеке')}</span>
      </div>

      <div style={{height:12}}/>

      <div className="gal-grid">
        {items.map(a => (
          <div key={a.id} className="gal-card" data-sima-handled="1" onClick={(e)=>insertArtifact(a, e)}
               style={{position:'relative'}}>
            <div className="gc-t">
              <span className={`gc-type ${a.type}`}>{a.kind || a.type}</span>
              <span className="meta">{a.savedAt}</span>
            </div>
            <h4>{a.title}</h4>
            <div className="gc-body">{a.body}</div>
            {a.tags && a.tags.length > 0 && (
              <div className="gc-tags">
                {a.tags.map(t => <span key={t} className="gc-tag">{t}</span>)}
              </div>
            )}
            <div className="gc-meta">
              <span>{a._isMock ? 'демо-артефакт' : (a.blockLayer ? 'слой: ' + a.blockLayer : 'из библиотеки')}</span>
              <span>
                {insertingId === a.id ? 'вставляю…' : <><Icon name="plus" size={10}/> вставить</>}
                {!a._isMock && (
                  <span style={{marginLeft:8, color:'var(--ink-3,#999)', fontSize:10, cursor:'pointer'}}
                        onClick={(e)=>deleteArtifact(a, e)}>удалить</span>
                )}
              </span>
            </div>
          </div>
        ))}
        {items.length === 0 && !loading && (
          <div style={{gridColumn:'1/-1',textAlign:'center',padding:40,color:'var(--ink-4)',fontSize:12}}>
            Библиотека пустая. Сохраните блок в артефакты с канваса (кнопка «в артефакты» на блоке) — он появится здесь.
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { GalleryV2 });

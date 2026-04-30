// library_view.jsx
function LibraryView({ cubes, onPickCube }) {
  const [filter, setFilter] = React.useState('all');
  const [query, setQuery] = React.useState('');
  const counts = { all: cubes.length };
  cubes.forEach(c => { counts[c.type] = (counts[c.type] || 0) + 1; });

  const filtered = cubes.filter(c => (filter === 'all' || c.type === filter) && (!query || c.title.toLowerCase().includes(query.toLowerCase()) || (c.body||'').toLowerCase().includes(query.toLowerCase())));

  return (
    <div className="canvas-wrap">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',paddingBottom:14,borderBottom:'0.5px solid var(--line-1)',marginBottom:14}}>
        <div>
          <div style={{fontSize:17,fontWeight:500}}>Библиотека</div>
          <div className="meta" style={{marginTop:2}}>{SIMA_DATA.libraryCount.total} кубиков · {SIMA_DATA.libraryCount.links} связей · {SIMA_DATA.libraryCount.canonical} канонических</div>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <input type="text" placeholder="поиск по смыслу" value={query} onChange={e=>setQuery(e.target.value)}
            style={{width:180,fontSize:12,padding:'6px 10px',border:'0.5px solid var(--line-2)',borderRadius:6,background:'var(--paper)',outline:'none'}}/>
        </div>
      </div>

      <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
        {['all','doc','layer','concept','extract','result'].map(t => (
          <button key={t} className={`chip ${filter===t?'active':''}`} onClick={() => setFilter(t)}>
            {t==='all' ? 'все' : typeLabel[t]} · {counts[t] || 0}
          </button>
        ))}
      </div>

      <div className="lib-tiles">
        {filtered.map(c => (
          <div key={c.id} className="node" style={{cursor:'pointer'}} onClick={() => onPickCube(c)}>
            <div className="n-hd">
              <Badge type={c.type} kind={c.kind} />
              <span className="grow"></span>
              <span className="meta" style={{textTransform:'lowercase'}}>{c.maturity === 'canonical' ? '★ канон' : c.maturity === 'verified' ? 'проверен' : 'черновик'}</span>
            </div>
            <div className="n-ttl" style={{marginTop:6}}>{c.title}</div>
            <div className="n-body">{c.body}</div>
            <div className="n-foot">
              <span className="meta">{c.meta}</span>
              <Icon name="arrow" size={11} color="var(--ink-4)"/>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
window.LibraryView = LibraryView;

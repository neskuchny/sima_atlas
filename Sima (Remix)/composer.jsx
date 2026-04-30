// composer.jsx — modal for synthesizing a new project/cube from mixed inputs
function Composer({ open, onClose, cubes, onSynth }) {
  const [intent, setIntent] = React.useState('Собрать концепцию универсального конструктора Сима — с миссией, метриками, задачами');
  const [projType, setProjType] = React.useState('Идея продукта');
  const [source, setSource] = React.useState('library');
  const [picks, setPicks] = React.useState(['doc.memo','con.vibecoding','doc.karpathy','doc.res_survey']);
  const [extra, setExtra] = React.useState('');
  const [autoFetch, setAutoFetch] = React.useState(true);
  const [synthesizing, setSynthesizing] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const projectTypes = ['Идея продукта','Исследование','Регламент','Стратегия','Концепция статьи','Персональная вики'];
  const sources = [
    { id:'library', icon:'library', label:'Библиотека' },
    { id:'voice',   icon:'mic',     label:'Диктовка' },
    { id:'text',    icon:'text',    label:'Текст' },
    { id:'file',    icon:'upload',  label:'Файл' },
    { id:'meet',    icon:'meet',    label:'Meetflow' },
    { id:'link',    icon:'link',    label:'Ссылка' },
  ];

  const togglePick = (id) => setPicks(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const removePick = (id) => setPicks(p => p.filter(x => x !== id));

  const filteredLib = cubes.filter(c => !query || c.title.toLowerCase().includes(query.toLowerCase()) || (c.body||'').toLowerCase().includes(query.toLowerCase()));

  // ─── Реальные операции через SimaAPI (общий origin с parent) ───
  const [synthError, setSynthError] = React.useState(null);
  const [meetings, setMeetings] = React.useState(window.__SIMA_REMIX_MEETINGS || []);
  const fileInputRef = React.useRef(null);

  // Подгружаем встречи при открытии вкладки Meetflow (если их ещё нет в payload)
  React.useEffect(() => {
    if (source === 'meet' && meetings.length === 0 && window.SimaAPI && window.SimaAPI.listMeetings) {
      window.SimaAPI.listMeetings().then(r => {
        if (r && r.ok && r.data && Array.isArray(r.data.meetings)) {
          setMeetings(r.data.meetings);
        }
      });
    }
  }, [source]);

  const doSynth = async () => {
    setSynthError(null);
    setSynthesizing(true);
    try {
      // Если есть extra (вставленный текст) и source='text' — сначала загружаем
      // его как DataSource, чтобы инсайты учли в синтезе.
      if (source === 'text' && extra && extra.trim() && window.SimaAPI) {
        await window.SimaAPI.uploadText('Контекст для синтеза', extra.trim());
      }
      // Основной синтез — собирает блоки/связи из intent + контекста проекта
      if (window.SimaAPI && window.SimaAPI.synthesize) {
        const r = await window.SimaAPI.synthesize(intent, projType);
        if (!r || !r.ok) {
          setSynthError((r && r.data && r.data.error) || 'Не удалось синтезировать');
          setSynthesizing(false);
          return;
        }
        // SimaAPI.synthesize сам делает reload через 250ms — composer не успеет
        // показать «собираю», но это ок: пользователь увидит обновлённый канвас.
      } else {
        // fallback на прототипный onSynth (мок) если SimaAPI не загрузился
        setTimeout(() => {
          setSynthesizing(false);
          onSynth({ intent, projType, picks, extra, autoFetch });
        }, 600);
      }
    } catch (e) {
      console.error('composer doSynth error:', e);
      setSynthError(String(e));
      setSynthesizing(false);
    }
  };

  const onFileChosen = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    if (window.SimaAPI && window.SimaAPI.uploadFiles) {
      await window.SimaAPI.uploadFiles(files);
    }
    if (e.target) e.target.value = '';
  };

  const onImportMeeting = async (meetingId) => {
    if (window.SimaAPI && window.SimaAPI.importMeeting) {
      await window.SimaAPI.importMeeting(meetingId);
    }
  };

  return (
    <div className={`composer ${open ? 'open' : ''}`} onClick={(e) => { if (e.target.classList.contains('composer')) onClose(); }}>
      <div className="composer-card">
        <div className="composer-hd">
          <Icon name="sparkle" size={16} color="var(--orange)"/>
          <div style={{flex:1}}>
            <div style={{fontSize:14,fontWeight:500}}>Синтезировать</div>
            <div className="meta" style={{marginTop:1}}>опишите что хотите получить — Сима соберёт схему из кубиков</div>
          </div>
          <button className="rail-btn" onClick={onClose} style={{width:28,height:28}}><Icon name="close" size={12}/></button>
        </div>

        <div className="composer-bd">
          <div className="composer-input">
            <div>
              <div className="meta" style={{marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>намерение</div>
              <textarea className="intent-input" rows="3" value={intent} onChange={e=>setIntent(e.target.value)}/>
              <div style={{display:'flex',gap:8,marginTop:8,alignItems:'center',flexWrap:'wrap'}}>
                <span className="meta">тип проекта:</span>
                {projectTypes.map(t => (
                  <button key={t} className={`chip ${projType===t?'active':''}`} onClick={()=>setProjType(t)}>{t}</button>
                ))}
              </div>
            </div>

            <div>
              <div className="meta" style={{marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em'}}>контекст</div>
              <div className="source-tab" style={{marginBottom:10}}>
                {sources.map(s => (
                  <button key={s.id} className={source===s.id?'on':''} onClick={()=>setSource(s.id)}>
                    <Icon name={s.icon} size={11}/> {s.label}
                  </button>
                ))}
              </div>

              {source === 'library' && (
                <div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:8}}>
                    {picks.map(id => {
                      const c = cubes.find(x => x.id === id); if (!c) return null;
                      return (
                        <span key={id} className="picked">
                          <Dot type={c.type}/> {c.title}
                          <span className="x" onClick={()=>removePick(id)}><Icon name="close" size={9}/></span>
                        </span>
                      );
                    })}
                    {picks.length === 0 && <span className="hint">перетащите или выберите кубики справа</span>}
                  </div>
                </div>
              )}

              {source === 'voice' && (
                <div className="drop-area">
                  <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
                    <div style={{width:32,height:32,borderRadius:'50%',background:'var(--orange-bg)',color:'var(--orange-ink)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                      <Icon name="mic" size={14}/>
                    </div>
                    <div style={{textAlign:'left'}}>
                      <div style={{fontSize:12,color:'var(--ink-1)',fontWeight:500}}>Говорите — Сима расшифрует и добавит в кубик</div>
                      <div className="meta">нажмите чтобы начать запись · русский язык</div>
                    </div>
                  </div>
                </div>
              )}
              {source === 'text' && (
                <textarea className="intent-input" rows="4" placeholder="вставьте текст — Сима разобьёт на смысловые атомы" value={extra} onChange={e=>setExtra(e.target.value)}/>
              )}
              {source === 'file' && (
                <div>
                  <div className="drop-area" onClick={()=>fileInputRef.current && fileInputRef.current.click()} style={{cursor:'pointer'}}>
                    перетащите .txt/.csv/.json/.md сюда или <u>выберите файл</u>
                  </div>
                  <input ref={fileInputRef} type="file" multiple
                    accept=".txt,.csv,.json,.md,.markdown,.tsv"
                    onChange={onFileChosen} style={{display:'none'}}/>
                </div>
              )}
              {source === 'meet' && (
                <div className="drop-area" style={{textAlign:'left'}}>
                  <div className="meta" style={{marginBottom:8}}>встречи · meetflow / tessent · {meetings.length}</div>
                  {meetings.length === 0 && (
                    <div style={{padding:'10px 4px',fontSize:11,color:'var(--ink-3)'}}>
                      Нет доступных встреч. Подключите Supabase в .env, чтобы видеть транскрипты.
                    </div>
                  )}
                  {meetings.map(m => {
                    const dateText = m.date ? String(m.date).split('T')[0] : '';
                    return (
                      <div key={m.id} style={{padding:'7px 9px',background:'var(--paper)',border:'0.5px solid var(--line-2)',borderRadius:5,marginBottom:5,display:'flex',alignItems:'center',gap:8,cursor: m.hasTranscript ? 'pointer' : 'not-allowed',fontSize:11,opacity: m.hasTranscript ? 1 : 0.5}}
                           onClick={() => m.hasTranscript && onImportMeeting(m.id)}>
                        <Icon name="meet" size={11} color="var(--ink-4)"/>
                        <span style={{flex:1,color:'var(--ink-1)'}}>{m.title}</span>
                        <span className="meta">{dateText}</span>
                        <span style={{fontSize:10,padding:'2px 6px',borderRadius:4,
                          background: m.hasTranscript ? 'var(--orange-bg,#fff2e8)' : '#f3f3f3',
                          color: m.hasTranscript ? 'var(--orange-ink,#d97a3a)' : '#999'
                        }}>{m.hasTranscript ? 'импорт' : 'нет транскрипта'}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {source === 'link' && (
                <input type="text" placeholder="https://..." className="intent-input" style={{fontSize:13}}/>
              )}
            </div>

            <div style={{background:'var(--bg-1)',border:'0.5px solid var(--line-2)',borderRadius:6,padding:'10px 12px',display:'flex',alignItems:'center',gap:10}}>
              <Icon name="sparkle" size={12} color="var(--orange)"/>
              <div style={{flex:1,fontSize:11.5,color:'var(--ink-2)'}}>
                <b>Сима может добавить своё:</b> найти релевантные кубики по смыслу, подтянуть связанные решения из встреч, предложить каркас.
              </div>
              <label style={{display:'flex',alignItems:'center',gap:6,fontSize:11,cursor:'pointer'}}>
                <input type="checkbox" checked={autoFetch} onChange={e=>setAutoFetch(e.target.checked)} style={{margin:0}}/>
                разрешить
              </label>
            </div>
          </div>

          <div className="composer-lib">
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:500,color:'var(--ink-2)'}}>Ваши кубики</div>
              <span className="meta">{cubes.length}</span>
            </div>
            <input type="text" placeholder="найти кубик..." value={query} onChange={e=>setQuery(e.target.value)}
              style={{width:'100%',fontSize:11,padding:'6px 9px',border:'0.5px solid var(--line-2)',borderRadius:5,background:'var(--paper)',outline:'none',marginBottom:8}}/>
            <div className="lib-list">
              {filteredLib.map(c => (
                <LibItem key={c.id} cube={c} picked={picks.includes(c.id)} onClick={togglePick} draggable />
              ))}
            </div>
          </div>
        </div>

        <div className="composer-ft">
          <span className="meta">{picks.length} выбрано{autoFetch ? ' · + автоподбор Сима' : ''}</span>
          <span className="grow"></span>
          {synthError && <span className="meta" style={{color:'#c0392b'}}>⚠ {synthError}</span>}
          <span className="meta">Claude · через интерфейс</span>
          <button className="btn ghost sm" onClick={onClose}>Отмена</button>
          <button className="btn pri" data-sima-handled="1" onClick={doSynth} disabled={synthesizing}>
            {synthesizing ? <><Icon name="sparkle" size={11}/> собираю...</> : <><Icon name="sparkle" size={11}/> синтезировать</>}
          </button>
        </div>
      </div>
    </div>
  );
}

window.Composer = Composer;

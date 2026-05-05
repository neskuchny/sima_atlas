// SIMA Atlas — additional views: Composer, Gallery, Library, TZ exporter.
//
// These are the four legacy features ported into the new design style.
// All four operate against `window.SIMA_API.artifacts` (artifact CRUD)
// and `window.SIMA_DATA` (read-only graph payload).
//
// Visual conventions (re-uses existing classes from styles.css):
//   .cmd-bar / .cmd-box  — modal overlay frame (Gallery, TZ export)
//   .pill                 — inline action button
//   .chip / .chips        — tag pills
//   .tab / .tabs          — tab switcher (Composer source-type tabs)
//   .mono                 — JetBrains Mono shortcut
//   .meta                 — secondary text colour
//   var(--st-*)           — status colour variables
//
// Mount points (see index.html):
//   Composer  → topbar view-tabs as 4th tab "Синтезировать"
//   Gallery   → modal opened from CommandBar / topbar pill
//   Library   → modal opened from CommandBar / topbar pill
//   TZ export → DetailPanel addendum (per-block) + modal export dialog

const { useState: useStateV, useEffect: useEffectV, useMemo: useMemoV } = React;

/* ====================== COMPOSER ====================== */
// Multi-source intake: text / file / URL / spoken-meeting transcript.
// The user pastes/uploads content → optionally tags it → publishes as
// an artifact (kind=document or kind=transcript). Artifacts then feed
// the Gallery and TZ generation.

function Composer({ onClose, onPublished, productContext, onBlocksCreated }) {
  const [source, setSource] = useStateV('text');     // text | file | url | meeting
  const [title, setTitle] = useStateV('');
  const [text, setText] = useStateV('');
  const [tags, setTags] = useStateV('');             // comma-separated
  const [busy, setBusy] = useStateV(false);
  const [result, setResult] = useStateV(null);
  const [intent, setIntent] = useStateV('custom');   // K4 — type of thing being modelled
  // Phase M — synthesis post-publish flow
  const [proposals, setProposals] = useStateV([]);
  const [synthBusy, setSynthBusy] = useStateV(false);
  const [accepting, setAccepting] = useStateV({}); // by id → state
  // Phase G — extracted insights (goals / constraints / ideas / risks / terms)
  const [insights, setInsights] = useStateV(null);
  const [insightsBusy, setInsightsBusy] = useStateV(false);
  const [picked, setPicked] = useStateV({}); // key → bool, for "save as artifact" multi-select

  const sources = [
    { id: 'text',    label: 'Текст',     hint: 'паста / заметка' },
    { id: 'meeting', label: 'Встреча',   hint: 'транскрипт' },
    { id: 'file',    label: 'Файл',      hint: '.md / .txt' },
    { id: 'url',     label: 'Ссылка',    hint: 'веб-источник' },
  ];

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const t = await f.text();
    setText(t);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''));
  };

  const publish = async () => {
    if (!title.trim()) { setResult({ ok: false, error: 'Укажите заголовок' }); return; }
    if (!text.trim() && source !== 'url') { setResult({ ok: false, error: 'Контент пуст' }); return; }
    setBusy(true);
    setResult(null);
    setProposals([]);
    const kind = source === 'meeting' ? 'transcript' : source === 'url' ? 'document' : 'document';
    const r = await window.SIMA_API.artifacts.create({
      kind,
      title: title.trim(),
      description: source === 'url' ? text.trim() : '',
      body: text,
      tags: tags.split(',').map(s => s.trim()).filter(Boolean),
    });
    setBusy(false);
    setResult(r);
    if (r.ok) {
      if (onPublished) onPublished(r.artifact);
      // Don't reset text yet — we need it for the synthesis flow.
    }
  };

  // Phase M — ask Sima to propose 1-3 blocks based on the artefact body.
  // K4 — intent biases the system prompt for richer non-product schemas.
  const synthesize = async () => {
    setSynthBusy(true); setProposals([]);
    const r = await window.SIMA_API.synthesis.block({
      source_text: text || (result?.artifact?.description || ''),
      product_context: productContext || null,
      count: 3,
      intent,
    });
    setSynthBusy(false);
    if (r?.ok) setProposals(r.proposals.map((p) => ({ ...p, _mock: r.mock })));
  };

  // Accept a proposal: create the block, then write its mission / kpi /
  // acceptance / depends_on / provides files.
  const accept = async (p) => {
    setAccepting((a) => ({ ...a, [p.id]: 'creating' }));
    const c = await window.SIMA_API.createBlock({
      id: p.id,
      title: p.title,
      layer: p.layer,
      status: 'idea',
    });
    if (!c?.ok) {
      setAccepting((a) => ({ ...a, [p.id]: `failed: ${c?.error || 'create'}` }));
      return;
    }
    setAccepting((a) => ({ ...a, [p.id]: 'writing' }));
    const writeFile = async (file, content) => {
      const r = await window.SIMA_API.synthesis.patchBlockFile(p.id, file, content);
      return r?.ok;
    };
    await writeFile('mission.md',    `# ${p.id} — mission\n\n${p.mission}\n`);
    if (p.kpi.length)        await writeFile('kpi.md',        `# ${p.id} — KPI\n\n${p.kpi.map((k) => `- ${k}`).join('\n')}\n`);
    if (p.acceptance.length) await writeFile('acceptance.md', `# ${p.id} — acceptance\n\n${p.acceptance.map((a, i) => `- [ ] **A${i+1}.** ${a}`).join('\n')}\n`);
    if (p.depends_on_capabilities.length) await writeFile('depends_on.md', `# ${p.id} — depends_on\n\n${p.depends_on_capabilities.map((d) => `- ?: ${d}`).join('\n')}\n`);
    if (p.provides_capabilities.length)   await writeFile('provides.md',   `# ${p.id} — provides\n\n${p.provides_capabilities.map((d) => `- ${d}`).join('\n')}\n`);
    setAccepting((a) => ({ ...a, [p.id]: 'accepted' }));
    setProposals((P) => P.filter((x) => x.id !== p.id));
    if (onBlocksCreated) onBlocksCreated(p);
  };

  const reject = (p) => setProposals((P) => P.filter((x) => x.id !== p.id));

  // Phase G — extract insights from the artefact body. Builds a panel
  // of goals/constraints/ideas/risks/terms that the operator can either
  // turn into separate artifacts or merge as tags on the current one.
  const runExtract = async () => {
    setInsightsBusy(true); setInsights(null); setPicked({});
    const r = await window.SIMA_API.synthesis.extract({
      text: text || (result?.artifact?.description || ''),
      kind: source === 'meeting' ? 'transcript' : source,
    });
    setInsightsBusy(false);
    if (r?.ok) setInsights(r);
  };

  const togglePick = (key) => setPicked((p) => ({ ...p, [key]: !p[key] }));

  const savePickedAsArtifacts = async () => {
    if (!insights) return;
    const buckets = ['goals', 'constraints', 'ideas', 'risks'];
    let created = 0, failed = 0;
    for (const bucket of buckets) {
      for (let i = 0; i < (insights[bucket] || []).length; i++) {
        const k = `${bucket}.${i}`;
        if (!picked[k]) continue;
        const itemText = insights[bucket][i];
        const r = await window.SIMA_API.artifacts.create({
          kind: bucket === 'ideas' ? 'note' : 'document',
          title: itemText.slice(0, 60) + (itemText.length > 60 ? '…' : ''),
          description: `Извлечено из «${title || 'untitled'}»`,
          body: itemText,
          tags: [bucket, ...(insights.terms || []).slice(0, 3)],
          sourceProjectId: result?.artifact?.id,
        });
        if (r?.ok) created++; else failed++;
      }
    }
    setResult({ ok: true, _extracted: { created, failed } });
    setPicked({});
  };

  // Tag suggestions from extracted terms — clicking a chip appends to
  // the tags input.
  const addTagFromTerm = (term) => {
    const cur = tags.split(',').map((s) => s.trim()).filter(Boolean);
    if (cur.includes(term)) return;
    setTags([...cur, term].join(', '));
  };

  return (
    <div className="composer-wrap">
      <div className="composer-inner">
        <div className="composer-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>SIMA · СИНТЕЗАТОР</div>
            <h2 style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 22, margin: '4px 0 4px' }}>
              Положите сюда любой источник — Sima извлечёт смысл
            </h2>
            <div className="meta" style={{ fontSize: 12.5 }}>
              Заметка, транскрипт встречи, файл или ссылка → артефакт, который видят галерея и блоки.
            </div>
          </div>
          {onClose && <button className="pill" onClick={onClose} title="Закрыть">✕</button>}
        </div>

        <div className="tabs" style={{ marginTop: 14 }}>
          {sources.map(s => (
            <button key={s.id} className={source === s.id ? 'active' : ''} onClick={() => setSource(s.id)}>
              {s.label}<span className="ct">{s.hint}</span>
            </button>
          ))}
        </div>

        {/* K4 — intent picker. What kind of thing are we modelling? */}
        <div className="composer-intent">
          <span className="meta" style={{ fontSize: 11.5 }}>Тип:</span>
          {[
            { id: 'product',   label: 'Продукт' },
            { id: 'book',      label: 'Книга' },
            { id: 'idea',      label: 'Идея' },
            { id: 'marketing', label: 'Маркетинг' },
            { id: 'custom',    label: 'Своё' },
          ].map((k) => (
            <button
              key={k.id}
              className={`intent-pill ${intent === k.id ? 'active' : ''}`}
              onClick={() => setIntent(k.id)}
              title={`Sima будет интерпретировать источник как ${k.label.toLowerCase()}`}
            >{k.label}</button>
          ))}
          <span className="meta" style={{ fontSize: 11, marginLeft: 'auto' }}>
            влияет на «Sima предложит блоки»
          </span>
        </div>

        <div className="composer-body">
          <input
            className="composer-input"
            placeholder="Название артефакта"
            value={title}
            onChange={e => setTitle(e.target.value)}
          />

          {source === 'file' && (
            <div className="composer-file">
              <input type="file" accept=".md,.txt,.json,.csv" onChange={onFile} />
              <span className="meta" style={{ fontSize: 11.5 }}>Поддержка: markdown / txt / json / csv</span>
            </div>
          )}

          {source === 'url' && (
            <input
              className="composer-input"
              placeholder="https://example.com/source"
              value={text}
              onChange={e => setText(e.target.value)}
            />
          )}

          {(source === 'text' || source === 'meeting' || source === 'file') && (
            <textarea
              className="composer-textarea"
              placeholder={source === 'meeting'
                ? 'Вставьте транскрипт встречи. Sima найдёт ключевые цели, ограничения, идеи и сохранит как артефакт.'
                : 'Текст / содержимое файла…'}
              value={text}
              onChange={e => setText(e.target.value)}
              rows={12}
            />
          )}

          <input
            className="composer-input"
            placeholder="Теги через запятую — например: продукт, marketing, idea"
            value={tags}
            onChange={e => setTags(e.target.value)}
          />

          <div className="composer-actions">
            <button className="pill primary" onClick={publish} disabled={busy}>
              {busy ? 'Публикую…' : '＋ Опубликовать как артефакт'}
            </button>
            <span className="meta" style={{ fontSize: 11.5 }}>
              Артефакт появится в галерее и сможет быть подцеплен к любому блоку.
            </span>
          </div>

          {result && (
            <div className={`composer-result ${result.ok ? 'ok' : 'fail'}`}>
              {result.ok
                ? <>✓ Опубликовано как <span className="mono">{result.artifact.id}</span> — «{result.artifact.title}»</>
                : <>✗ {result.error}</>}
            </div>
          )}

          {/* Phase M — Sima synthesis */}
          {result?.ok && text && (
            <div className="synthesis-cta">
              <button className="pill primary" onClick={synthesize} disabled={synthBusy}>
                {synthBusy ? '✦ Sima думает…' : '✦ Sima предложит блоки на основе этого'}
              </button>
              <button className="pill" onClick={runExtract} disabled={insightsBusy}>
                {insightsBusy ? '◔ извлекаю…' : '◔ Найти смыслы (goals / risks / ideas)'}
              </button>
              <span className="meta" style={{ fontSize: 11.5 }}>
                Блоки и/или извлечь структурированные insights.
              </span>
            </div>
          )}

          {/* Phase G — extracted insights panel */}
          {insights && (
            <div className="insights-panel">
              {insights.mock && (
                <div className="composer-result fail" style={{ marginBottom: 8 }}>
                  Demo-режим: задайте ANTHROPIC_API_KEY для реального извлечения.
                </div>
              )}
              {insights.summary && (
                <div className="insights-summary">
                  <div className="meta" style={{ fontSize: 10.5, marginBottom: 2 }}>SIMA РЕЗЮМИРУЕТ</div>
                  {insights.summary}
                </div>
              )}
              {insights.terms && insights.terms.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div className="meta" style={{ fontSize: 10.5, marginBottom: 4 }}>ТЕРМИНЫ — клик добавит в теги</div>
                  <div className="chips">
                    {insights.terms.map((t) => (
                      <span
                        key={t}
                        className={`chip clickable ${tags.split(',').map(s=>s.trim()).includes(t) ? 'on' : ''}`}
                        onClick={() => addTagFromTerm(t)}
                      >{t}</span>
                    ))}
                  </div>
                </div>
              )}
              {[
                { k: 'goals', label: 'Цели', icon: '◎' },
                { k: 'constraints', label: 'Ограничения', icon: '⊗' },
                { k: 'ideas', label: 'Идеи', icon: '✦' },
                { k: 'risks', label: 'Риски', icon: '⚠' },
              ].map(({ k, label, icon }) => {
                const items = insights[k] || [];
                if (!items.length) return null;
                return (
                  <div key={k} className="insights-group">
                    <div className="insights-group-head">
                      <span className="mono" style={{ fontSize: 11 }}>{icon} {label.toUpperCase()}</span>
                      <span className="meta" style={{ fontSize: 11 }}>{items.length}</span>
                    </div>
                    <ul className="insights-list">
                      {items.map((it, i) => {
                        const key = `${k}.${i}`;
                        return (
                          <li key={key} className={picked[key] ? 'picked' : ''} onClick={() => togglePick(key)}>
                            <span className="insights-check">{picked[key] ? '☑' : '☐'}</span>
                            <span>{it}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
              {Object.values(picked).some(Boolean) && (
                <div className="insights-actions">
                  <button className="pill primary" onClick={savePickedAsArtifacts}>
                    💾 Сохранить отмеченные как артефакты
                  </button>
                  <span className="meta" style={{ fontSize: 11.5 }}>
                    Каждый отмеченный пункт станет отдельным артефактом
                    (kind=document для goals/constraints/risks, note для ideas).
                  </span>
                </div>
              )}
              {result?._extracted && (
                <div className={`composer-result ${result._extracted.failed ? 'fail' : 'ok'}`} style={{ marginTop: 6 }}>
                  ✓ создано артефактов: {result._extracted.created}
                  {result._extracted.failed > 0 && <>; ошибок: {result._extracted.failed}</>}
                </div>
              )}
            </div>
          )}
          {proposals.length > 0 && (
            <div className="synthesis-list">
              {proposals[0]?._mock && (
                <div className="composer-result fail" style={{ marginBottom: 8 }}>
                  Demo-режим: задайте ANTHROPIC_API_KEY чтобы Sima генерировала реальные предложения.
                </div>
              )}
              {proposals.map((p) => (
                <div key={p.id} className="synth-card">
                  <div className="synth-card-head">
                    <span className="mono" style={{ fontSize: 11 }}>{p.id}</span>
                    <span className="gallery-kind">{p.layer}</span>
                  </div>
                  <div className="synth-title">{p.title}</div>
                  <div className="synth-mission">{p.mission}</div>
                  {p.kpi.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div className="meta" style={{ fontSize: 10.5, marginBottom: 2 }}>KPI</div>
                      <div className="chips">{p.kpi.slice(0, 4).map((k, i) => <span key={i} className="chip">{k}</span>)}</div>
                    </div>
                  )}
                  {p.acceptance.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      <div className="meta" style={{ fontSize: 10.5, marginBottom: 2 }}>ACCEPTANCE</div>
                      <ul className="synth-list-md">
                        {p.acceptance.slice(0, 4).map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>
                  )}
                  {(p.provides_capabilities.length > 0 || p.depends_on_capabilities.length > 0) && (
                    <div className="synth-caps">
                      {p.provides_capabilities.length > 0 && <span><span className="meta">даёт:</span> {p.provides_capabilities.slice(0, 4).join(', ')}</span>}
                      {p.depends_on_capabilities.length > 0 && <span><span className="meta">зависит:</span> {p.depends_on_capabilities.slice(0, 4).join(', ')}</span>}
                    </div>
                  )}
                  {p.rationale && <div className="meta" style={{ fontSize: 11, marginTop: 6 }}>{p.rationale}</div>}
                  <div className="synth-actions">
                    <button className="pill primary" onClick={() => accept(p)} disabled={!!accepting[p.id]}>
                      {accepting[p.id] === 'creating' ? 'создаю…' :
                        accepting[p.id] === 'writing' ? 'пишу файлы…' :
                        accepting[p.id]?.startsWith('failed') ? 'ошибка' :
                        '＋ Принять и создать блок'}
                    </button>
                    <button className="pill" onClick={() => reject(p)} disabled={!!accepting[p.id]}>
                      ✗ Пропустить
                    </button>
                    {accepting[p.id]?.startsWith('failed') && (
                      <span className="meta" style={{ fontSize: 11, color: 'var(--st-fail)' }}>{accepting[p.id]}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ====================== GALLERY ====================== */
// Browse / search / delete / insert artifacts.
// Modal frame: re-uses .cmd-bar / .cmd-box scaffolding for consistent feel.

function Gallery({ onClose, onPick }) {
  const [items, setItems] = useStateV([]);
  const [filter, setFilter] = useStateV('all');     // all | block | tz | document | transcript | note
  const [q, setQ] = useStateV('');
  const [loading, setLoading] = useStateV(true);
  const [selected, setSelected] = useStateV(null);  // artifact id

  const refresh = async () => {
    setLoading(true);
    const r = await window.SIMA_API.artifacts.list({ kind: filter === 'all' ? undefined : filter, search: q || undefined });
    setItems(r?.ok ? r.artifacts : []);
    setLoading(false);
  };
  useEffectV(() => { refresh(); }, [filter]);

  const filtered = useMemoV(() => {
    if (!q) return items;
    const ql = q.toLowerCase();
    return items.filter(a =>
      (a.title || '').toLowerCase().includes(ql) ||
      (a.description || '').toLowerCase().includes(ql) ||
      (a.tags || []).some(t => t.toLowerCase().includes(ql))
    );
  }, [items, q]);

  const onDelete = async (id) => {
    if (!window.confirm('Удалить артефакт?')) return;
    await window.SIMA_API.artifacts.delete(id);
    setItems(I => I.filter(x => x.id !== id));
    if (selected === id) setSelected(null);
  };

  const onInsert = async (a) => {
    const r = await window.SIMA_API.artifacts.insert(a.id, { project_id: 'main' });
    if (r?.ok && onPick) onPick(a);
    if (r?.ok) onClose && onClose();
  };

  const filters = [
    { id: 'all',        label: 'Все' },
    { id: 'block',      label: 'Блоки' },
    { id: 'tz',         label: 'ТЗ' },
    { id: 'document',   label: 'Документы' },
    { id: 'transcript', label: 'Транскрипты' },
    { id: 'map',        label: 'Карты' },
    { id: 'note',       label: 'Заметки' },
  ];

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box gallery-box" onClick={e => e.stopPropagation()}>
        <div className="gallery-head">
          <input
            className="gallery-search"
            placeholder="Поиск по заголовку / тегам / описанию…"
            value={q}
            onChange={e => setQ(e.target.value)}
            autoFocus
          />
          <div className="gallery-filters">
            {filters.map(f => (
              <button key={f.id} className={filter === f.id ? 'active' : ''} onClick={() => setFilter(f.id)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="gallery-grid">
          {loading && <div className="meta" style={{ padding: 14 }}>Загрузка…</div>}
          {!loading && !filtered.length && (
            <div className="meta" style={{ padding: 14 }}>
              Артефакты не найдены. Откройте «Синтезировать» в шапке, чтобы добавить первый.
            </div>
          )}
          {filtered.map(a => (
            <div key={a.id} className={`gallery-card ${selected === a.id ? 'selected' : ''}`} onClick={() => setSelected(a.id === selected ? null : a.id)}>
              <div className="gallery-card-head">
                <span className={`gallery-kind kind-${a.kind}`}>{a.kind}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)' }}>
                  {(a.createdAt || '').slice(0, 10)}
                </span>
              </div>
              <div className="gallery-title">{a.title}</div>
              {a.description && <div className="gallery-desc">{a.description}</div>}
              {a.tags && a.tags.length > 0 && (
                <div className="chips" style={{ marginTop: 6 }}>
                  {a.tags.slice(0, 4).map(t => <span key={t} className="chip">{t}</span>)}
                </div>
              )}
              {selected === a.id && (
                <div className="gallery-actions" onClick={e => e.stopPropagation()}>
                  <button className="pill primary" onClick={() => onInsert(a)}>＋ Подцепить к проекту</button>
                  <button className="pill" onClick={() => onDelete(a.id)} style={{ color: 'var(--st-fail)' }}>✕ Удалить</button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="gallery-foot">
          <span className="meta">{filtered.length} {pluralize(filtered.length, 'артефакт', 'артефакта', 'артефактов')}</span>
          <button className="pill" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

/* ====================== LIBRARY ====================== */
// Saved blocks browser — shows artifacts with kind=block grouped by
// blockType, optionally filtered by current module's layer.

function Library({ data, currentModuleId, onClose, onPick }) {
  const [items, setItems] = useStateV([]);
  const [q, setQ] = useStateV('');
  const [loading, setLoading] = useStateV(true);

  useEffectV(() => {
    (async () => {
      setLoading(true);
      const r = await window.SIMA_API.artifacts.list({ kind: 'block' });
      setItems(r?.ok ? r.artifacts : []);
      setLoading(false);
    })();
  }, []);

  const moduleLayer = currentModuleId ? data.modules.find(m => m.id === currentModuleId)?.layer : null;

  const filtered = useMemoV(() => {
    let out = items;
    if (moduleLayer) out = out.filter(a => !a.blockLayer || a.blockLayer === moduleLayer);
    if (q) {
      const ql = q.toLowerCase();
      out = out.filter(a => (a.title || '').toLowerCase().includes(ql) || (a.tags || []).some(t => t.toLowerCase().includes(ql)));
    }
    return out;
  }, [items, q, moduleLayer]);

  const grouped = useMemoV(() => {
    const m = new Map();
    for (const a of filtered) {
      const k = a.blockType || 'general';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(a);
    }
    return Array.from(m.entries());
  }, [filtered]);

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box library-box" onClick={e => e.stopPropagation()}>
        <div className="library-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>БИБЛИОТЕКА БЛОКОВ</div>
            <h3 style={{ margin: 0, fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 18 }}>
              Готовые блоки, которые можно вставить в проект
              {moduleLayer && <span className="meta" style={{ fontStyle: 'normal', fontSize: 12, marginLeft: 8 }}>· фильтр по слою <span className="mono">{moduleLayer}</span></span>}
            </h3>
          </div>
          <input
            className="gallery-search"
            placeholder="Поиск…"
            value={q}
            onChange={e => setQ(e.target.value)}
            autoFocus
            style={{ maxWidth: 280 }}
          />
        </div>
        <div className="library-body">
          {loading && <div className="meta" style={{ padding: 14 }}>Загрузка…</div>}
          {!loading && !grouped.length && (
            <div className="meta" style={{ padding: 14 }}>
              Сохранённых блоков пока нет. Сохраните любой блок схемы как артефакт — он появится здесь.
            </div>
          )}
          {grouped.map(([type, list]) => (
            <div key={type} className="library-group">
              <div className="library-group-head">
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', letterSpacing: '0.08em' }}>
                  {type.toUpperCase()}
                </span>
                <span className="meta" style={{ fontSize: 11 }}>{list.length}</span>
              </div>
              <div className="library-grid">
                {list.map(a => (
                  <div key={a.id} className="library-card" onClick={() => onPick && onPick(a)}>
                    <div className="library-card-title">{a.title}</div>
                    {a.description && <div className="library-card-desc">{a.description}</div>}
                    {a.tags && (
                      <div className="chips" style={{ marginTop: 6 }}>
                        {a.tags.slice(0, 3).map(t => <span key={t} className="chip">{t}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="gallery-foot">
          <span className="meta">{filtered.length} {pluralize(filtered.length, 'блок', 'блока', 'блоков')}</span>
          <button className="pill" onClick={onClose}>Закрыть</button>
        </div>
      </div>
    </div>
  );
}

/* ====================== TZ EXPORTER ====================== */
// Generate a TZ for the selected block + offer export to coding agents.
// Reads the block's mission/kpi/acceptance/depends_on/provides via the
// existing /atlas/payload endpoint that serves SIMA_BOOTSTRAP, then
// renders a markdown TZ in-place. Save-as-artifact stores it for reuse.

function TZExporter({ data, moduleId, onClose, onSendToAgent, onClaudeAdvice }) {
  const m = data.modules.find(x => x.id === moduleId);
  const tasks = data.tasks[moduleId] || [];
  const [busy, setBusy] = useStateV(false);
  const [saved, setSaved] = useStateV(null);

  const tzMd = useMemoV(() => {
    if (!m) return '';
    const docs = data.moduleDocs?.[moduleId] || {};
    const lines = [
      `# ТЗ: ${m.title}`,
      ``,
      `**Слой:** ${m.layer}  ·  **Статус:** ${m.status}  ·  **Приоритет:** P${m.priority}`,
      ``,
      `## Зачем`,
      docs.why || docs.short || '_не задано_',
      ``,
      `## Логика`,
      docs.logic || '_не задано_',
      ``,
    ];
    if (tasks.length) {
      lines.push('## Декомпозиция');
      for (const t of tasks) {
        lines.push(`- **${t.id}** · ${t.title}${t.note ? ` _(${t.note})_` : ''}`);
      }
      lines.push('');
    }
    const inEdges = data.edges.filter(e => e.to === moduleId);
    const outEdges = data.edges.filter(e => e.from === moduleId);
    if (inEdges.length || outEdges.length) {
      lines.push('## Связи');
      if (inEdges.length) {
        lines.push('### Входящие');
        for (const e of inEdges) {
          const o = data.modules.find(x => x.id === e.from);
          lines.push(`- ← **${o?.title || e.from}** · ${e.kind}${e.label ? ' · ' + e.label : ''}`);
        }
      }
      if (outEdges.length) {
        lines.push('### Исходящие');
        for (const e of outEdges) {
          const o = data.modules.find(x => x.id === e.to);
          lines.push(`- → **${o?.title || e.to}** · ${e.kind}${e.label ? ' · ' + e.label : ''}`);
        }
      }
      lines.push('');
    }
    lines.push('## Приёмка');
    lines.push('Критерии готовности — см. acceptance.md в каталоге блока.');
    return lines.join('\n');
  }, [moduleId]);

  const saveAsArtifact = async () => {
    setBusy(true);
    const r = await window.SIMA_API.artifacts.create({
      kind: 'tz',
      title: `ТЗ: ${m.title}`,
      description: `Сгенерировано из блока ${moduleId}`,
      body: tzMd,
      tags: ['tz', m.layer, moduleId],
      sourceBlockId: moduleId,
    });
    setBusy(false);
    setSaved(r);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(tzMd).then(
      () => setSaved({ ok: true, _copied: true }),
      () => setSaved({ ok: false, error: 'clipboard denied' })
    );
  };

  if (!m) return null;

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box tz-box" onClick={e => e.stopPropagation()}>
        <div className="tz-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>ТЗ · {moduleId}</div>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 19 }}>{m.title}</h3>
          </div>
          <button className="pill" onClick={onClose} title="Закрыть">✕</button>
        </div>

        <div className="tz-body">
          <pre className="tz-preview">{tzMd}</pre>
        </div>

        <div className="tz-actions">
          <div className="tz-actions-row">
            <span className="meta" style={{ fontSize: 11.5 }}>Отправить в агента (с этим ТЗ как контекстом):</span>
            <button className="pill" onClick={() => onSendToAgent && onSendToAgent('claude', m)}>Claude Code</button>
            <button className="pill" onClick={() => onSendToAgent && onSendToAgent('cursor', m)}>Cursor</button>
            <button className="pill" onClick={() => onSendToAgent && onSendToAgent('codex', m)}>Codex</button>
          </div>
          <div className="tz-actions-row">
            <button className="pill" onClick={copyToClipboard}>⧉ Скопировать markdown</button>
            <button className="pill primary" onClick={saveAsArtifact} disabled={busy}>
              {busy ? 'Сохраняю…' : '💾 Сохранить как артефакт'}
            </button>
            {onClaudeAdvice && (
              <button className="pill" onClick={() => onClaudeAdvice(m, {
                kind: 'tz',
                context: { tz_md: tzMd.slice(0, 4000) },
              })}>✨ Sima ужмёт ТЗ</button>
            )}
          </div>
          {saved && (
            <div className={`composer-result ${saved.ok ? 'ok' : 'fail'}`}>
              {saved._copied ? '✓ Скопировано в буфер' : saved.ok
                ? <>✓ Сохранено как <span className="mono">{saved.artifact.id}</span></>
                : <>✗ {saved.error}</>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ====================== SYSTEM DOCS ======================
   Read-only modal that surfaces the auto-generated artefacts living in
   atlas/ — Roadmap, Wiki (mermaid), end-user tutorials. These were
   produced by the existing toolchain (generate_wiki, render_wiki_html,
   rebuild_atlas_roadmap, generate_user_docs); the new design just
   exposes them.
*/
function SystemDocs({ onClose }) {
  const [tab, setTab] = useStateV('roadmap');
  const [content, setContent] = useStateV('');
  const [draft, setDraft] = useStateV('');
  const [editing, setEditing] = useStateV(false);
  const [saveMsg, setSaveMsg] = useStateV(null);
  const [docs, setDocs] = useStateV([]);
  const [openDocFor, setOpenDocFor] = useStateV(null);
  const [docContent, setDocContent] = useStateV('');
  const [meta, setMeta] = useStateV(null);
  // Phase O-4: operator profile tab data
  const [profile, setProfile] = useStateV(null);

  const EDITABLE = new Set(['project.md', 'rules.md', 'tech_stack.md']);
  const tabToFile = (t) => ({
    roadmap: 'roadmap.md', wiki: 'wiki.html', 'wiki-md': 'WIKI.md',
    project: 'project.md', rules: 'rules.md', stack: 'tech_stack.md',
  }[t]);

  useEffectV(() => {
    let alive = true;
    (async () => {
      setContent(''); setDraft(''); setMeta(null); setEditing(false); setSaveMsg(null);
      const file = tabToFile(tab);
      if (file && tab !== 'docs') {
        const r = await window.SIMA_API.meta.get(file);
        if (alive && r?.ok) { setContent(r.content || ''); setDraft(r.content || ''); setMeta(r); }
      } else if (tab === 'docs') {
        const r = await window.SIMA_API.meta.userDocsList();
        if (alive && r?.ok) setDocs(r.docs || []);
      } else if (tab === 'profile') {
        const r = await window.SIMA_API.meta.operatorProfile();
        if (alive && r?.ok) setProfile(r.profile || null);
      }
    })();
    return () => { alive = false; };
  }, [tab]);

  const saveMeta = async () => {
    const file = tabToFile(tab);
    if (!EDITABLE.has(file)) return;
    setSaveMsg(null);
    const r = await window.SIMA_API.meta.save(file, draft);
    if (r?.ok) {
      setContent(draft);
      setEditing(false);
      setSaveMsg({ kind: 'ok', text: `✓ сохранено (${r.bytes} байт)` });
      setTimeout(() => setSaveMsg(null), 2400);
    } else {
      setSaveMsg({ kind: 'fail', text: r?.error || 'save failed' });
    }
  };

  useEffectV(() => {
    let alive = true;
    if (!openDocFor) { setDocContent(''); return; }
    (async () => {
      const r = await window.SIMA_API.meta.userDocGet(openDocFor);
      if (alive) setDocContent(r?.ok ? r.content : `# Не сгенерировано\n\nЗапустите generate_user_docs ${openDocFor}`);
    })();
    return () => { alive = false; };
  }, [openDocFor]);

  const tabs = [
    { id: 'profile',  label: 'Профиль', special: 'profile' },
    { id: 'roadmap',  label: 'Roadmap' },
    { id: 'wiki',     label: 'Wiki (mermaid)' },
    { id: 'wiki-md',  label: 'WIKI.md' },
    { id: 'docs',     label: 'Пользователю' },
    { id: 'project',  label: 'project.md', editable: true },
    { id: 'rules',    label: 'rules.md', editable: true },
    { id: 'stack',    label: 'tech_stack.md', editable: true },
  ];
  const isEditableTab = !!tabs.find((t) => t.id === tab && t.editable);

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box sysdocs-box" onClick={e => e.stopPropagation()}>
        <div className="sysdocs-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>СИСТЕМНЫЕ ДОКИ</div>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 19 }}>
              Авто-генерируемые + редактируемые артефакты Atlas
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {isEditableTab && !editing && content !== null && (
              <button className="pill" onClick={() => setEditing(true)}>✎ Редактировать</button>
            )}
            {isEditableTab && editing && (
              <>
                <button className="pill primary" onClick={saveMeta}>💾 Сохранить</button>
                <button className="pill" onClick={() => { setDraft(content); setEditing(false); setSaveMsg(null); }}>Отмена</button>
              </>
            )}
            <button className="pill" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="tabs sysdocs-tabs">
          {tabs.map(t => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); setOpenDocFor(null); }}>
              {t.label}{t.editable && <span className="ct">✎</span>}
            </button>
          ))}
        </div>
        {saveMsg && (
          <div className={`composer-result ${saveMsg.kind}`} style={{ margin: '8px 18px 0' }}>{saveMsg.text}</div>
        )}
        <div className="sysdocs-body">
          {tab === 'wiki' && (
            content
              ? <iframe className="sysdocs-iframe" srcDoc={content} title="wiki" />
              : <div className="meta" style={{ padding: 14 }}>wiki.html не найден. Запустите node scripts/render_wiki_html.mjs.</div>
          )}
          {(tab === 'roadmap' || tab === 'wiki-md') && (
            content
              ? <pre className="sysdocs-md">{content}</pre>
              : <div className="meta" style={{ padding: 14 }}>файл не найден или пуст</div>
          )}
          {isEditableTab && !editing && (
            content
              ? <pre className="sysdocs-md">{content}</pre>
              : <div className="meta" style={{ padding: 14 }}>пусто</div>
          )}
          {isEditableTab && editing && (
            <textarea className="sysdocs-editor" value={draft} onChange={e => setDraft(e.target.value)} rows={26} />
          )}
          {tab === 'docs' && !openDocFor && (
            <div className="sysdocs-list">
              {!docs.length && <div className="meta" style={{ padding: 14 }}>
                Ещё не сгенерировано. В DetailPanel нажмите «Сгенерировать пользовательский гайд» для блока,
                либо запустите node scripts/generate_user_docs.mjs &lt;block_id&gt;.
              </div>}
              {docs.map(d => (
                <div key={d.block_id} className="sysdocs-list-row" onClick={() => setOpenDocFor(d.block_id)}>
                  <span className="mono" style={{ fontSize: 12 }}>{d.block_id}</span>
                  <span className="meta" style={{ fontSize: 11 }}>{(d.bytes/1024).toFixed(1)} КБ · {String(d.mtime).slice(0, 16).replace('T', ' ')}</span>
                  <span className="meta">→</span>
                </div>
              ))}
            </div>
          )}
          {tab === 'profile' && (
            <div className="profile-body">
              {!profile && <div className="meta" style={{ padding: 14 }}>Профиль не сгенерирован. Запустите node scripts/aggregate_operator_profile.mjs.</div>}
              {profile && (
                <>
                  <div className="acc-counts mono" style={{ marginBottom: 12 }}>
                    <span className="acc-pill">{profile._status || 'ready'}</span>
                    {profile.updated_at && <span className="acc-pill">обновлено {String(profile.updated_at).slice(0, 16).replace('T', ' ')}</span>}
                    <span className="acc-pill">operator: {profile.operator_id || 'default'}</span>
                  </div>
                  {profile._status === 'warming_up' && (
                    <div className="lesson" style={{ marginBottom: 12 }}>
                      Sima пока что собирает данные о тебе. Нужно ещё{' '}
                      <strong>{(profile._min_data?.done_required || 5) - (profile._min_data?.done_transitions || 0)}</strong> done-блоков и{' '}
                      <strong>{(profile._min_data?.invocations_required || 10) - (profile._min_data?.invocations || 0)}</strong> запусков агентов
                      чтобы профиль стал готовым. Сейчас собрано: {profile._preview?.total_traces} LLM-трейсов · {profile._preview?.total_proposals} предложений.
                    </div>
                  )}
                  {Array.isArray(profile.tech_stack_history) && profile.tech_stack_history.length > 0 && (
                    <div className="profile-section">
                      <h3>Стек, который ты обычно используешь</h3>
                      <div className="chips">
                        {profile.tech_stack_history.slice(0, 12).map((t, i) => (
                          <span key={i} className="chip">{t.value || t} {t.count ? <span className="meta">×{t.count}</span> : null}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {Array.isArray(profile.dont_use) && profile.dont_use.length > 0 && (
                    <div className="profile-section">
                      <h3>Don't-use (Sima не предложит)</h3>
                      <div className="chips">
                        {profile.dont_use.slice(0, 12).map((t, i) => (
                          <span key={i} className="chip" style={{ borderColor: 'var(--st-fail)', color: 'var(--st-fail)' }}>
                            ✕ {t.value || t} {t.reason ? <span className="meta">— {t.reason}</span> : null}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {Array.isArray(profile.lesson) && profile.lesson.length > 0 && (
                    <div className="profile-section">
                      <h3>Уроки последних запусков</h3>
                      <ul className="profile-lessons">
                        {profile.lesson.slice(0, 10).map((l, i) => (
                          <li key={i}>
                            {l.summary || l.note || JSON.stringify(l).slice(0, 200)}
                            {l.block && <span className="meta" style={{ fontSize: 10.5, marginLeft: 6 }}>· {l.block}</span>}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="profile-section">
                    <h3>Сырые данные</h3>
                    <pre className="sysdocs-md" style={{ fontSize: 11 }}>{JSON.stringify(profile, null, 2)}</pre>
                  </div>
                  <div className="meta" style={{ fontSize: 11, marginTop: 10, padding: '0 18px' }}>
                    Sima использует этот профиль чтобы биасить «✨ Совет Клода» (graph_overview / gallery) под твои предпочтения.
                  </div>
                </>
              )}
            </div>
          )}
          {tab === 'docs' && openDocFor && (
            <>
              <div className="sysdocs-back-bar">
                <button className="pill" onClick={() => setOpenDocFor(null)}>← список</button>
                <span className="mono" style={{ fontSize: 12 }}>{openDocFor}.md</span>
              </div>
              <pre className="sysdocs-md">{docContent}</pre>
            </>
          )}
        </div>
        {meta && meta.mtime && (
          <div className="sysdocs-foot">
            <span className="meta" style={{ fontSize: 11 }}>обновлено: {String(meta.mtime).slice(0, 16).replace('T', ' ')}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ====================== PROPOSALS ======================
   Modal listing pending proposals (block_update + others) so the operator
   can accept/reject them. Backend endpoints live in atlas_api_server.mjs:
   /atlas/proposals/list (read), /proposals/accept, /proposals/reject.
*/
function ProposalsPanel({ onClose, onAfterAction }) {
  const [items, setItems] = useStateV([]);
  const [loading, setLoading] = useStateV(true);
  const [busy, setBusy] = useStateV({});
  const [reason, setReason] = useStateV('');

  const refresh = async () => {
    setLoading(true);
    const r = await window.SIMA_API.meta.proposalsList();
    setItems(r?.ok ? r.items.filter((i) => !i.resolved && !i.accepted_at && !i.rejected_at) : []);
    setLoading(false);
  };
  useEffectV(() => { refresh(); }, []);

  const act = async (id, kind) => {
    setBusy((b) => ({ ...b, [id]: kind }));
    const r = kind === 'accept'
      ? await window.SIMA_API.meta.proposalAccept(id)
      : await window.SIMA_API.meta.proposalReject(id, reason || 'rejected from UI');
    setBusy((b) => { const c = { ...b }; delete c[id]; return c; });
    if (r?.ok) {
      onAfterAction && onAfterAction(kind, id);
      await refresh();
    }
  };

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box proposals-box" onClick={e => e.stopPropagation()}>
        <div className="sysdocs-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>ПРЕДЛОЖЕНИЯ SIMA</div>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 19 }}>
              {loading ? 'Загрузка…' : `${items.length} в ожидании`}
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="pill" onClick={refresh}>↻ Обновить</button>
            <button className="pill" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="proposals-body">
          {!loading && !items.length && <div className="meta" style={{ padding: 14 }}>
            Нет открытых предложений. Sima добавляет их автоматически на основе chat-distillates,
            sync-check и других процессов.
          </div>}
          {items.map((p) => (
            <div key={p.id} className="proposal-card">
              <div className="proposal-card-head">
                <span className="mono" style={{ fontSize: 10.5 }}>{p.kind}</span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>
                  {p.block_id} · conf {((p.source?.confidence || 0) * 100).toFixed(0)}% · {p.source?.provider}
                </span>
              </div>
              {p.diff_summary && <div style={{ fontSize: 12.5, marginTop: 4 }}>{p.diff_summary}</div>}
              {p.proposed && (
                <pre className="proposal-diff">{
                  Object.entries(p.proposed).map(([k, v]) => `+ ${k}: ${typeof v === 'string' ? v : JSON.stringify(v).slice(0, 140)}`).join('\n')
                }</pre>
              )}
              <div className="proposal-actions">
                <button className="pill primary" disabled={!!busy[p.id]} onClick={() => act(p.id, 'accept')}>
                  {busy[p.id] === 'accept' ? 'применяю…' : '✓ принять'}
                </button>
                <button className="pill" disabled={!!busy[p.id]} onClick={() => act(p.id, 'reject')}>
                  {busy[p.id] === 'reject' ? 'отклоняю…' : '✗ отклонить'}
                </button>
              </div>
            </div>
          ))}
        </div>
        {items.length > 0 && (
          <div className="sysdocs-foot">
            <input
              className="composer-input"
              placeholder="Причина отклонения (по умолчанию)"
              value={reason}
              onChange={e => setReason(e.target.value)}
              style={{ maxWidth: 360 }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ====================== SCHEMA TEMPLATES (Phase F-5) ======================
   Pre-baked schemas (book / idea / marketing / product) — pick one,
   choose a prefix, click Apply → backend creates all blocks + edges
   atomically. Used to bootstrap a new product / project quickly.
*/
function TemplatesPanel({ onClose, onApplied }) {
  const [items, setItems] = useStateV([]);
  const [loading, setLoading] = useStateV(true);
  const [picked, setPicked] = useStateV(null);
  const [prefix, setPrefix] = useStateV('');
  const [busy, setBusy] = useStateV(false);
  const [result, setResult] = useStateV(null);
  // K3 — snapshot current graph as new template
  const [snapMode, setSnapMode] = useStateV(false);
  const [snapId, setSnapId] = useStateV('');
  const [snapTitle, setSnapTitle] = useStateV('');
  const [snapDesc, setSnapDesc] = useStateV('');
  const [snapBusy, setSnapBusy] = useStateV(false);
  const [snapResult, setSnapResult] = useStateV(null);

  const refresh = async () => {
    const r = await window.SIMA_API.templates.list();
    if (r?.ok) setItems(r.templates || []);
  };
  const doSnapshot = async () => {
    if (!snapId.trim()) { setSnapResult({ ok: false, error: 'укажите id' }); return; }
    setSnapBusy(true); setSnapResult(null);
    const r = await window.SIMA_API.templates.snapshot({
      template_id: snapId.trim(),
      title: snapTitle.trim() || snapId.trim(),
      description: snapDesc.trim() || undefined,
      overwrite: snapResult?.error?.includes('exists') ? true : undefined,
    });
    setSnapBusy(false);
    setSnapResult(r);
    if (r?.ok) {
      await refresh();
      setSnapMode(false); setSnapId(''); setSnapTitle(''); setSnapDesc('');
    }
  };

  useEffectV(() => {
    let alive = true;
    (async () => {
      await refresh();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
    // eslint-disable-next-line
  }, []);

  const apply = async () => {
    if (!picked) return;
    setBusy(true); setResult(null);
    const r = await window.SIMA_API.templates.apply(picked.id, prefix.trim() || picked.id);
    setBusy(false);
    setResult(r);
    if (r?.ok && onApplied) onApplied(r);
  };

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box templates-box" onClick={e => e.stopPropagation()}>
        <div className="sysdocs-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>ШАБЛОНЫ СХЕМ</div>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 19 }}>
              Готовые скелеты — или сохрани свой граф как шаблон
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="pill" onClick={() => setSnapMode((s) => !s)} title="Сохранить весь текущий граф как новый шаблон">
              {snapMode ? '✕ Отмена' : '＋ Снимок графа'}
            </button>
            <button className="pill" onClick={onClose}>✕</button>
          </div>
        </div>
        {snapMode && (
          <div className="snap-form">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                className="composer-input"
                placeholder="id шаблона (a-z0-9-)"
                value={snapId}
                onChange={(e) => setSnapId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                style={{ maxWidth: 220 }}
              />
              <input
                className="composer-input"
                placeholder="Название (видно в галерее шаблонов)"
                value={snapTitle}
                onChange={(e) => setSnapTitle(e.target.value)}
                style={{ flex: 1, minWidth: 220 }}
              />
            </div>
            <input
              className="composer-input"
              placeholder="Краткое описание — что это за шаблон, для чего"
              value={snapDesc}
              onChange={(e) => setSnapDesc(e.target.value)}
            />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="pill primary" onClick={doSnapshot} disabled={snapBusy || !snapId.trim()}>
                {snapBusy ? 'снимаю…' : '💾 Сохранить как шаблон'}
              </button>
              <span className="meta" style={{ fontSize: 11.5 }}>
                Считает все живые блоки текущего графа + их mission/kpi/acceptance + связи.
              </span>
              {snapResult && (
                <span className={`composer-result ${snapResult.ok ? 'ok' : 'fail'}`} style={{ padding: '4px 10px' }}>
                  {snapResult.ok
                    ? <>✓ создано: {snapResult.blocks_count} блоков, {snapResult.edges_count} связей</>
                    : <>✗ {snapResult.error}{snapResult.error?.includes('exists') ? ' (нажмите ещё раз чтобы перезаписать)' : ''}</>}
                </span>
              )}
            </div>
          </div>
        )}
        <div className="templates-body">
          {loading && <div className="meta" style={{ padding: 14 }}>Загрузка…</div>}
          {!loading && !items.length && <div className="meta" style={{ padding: 14 }}>
            Шаблоны не найдены. Положите JSON-файлы в atlas/schema_templates/.
          </div>}
          {!loading && items.map((t) => (
            <div
              key={t.id}
              className={`template-card ${picked?.id === t.id ? 'picked' : ''}`}
              onClick={() => setPicked(t)}
            >
              <div className="template-card-head">
                <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{t.id}</span>
                <span className="meta" style={{ fontSize: 11 }}>{t.blocks_count} блоков</span>
              </div>
              <div className="template-title">{t.title}</div>
              <div className="template-desc">{t.description}</div>
            </div>
          ))}
        </div>
        {picked && (
          <div className="templates-foot">
            <span className="meta" style={{ fontSize: 12 }}>Префикс ID:</span>
            <input
              className="composer-input"
              placeholder={picked.id}
              value={prefix}
              onChange={(e) => setPrefix(e.target.value.replace(/[^a-z0-9-]/g, ''))}
              style={{ maxWidth: 180 }}
            />
            <span className="meta mono" style={{ fontSize: 10.5 }}>
              блоки получат id b.{(prefix || picked.id)}-&lt;suffix&gt;
            </span>
            <button className="pill primary" onClick={apply} disabled={busy}>
              {busy ? 'применяю…' : '＋ Применить шаблон'}
            </button>
            {result && (
              <span className={`composer-result ${result.ok ? 'ok' : 'fail'}`} style={{ padding: '4px 10px' }}>
                {result.ok
                  ? <>✓ создано {result.created.length}{result.skipped.length ? `, пропущено ${result.skipped.length}` : ''}</>
                  : <>✗ {result.error}</>}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ====================== SYNC REPORT (Phase O-1) ======================
   Replaces the editorial «1 рассинхрон» mock animation with a real
   structured drift report: each block classified ✓ ok / ⚠ drift /
   ✗ broken with the actual reason, plus per-validator pass/fail.
   Combines schema-syncer (deterministic validators) + verifier --all
   (LLM-judge mission vs reality).
*/
function SyncReportPanel({ onClose, onJumpToBlock, autoVerifier = false }) {
  const [busy, setBusy] = useStateV(false);
  const [withVerifier, setWithVerifier] = useStateV(autoVerifier);
  const [report, setReport] = useStateV(null);     // schema-syncer result
  const [verifier, setVerifier] = useStateV(null); // verifier --all result
  const [tab, setTab] = useStateV('overview');     // overview | validators | blocks
  const [error, setError] = useStateV(null);

  const run = async () => {
    setBusy(true); setError(null); setReport(null); setVerifier(null);
    try {
      const r1 = await window.SIMA_API.meta.subagentRun('schema-syncer');
      setReport(r1.result || r1);
      if (withVerifier) {
        const r2 = await window.SIMA_API.meta.subagentRun('verifier');
        setVerifier(r2.result || r2);
      }
    } catch (e) {
      setError(String(e.message || e));
    }
    setBusy(false);
  };

  // Phase P-2.2: when invoked from «Ревью продукта», auto-run on mount
  // with LLM-judge already on. The flag pre-checked from the prop;
  // we kick off `run` as soon as the modal mounts.
  useEffectV(() => {
    if (autoVerifier) run();
    // eslint-disable-next-line
  }, []);

  // Combined per-block status: deterministic verdict from schema-syncer
  // (drift_blocks / broken_blocks lists), enriched with LLM-judge verdict
  // from verifier when available.
  const combined = (() => {
    if (!report) return null;
    const broken = new Set((report.broken_blocks || []).map((b) => b.block_id));
    const drift  = new Set((report.drift_blocks  || []).map((b) => b.block_id));
    const reasons = {};
    for (const b of (report.broken_blocks || [])) reasons[b.block_id] = { kind: 'broken', reason: b.reason };
    for (const b of (report.drift_blocks  || [])) reasons[b.block_id] = { kind: 'drift',  reason: b.reason };
    const llmByBlock = {};
    if (verifier?.blocks) {
      for (const v of verifier.blocks) {
        llmByBlock[v.block_id] = {
          verdict: v.verdict,
          summary: v.validation?.summary || '',
          violations: v.validation?.violations || [],
        };
        // Promote LLM-only finds: if not flagged by deterministic but LLM says broken/drift
        if (v.verdict === 'broken' && !broken.has(v.block_id)) {
          broken.add(v.block_id);
          reasons[v.block_id] = { kind: 'broken', reason: 'LLM: ' + (v.validation?.summary || 'mission mismatch') };
        } else if (v.verdict === 'drift' && !drift.has(v.block_id) && !broken.has(v.block_id)) {
          drift.add(v.block_id);
          reasons[v.block_id] = { kind: 'drift', reason: 'LLM: ' + (v.validation?.summary || 'partial alignment') };
        }
      }
    }
    return { broken: [...broken], drift: [...drift], reasons, llm: llmByBlock };
  })();

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box sync-report-box" onClick={(e) => e.stopPropagation()}>
        <div className="sysdocs-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>SYNC REPORT</div>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 19 }}>
              Что синхронно, что в дрейфе, что сломано
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <label className="meta" style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 4 }}>
              <input type="checkbox" checked={withVerifier} onChange={(e) => setWithVerifier(e.target.checked)} />
              + LLM-судья (медленнее)
            </label>
            <button className="pill primary" onClick={run} disabled={busy}>{busy ? 'считаю…' : '▶ запустить'}</button>
            <button className="pill" onClick={onClose}>✕</button>
          </div>
        </div>
        {error && <div className="composer-result fail" style={{ margin: '8px 18px 0' }}>{error}</div>}
        {!report && !busy && (
          <div className="meta" style={{ padding: '20px 18px', fontSize: 13 }}>
            Нажмите <strong>▶ запустить</strong> чтобы Sima прогнала 9 валидаторов по всем блокам и собрала
            структурированный drift-report. Включите <strong>LLM-судью</strong> чтобы дополнительно проверить
            совпадение реализации с миссией / KPI / acceptance / условиями каждого блока.
          </div>
        )}
        {busy && <div className="meta" style={{ padding: 14 }}>Прогон валидаторов{withVerifier ? ' + LLM-судьи (может занять 10–60 сек)' : ''}…</div>}
        {report && (
          <>
            <div className="acc-summary" style={{ margin: '14px 18px 0' }}>
              <div className="acc-counts mono">
                <span className="acc-pill ok">✓ ok {report.summary?.ok ?? 0}</span>
                <span className="acc-pill" style={{ background: 'rgba(220, 150, 60, 0.18)', color: '#7a4a00' }}>⚠ drift {combined?.drift.length ?? 0}</span>
                <span className="acc-pill bad">✗ broken {combined?.broken.length ?? 0}</span>
                <span className="acc-pill mono">валидаторы {report.summary?.validators_pass}/{report.summary?.validators_total}</span>
                <span className="acc-pill mono">{report.duration_ms}ms</span>
              </div>
            </div>
            <div className="tabs" style={{ padding: '12px 18px 0' }}>
              <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>Обзор</button>
              <button className={tab === 'blocks' ? 'active' : ''} onClick={() => setTab('blocks')}>По блокам</button>
              <button className={tab === 'validators' ? 'active' : ''} onClick={() => setTab('validators')}>Валидаторы</button>
            </div>
            <div className="sync-report-body">
              {tab === 'overview' && (
                <>
                  {combined?.broken.length === 0 && combined?.drift.length === 0 && (
                    <div className="lesson good" style={{ marginTop: 0 }}>
                      <div className="verdict">✓ всё синхронно</div>
                      Все {report.summary?.total_blocks} блоков прошли проверки.
                      {!withVerifier && ' Включите LLM-судью чтобы дополнительно проверить смысл (миссия vs реализация).'}
                    </div>
                  )}
                  {combined?.broken.length > 0 && (
                    <>
                      <h3 style={{ color: 'var(--st-fail)' }}>✗ Сломанные ({combined.broken.length})</h3>
                      {combined.broken.map((bid) => (
                        <div key={bid} className="sync-block-row v-bad" onClick={() => onJumpToBlock?.(bid)}>
                          <span className="mono" style={{ flex: 1 }}>{bid}</span>
                          <span className="meta" style={{ fontSize: 11.5 }}>{combined.reasons[bid]?.reason}</span>
                        </div>
                      ))}
                    </>
                  )}
                  {combined?.drift.length > 0 && (
                    <>
                      <h3 style={{ color: '#7a4a00' }}>⚠ Дрейф ({combined.drift.length})</h3>
                      {combined.drift.map((bid) => (
                        <div key={bid} className="sync-block-row v-warn" onClick={() => onJumpToBlock?.(bid)}>
                          <span className="mono" style={{ flex: 1 }}>{bid}</span>
                          <span className="meta" style={{ fontSize: 11.5 }}>{combined.reasons[bid]?.reason}</span>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )}
              {tab === 'blocks' && (
                <>
                  {!verifier && (
                    <div className="meta" style={{ marginBottom: 10 }}>
                      Включите «+ LLM-судья» чтобы получить здесь mission-vs-реализация по каждому блоку.
                    </div>
                  )}
                  {verifier?.blocks?.length > 0 && verifier.blocks.map((b) => {
                    const cls = b.verdict === 'aligned' ? 'ok' : b.verdict === 'broken' ? 'bad' : 'warn';
                    return (
                      <div key={b.block_id} className={`sync-block-card v-${cls}`} onClick={() => onJumpToBlock?.(b.block_id)}>
                        <div className="sync-block-card-head">
                          <span className="mono" style={{ flex: 1 }}>{b.block_id}</span>
                          <span className={`acc-pill ${cls === 'ok' ? 'ok' : cls === 'bad' ? 'bad' : 'skip'}`}>{b.verdict}</span>
                        </div>
                        {b.validation?.summary && <div style={{ fontSize: 12.5, marginTop: 4 }}>{b.validation.summary}</div>}
                        {b.validation?.violations?.length > 0 && (
                          <ul className="sync-violations">
                            {b.validation.violations.slice(0, 5).map((v, i) => (
                              <li key={i}><span className="mono">[{v.kind}]</span> <span style={{ color: v.severity === 'high' ? 'var(--st-fail)' : v.severity === 'med' ? '#7a4a00' : 'var(--ink-3)' }}>{v.evidence}</span></li>
                            ))}
                          </ul>
                        )}
                        {b.acceptance?.verdict && (
                          <div className="meta" style={{ fontSize: 11, marginTop: 4 }}>
                            acceptance: {b.acceptance.verdict}
                            {b.acceptance.counts && ` (${b.acceptance.counts.pass}/${(b.acceptance.counts.pass||0)+(b.acceptance.counts.fail||0)+(b.acceptance.counts.skipped||0)})`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
              {tab === 'validators' && (
                <div className="sync-validators-list">
                  {report.validators.map((v) => (
                    <div key={v.name} className={`sync-block-row v-${v.ok ? 'ok' : 'bad'}`}>
                      <span className="mono" style={{ minWidth: 200 }}>{v.ok ? '✓' : '✗'} {v.name}</span>
                      <span className="meta" style={{ fontSize: 11.5, flex: 1 }}>{v.summary || `exit ${v.exit}`}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ====================== ARCHITECTURE REVIEW (Phase Q-3) ============
   Whole-product architectural review. Per-block N1 catches local
   alignment issues; this surfaces SYSTEMIC concerns: stack consistency
   across blocks, scalability under stated load, multi-tenant fit,
   data-flow gaps, security between blocks, redundant blocks, missing
   blocks. Persisted to atlas/architecture_reviews/_latest.json.
*/
function ArchReviewPanel({ onClose, onJumpToBlock }) {
  const [latest, setLatest] = useStateV(null);
  const [busy, setBusy] = useStateV(false);
  const [error, setError] = useStateV(null);

  const loadLatest = async () => {
    const r = await window.SIMA_API.synthesis.architectureReviewLatest();
    if (r?.ok) setLatest(r);
  };
  useEffectV(() => { loadLatest(); /* eslint-disable-next-line */ }, []);

  const run = async () => {
    setBusy(true); setError(null);
    const r = await window.SIMA_API.synthesis.architectureReview();
    setBusy(false);
    if (!r?.ok) { setError(r?.error || 'failed'); return; }
    setLatest(r);
  };

  const verdictClass = latest?.verdict === 'aligned' ? 'ok' : latest?.verdict === 'broken' ? 'bad' : 'warn';
  const verdictLabel = { aligned: '✓ архитектура целостна', drift: '⚠ есть concerns', broken: '✗ серьёзные проблемы' }[latest?.verdict] || latest?.verdict;

  const KIND_LABEL = {
    stack_consistency: 'Несогласованный стек',
    scalability:       'Масштабируемость',
    multi_tenant:      'Multi-tenant',
    data_flow:         'Поток данных',
    security:          'Безопасность',
    missing_block:     'Не хватает блока',
    redundancy:        'Дублирование',
    condition:         'Условие проекта',
  };

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box arch-review-box" onClick={(e) => e.stopPropagation()}>
        <div className="sysdocs-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>АРХИТЕКТУРА · ВЕСЬ ПРОДУКТ</div>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 19 }}>
              Целостность фреймворков, масштаб, поток данных
            </h3>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="pill primary" onClick={run} disabled={busy}>{busy ? 'анализирую…' : '▶ запустить'}</button>
            <button className="pill" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="sync-report-body">
          {error && <div className="composer-result fail">{error}</div>}
          {!latest && !busy && (
            <div className="meta" style={{ padding: 14, fontSize: 13 }}>
              Sima прочитает <code>project.md</code> + <code>rules.md</code> + <code>tech_stack.md</code> + миссию каждого блока + связи —
              и поднимет system-level concerns: совместимость стэков, масштаб под нагрузку, multi-tenant fit, поток данных, безопасность,
              дубли, недостающие блоки. Это <strong>отдельно от per-block validation</strong> — там локально, тут системно.
            </div>
          )}
          {busy && <div className="meta" style={{ padding: 14 }}>LLM анализирует архитектуру (10–60 сек)…</div>}
          {latest && (
            <>
              <div className={`acc-summary acc-${verdictClass}`}>
                <div className="acc-verdict">{verdictLabel}</div>
                {latest.summary && <div style={{ fontSize: 13, marginTop: 6 }}>{latest.summary}</div>}
                <div className="acc-counts mono" style={{ marginTop: 8 }}>
                  {latest.concerns?.length > 0 && <span className="acc-pill bad">concerns {latest.concerns.length}</span>}
                  {latest.strengths?.length > 0 && <span className="acc-pill ok">strengths {latest.strengths.length}</span>}
                  {latest.block_count && <span className="acc-pill mono">blocks {latest.block_count}</span>}
                  {latest.checked_at && <span className="acc-pill mono">{String(latest.checked_at).slice(0, 16).replace('T', ' ')}</span>}
                  {latest.mock && <span className="acc-pill" style={{ background: 'var(--card-2)' }}>demo</span>}
                </div>
              </div>
              {latest.concerns?.length > 0 && (
                <>
                  <h3>Concerns</h3>
                  <div className="acc-list">
                    {latest.concerns.map((c, i) => (
                      <div key={i} className={`acc-row v-${c.severity === 'high' ? 'fail' : c.severity === 'med' ? 'inconclusive' : 'skipped'}`}>
                        <span className="acc-id mono">{KIND_LABEL[c.kind] || c.kind}</span>
                        <div style={{ flex: 1 }}>
                          <div className="acc-text">{c.evidence}</div>
                          {c.fix && <div className="meta" style={{ fontSize: 11, marginTop: 3 }}>fix: {c.fix}</div>}
                          {c.blocks?.length > 0 && (
                            <div className="meta" style={{ fontSize: 11, marginTop: 3 }}>
                              затрагивает: {c.blocks.map((b) => (
                                <span key={b} className="mono" style={{ cursor: 'pointer', textDecoration: 'underline', marginRight: 4 }} onClick={(e) => { e.stopPropagation(); onJumpToBlock?.(b); }}>{b}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <span className={`val-sev sev-${c.severity || 'low'}`}>{c.severity || 'low'}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {latest.strengths?.length > 0 && (
                <>
                  <h3>Что хорошо</h3>
                  <ul className="val-matches">
                    {latest.strengths.map((s, i) => <li key={i}>✓ {s}</li>)}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ====================== SUBAGENTS (Phase N-3) ======================
   Three Cursor-style subagents callable from one panel:
     schema-syncer — drift report on the whole atlas
     verifier      — acceptance + LLM-validator combined
     wiki-builder  — regenerate WIKI / wiki.html / roadmap / auto_tz
   Same scripts are MCP-callable via sima-atlas server (subagent_*).
*/
function SubagentsPanel({ onClose, currentBlockId }) {
  const [results, setResults] = useStateV({}); // { name: result }
  const [busy, setBusy] = useStateV({});

  const run = async (name, body) => {
    setBusy((b) => ({ ...b, [name]: true }));
    const r = await window.SIMA_API.meta.subagentRun(name, body);
    setBusy((b) => { const c = { ...b }; delete c[name]; return c; });
    setResults((R) => ({ ...R, [name]: r }));
  };

  const renderResult = (name) => {
    const r = results[name];
    if (!r) return null;
    const result = r.result || r;
    return (
      <div className={`composer-result ${r.ok ? 'ok' : 'fail'}`} style={{ marginTop: 8 }}>
        {name === 'schema-syncer' && result.summary && (
          <>
            <strong>{result.summary.ok}/{result.summary.total_blocks}</strong> ok ·
            <strong style={{ color: result.summary.broken ? 'var(--st-fail)' : 'inherit', marginLeft: 6 }}>{result.summary.broken}</strong> broken ·
            <strong style={{ color: result.summary.drift ? 'var(--st-progress)' : 'inherit', marginLeft: 6 }}>{result.summary.drift}</strong> drift ·
            validators {result.summary.validators_pass}/{result.summary.validators_total}
            {result.broken_blocks?.length > 0 && (
              <ul style={{ margin: '6px 0 0 18px', fontSize: 11.5 }}>
                {result.broken_blocks.map((b, i) => <li key={i}>✗ <span className="mono">{b.block_id}</span> — {b.reason}</li>)}
              </ul>
            )}
            {result.drift_blocks?.length > 0 && (
              <ul style={{ margin: '6px 0 0 18px', fontSize: 11.5 }}>
                {result.drift_blocks.map((b, i) => <li key={i}>⚠ <span className="mono">{b.block_id}</span> — {b.reason}</li>)}
              </ul>
            )}
          </>
        )}
        {name === 'verifier' && (result.verdict || result.block_count) && (
          <>
            {result.block_count
              ? <>verifier (all): <strong>{result.aligned}</strong> aligned · <strong>{result.drift}</strong> drift · <strong>{result.broken}</strong> broken / {result.block_count} blocks</>
              : <>{result.block_id}: <strong>{result.verdict}</strong>{result.validation?.summary && ` — ${result.validation.summary}`}</>}
          </>
        )}
        {name === 'wiki-builder' && result.steps && (
          <>
            <strong>{result.steps.filter(s => s.ok).length}/{result.steps.length}</strong> steps in {result.duration_ms}ms
            <ul style={{ margin: '6px 0 0 18px', fontSize: 11 }}>
              {result.steps.map((s, i) => <li key={i}>{s.ok ? '✓' : '✗'} {s.name}</li>)}
            </ul>
          </>
        )}
        {!r.ok && r.error && <div style={{ marginTop: 4 }}>{r.error}</div>}
      </div>
    );
  };

  return (
    <div className="cmd-bar" onClick={onClose}>
      <div className="cmd-box subagents-box" onClick={(e) => e.stopPropagation()}>
        <div className="sysdocs-head">
          <div>
            <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>ПОДАГЕНТЫ</div>
            <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 19 }}>
              Те же скрипты, что подключены к Cursor / MCP — теперь под рукой
            </h3>
          </div>
          <button className="pill" onClick={onClose}>✕</button>
        </div>
        <div className="subagents-body">
          <div className="subagent-card">
            <div className="subagent-card-head">
              <div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>schema-syncer · b.core-sync</div>
                <h4 style={{ margin: '2px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 16 }}>
                  Полный drift-report по всему графу
                </h4>
              </div>
              <button className="pill primary" onClick={() => run('schema-syncer')} disabled={!!busy['schema-syncer']}>
                {busy['schema-syncer'] ? 'идёт…' : '▶ запустить'}
              </button>
            </div>
            <div className="meta" style={{ fontSize: 12, marginTop: 6 }}>
              Прогоняет 9 валидаторов (rules / tech_stack / dependency contracts / acceptance / cursor-hooks / agent parity / parity matrix / placeholders / projects).
              Возвращает разбивку <code>ok / drift / broken</code> с причиной у каждого блока.
            </div>
            {renderResult('schema-syncer')}
          </div>

          <div className="subagent-card">
            <div className="subagent-card-head">
              <div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>verifier · b.acceptance-verifier-loop</div>
                <h4 style={{ margin: '2px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 16 }}>
                  Acceptance + LLM-судья (миссия vs реализация)
                </h4>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {currentBlockId && currentBlockId.startsWith('b.') && (
                  <button className="pill" onClick={() => run('verifier', { block_id: currentBlockId })} disabled={!!busy['verifier']}>
                    {busy['verifier'] ? 'идёт…' : `▶ ${currentBlockId}`}
                  </button>
                )}
                <button className="pill primary" onClick={() => run('verifier')} disabled={!!busy['verifier']}>
                  {busy['verifier'] ? 'идёт…' : '▶ все блоки'}
                </button>
              </div>
            </div>
            <div className="meta" style={{ fontSize: 12, marginTop: 6 }}>
              Запускает <code>verify_block_acceptance.mjs</code> + <code>validateBlock</code> LLM-судью, мерджит в один verdict
              <code>aligned / drift / broken</code>.
            </div>
            {renderResult('verifier')}
          </div>

          <div className="subagent-card">
            <div className="subagent-card-head">
              <div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>wiki-builder · b.docs</div>
                <h4 style={{ margin: '2px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 16 }}>
                  Пересобрать WIKI / wiki.html / roadmap / auto_tz
                </h4>
              </div>
              <button className="pill primary" onClick={() => run('wiki-builder')} disabled={!!busy['wiki-builder']}>
                {busy['wiki-builder'] ? 'идёт…' : '▶ пересобрать'}
              </button>
            </div>
            <div className="meta" style={{ fontSize: 12, marginTop: 6 }}>
              Идемпотентно — безопасно вызывать после каждой правки блока.
            </div>
            {renderResult('wiki-builder')}
          </div>
        </div>
        <div className="sysdocs-foot">
          <span className="meta" style={{ fontSize: 11 }}>
            Те же подагенты доступны Cursor через <code>.cursor/agents.json</code> и MCP-клиентам как <code>subagent_*</code> tools.
          </span>
        </div>
      </div>
    </div>
  );
}

/* ====================== HELPERS ====================== */
function pluralize(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

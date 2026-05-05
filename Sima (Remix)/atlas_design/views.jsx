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
  const synthesize = async () => {
    setSynthBusy(true); setProposals([]);
    const r = await window.SIMA_API.synthesis.block({
      source_text: text || (result?.artifact?.description || ''),
      product_context: productContext || null,
      count: 3,
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

function TZExporter({ data, moduleId, onClose, onSendToAgent }) {
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

  useEffectV(() => {
    let alive = true;
    (async () => {
      const r = await window.SIMA_API.templates.list();
      if (alive && r?.ok) setItems(r.templates || []);
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
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
              Готовые скелеты — продукт, книга, идея, маркетинг
            </h3>
          </div>
          <button className="pill" onClick={onClose}>✕</button>
        </div>
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

/* ====================== HELPERS ====================== */
function pluralize(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

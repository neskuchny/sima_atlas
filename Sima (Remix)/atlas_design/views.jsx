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

function Composer({ onClose, onPublished }) {
  const [source, setSource] = useStateV('text');     // text | file | url | meeting
  const [title, setTitle] = useStateV('');
  const [text, setText] = useStateV('');
  const [tags, setTags] = useStateV('');             // comma-separated
  const [busy, setBusy] = useStateV(false);
  const [result, setResult] = useStateV(null);

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
      // Reset for next intake
      setText(''); setTitle(''); setTags('');
    }
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

/* ====================== HELPERS ====================== */
function pluralize(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

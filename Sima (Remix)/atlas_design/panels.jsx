// SIMA Atlas — left rail, detail panel, dock (terminal + roadmap), layered 3D, sync banner
const { useState: useState2, useEffect: useEffect2, useMemo: useMemo2 } = React;

/* ====================== LEFT RAIL ====================== */
function ContextRail({ data, onClose, onUpdateField, onOpenDocs }) {
  const p = data.product;
  // R-7.31 — editOnClick: single-click активирует edit (раньше нужен был
  // double-click, оператор не догадывался). Для structured данных
  // (KPI / Условия / стек) — кнопка ✎ ведёт в 📖 Доки (там лежит
  // первичный источник: project.md / tech_stack.md).
  const editPencil = (label) => onOpenDocs ? (
    <button className="rail-edit" onClick={(e) => { e.stopPropagation(); onOpenDocs(); }} title={`Редактировать ${label} в 📖 Доки`}>✎</button>
  ) : null;
  return (
    <aside className="rail">
      {onClose && <button className="rail-collapse" onClick={onClose} title="Свернуть">◀</button>}
      <h2>Контекст продукта</h2>
      <div className="product-card">
        <div className="codename">{p.codename}</div>
        <div className="name serif">
          {onUpdateField ? <EditableText editOnClick value={p.title} onChange={(v) => onUpdateField('title', v)} /> : p.title}
        </div>
        <div className="sub">
          {onUpdateField ? <EditableText editOnClick value={p.subtitle} onChange={(v) => onUpdateField('subtitle', v)} multiline /> : p.subtitle}
        </div>
      </div>

      <div className="field italic">
        <div className="lbl">Цель <span className="tag">@goal</span></div>
        <div className="val">
          {onUpdateField ? <EditableText editOnClick value={p.goal} onChange={(v) => onUpdateField('goal', v)} multiline /> : p.goal}
        </div>
      </div>

      <div className="field italic">
        <div className="lbl">Миссия <span className="tag">@mission</span></div>
        <div className="val">
          {onUpdateField ? <EditableText editOnClick value={p.mission} onChange={(v) => onUpdateField('mission', v)} multiline /> : p.mission}
        </div>
      </div>

      <div className="field">
        <div className="lbl">Качество / KPI <span className="tag">@quality</span>{editPencil('KPI (project.md)')}</div>
        {p.quality.map(q => (
          <div key={q.code} className="kpi-row">
            <span className="code">{q.code}</span>
            <span className="lbl2">{q.label}</span>
          </div>
        ))}
        {!p.quality.length && <div className="meta" style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>Заполни в 📖 Доки → project.md</div>}
      </div>

      <div className="field">
        <div className="lbl">Условия / стек <span className="tag">@conditions</span>{editPencil('стек (tech_stack.md)')}</div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginBottom: 4, letterSpacing: '0.06em' }}>BACKEND</div>
          <div className="chips">{p.conditions.backend.map(x => <span key={x} className="chip">{x}</span>)}</div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginBottom: 4, letterSpacing: '0.06em' }}>FRONTEND</div>
          <div className="chips">{p.conditions.frontend.map(x => <span key={x} className="chip">{x}</span>)}</div>
        </div>
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginBottom: 4, letterSpacing: '0.06em' }}>ЛОГИКА</div>
          <div className="chips">{p.conditions.logic.map(x => <span key={x} className="chip">{x}</span>)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginBottom: 4, letterSpacing: '0.06em' }}>ПРОВЕРКИ</div>
          <div className="chips">{p.conditions.checks.map(x => <span key={x} className="chip">{x}</span>)}</div>
        </div>
      </div>
    </aside>
  );
}

/* ====================== DETAIL PANEL ====================== */
function DetailPanel({ data, modules: liveModules, moduleId, onClose, desyncResolved, onSendToAgent, onDrillDown, onOpenTz, onClaudeAdvice, onAddEdge }) {
  const [tab, setTab] = useState2('overview');
  useEffect2(() => { setTab('overview'); }, [moduleId]);

  if (!moduleId) {
    return (
      <aside className="detail">
        <div className="dhead">
          <div className="layer-tag mono">no-selection</div>
          <h1>Выберите модуль</h1>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>
            Кликните на узел в схеме — здесь появится описание, KPI, задачи, логика и история решений. Через эту панель агенты (Claude Code, Cursor, Codex) получают контекст именно нужного блока.
          </div>
        </div>
      </aside>
    );
  }

  // Phase R-7.5 — prefer App's optimistic modules state (which includes
  // freshly-created blocks before the server payload caught up) over
  // data.modules (snapshot from last fetchLive). Without this, DetailPanel
  // silently returned null right after createBlock if refresh() hadn't
  // re-fetched yet — the panel container appeared but had no contents.
  const fromLive = (liveModules || []).find(x => x.id === moduleId);
  const fromPayload = (data?.modules || []).find(x => x.id === moduleId);
  const m = fromLive || fromPayload;
  if (!m) {
    // Block id is selected but neither source has it. Show a friendly
    // placeholder instead of `return null` — that previously hid the
    // panel completely and confused the operator.
    return (
      <aside className="detail">
        <div className="dhead">
          <div className="layer-tag mono">@{moduleId.replace(/^b\./, '')}</div>
          <h1>{moduleId}</h1>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5, marginTop: 8 }}>
            Блок ещё не подгружен. Возможно, страница не обновилась после создания — нажмите Sync вверху или Ctrl+R.
          </div>
        </div>
      </aside>
    );
  }
  const tasks = data.tasks?.[moduleId] || [];
  const subs = data.submodules?.[moduleId] || [];
  const lessons = (data.lessons || []).filter(l => l.module === moduleId || (m.layer === 'frontend' && l.module === 'frontend'));
  const status = (moduleId === 'metrics' && desyncResolved) ? 'progress' : m.status;

  const tabs = [
    { id: 'overview', label: 'Обзор' },
    { id: 'contract', label: 'Контракт' },
    { id: 'tasks', label: 'Задачи', count: tasks.length },
    { id: 'runs', label: 'Запуски' },
    { id: 'acceptance', label: 'Приёмка' },
    { id: 'validation', label: 'Соответствие' },
    { id: 'files', label: 'Файлы' },
    { id: 'subs', label: 'Подмодули', count: subs.length },
    { id: 'memory', label: 'Память', count: lessons.length },
    { id: 'connections', label: 'Связи' },
  ];

  const inEdges = data.edges.filter(e => e.to === moduleId);
  const outEdges = data.edges.filter(e => e.from === moduleId);
  const moduleById = Object.fromEntries(data.modules.map(x => [x.id, x]));

  return (
    <aside className="detail">
      <div className="dhead">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div className="layer-tag mono">@{m.tag} · layer:{m.layer}</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* R-7.25 — кнопка удаления вынесена из спрятанного context-menu
                в шапку панели (UX: основной way для оператора). hard delete
                с confirm, после ok закрываем панель и обновляем canvas. */}
            <button
              onClick={async () => {
                if (!window.SIMA_API?.deleteBlock) return;
                if (!window.confirm(`Удалить блок ${m.id}? Запись в graph.json и директория atlas/clients/<...>/blocks/${m.id}/ будут удалены. Действие необратимо (но файлы остаются в git-истории).`)) return;
                const r = await window.SIMA_API.deleteBlock(m.id, true /* hard */);
                if (r?.ok) {
                  try { window.dispatchEvent(new CustomEvent('sima-log-push', { detail: { agent: 'SIMA Core', kind: 'ok', msg: `🗑 Удалён блок ${m.id}` } })); } catch {}
                  if (onClose) onClose();
                } else {
                  try { window.dispatchEvent(new CustomEvent('sima-log-push', { detail: { agent: 'SIMA Core', kind: 'fail', msg: `Удаление ${m.id} не удалось: ${r?.error || 'unknown'}` } })); } catch {}
                }
              }}
              title="Удалить блок (hard, с диска)"
              style={{
                background: 'transparent', border: 0, color: 'var(--st-fail, #c33)',
                cursor: 'pointer', fontSize: 14, padding: '0 4px', lineHeight: 1,
              }}
            >🗑</button>
            <button onClick={onClose} style={{
              background: 'transparent', border: 0, color: 'var(--ink-3)',
              cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1,
            }}>✕</button>
          </div>
        </div>
        <h1>
          {/* R-7.32 — заголовок блока редактируется одним кликом.
              Раньше это можно было только через ✎ Руками → mission.md
              или через вкладку Контракт. */}
          {window.SIMA_API?.patchBlock ? (
            <EditableText
              editOnClick
              value={m.title}
              onChange={(v) => { if (v && v !== m.title) window.SIMA_API.patchBlock(m.id, { title: v }); }}
              placeholder="название блока…"
            />
          ) : m.title}
        </h1>
        <div className="meta">
          <span className="status-pill"><span className="dot" style={{ background: `var(--st-${status})` }} />{statusLabel(status)}</span>
          <span className="status-pill mono">P{m.priority}</span>
          <span className="status-pill mono">layer/{m.layer}</span>
          {m.checked && <span className="status-pill">✓ проверено</span>}
        </div>
        {/* Phase R-5 — soft-gate hint. We don't block status transitions,
            but we make missing contract pieces visible upfront so the
            operator sees what's needed before pushing into todo/progress. */}
        {m.contract && Array.isArray(m.contract.missing) && m.contract.missing.length > 0 && (
          <div className="gate-hint" style={{
            marginTop: 8, padding: '6px 9px', borderRadius: 6,
            background: 'var(--ink-bg-soft, rgba(120, 120, 140, 0.08))',
            color: 'var(--ink-3)', fontSize: 12, lineHeight: 1.45,
          }}>
            <strong style={{ color: 'var(--ink-2)' }}>чтобы продвинуть статус — заполни:</strong>{' '}
            {m.contract.missing.map((f) => f.replace(/\.md$/, '')).join(' · ')}
            <span style={{ marginLeft: 6, color: 'var(--ink-4)' }}>
              ({m.contract.filled}/{m.contract.total})
            </span>
          </div>
        )}
      </div>

      <div className="tabs">
        {tabs.map(t => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}{t.count != null && <span className="ct">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="dbody">
        {tab === 'overview' && <Overview m={m} status={status} desyncResolved={desyncResolved} onSendToAgent={onSendToAgent} onDrillDown={onDrillDown} hasSubsystem={!!data.subsystems?.[m.id]} onOpenTz={onOpenTz} onClaudeAdvice={onClaudeAdvice} />}
        {tab === 'contract' && <ContractSection moduleId={moduleId} layer={m.layer} />}
        {tab === 'tasks' && <TasksList tasks={tasks} desyncResolved={desyncResolved} moduleId={moduleId} onSendToAgent={onSendToAgent} missionText={(MODULE_DESC[moduleId] || {}).why || (MODULE_DESC[moduleId] || {}).logic || ''} layer={m.layer} />}
        {tab === 'runs' && <RunStatusSection moduleId={moduleId} />}
        {tab === 'acceptance' && <AcceptanceSection moduleId={moduleId} moduleObj={m} onClaudeAdvice={onClaudeAdvice} />}
        {tab === 'validation' && <ValidationSection moduleId={moduleId} moduleObj={m} />}
        {tab === 'files' && <FilesSection moduleId={moduleId} />}
        {tab === 'subs' && <SubsList subs={subs} desyncResolved={desyncResolved} moduleId={moduleId} />}
        {tab === 'memory' && <Memory lessons={lessons} history={data.history.filter(h => h.module === moduleId)} moduleId={moduleId} />}
        {tab === 'connections' && <ConnectionsTab inEdges={inEdges} outEdges={outEdges} moduleById={moduleById} moduleId={moduleId} allModules={data.modules} allEdges={data.edges} onAddEdge={onAddEdge} onClaudeAdvice={onClaudeAdvice} />}
      </div>
    </aside>
  );
}

function Overview({ m, status, desyncResolved, onSendToAgent, onDrillDown, hasSubsystem, onOpenTz, onClaudeAdvice }) {
  const desc = MODULE_DESC[m.id] || {};
  // Phase R-7.12 — для НОВЫХ блоков (не из захардкоженного MODULE_DESC)
  // подгружаем реальный mission.md из контракта. Без этого «Обзор» tab
  // показывал плейсхолдер «Описание модуля будет дополнено...» даже после
  // того как оператор сохранил миссию через ✎ Руками — операор справедливо
  // жаловался «всё пропадает».
  const [missionText, setMissionText] = useState2('');
  const [missionLoaded, setMissionLoaded] = useState2(false);
  useEffect2(() => {
    setMissionLoaded(false);
    if (!m.id || !m.id.startsWith('b.')) { setMissionText(''); setMissionLoaded(true); return; }
    let cancelled = false;
    (async () => {
      try {
        const r = await window.SIMA_API?.meta?.blockFile(m.id, 'mission.md');
        if (cancelled) return;
        const raw = r?.ok ? String(r.content || '') : '';
        // Strip the auto-heading (`# <id> — mission`) and trailing layer block
        const body = raw.replace(/^#[^\n]*\n+/, '').replace(/\n+##\s+Layer[\s\S]*$/i, '').trim();
        setMissionText(body);
      } catch {}
      if (!cancelled) setMissionLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [m.id]);
  // Resolution priority for «Зачем»:
  //   1. live mission.md (operator wrote / agent filled it on disk)
  //   2. hardcoded MODULE_DESC fallback (legacy demo blocks)
  //   3. placeholder
  const isPlaceholderText = (s) => !s || /Заполни через детальную панель|добавь конкретную метрику/i.test(s);
  const liveMission = !isPlaceholderText(missionText) ? missionText : '';
  const whyText = liveMission || desc.why || (missionLoaded ? 'Описание модуля будет дополнено во время работы с агентом. Откройте таб «Контракт» и нажмите ✎ Руками рядом с mission.md, чтобы заполнить.' : 'Загрузка…');
  return (
    <>
      {hasSubsystem && (
        <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '12px 14px', borderRadius: 8, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', marginBottom: 3 }}>SUBSYSTEM</div>
            <div style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 15 }}>Это — целая подсистема со своим контуром</div>
            <div style={{ fontSize: 11.5, opacity: 0.7, marginTop: 2 }}>модули, KPI, стек, задачи — открой схему внутри</div>
          </div>
          <button onClick={() => onDrillDown(m.id)} style={{ background: 'var(--paper)', color: 'var(--ink)', border: 0, padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>Открыть схему →</button>
        </div>
      )}
      {m.warn && status !== 'progress' && (
        <div className="lesson bad" style={{ marginBottom: 14 }}>
          <div className="verdict">внимание · sima-core</div>
          {m.warn}
        </div>
      )}
      <h3>Зачем</h3>
      <p className="lede" style={{ whiteSpace: 'pre-wrap' }}>{whyText}</p>

      <h3>Логика</h3>
      <p>{desc.logic}</p>

      <h3>Бэкенд</h3>
      <div className="chips" style={{ marginBottom: 4 }}>{(desc.backend || []).map(x => <span key={x} className="chip">{x}</span>)}</div>

      {desc.frontend && <>
        <h3>Фронтенд</h3>
        <div className="chips">{desc.frontend.map(x => <span key={x} className="chip">{x}</span>)}</div>
      </>}

      {/* P1.5 — tech_stack from graph.json (live) */}
      {Array.isArray(m.tech_stack) && m.tech_stack.length > 0 && (
        <>
          <h3>Tech stack блока</h3>
          <div className="chips">{m.tech_stack.map(x => <span key={x} className="chip mono" style={{ fontSize: 11 }}>{x}</span>)}</div>
          <div className="meta" style={{ fontSize: 11, marginTop: 4 }}>
            из <code>graph.json</code> блока — будет проверено sync-check'ом против глобального <code>tech_stack.md</code>.
          </div>
        </>
      )}

      <h3>KPI блока</h3>
      {(desc.kpi || []).map(k => (
        <div key={k.code} className="kpi-row" style={{ borderBottom: '1px dashed var(--rule)', padding: '5px 0', display: 'flex', justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: 11, fontWeight: 500 }}>{k.code}</span>
          <span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{k.label}</span>
        </div>
      ))}

      <h3>Отправить в агента</h3>
      <div className="send-task">
        <span className="lab">Контекст этого блока →</span>
        <button onClick={() => onSendToAgent('claude', m)}>Claude Code</button>
        <button onClick={() => onSendToAgent('cursor', m)}>Cursor</button>
        <button onClick={() => onSendToAgent('codex', m)}>Codex</button>
      </div>

      <BlockScreenshot block={m} />

      <h3>Документы</h3>
      <div className="send-task">
        <span className="lab">Сгенерировать / экспорт →</span>
        {onOpenTz && <button onClick={() => onOpenTz(m.id)}>✎ ТЗ блока</button>}
        <UserDocsButton blockId={m.id} />
        {onClaudeAdvice && <button onClick={() => onClaudeAdvice(m)}>✨ Совет Клода</button>}
      </div>
    </>
  );
}

// P-3 — block screenshot section. Shows latest captured image (or empty
// state) and a button to trigger a fresh capture against block.ui_url.
// Operator can edit the ui_url inline; saves via patchBlock.
function BlockScreenshot({ block }) {
  const [busy, setBusy] = useState2(false);
  const [info, setInfo] = useState2(null);
  const [bumper, setBumper] = useState2(0); // cache-buster for <img src>
  const [editing, setEditing] = useState2(false);
  const [urlDraft, setUrlDraft] = useState2(block?.ui_url || '');
  const [urlSaveMsg, setUrlSaveMsg] = useState2(null);

  const refresh = async () => {
    if (!block?.id || !block.id.startsWith('b.')) return;
    const r = await window.SIMA_API?.meta?.screenshotsList(block.id);
    setInfo(r?.ok ? r : null);
  };
  useEffect2(() => { refresh(); /* eslint-disable-next-line */ }, [block?.id]);
  useEffect2(() => { setUrlDraft(block?.ui_url || ''); }, [block?.id, block?.ui_url]);

  const capture = async () => {
    setBusy(true);
    const r = await window.SIMA_API.meta.screenshotCapture(block.id, {});
    setBusy(false);
    if (r?.ok) {
      setBumper(Date.now());
      refresh();
    } else {
      window.alert(r?.error || 'screenshot failed');
    }
  };

  const saveUrl = async () => {
    setUrlSaveMsg(null);
    const u = urlDraft.trim();
    if (u && !/^https?:\/\//.test(u)) {
      setUrlSaveMsg({ kind: 'fail', text: 'URL должен начинаться с http:// или https://' });
      return;
    }
    const r = await window.SIMA_API.patchBlock(block.id, { ui_url: u });
    if (r?.ok) {
      setEditing(false);
      setUrlSaveMsg({ kind: 'ok', text: '✓ сохранено' });
      setTimeout(() => setUrlSaveMsg(null), 2200);
    } else {
      setUrlSaveMsg({ kind: 'fail', text: r?.error || 'save failed' });
    }
  };

  if (!block?.id || !block.id.startsWith('b.')) return null;
  const apiBase = (window.SIMA_API_BASE || 'http://localhost:8787').replace(/\/$/, '');
  const hasShot = info?.has_latest;
  const imgSrc = hasShot ? `${apiBase}/atlas/blocks/${encodeURIComponent(block.id)}/screenshot-file?name=latest.png&t=${bumper}` : null;

  return (
    <>
      <h3>Скрин блока</h3>
      <div className="block-screenshot">
        {hasShot ? (
          <a href={imgSrc} target="_blank" rel="noreferrer" className="block-screenshot-img-wrap">
            <img src={imgSrc} alt={`screenshot of ${block.id}`} />
          </a>
        ) : (
          <div className="block-screenshot-empty meta">
            {block.ui_url
              ? 'Скрин ещё не снят. Нажмите ниже.'
              : 'Задайте ui_url блока, чтобы Sima могла снять скрин.'}
          </div>
        )}
        <div className="block-screenshot-meta meta">
          {info?.files?.[0] && <span>обновлено: {String(info.files[0].mtime).slice(0, 16).replace('T', ' ')} · {(info.files[0].bytes / 1024).toFixed(1)} КБ</span>}
          {info?.files?.length > 1 && <span style={{ marginLeft: 8 }}>история: {info.files.length}</span>}
        </div>
      </div>
      <div className="send-task" style={{ marginTop: 8, alignItems: 'flex-start' }}>
        <span className="lab" style={{ paddingTop: 6 }}>UI URL →</span>
        {editing ? (
          <>
            <input
              className="composer-input"
              placeholder="https://your-app.example.com/feature"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
            <button onClick={saveUrl}>💾 сохранить</button>
            <button onClick={() => { setEditing(false); setUrlDraft(block.ui_url || ''); }}>отмена</button>
          </>
        ) : (
          <>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', flex: 1 }}>
              {block.ui_url || '_(не задан)_'}
            </span>
            <button onClick={() => setEditing(true)}>✎ изменить</button>
          </>
        )}
        <button onClick={capture} disabled={busy || !block.ui_url}>{busy ? 'снимаю…' : '📸 снять скрин'}</button>
        {urlSaveMsg && <span className={`composer-result ${urlSaveMsg.kind}`} style={{ fontSize: 11, padding: '2px 8px', marginLeft: 4 }}>{urlSaveMsg.text}</span>}
      </div>
    </>
  );
}

// O-3 button: regenerates the end-user click-walkthrough doc
// (atlas/docs/end-user/<block>.md) via /user-docs/regenerate. The
// generator already produces step-by-step {action, target, expected}
// content via LLM; this just exposes the trigger from DetailPanel.
function UserDocsButton({ blockId }) {
  const [busy, setBusy] = useState2(false);
  const [msg, setMsg] = useState2(null);
  if (!blockId || !blockId.startsWith('b.')) return null;
  const click = async () => {
    setBusy(true); setMsg(null);
    const r = await window.SIMA_API?.meta?.userDocsRegenerate(blockId);
    setBusy(false);
    if (!r) { setMsg({ kind: 'fail', text: 'нет ответа' }); return; }
    setMsg({
      kind: r.ok ? 'ok' : 'fail',
      text: r.ok ? '✓ доки сгенерированы — открой 📖 Доки → Пользователю' : `✗ ${r.error || 'failed'}`,
    });
    setTimeout(() => setMsg(null), 3500);
  };
  return (
    <>
      <button onClick={click} disabled={busy} title="Сгенерировать пошаговый гайд для конечного пользователя (Click X → field Y → button Z)">
        {busy ? '…' : '📖 Гайд пользователю'}
      </button>
      {msg && <span className={`composer-result ${msg.kind}`} style={{ fontSize: 11, padding: '2px 8px', marginLeft: 6 }}>{msg.text}</span>}
    </>
  );
}

function TasksList({ tasks, desyncResolved, moduleId, onSendToAgent, missionText, layer }) {
  // Phase M-4 — Sima decomposes mission into tasks
  const [suggested, setSuggested] = useState2([]);
  const [busy, setBusy] = useState2(false);

  const askSima = async () => {
    if (!moduleId || !moduleId.startsWith('b.')) return;
    setBusy(true);
    const r = await window.SIMA_API?.synthesis?.tasks({
      block_id: moduleId,
      title: moduleId,
      mission: missionText || '',
      layer: layer || 'logic',
    });
    setBusy(false);
    if (r?.ok) setSuggested(r.tasks.map((t) => ({ ...t, _mock: r.mock })));
  };

  return (
    <>
      <h3>Декомпозиция</h3>
      {!tasks.length && <p style={{ color: 'var(--ink-3)' }}>Задачи появятся, когда агент начнёт декомпозицию.</p>}
      {tasks.map(t => {
        const st = (moduleId === 'metrics' && t.id === 'T-202' && desyncResolved) ? 'progress' : t.status;
        return (
          <div key={t.id} className="task-row">
            <span className="tid">{t.id}</span>
            <div>
              <div className="ttitle">{t.title}</div>
              {t.note && st !== 'progress' && <div className="tnote">⚠ {t.note}</div>}
              <div className="tmeta">
                <span className="mono">{t.priority}</span>
                {t.agent && <span className="agent-chip">{t.agent}</span>}
              </div>
            </div>
            <div className="tstatus" data-st={st} title={statusLabel(st)} />
          </div>
        );
      })}

      {moduleId && moduleId.startsWith('b.') && (
        <>
          <h3>✦ Sima разложит на задачи</h3>
          <div className="send-task" style={{ marginBottom: 8 }}>
            <span className="lab">Из mission блока →</span>
            <button onClick={askSima} disabled={busy}>{busy ? 'думаю…' : '✦ предложить декомпозицию'}</button>
          </div>
          {suggested[0]?._mock && (
            <div className="composer-result fail" style={{ marginBottom: 8 }}>Demo-режим — нужен ANTHROPIC_API_KEY.</div>
          )}
          {suggested.map((t) => (
            <div key={t.id} className="synth-task">
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{t.id}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{t.title}</div>
                {t.note && <div className="meta" style={{ fontSize: 11 }}>{t.note}</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <span className="acc-pill mono">{t.priority}</span>
                  <span className="acc-pill mono">{t.agent}</span>
                </div>
              </div>
            </div>
          ))}
          {suggested.length > 0 && (
            <div className="meta" style={{ fontSize: 11, marginTop: 4 }}>
              Предложения только показаны — записать их в tasks.md можно через «Send to Claude Code» с этим контекстом.
            </div>
          )}
        </>
      )}
    </>
  );
}

function SubsList({ subs, desyncResolved, moduleId }) {
  if (!subs.length) return <p style={{ color: 'var(--ink-3)' }}>У этого блока пока нет подмодулей.</p>;
  return (
    <>
      <h3>Подмодули</h3>
      <div className="subm-list">
        {subs.map(s => {
          const st = (s.id === 'metrics-ast' && desyncResolved) ? 'progress' : s.status;
          return (
            <div key={s.id} className="subm-row">
              <span className="dot" style={{ background: `var(--st-${st})` }} />
              <span style={{ flex: 1 }}>{s.title}</span>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{statusLabel(st)}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function Memory({ lessons, history, moduleId }) {
  // Pull real per-block trace from disk: decisions.log + patterns.md.
  // The static `lessons`/`history` props from the bootstrap are the
  // editorial fallback; if the block has its own decisions log we
  // surface that as the primary view.
  const [decisions, setDecisions] = useState2(null);
  const [patterns, setPatterns] = useState2(null);
  const [packBusy, setPackBusy] = useState2(false);
  const [packResult, setPackResult] = useState2(null);
  const apiBase = (window.SIMA_API_BASE || 'http://localhost:8787').replace(/\/$/, '');

  useEffect2(() => {
    let alive = true;
    (async () => {
      if (!moduleId || !moduleId.startsWith('b.')) { setDecisions(null); setPatterns(null); return; }
      const [d, p] = await Promise.all([
        window.SIMA_API?.meta?.blockFile(moduleId, 'decisions.log'),
        window.SIMA_API?.meta?.blockFile(moduleId, 'patterns.md'),
      ]);
      if (!alive) return;
      setDecisions(d?.ok ? d.content : null);
      setPatterns(p?.ok ? p.content : null);
    })();
    return () => { alive = false; };
  }, [moduleId]);

  const decisionLines = decisions
    ? decisions.split(/\n/).filter((l) => l && !l.startsWith('#')).slice(-12).reverse()
    : [];

  const buildPack = async () => {
    setPackBusy(true); setPackResult(null);
    try {
      const r = await fetch(apiBase + '/atlas/build-context-pack', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ block_id: moduleId }),
      });
      const j = await r.json();
      setPackResult(j);
    } catch (e) {
      setPackResult({ ok: false, error: String(e.message || e) });
    }
    setPackBusy(false);
  };

  return (
    <>
      {moduleId && moduleId.startsWith('b.') && (
        <div className="send-task" style={{ marginBottom: 14 }}>
          <span className="lab">Контекст-пак →</span>
          <button onClick={buildPack} disabled={packBusy}>{packBusy ? 'Собираю…' : '🗂 Собрать context_pack'}</button>
          {packResult && (
            <span className={`composer-result ${packResult.ok ? 'ok' : 'fail'}`} style={{ marginLeft: 8, padding: '4px 10px' }}>
              {packResult.ok ? <>✓ <span className="mono">{packResult.file}</span></> : <>✗ {packResult.error}</>}
            </span>
          )}
        </div>
      )}

      <h3>Решения блока (decisions.log)</h3>
      {decisionLines.length ? (
        <div className="memory-decisions">
          {decisionLines.map((ln, i) => {
            const tabs = ln.split('\t');
            const ts = tabs[0] || '';
            const kind = tabs[1] || '';
            const note = tabs.slice(2).join('\t') || ln;
            return (
              <div key={i} className="memory-row">
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)' }}>{ts.slice(0, 16).replace('T', ' ')}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{kind}</span>
                <span style={{ fontSize: 12 }}>{note}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p style={{ color: 'var(--ink-3)' }}>
          {moduleId && moduleId.startsWith('b.') ? 'decisions.log пуст для этого блока.' : 'Память — для b.* блоков atlas.'}
        </p>
      )}

      {patterns && patterns.trim() && patterns.trim() !== '# patterns' && (
        <>
          <h3>Паттерны (patterns.md)</h3>
          <pre className="memory-patterns">{patterns}</pre>
        </>
      )}

      <h3>Уроки (бутстрап)</h3>
      {lessons.length ? lessons.map((l, i) => (
        <div key={i} className={`lesson ${l.verdict}`}>
          <div className="verdict">{l.verdict === 'good' ? '✓ что сработало' : '✗ что не сработало'}</div>
          {l.note}
        </div>
      )) : <p style={{ color: 'var(--ink-3)' }}>Уроков по этому блоку нет.</p>}

      <h3>События</h3>
      {history.length ? history.map((h, i) => (
        <div key={i} style={{
          padding: '7px 0', borderBottom: '1px dashed var(--rule)',
          fontSize: 12.5, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: 10
        }}>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{h.ts}</span>
          <div>
            <div style={{ color: 'var(--ink-2)' }}>{h.msg}</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 2 }}>← {h.agent}</div>
          </div>
        </div>
      )) : <p style={{ color: 'var(--ink-3)' }}>Нет событий по этому блоку.</p>}
    </>
  );
}

function ConnectionsTab({ inEdges, outEdges, moduleById, moduleId, allModules, allEdges, onAddEdge, onClaudeAdvice }) {
  const Row = ({ e, dir }) => {
    const other = moduleById[dir === 'in' ? e.from : e.to];
    if (!other) return null;
    return (
      <div className="subm-row">
        <span style={{ fontSize: 11, color: 'var(--ink-4)' }}>{dir === 'in' ? '←' : '→'}</span>
        <span style={{ flex: 1 }}>{other.title}</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--ink-3)' }}>{e.kind}{e.desync ? ' · desync' : ''}</span>
      </div>
    );
  };

  // Phase M-3 — Sima suggests edges
  const [suggested, setSuggested] = useState2([]);
  const [busy, setBusy] = useState2(false);
  const [accepted, setAccepted] = useState2(new Set());

  const askSima = async () => {
    if (!moduleId || !moduleId.startsWith('b.')) return;
    setBusy(true);
    const r = await window.SIMA_API?.synthesis?.edges({
      focal_block_id: moduleId,
      modules: allModules || [],
      edges: allEdges || [],
    });
    setBusy(false);
    if (r?.ok) setSuggested(r.edges.map((e) => ({ ...e, _mock: r.mock })));
  };

  const acceptSuggestion = async (e) => {
    setAccepted((s) => new Set([...s, edgeKey(e)]));
    if (onAddEdge) onAddEdge({ from: e.from, to: e.to, kind: e.kind, label: e.capability || '' });
  };

  return (
    <>
      <h3>Входящие ({inEdges.length})</h3>
      <div className="subm-list" style={{ marginBottom: 14 }}>
        {inEdges.map((e, i) => <Row key={i} e={e} dir="in" />)}
        {!inEdges.length && <p style={{ color: 'var(--ink-3)', margin: 0 }}>—</p>}
      </div>
      <h3>Исходящие ({outEdges.length})</h3>
      <div className="subm-list" style={{ marginBottom: 14 }}>
        {outEdges.map((e, i) => <Row key={i} e={e} dir="out" />)}
        {!outEdges.length && <p style={{ color: 'var(--ink-3)', margin: 0 }}>—</p>}
      </div>

      {moduleId && moduleId.startsWith('b.') && (
        <>
          <h3>✦ Sima предложит связи</h3>
          <div className="send-task" style={{ marginBottom: 8 }}>
            <span className="lab">На основе графа →</span>
            <button onClick={askSima} disabled={busy}>{busy ? 'думаю…' : '✦ предложить'}</button>
            {onClaudeAdvice && (
              <button onClick={() => onClaudeAdvice(allModules.find(x => x.id === moduleId), {
                kind: 'block_connections',
                context: {
                  in: inEdges.map(e => e.from),
                  out: outEdges.map(e => e.to),
                  neighbors: allModules.filter(m => m.id !== moduleId).slice(0, 20).map(m => ({ id: m.id, title: m.title, layer: m.layer })),
                },
              })}>✨ что упускаю?</button>
            )}
          </div>
          {suggested[0]?._mock && (
            <div className="composer-result fail" style={{ marginBottom: 8 }}>Demo-режим — нужен ANTHROPIC_API_KEY.</div>
          )}
          {suggested.map((e) => {
            const key = edgeKey(e);
            const isAccepted = accepted.has(key);
            const target = moduleById[e.to];
            return (
              <div key={key} className={`synth-edge ${isAccepted ? 'accepted' : ''}`}>
                <div className="synth-edge-head">
                  <span className="mono" style={{ fontSize: 11 }}>{e.from} → {e.to}</span>
                  <span className="gallery-kind">{e.kind}</span>
                </div>
                <div style={{ fontSize: 12.5, marginTop: 2 }}>
                  {target ? `${target.title} · ` : ''}{e.capability && <span className="mono" style={{ fontSize: 11 }}>{e.capability}</span>}
                </div>
                {e.rationale && <div className="meta" style={{ fontSize: 11, marginTop: 2 }}>{e.rationale}</div>}
                {!isAccepted && (
                  <div className="synth-actions" style={{ marginTop: 6 }}>
                    <button className="pill primary" onClick={() => acceptSuggestion(e)}>＋ принять</button>
                    <button className="pill" onClick={() => setSuggested((S) => S.filter((x) => edgeKey(x) !== key))}>✗ пропустить</button>
                  </div>
                )}
                {isAccepted && <div className="meta" style={{ fontSize: 11, marginTop: 4 }}>✓ добавлено</div>}
              </div>
            );
          })}
        </>
      )}
    </>
  );
}
function edgeKey(e) { return `${e.from}|${e.to}|${e.capability || ''}`; }

/* Module descriptions */
const MODULE_DESC = {
  ingest:    { why: 'Принимает события от SDK, валидирует по схеме, гарантирует exactly-once в Warehouse.', logic: 'POST /v1/events → schema-validate → Kafka (exactly-once) → ClickHouse через Materialized View.', backend: ['FastAPI', 'Kafka 3.7', 'pydantic v2', 'idempotent producer'], kpi: [{ code: '99.99%', label: 'успешных приёмов' }, { code: '50k/s', label: 'throughput' }, { code: '< 25ms', label: 'p95 ack' }] },
  metrics:   { why: 'Domain-language для метрик. Продакт пишет formula: count(distinct user_id) where event=signup — превращается в SQL.', logic: 'DSL → AST → ClickHouse SQL → кеш Redis → результат. Сейчас рассинхрон: AST ссылается на user_id, в ingest уже actor_id.', backend: ['Python', 'lark парсер', 'ClickHouse-driver', 'Redis 7'], kpi: [{ code: '< 800ms', label: 'p95 запроса' }, { code: '100%', label: 'покрытие операторов' }] },
  dashboard: { why: 'Drag-n-drop конструктор дашбордов. Главный пользовательский UI — без него весь backend бессмысленен.', logic: 'Grid → Tile (chart + filter) → пресеты → share. Каждый tile = ссылка на metric + конфиг визуализации.', backend: ['REST /dashboards', 'PostgreSQL', 'WebSocket для live'], frontend: ['React 18', 'react-grid-layout', 'TanStack Query', 'ECharts'], kpi: [{ code: '< 2s', label: 'TTI' }, { code: '< 5min', label: 'до первого дашборда' }] },
  billing:   { why: 'Подписки, лимиты по событиям/seat, возвраты. Без этого нет монетизации.', logic: 'Stripe webhook → idempotent обработка → внутренний биллинг → инвойс PDF. Refund: pro-rata от неиспользованного.', backend: ['Stripe SDK', 'PostgreSQL', 'WeasyPrint'], kpi: [{ code: '0', label: 'потерянных webhook' }, { code: '< 1%', label: 'провалов refund' }] },
  auth:      { why: 'Многотенантная авторизация, RBAC на уровне dataset, SSO через OIDC.', logic: 'JWT + refresh, роли viewer/editor/admin, scope: workspace.', backend: ['FastAPI', 'JWT', 'OIDC (Auth0)', 'PostgreSQL'], kpi: [{ code: '0', label: 'CVE high' }, { code: '< 50ms', label: 'verify' }] },
  warehouse: { why: 'Хранилище событий: миллиарды строк, OLAP-агрегации, материализованные view.', logic: 'ClickHouse кластер 3 шарда × 2 реплики, MV-агрегации по часам/дням.', backend: ['ClickHouse 24.x', 'ZooKeeper', 'Materialized Views'], kpi: [{ code: '< 200ms', label: 'p95 на 10M строк' }, { code: '99.9%', label: 'uptime' }] },
  query:     { why: 'Транслирует Metrics DSL и фильтры в безопасный ClickHouse SQL с лимитами.', logic: 'Validate → AST → SQL builder → execute с timeout 5s → пагинация.', backend: ['Python', 'sqlglot ❌', 'своя SQL-сборка', 'Redis cache'], kpi: [{ code: '< 800ms', label: 'p95 query' }, { code: '0', label: 'SQL-injection' }] },
  events:    { why: 'Реестр event-схем. Любое событие должно быть зарегистрировано до приёма в ingest.', logic: 'Schema-registry: типы, обязательные поля, миграции. Versioning через додаваемые поля only.', backend: ['Avro', 'PostgreSQL', 'Schema-registry API'], kpi: [{ code: '100%', label: 'событий с валидной схемой' }] },
  datasets:  { why: 'Логические группы событий с ACL — на них опираются дашборды и метрики.', logic: 'Dataset = filter над сырыми событиями + permissions + retention. Materialized или virtual.', backend: ['PostgreSQL', 'ClickHouse views'], kpi: [{ code: '< 100ms', label: 'list datasets' }] },
  cohorts:   { why: 'Динамические группы пользователей: «совершили signup и ни разу не покупали»', logic: 'Cohort = saved query → ежечасное обновление → используется в funnel/retention.', backend: ['ClickHouse', 'Cron'], kpi: [{ code: '< 60min', label: 'свежесть когорты' }] },
  charts:    { why: 'Визуализация результатов метрик: line/bar/funnel/cohort.', logic: 'Получает MetricResult → подбирает тип графика → рендерит ECharts. Лёгкая перенастройка через json.', frontend: ['ECharts 5', 'd3-color', 'React'], kpi: [{ code: '< 400ms', label: 'render 10k точек' }] },
  filters:   { why: 'Глобальные фильтры на дашборд: время, сегмент, пользователь.', logic: 'URL-state, синхронизация со всеми tile, сохранение в presets.', frontend: ['React', 'use-query-params'], kpi: [] },
  share:     { why: 'Публичные ссылки и embed-режим для дашбордов.', logic: 'Подписанные URL с TTL, embed в iframe с whitelisted-доменом.', backend: ['JWT short-lived'], frontend: ['embed.js'], kpi: [] },
  alerts:    { why: 'Уведомления при выходе метрики за пороги.', logic: 'Каждые 5 мин: запросить метрику → сравнить с правилом → отправить в Slack/email.', backend: ['Celery beat', 'Slack SDK'], kpi: [{ code: '< 5min', label: 'детект отклонения' }] },
  tests:     { why: 'Прогон unit/e2e/load — единая точка для CI и локального запуска агентами.', logic: 'pytest + playwright + locust в одном harness. Отчёты в SIMA fixed format.', backend: ['pytest', 'Playwright', 'Locust'], kpi: [{ code: '≥ 80%', label: 'coverage' }, { code: '0', label: 'flaky' }] },
  observ:    { why: 'Метрики приложения, трейсы, логи — для самого Lensa, а не для клиентов.', logic: 'OTel SDK → Prometheus + Tempo + Loki. Дашборды в Grafana.', backend: ['OpenTelemetry', 'Prometheus', 'Grafana'], kpi: [{ code: '100%', label: 'роутов с трейсами' }] },
};

/* ====================== DOCK ====================== */
function Dock({ data, log, onSendToAgent, collapsed, setCollapsed, activeAgent, setActiveAgent }) {
  const termRef = React.useRef(null);
  useEffect2(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [log]);

  const filtered = log.filter(l => activeAgent === 'all' || l.agent === activeAgent);

  return (
    <div className={`dock ${collapsed ? 'collapsed' : ''}`}>
      <div className="dock-tabs">
        <button className={`tab ${activeAgent === 'all' ? 'active' : ''}`} onClick={() => setActiveAgent('all')}>
          <span className="agent-dot" style={{ background: 'var(--ink)' }} />Все агенты <span className="ct">{log.length}</span>
        </button>
        {data.agents.filter(a => a.id !== 'sima').map(a => (
          <button key={a.id} className={`tab ${activeAgent === a.title ? 'active' : ''}`} onClick={() => setActiveAgent(a.title)}>
            <span className="agent-dot" style={{ background: `var(--st-${a.color === 'warm' ? 'progress' : a.color === 'blue' ? 'desync' : a.color === 'violet' ? 'desync' : 'todo'})` }} />
            {a.title} <span className="ct">{log.filter(l => l.agent === a.title).length}</span>
          </button>
        ))}
        <div className="spacer" />
        <span style={{ fontSize: 11, color: 'var(--ink-4)', marginRight: 8 }}>
          <span className="kbd">⌘K</span> для команды
        </span>
        <button className="icon-btn" onClick={() => setCollapsed(c => !c)} title={collapsed ? 'Раскрыть' : 'Свернуть'}>
          {collapsed ? '⌃' : '⌄'}
        </button>
      </div>
      {!collapsed && (
        <div className="dock-body">
          <div className="term" ref={termRef}>
            {filtered.map((l, i) => (
              <div key={i} className={`ln ${l.kind}`}>
                <span className="ts">{l.ts}</span>
                {l.agent && <span style={{ color: 'var(--ink-4)' }}>[{l.agent}] </span>}
                {l.msg}
              </div>
            ))}
            {filtered.length === 0 && <div className="ln note">Лог пуст. Отправьте задачу из детальной панели — здесь появятся события агента.</div>}
          </div>
          <div className="roadmap">
            <h4>Дорожная карта</h4>
            {data.modules
              .slice()
              .sort((a, b) => a.priority - b.priority)
              .slice(0, 9)
              .map(m => (
                <div key={m.id} className="rm-row">
                  <span className="dot" style={{ background: `var(--st-${m.status})` }} />
                  <span>{m.title}</span>
                  <span className="meta">P{m.priority} · {statusLabel(m.status)}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ====================== LAYERED 3D VIEW ====================== */
function LayeredView({ data, onSelect, desyncResolved }) {
  const [focus, setFocus] = useState2('frontend');
  const groups = {
    frontend: data.modules.filter(m => m.layer === 'frontend'),
    logic: data.modules.filter(m => m.layer === 'logic'),
    backend: data.modules.filter(m => m.layer === 'backend'),
    tests: data.modules.filter(m => m.layer === 'tests'),
  };
  const order = ['frontend', 'logic', 'backend', 'tests'];
  const labels = { frontend: 'Frontend · UI', logic: 'Domain · Logic', backend: 'Backend · Data', tests: 'Tests · Ops' };

  return (
    <div className="canvas-wrap">
      <div className="layered">
        <div className="stack">
          {order.map((g, i) => {
            const isFocus = focus === g;
            const z = (order.length - i) * 90 - (isFocus ? 60 : 0);
            return (
              <div
                key={g}
                className={`layer ${isFocus ? 'focused' : ''}`}
                style={{
                  transform: `translateZ(${z}px)`,
                  opacity: isFocus ? 1 : 0.85,
                }}
                onClick={() => setFocus(g)}
              >
                <div className="ltitle"><span className="num mono">L{order.length - i}</span>{labels[g]}</div>
                <div className="lgrid">
                  {groups[g].map(m => {
                    const st = (m.id === 'metrics' && desyncResolved) ? 'progress' : m.status;
                    return (
                      <div key={m.id} className="lnode" onClick={(e) => { e.stopPropagation(); onSelect(m.id); }}>
                        <span className="dot" style={{ background: `var(--st-${st})` }} />
                        <span style={{ flex: 1 }}>{m.title}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="layered-controls">
          {order.map(g => (
            <button key={g} className={focus === g ? 'active' : ''} onClick={() => setFocus(g)}>
              {labels[g]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

window.ContextRail = ContextRail;
window.DetailPanel = DetailPanel;
window.Dock = Dock;
window.LayeredView = LayeredView;

/* ====================== LAYERED V2 — RICHER ====================== */
function LayeredV2({ data, modules, onSelect, desyncResolved }) {
  const order = [
    { key: 'frontend', title: 'Frontend · UI', code: 'L3 · что видит пользователь' },
    { key: 'logic',    title: 'Domain · Logic', code: 'L2 · как продукт думает' },
    { key: 'backend',  title: 'Backend · Data', code: 'L1 · что хранит и считает' },
    { key: 'tests',    title: 'Tests · Ops',    code: 'L4 · как мы это проверяем' },
  ];
  return (
    <div className="layered-v2">
      <div style={{ marginBottom: 22, paddingBottom: 14, borderBottom: '1px dashed var(--rule)' }}>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>view · layered</div>
        <h2 style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 28, fontWeight: 500, margin: '4px 0 6px' }}>{data.product.title} — по слоям</h2>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', maxWidth: 720 }}>
          Тот же продукт, что и в графе, но разложен по уровням ответственности. Слой → модули → описание + прогресс. Кликните любой модуль, чтобы открыть детали справа.
        </div>
      </div>
      {order.map(g => {
        const mods = modules.filter(m => m.layer === g.key);
        return (
          <div key={g.key} className={`layer-card ${g.key}`}>
            <div className="layer-head">
              <h3>{g.title}</h3>
              <span className="lc">{g.code} · {mods.length} модул{mods.length === 1 ? 'ь' : mods.length < 5 ? 'я' : 'ей'}</span>
            </div>
            <div className="layer-mods">
              {mods.map(m => {
                const st = (m.id === 'metrics' && desyncResolved) ? 'progress' : m.status;
                const tasks = data.tasks[m.id] || [];
                const done = tasks.filter(t => t.status === 'done').length;
                const pct = tasks.length ? (done / tasks.length) * 100 : (st === 'done' ? 100 : st === 'progress' ? 50 : 0);
                const desc = data.moduleDocs[m.id]?.short || '';
                return (
                  <div key={m.id} className="lmod" onClick={() => onSelect(m.id)}>
                    <div className="lmod-head">
                      <span className="dot" style={{ background: `var(--st-${st})` }} />
                      <h4>{m.title}</h4>
                    </div>
                    {desc && <div className="lmod-desc">{desc}</div>}
                    <div className="lmod-foot">
                      <span>@{m.tag}</span>
                      <div className="bar"><div className="bar-fill" style={{ width: `${pct}%`, background: `var(--st-${st})` }} /></div>
                      <span>{tasks.length ? `${done}/${tasks.length}` : statusLabel(st)}</span>
                    </div>
                  </div>
                );
              })}
              {!mods.length && <div style={{ color: 'var(--ink-4)', fontStyle: 'italic', fontSize: 12 }}>пока пусто</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

window.LayeredV2 = LayeredV2;

/* ====================== RUN STATUS ======================
   Polls /runs/list?block_id=<id>&active=1 every 4s while a run is live,
   falls back to a 12s slow poll otherwise. Surfaces FSM phase, agent,
   and a "Send to ..." action that POSTs /runs/start (non-blocking).
*/
function RunStatusSection({ moduleId }) {
  const [runs, setRuns] = useState2([]);
  const [busy, setBusy] = useState2(false);
  const [error, setError] = useState2(null);
  // Per-run-id log tail state. We only tail the most-recent run; older runs
  // can be expanded on-demand if needed.
  const [logText, setLogText] = useState2('');
  const [logSize, setLogSize] = useState2(0);
  const [files, setFiles] = useState2([]);
  const [openLogFor, setOpenLogFor] = useState2(null); // run_id whose log is shown
  const apiBase = (window.SIMA_API_BASE || 'http://localhost:8787').replace(/\/$/, '');
  // R-7.32: client должен читаться при КАЖДОМ запросе, не при mount.
  // Иначе race: data_loader ставит window.__SIMA_DATA_CLIENT после
  // первого refresh, а компонент уже смонтирован с client=''. Все
  // /runs/* уходили без клиента → run_state ложился в ROOT atlas/,
  // оркестратор смотрел ROOT/atlas/blocks/<id> и крашился.
  const getClient = () => (typeof window !== 'undefined' && window.__SIMA_DATA_CLIENT && window.__SIMA_DATA_CLIENT !== 'default')
    ? window.__SIMA_DATA_CLIENT : '';
  const clientQs = () => { const c = getClient(); return c ? `&client=${encodeURIComponent(c)}` : ''; };

  const fetchRuns = async () => {
    try {
      // enriched=1: each run carries acceptance_after, cost_usd,
      // file_count so history cards can show what actually happened.
      const r = await fetch(apiBase + '/runs/list?block_id=' + encodeURIComponent(moduleId) + '&limit=10&enriched=1' + clientQs(), { cache: 'no-store' });
      const j = await r.json();
      if (j.ok) setRuns(j.runs || []);
    } catch {}
  };

  // Keep the latest run open by default so the operator sees agent output
  // immediately after pressing "Run".
  useEffect2(() => {
    if (!openLogFor && runs[0]) setOpenLogFor(runs[0].run_id);
  }, [runs, openLogFor]);

  const fetchLog = async (run_id, since = 0) => {
    try {
      const r = await fetch(apiBase + '/runs/log?run_id=' + encodeURIComponent(run_id) + '&since=' + since, { cache: 'no-store' });
      const j = await r.json();
      if (!j.ok) return;
      // If `since` was stale (e.g. log got truncated), reset to whatever
      // the server returned so we don't miss new bytes.
      if (since === 0) {
        setLogText(j.text || '');
      } else {
        setLogText((t) => t + (j.text || ''));
      }
      setLogSize(j.next || 0);
    } catch {}
  };
  const fetchFiles = async (run_id) => {
    try {
      const r = await fetch(apiBase + '/runs/files?run_id=' + encodeURIComponent(run_id) + clientQs(), { cache: 'no-store' });
      const j = await r.json();
      if (j.ok) setFiles(j.files || []);
    } catch {}
  };

  // When the open run changes, reset the tail state and fetch fresh.
  useEffect2(() => {
    if (!openLogFor) return;
    setLogText('');
    setLogSize(0);
    fetchLog(openLogFor, 0);
    fetchFiles(openLogFor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openLogFor]);

  useEffect2(() => {
    fetchRuns();
    const TERMINAL = new Set(['Succeeded', 'Failed', 'Stalled', 'Canceled']);
    const live = (runs || []).some((r) => !TERMINAL.has(r.current_state));
    const itv = setInterval(() => {
      fetchRuns();
      if (openLogFor && live) fetchLog(openLogFor, logSize);
    }, live ? 2000 : 12000);
    return () => clearInterval(itv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, openLogFor, logSize, runs.length]);

  const startRun = async (agent) => {
    setBusy(true); setError(null);
    try {
      const r = await fetch(apiBase + '/runs/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ block_id: moduleId, agent, ...((c => c ? { client_id: c } : {})(getClient())) }),
      });
      const j = await r.json();
      if (!j.ok) setError(j.error || 'failed');
      else if (j.run_id) {
        setOpenLogFor(j.run_id);
        setLogText(''); setLogSize(0);
      }
      setTimeout(fetchRuns, 800);
    } catch (e) {
      setError(String(e.message || e));
    }
    setBusy(false);
  };

  const cancelRun = async (run_id) => {
    if (!window.confirm(`Отменить запуск ${run_id}?`)) return;
    try {
      const r = await fetch(apiBase + '/runs/cancel', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ run_id, reason: 'cancelled from UI', ...((c => c ? { client_id: c } : {})(getClient())) }),
      });
      const j = await r.json();
      if (!j.ok) setError(j.error || 'cancel failed');
      setTimeout(fetchRuns, 400);
    } catch (e) {
      setError(String(e.message || e));
    }
  };

  const TERMINAL = new Set(['Succeeded', 'Failed', 'Stalled', 'Canceled']);
  const live = runs.find((r) => !TERMINAL.has(r.current_state));

  return (
    <>
      <h3>Запуск агента</h3>
      <div className="send-task" style={{ marginBottom: 14 }}>
        <span className="lab">Запустить блок →</span>
        <button onClick={() => startRun('claude')} disabled={busy}>Claude Code</button>
        <button onClick={() => startRun('cursor')} disabled={busy}>Cursor</button>
        <button onClick={() => startRun('codex')}  disabled={busy}>Codex</button>
      </div>
      {error && <div className="lesson bad" style={{ marginBottom: 12 }}>{error}</div>}

      {live && (
        <div className="run-card live" onClick={() => setOpenLogFor(live.run_id)}>
          <div className="run-card-head">
            <span className="run-pulse" />
            <span className="mono" style={{ fontSize: 11, flex: 1 }}>{live.run_id}</span>
            <span className="run-phase">{live.current_state}</span>
            <button
              className="run-cancel"
              onClick={(e) => { e.stopPropagation(); cancelRun(live.run_id); }}
              title="Отменить"
            >✕ Отменить</button>
          </div>
          <div className="meta" style={{ fontSize: 11.5 }}>
            agent={live.agent} · started {short(live.started_at)} · last event {short(live.last_event_at)}
          </div>
        </div>
      )}

      {openLogFor && (
        <div className="run-log-wrap">
          <div className="run-log-head">
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>лог · {openLogFor}</span>
            <span className="meta" style={{ fontSize: 10.5 }}>{logSize} байт</span>
          </div>
          <pre className="run-log">{logText || (live ? 'ожидаю вывод…' : 'лог пуст или удалён')}</pre>
          {files.length > 0 && (
            <div className="run-files">
              <div className="meta" style={{ fontSize: 10.5, marginBottom: 4, letterSpacing: '0.06em' }}>ИЗМЕНИЛ</div>
              <div className="chips">
                {files.slice(0, 12).map((f) => <span key={f} className="chip mono">{f}</span>)}
                {files.length > 12 && <span className="chip">+{files.length - 12}</span>}
              </div>
            </div>
          )}
        </div>
      )}

      <h3>История</h3>
      {!runs.length && <p style={{ color: 'var(--ink-3)' }}>Запусков пока нет — нажмите кнопку выше.</p>}
      {runs.map((r) => {
        const enr = r.enriched || {};
        const acc = enr.acceptance_after;
        return (
          <div
            key={r.run_id}
            className={`run-card ${r.current_state.toLowerCase()} ${openLogFor === r.run_id ? 'open' : ''}`}
            onClick={() => setOpenLogFor(r.run_id)}
          >
            <div className="run-card-head">
              <span className="run-phase">{r.current_state}</span>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', flex: 1 }}>{short(r.started_at)}</span>
              <span className="meta" style={{ fontSize: 10.5 }}>{r.agent}</span>
            </div>
            {(acc || enr.file_count > 0 || enr.cost_usd > 0) && (
              <div className="run-card-enriched">
                {acc && (
                  <span className={`acc-pill ${acc.verdict === 'pass' ? 'ok' : acc.verdict === 'fail' ? 'bad' : 'skip'}`}>
                    приёмка {acc.verdict}
                    {acc.counts && <span className="meta" style={{ fontSize: 10, marginLeft: 4 }}>{acc.counts.pass}/{(acc.counts.pass||0)+(acc.counts.fail||0)+(acc.counts.skipped||0)}</span>}
                  </span>
                )}
                {enr.file_count > 0 && (
                  <span className="acc-pill mono" title="изменено файлов">↑ {enr.file_count} файл{enr.file_count === 1 ? '' : enr.file_count < 5 ? 'а' : 'ов'}</span>
                )}
                {enr.cost_usd > 0 && (
                  <span className="acc-pill mono" title={`${enr.trace_count} LLM-вызов(ов)`}>
                    ${enr.cost_usd.toFixed(4)}
                  </span>
                )}
                {enr.trace_count > 0 && enr.cost_usd === 0 && (
                  <span className="acc-pill mono" title="LLM вызовы (mock, без оплаты)">{enr.trace_count} mock</span>
                )}
              </div>
            )}
            <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)', marginTop: 4 }}>
              {r.run_id}
            </div>
          </div>
        );
      })}
      <div className="meta" style={{ fontSize: 11, marginTop: 8 }}>
        Опрос каждые {live ? '2' : '12'} сек.
      </div>
    </>
  );
}

/* ====================== ACCEPTANCE ======================
   Reads /acceptance/diff which returns {latest, previous, delta}. The delta
   per-assertion drives the «улучшилось / регресс / новое» badges so the
   operator can see what changed after the last run.
*/
function AcceptanceSection({ moduleId, onClaudeAdvice, moduleObj }) {
  const [data_, setData] = useState2(null);
  const [loading, setLoading] = useState2(true);
  const [reviseBusy, setReviseBusy] = useState2(false);
  const [reviseMsg, setReviseMsg] = useState2(null);
  const apiBase = (window.SIMA_API_BASE || 'http://localhost:8787').replace(/\/$/, '');

  const fetchDiff = async () => {
    setLoading(true);
    try {
      const r = await fetch(apiBase + '/acceptance/diff?block_id=' + encodeURIComponent(moduleId), { cache: 'no-store' });
      const j = await r.json();
      setData(j.ok ? j : null);
    } catch {
      setData(null);
    }
    setLoading(false);
  };
  useEffect2(() => { fetchDiff(); /* eslint-disable-next-line */ }, [moduleId]);

  const reviseAndRerun = async () => {
    if (!data_) return;
    setReviseBusy(true); setReviseMsg(null);
    const failed = data_.latest.assertions.filter((a) => a.verdict === 'fail');
    const inconclusive = data_.latest.assertions.filter((a) => a.verdict === 'inconclusive');
    const lines = [
      `Блок ${moduleId} не прошёл приёмку. Исправь следующее, минимально инвазивно.`,
      '',
      ...failed.map((a) => `[FAIL] ${a.id}: ${a.text}\n   reasoning: ${a.reasoning || '(no reasoning)'}`),
      ...inconclusive.map((a) => `[INCONCL] ${a.id}: ${a.text}`),
      '',
      'После исправления убедись что acceptance-verifier пройдёт. Не вноси изменения за пределами зоны ответственности блока.',
    ];
    try {
      // R-7.22: «Исправить и перезапустить» тоже multi-tenant aware.
      const ac = (typeof window !== 'undefined' && window.__SIMA_DATA_CLIENT && window.__SIMA_DATA_CLIENT !== 'default')
        ? window.__SIMA_DATA_CLIENT : '';
      const r = await fetch(apiBase + '/runs/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ block_id: moduleId, agent: 'claude', prompt: lines.join('\n'), ...(ac ? { client_id: ac } : {}) }),
      });
      const j = await r.json();
      if (j.ok) setReviseMsg({ kind: 'ok', text: `Запуск создан: ${j.run_id}. Откройте «Запуски» для прогресса.` });
      else setReviseMsg({ kind: 'fail', text: j.error || 'failed' });
    } catch (e) {
      setReviseMsg({ kind: 'fail', text: String(e.message || e) });
    }
    setReviseBusy(false);
  };

  if (loading) return <p style={{ color: 'var(--ink-3)' }}>Загрузка…</p>;
  if (!data_) return <p style={{ color: 'var(--ink-3)' }}>Нет данных приёмки. Запустите acceptance-verifier по этому блоку.</p>;

  const { latest, previous, delta } = data_;
  const { verdict, checked_at, summary, assertions } = latest;
  const cls = verdict === 'pass' ? 'ok' : verdict === 'fail' ? 'bad' : 'warn';
  const hasFailures = (latest.summary.fail || 0) > 0;
  const regressedCount = Object.values(delta || {}).filter((d) => d.kind === 'regressed').length;
  const improvedCount  = Object.values(delta || {}).filter((d) => d.kind === 'improved').length;

  return (
    <>
      <h3>Приёмка блока</h3>
      <div className={`acc-summary acc-${cls}`}>
        <div className="acc-verdict">{verdict || 'inconclusive'}</div>
        <div className="acc-counts mono">
          <span className="acc-pill ok">pass {summary.pass}</span>
          <span className="acc-pill bad">fail {summary.fail}</span>
          <span className="acc-pill skip">skip {summary.skip}</span>
          <span className="acc-pill">total {summary.total}</span>
        </div>
        {previous && (improvedCount + regressedCount > 0) && (
          <div className="acc-deltabar mono">
            {improvedCount > 0 && <span className="acc-delta improved">↑ {improvedCount} улучшилось</span>}
            {regressedCount > 0 && <span className="acc-delta regressed">↓ {regressedCount} регресс</span>}
            <span className="meta" style={{ fontSize: 10.5 }}>
              vs {short(previous.checked_at)} (verdict={previous.verdict})
            </span>
          </div>
        )}
        {checked_at && <div className="meta" style={{ fontSize: 11, marginTop: 6 }}>проверено: {short(checked_at)}</div>}
        {hasFailures && (
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="pill primary" onClick={reviseAndRerun} disabled={reviseBusy}>
              {reviseBusy ? 'Запускаю…' : '↻ Исправить и перезапустить'}
            </button>
            {onClaudeAdvice && moduleObj && (
              <button className="pill" onClick={() => onClaudeAdvice(moduleObj, {
                kind: 'block_acceptance',
                context: {
                  failed: latest.assertions.filter(a => a.verdict === 'fail').map(a => ({ id: a.id, text: a.text, reasoning: a.reasoning })),
                },
              })}>✨ Почему упала?</button>
            )}
            {reviseMsg && (
              <div className={`composer-result ${reviseMsg.kind}`} style={{ marginTop: 8, flexBasis: '100%' }}>{reviseMsg.text}</div>
            )}
          </div>
        )}
      </div>
      <div className="acc-list">
        {assertions.map((a) => {
          const d = delta?.[a.id];
          const changed = d && (d.kind === 'improved' || d.kind === 'regressed');
          return (
            <div key={a.id} className={`acc-row v-${a.verdict} ${changed ? 'd-' + d.kind : ''}`}>
              <span className="acc-id mono">{a.id}</span>
              <div style={{ flex: 1 }}>
                <div className="acc-text">{a.text}</div>
                {a.reasoning && <div className="meta" style={{ fontSize: 11, marginTop: 3 }}>{a.reasoning}</div>}
                {changed && (
                  <div className="acc-changed mono">
                    {d.from} → {d.to}
                    <span className="acc-changed-tag">{d.kind === 'improved' ? '↑ улучшилось' : '↓ регресс'}</span>
                  </div>
                )}
                {d && d.kind === 'new' && (
                  <div className="acc-changed mono"><span className="acc-changed-tag new">+ новое</span></div>
                )}
              </div>
              <span className={`acc-dot v-${a.verdict}`} title={a.verdict}>
                {a.verdict === 'pass' ? '✓' : a.verdict === 'fail' ? '✗' : '·'}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

function short(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }); }
  catch { return String(ts).slice(0, 16); }
}

/* ====================== CONTRACT (Phase E) ======================
   Shows the 5 contract files of a block (mission/kpi/acceptance/
   depends_on/provides). For each file:
     · status indicator: ! (empty) / ⚠ (weak <80 chars) / ✓ (filled)
     · current content preview
     · ✨ Заполнить через Sima — for empty files
     · ✏ Переформулировать — for filled files
     · approve modal with side-by-side preview before writing to disk
*/
const CONTRACT_FILES = [
  { file: 'mission.md',     label: 'Миссия', placeholder: 'Зачем существует этот блок?' },
  { file: 'user_story.md',  label: 'User story', placeholder: 'Как X / Когда Y / Я хочу Z / Чтобы W — что пользователь реально хочет.' },
  { file: 'kpi.md',         label: 'KPI', placeholder: 'Измеримые метрики успеха.' },
  { file: 'acceptance.md',  label: 'Приёмка', placeholder: 'Тестируемые критерии готовности.' },
  { file: 'depends_on.md',  label: 'Зависит от', placeholder: 'Какие блоки нужны для работы.' },
  { file: 'provides.md',    label: 'Даёт', placeholder: 'Какие capability отдаёт.' },
  { file: 'code_summary.md',label: 'Code summary', placeholder: 'Auto-gen после run-а: на чём написан, как, зачем (sub-summary вместо перечитывания всего кода).' },
];

function classifyContent(file, content) {
  const body = String(content || '').replace(/^#[^\n]*\n+/, '').trim();
  // Drop seeded placeholder text as if empty
  const isPlaceholder =
    /Заполни через детальную панель|добавь конкретную метрику|Заполни через детальную/i.test(body) ||
    /^- none\s*$/im.test(body) ||
    /^- T1: первая задача/.test(body);
  if (!body || isPlaceholder) return 'empty';
  if (body.length < 80) return 'weak';
  return 'filled';
}

/* ====================== VALIDATION (Phase N-1) ======================
   LLM-судья: совпадает ли реализация блока с миссией / KPI / acceptance /
   условиями (rules.md, tech_stack.md). Verdict: aligned / drift / broken.
   Каждое нарушение типизировано (mission/kpi/rules/tech_stack/...) с
   severity и evidence. UI: «Проверить соответствие» → результат с
   разбивкой violations + matches.
*/
function ValidationSection({ moduleId, moduleObj }) {
  const [latest, setLatest] = useState2(null);
  const [busy, setBusy] = useState2(false);
  const [error, setError] = useState2(null);

  const loadLatest = async () => {
    if (!moduleId || !moduleId.startsWith('b.')) { setLatest(null); return; }
    const r = await window.SIMA_API?.synthesis?.validationLatest(moduleId);
    if (r?.ok) setLatest(r);
  };
  useEffect2(() => { loadLatest(); /* eslint-disable-next-line */ }, [moduleId]);

  const runCheck = async () => {
    setBusy(true); setError(null);
    const r = await window.SIMA_API.synthesis.validateBlock(moduleId);
    setBusy(false);
    if (!r?.ok) { setError(r?.error || 'failed'); return; }
    setLatest(r);
  };

  if (!moduleId || !moduleId.startsWith('b.')) {
    return <p style={{ color: 'var(--ink-3)' }}>Доступно только для b.* блоков atlas.</p>;
  }

  const verdictClass = latest?.verdict === 'aligned' ? 'ok' : latest?.verdict === 'broken' ? 'bad' : latest?.verdict === 'drift' ? 'warn' : '';
  const verdictLabel = { aligned: '✓ соответствует', drift: '⚠ дрейф', broken: '✗ сломано' }[latest?.verdict] || latest?.verdict;

  return (
    <>
      <h3>LLM-валидатор соответствия</h3>
      <div className="meta" style={{ fontSize: 11.5, marginBottom: 10 }}>
        Sima сравнивает <strong>миссию / KPI / acceptance</strong> блока с тем, что <strong>реально сделано</strong> (decisions / checks / files), и проверяет соблюдение <strong>rules.md</strong> и <strong>tech_stack.md</strong>.
      </div>
      <div className="send-task" style={{ marginBottom: 12 }}>
        <span className="lab">Sima-судья →</span>
        <button onClick={runCheck} disabled={busy}>{busy ? 'проверяю…' : '✦ Проверить соответствие'}</button>
        {latest?.checked_at && (
          <span className="meta" style={{ fontSize: 11 }}>последняя: {short(latest.checked_at)}</span>
        )}
      </div>
      {error && <div className="lesson bad" style={{ marginBottom: 10 }}>{error}</div>}
      {!latest && !busy && <p style={{ color: 'var(--ink-3)' }}>Ещё не проверялось — нажмите кнопку выше.</p>}
      {latest?.mock && (
        <div className="composer-result fail" style={{ marginBottom: 8 }}>Demo-режим — задайте ANTHROPIC_API_KEY для реальной проверки.</div>
      )}
      {latest && (
        <div className={`acc-summary acc-${verdictClass}`}>
          <div className="acc-verdict">{verdictLabel}</div>
          {latest.summary && <div style={{ fontSize: 12.5, marginTop: 4 }}>{latest.summary}</div>}
          <div className="acc-counts mono" style={{ marginTop: 8 }}>
            {latest.violations?.length > 0 && <span className="acc-pill bad">violations {latest.violations.length}</span>}
            {latest.matches?.length > 0 && <span className="acc-pill ok">matches {latest.matches.length}</span>}
          </div>
        </div>
      )}
      {latest?.violations?.length > 0 && (
        <>
          <h3>Нарушения</h3>
          <div className="acc-list">
            {latest.violations.map((v, i) => (
              <div key={i} className={`acc-row v-${v.severity === 'high' ? 'fail' : v.severity === 'med' ? 'inconclusive' : 'skipped'}`}>
                <span className="acc-id mono">{v.kind}</span>
                <div style={{ flex: 1 }}>
                  <div className="acc-text">{v.evidence}</div>
                  {v.fix && <div className="meta" style={{ fontSize: 11, marginTop: 3 }}>предлагаемый фикс: {v.fix}</div>}
                </div>
                <span className={`val-sev sev-${v.severity || 'low'}`}>{v.severity || 'low'}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {latest?.matches?.length > 0 && (
        <>
          <h3>Что хорошо</h3>
          <ul className="val-matches">
            {latest.matches.map((m, i) => <li key={i}>✓ {m}</li>)}
          </ul>
        </>
      )}
    </>
  );
}

/* ====================== FILES (Phase N-2) ======================
   atlas/files_registry.json view per-block. Mark alive/dead/archived.
   Dead/archived files are excluded from build_context_pack so the
   agent never reads stale code.
*/
function FilesSection({ moduleId }) {
  const [files, setFiles] = useState2([]);
  const [loading, setLoading] = useState2(true);
  const [busy, setBusy] = useState2({}); // by path
  const [newPath, setNewPath] = useState2('');

  const load = async () => {
    if (!moduleId || !moduleId.startsWith('b.')) { setFiles([]); setLoading(false); return; }
    setLoading(true);
    const r = await window.SIMA_API?.meta?.filesList(moduleId);
    setFiles(r?.ok ? r.files : []);
    setLoading(false);
  };
  useEffect2(() => { load(); /* eslint-disable-next-line */ }, [moduleId]);

  const importFromBlock = async () => {
    setBusy((b) => ({ ...b, _import: true }));
    await window.SIMA_API?.meta?.filesSyncFromBlock(moduleId);
    setBusy((b) => { const c = { ...b }; delete c._import; return c; });
    await load();
  };

  const setStatus = async (p, status, reason) => {
    setBusy((b) => ({ ...b, [p]: status }));
    const r = await window.SIMA_API?.meta?.filesMark(p, status, moduleId, reason || `marked ${status} from UI`);
    setBusy((b) => { const c = { ...b }; delete c[p]; return c; });
    if (r?.ok) await load();
  };

  const addFile = async () => {
    const p = newPath.trim();
    if (!p) return;
    await setStatus(p, 'alive', 'added from UI');
    setNewPath('');
  };

  if (!moduleId || !moduleId.startsWith('b.')) {
    return <p style={{ color: 'var(--ink-3)' }}>Файловый реестр доступен только для b.* блоков atlas.</p>;
  }

  const counts = {
    alive: files.filter((f) => f.status === 'alive').length,
    dead: files.filter((f) => f.status === 'dead').length,
    archived: files.filter((f) => f.status === 'archived').length,
  };

  return (
    <>
      <h3>Файлы блока (alive / dead / archived)</h3>
      <div className="meta" style={{ fontSize: 11.5, marginBottom: 10 }}>
        <strong>dead</strong> и <strong>archived</strong> файлы исключаются из context-pack, который читают агенты — так они никогда не натыкаются на старый код.
      </div>
      <div className="acc-counts mono" style={{ marginBottom: 10 }}>
        <span className="acc-pill ok">alive {counts.alive}</span>
        <span className="acc-pill bad">dead {counts.dead}</span>
        <span className="acc-pill skip">archived {counts.archived}</span>
      </div>
      <div className="send-task" style={{ marginBottom: 10 }}>
        <button onClick={importFromBlock} disabled={!!busy._import}>{busy._import ? 'импорт…' : '↻ импорт из files.md блока'}</button>
        <input
          className="composer-input"
          placeholder="src/path/file.ts — добавить новый"
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        <button onClick={addFile} disabled={!newPath.trim()}>＋ alive</button>
      </div>
      {loading && <p style={{ color: 'var(--ink-3)' }}>Загрузка…</p>}
      {!loading && !files.length && (
        <p style={{ color: 'var(--ink-3)' }}>Нет файлов в реестре. Импортируйте из files.md блока или добавьте вручную.</p>
      )}
      <div className="files-list">
        {files.map((f) => (
          <div key={f.path} className={`files-row file-${f.status}`}>
            <span className="files-status">{f.status === 'alive' ? '✓' : f.status === 'dead' ? '✗' : '⊘'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="mono files-path">{f.path}</div>
              {f.reason && <div className="meta" style={{ fontSize: 10.5, marginTop: 2 }}>{f.reason}</div>}
            </div>
            <div className="files-actions">
              {f.status !== 'alive'    && <button onClick={() => setStatus(f.path, 'alive')} disabled={busy[f.path]}>alive</button>}
              {f.status !== 'dead'     && <button onClick={() => setStatus(f.path, 'dead', window.prompt('Причина (опционально):') || 'replaced')} disabled={busy[f.path]}>dead</button>}
              {f.status !== 'archived' && <button onClick={() => setStatus(f.path, 'archived')} disabled={busy[f.path]}>archived</button>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ContractSection({ moduleId, layer }) {
  const [files, setFiles] = useState2({});
  const [loading, setLoading] = useState2(true);
  const [editing, setEditing] = useState2(null); // { file, mode, draft, original }
  const [busy, setBusy] = useState2(false);
  const [error, setError] = useState2(null);

  const fetchAll = async () => {
    if (!moduleId || !moduleId.startsWith('b.')) { setFiles({}); setLoading(false); return; }
    setLoading(true);
    const results = await Promise.all(
      CONTRACT_FILES.map(async ({ file }) => {
        const r = await window.SIMA_API?.meta?.blockFile(moduleId, file);
        return [file, r?.ok ? r.content : ''];
      })
    );
    setFiles(Object.fromEntries(results));
    setLoading(false);
  };
  useEffect2(() => { fetchAll(); /* eslint-disable-next-line */ }, [moduleId]);

  const startFill = async (file) => {
    try { console.log('[panels] startFill invoked', { block_id: moduleId, file, hasApi: !!window.SIMA_API?.synthesis?.fillField }); } catch {}
    setEditing({ file, mode: 'fill', draft: '', original: files[file] || '' });
    setBusy(true); setError(null);
    if (!window.SIMA_API?.synthesis?.fillField) {
      setError('SIMA_API.synthesis.fillField недоступен. Открой DevTools → Console.');
      setBusy(false); setEditing(null);
      try { console.error('[panels] SIMA_API.synthesis.fillField is undefined', window.SIMA_API); } catch {}
      return;
    }
    const r = await window.SIMA_API.synthesis.fillField({
      block_id: moduleId, field: file, layer,
      mission_context: files['mission.md'] || '',
      neighbors: { kpi: files['kpi.md'], acceptance: files['acceptance.md'], depends_on: files['depends_on.md'] },
    });
    setBusy(false);
    if (!r?.ok) { setError(r?.error || 'fill failed'); setEditing(null); return; }
    setEditing({ file, mode: 'fill', draft: r.content, original: files[file] || '', mock: r.mock });
  };

  const startRewrite = async (file) => {
    // R-7.36 — diagnostic: чтобы понять, click handler вообще вызывается
    // или нет (юзер: «нажимаю — ничего не происходит, в Network тоже»).
    try { console.log('[panels] startRewrite invoked', { block_id: moduleId, file, hasApi: !!window.SIMA_API?.synthesis?.rewriteField }); } catch {}
    setEditing({ file, mode: 'rewrite', draft: '', original: files[file] || '' });
    setBusy(true); setError(null);
    if (!window.SIMA_API?.synthesis?.rewriteField) {
      setError('SIMA_API.synthesis.rewriteField недоступен. Открой DevTools → Console.');
      setBusy(false); setEditing(null);
      try { console.error('[panels] SIMA_API.synthesis.rewriteField is undefined', window.SIMA_API); } catch {}
      return;
    }
    const r = await window.SIMA_API.synthesis.rewriteField({
      block_id: moduleId, field: file,
      current_content: files[file] || '',
      mission_context: files['mission.md'] || '',
    });
    setBusy(false);
    if (!r?.ok) { setError(r?.error || 'rewrite failed'); setEditing(null); return; }
    setEditing({ file, mode: 'rewrite', draft: r.content, original: files[file] || '', mock: r.mock });
  };

  // Phase R-7.7 — manual edit без LLM-вызова. До этого все три действия
  // в контракт-табе шли через LLM (fillField / rewriteField), и при
  // mock/demo-режиме оператор не мог сохранить ничего вручную. Это и
  // была главная блокировка «не могу руками заполнить миссию».
  const startManual = (file) => {
    const current = files[file] || '';
    // Phase R-7.13 — для template-content (свежесозданные блоки имеют
    // дефолтный «Описание модуля X. Заполни через детальную панель...»)
    // textarea стартует ПУСТАЯ. Без этого оператор путался: видел
    // template + ## Layer block + дописывал свой текст под шаблоном →
    // в файле получалась мешанина. Чистый старт значит «напиши свою
    // миссию с нуля». Если контент НЕ template — оставляем как есть для
    // правки.
    const stripHeading = (s) => s.replace(/^#[^\n]*\n+/, '').replace(/\n+##\s+Layer[\s\S]*$/i, '').trim();
    const body = stripHeading(current);
    const isTemplate =
      /Заполни через детальную панель|добавь конкретную метрику|^- none\s*$/im.test(body) ||
      body.length < 20;
    setEditing({ file, mode: 'manual', draft: isTemplate ? '' : body, original: current });
    setError(null);
  };

  const approve = async () => {
    if (!editing) return;
    setBusy(true);
    // Wrap content with the standard H1 if missing (each file's first line
    // is `# <block_id> — <file basename>`).
    const heading = `# ${moduleId} — ${editing.file.replace(/\.md$/, '')}`;
    const body = editing.draft.trim();
    const content = body.startsWith('#') ? body + '\n' : `${heading}\n\n${body}\n`;
    const r = await window.SIMA_API.synthesis.patchBlockFile(moduleId, editing.file, content);
    setBusy(false);
    if (r?.ok) {
      setFiles((F) => ({ ...F, [editing.file]: content }));
      setEditing(null);
      try { window.dispatchEvent(new CustomEvent('sima-log-push', { detail: { agent: 'SIMA Core', kind: 'ok', msg: `💾 Сохранено ${moduleId} · ${editing.file}` } })); } catch {}
      // Phase R-7.15 — force a second refresh shortly after save so the
      // canvas card preview (`data.moduleDocs[id].short`) actually
      // re-renders. patchBlockFile already calls refresh() once, but in
      // some Windows environments the OS-level file cache or React
      // batching can leave the canvas with stale moduleDocs. Belt-and-
      // suspenders extra refresh covers that race.
      if (window.SIMA_API?.refresh) {
        setTimeout(() => {
          try { window.SIMA_API.refresh(); } catch {}
        }, 250);
      }
    } else {
      setError(r?.error || 'save failed');
      try { window.dispatchEvent(new CustomEvent('sima-log-push', { detail: { agent: 'SIMA Core', kind: 'fail', msg: `Save ${editing.file} не дошёл до диска: ${r?.error || 'unknown'}` } })); } catch {}
    }
  };

  if (loading) return <p style={{ color: 'var(--ink-3)' }}>Загрузка контракта…</p>;
  if (!moduleId || !moduleId.startsWith('b.')) {
    return <p style={{ color: 'var(--ink-3)' }}>Контракт доступен только для b.* блоков atlas.</p>;
  }

  return (
    <>
      <h3>Контракт блока</h3>
      <div className="meta" style={{ fontSize: 11.5, marginBottom: 10 }}>
        ! пусто · ⚠ слабо · ✓ заполнено. Sima может предложить черновик через ✨ или переформулировать через ✏.
      </div>
      {error && <div className="lesson bad" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="contract-list">
        {CONTRACT_FILES.map(({ file, label, placeholder }) => {
          const content = files[file] || '';
          const klass = classifyContent(file, content);
          const symbol = klass === 'empty' ? '!' : klass === 'weak' ? '⚠' : '✓';
          return (
            <div key={file} className={`contract-row contract-${klass}`}>
              <div className="contract-row-head">
                <span className={`contract-flag flag-${klass}`}>{symbol}</span>
                <span className="contract-label">{label}</span>
                <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{file}</span>
              </div>
              <div className="contract-actions">
                {/* Phase R-7.7 — Руками доступно ВСЕГДА, без LLM. Главное действие
                    когда LLM в demo-режиме (нет API-ключа / claude_cli не работает).
                    Phase R-7.22-vis: actions поехали из head в свой row, чтобы
                    в узкой панели (~370px) кнопки не наезжали на label. */}
                <button className="pill" onClick={() => startManual(file)} disabled={busy} title="Открыть текстовое поле и отредактировать содержимое вручную (без LLM)">✎ Руками</button>
                {klass === 'empty' && (
                  <button className="pill primary" onClick={() => startFill(file)} disabled={busy} title="Sima сгенерирует черновик через LLM">✨ Заполнить</button>
                )}
                {klass !== 'empty' && (
                  <button className="pill" onClick={() => startRewrite(file)} disabled={busy} title="Sima переформулирует существующий текст через LLM">✏ Переписать</button>
                )}
              </div>
              {/* R-7.28 — рендерим mission/kpi/acceptance/etc. как markdown
                  (заголовки, списки, code, bold) вместо raw <pre>. Контент
                  доверенный (оператор + LLM) — sanitize не делаем. */}
              {content
                ? <div className="contract-body md" dangerouslySetInnerHTML={{ __html: (window.marked?.parse?.(content) ?? content) }} />
                : <pre className="contract-body empty">({placeholder})</pre>}
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="cmd-bar" onClick={() => !busy && setEditing(null)}>
          <div className="cmd-box contract-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sysdocs-head">
              <div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.08em' }}>
                  {editing.mode === 'fill' ? 'SIMA · ЗАПОЛНЯЕТ' :
                   editing.mode === 'rewrite' ? 'SIMA · ПЕРЕФОРМУЛИРУЕТ' :
                   'РЕДАКТИРОВАНИЕ ВРУЧНУЮ'}
                </div>
                <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 18 }}>
                  {moduleId} · {editing.file}
                </h3>
              </div>
              <button className="pill" onClick={() => setEditing(null)} disabled={busy}>✕</button>
            </div>
            {editing.mock && (
              <div className="composer-result fail" style={{ margin: '8px 18px 0' }}>
                Demo-режим: задайте ANTHROPIC_API_KEY чтобы получать реальные предложения.
              </div>
            )}
            <div className="contract-modal-body">
              {editing.mode === 'rewrite' && editing.original && (
                <div>
                  <div className="meta" style={{ fontSize: 10.5, marginBottom: 4, letterSpacing: '0.06em' }}>БЫЛО</div>
                  <pre className="contract-modal-pre dim">{editing.original}</pre>
                </div>
              )}
              <div>
                <div className="meta" style={{ fontSize: 10.5, marginBottom: 4, letterSpacing: '0.06em' }}>
                  {editing.mode === 'rewrite' ? 'СТАЛО (можно поправить)' :
                   editing.mode === 'manual' ? 'ТЕКУЩЕЕ СОДЕРЖИМОЕ (правьте напрямую)' :
                   'ЧЕРНОВИК (можно поправить)'}
                </div>
                <textarea
                  className="contract-modal-edit"
                  value={editing.draft}
                  onChange={(e) => setEditing({ ...editing, draft: e.target.value })}
                  disabled={busy}
                  rows={14}
                />
              </div>
            </div>
            <div className="sysdocs-foot" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button className="pill" onClick={() => setEditing(null)} disabled={busy}>Отмена</button>
              <button className="pill primary" onClick={approve} disabled={busy || !editing.draft.trim()}>
                {busy ? 'сохраняю…' : '💾 Принять и записать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

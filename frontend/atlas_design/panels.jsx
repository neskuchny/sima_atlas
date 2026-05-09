// SIMA Atlas — left rail, detail panel, dock (terminal + roadmap), layered 3D, sync banner
const { useState: useState2, useEffect: useEffect2, useMemo: useMemo2 } = React;

/* ====================== LEFT RAIL ====================== */
function ContextRail({ data, onClose, onUpdateField, onOpenDocs }) {
  const p = data.product;
  const t = window.__SIMA_T || ((_, fb) => fb);
  // R-7.31 — editOnClick: single-click активирует edit (раньше нужен был
  // double-click, оператор не догадывался). Для structured данных
  // (KPI / Условия / стек) — кнопка ✎ ведёт в 📖 Доки (там лежит
  // первичный источник: project.md / tech_stack.md).
  const editPencil = (label) => onOpenDocs ? (
    <button className="rail-edit" onClick={(e) => { e.stopPropagation(); onOpenDocs(); }} title={`${t('rail.edit_in_docs_prefix', 'Edit')} ${label} ${t('rail.edit_in_docs_suffix', 'in 📖 Docs')}`}>✎</button>
  ) : null;
  return (
    <aside className="rail">
      {onClose && <button className="rail-collapse" onClick={onClose} title={t('rail.collapse_title', 'Collapse')}>◀</button>}
      <h2>{t('rail.product_context', 'Product context')}</h2>
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
        <div className="lbl">{t('rail.goal', 'Goal')} <span className="tag">@goal</span></div>
        <div className="val">
          {onUpdateField ? <EditableText editOnClick value={p.goal} onChange={(v) => onUpdateField('goal', v)} multiline /> : p.goal}
        </div>
      </div>

      <div className="field italic">
        <div className="lbl">{t('rail.mission', 'Mission')} <span className="tag">@mission</span></div>
        <div className="val">
          {onUpdateField ? <EditableText editOnClick value={p.mission} onChange={(v) => onUpdateField('mission', v)} multiline /> : p.mission}
        </div>
      </div>

      <div className="field">
        <div className="lbl">{t('rail.quality_kpi', 'Quality / KPI')} <span className="tag">@quality</span>{editPencil(t('rail.kpi_label', 'KPI (project.md)'))}</div>
        {p.quality.map(q => (
          <div key={q.code} className="kpi-row">
            <span className="code">{q.code}</span>
            <span className="lbl2">{q.label}</span>
          </div>
        ))}
        {!p.quality.length && <div className="meta" style={{ fontSize: 11.5, color: 'var(--ink-4)' }}>{t('rail.fill_in_docs', 'Fill in via 📖 Docs → project.md')}</div>}
      </div>

      <div className="field">
        <div className="lbl">{t('rail.conditions_stack', 'Conditions / stack')} <span className="tag">@conditions</span>{editPencil(t('rail.stack_label', 'stack (tech_stack.md)'))}</div>
        {(() => {
          // R-7.68 — guard: payload may have undefined conditions or
          // missing per-layer arrays (older clients, partial state).
          const cond = p.conditions || {};
          const backend = Array.isArray(cond.backend) ? cond.backend : [];
          const frontend = Array.isArray(cond.frontend) ? cond.frontend : [];
          const logic = Array.isArray(cond.logic) ? cond.logic : [];
          const checks = Array.isArray(cond.checks) ? cond.checks : [];
          const allEmpty = !backend.length && !frontend.length && !logic.length && !checks.length;
          if (allEmpty && onOpenDocs) {
            return (
              <button className="rail-empty-cta" onClick={onOpenDocs}>
                <span className="rail-empty-cta-icon">✎</span>
                <span>{t('rail.stack_empty_cta', 'Click to fill in tech_stack.md in 📖 Docs')}</span>
              </button>
            );
          }
          const layerRow = (label, arr) => (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10.5, color: 'var(--ink-4)', marginBottom: 4, letterSpacing: '0.06em' }}>{label}</div>
              <div className="chips">{arr.length ? arr.map(x => <span key={x} className="chip">{x}</span>) : <span className="meta" style={{ fontSize: 11 }}>—</span>}</div>
            </div>
          );
          return (
            <>
              {layerRow(t('rail.layer_backend',  'BACKEND'),  backend)}
              {layerRow(t('rail.layer_frontend', 'FRONTEND'), frontend)}
              {layerRow(t('rail.layer_logic',    'LOGIC'),    logic)}
              {layerRow(t('rail.layer_checks',   'CHECKS'),   checks)}
            </>
          );
        })()}
      </div>
    </aside>
  );
}

/* ====================== DETAIL PANEL ====================== */
function DetailPanel({ data, modules: liveModules, moduleId, onClose, desyncResolved, onSendToAgent, onDrillDown, onSelect, onOpenTz, onClaudeAdvice, onAddEdge }) {
  const [tab, setTab] = useState2('overview');
  useEffect2(() => { setTab('overview'); }, [moduleId]);

  if (!moduleId) {
    const t = window.__SIMA_T || ((_, fb) => fb);
    return (
      <aside className="detail">
        <div className="dhead">
          <div className="layer-tag mono">no-selection</div>
          <h1>{t('detail.select_module', 'Select a module')}</h1>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5 }}>
            {t('detail.select_module_hint', 'Click a node on the canvas — its description, KPIs, tasks, logic and decision history will appear here. Through this panel agents (Claude Code, Cursor, Codex) get the right block\'s context.')}
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
    const t = window.__SIMA_T || ((_, fb) => fb);
    // Block id is selected but neither source has it. Show a friendly
    // placeholder instead of `return null` — that previously hid the
    // panel completely and confused the operator.
    return (
      <aside className="detail">
        <div className="dhead">
          <div className="layer-tag mono">@{moduleId.replace(/^b\./, '')}</div>
          <h1>{moduleId}</h1>
          <div style={{ fontSize: 13, color: 'var(--ink-3)', lineHeight: 1.5, marginTop: 8 }}>
            {t('detail.block_not_loaded', 'Block not yet loaded. Maybe the page didn\'t refresh after creation — press Sync above or Ctrl+R.')}
          </div>
        </div>
      </aside>
    );
  }
  const tasks = data.tasks?.[moduleId] || [];
  const subs = data.submodules?.[moduleId] || [];
  const lessons = (data.lessons || []).filter(l => l.module === moduleId || (m.layer === 'frontend' && l.module === 'frontend'));
  const status = (moduleId === 'metrics' && desyncResolved) ? 'progress' : m.status;

  // R-7.52 — labels via i18n. Re-render on locale change is driven by
  // App() at the tree root (see index.html App fn) — DetailPanel doesn't
  // subscribe locally to keep its hook count constant.
  const t = window.__SIMA_T || ((_, fb) => fb);
  const tabs = [
    { id: 'overview',    label: t('tab.overview',    'Overview') },
    { id: 'contract',    label: t('tab.contract',    'Contract') },
    { id: 'tasks',       label: t('tab.tasks',       'Tasks'),       count: tasks.length },
    { id: 'runs',        label: t('tab.runs',        'Runs') },
    { id: 'acceptance',  label: t('tab.acceptance',  'Acceptance') },
    { id: 'validation',  label: t('tab.validation',  'Validation') },
    { id: 'files',       label: t('tab.files',       'Files') },
    { id: 'subs',        label: t('tab.subs',        'Submodules'),  count: subs.length },
    { id: 'memory',      label: t('tab.memory',      'Memory'),      count: lessons.length },
    { id: 'connections', label: t('tab.connections', 'Connections') },
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
                if (!window.confirm(`${t('detail.delete_confirm_a', 'Delete block')} ${m.id}${t('detail.delete_confirm_b', '? Entry in graph.json and directory atlas/clients/<...>/blocks/')}${m.id}${t('detail.delete_confirm_c', '/ will be deleted. Irreversible (but files remain in git history).')}`)) return;
                const r = await window.SIMA_API.deleteBlock(m.id, true /* hard */);
                if (r?.ok) {
                  try { window.dispatchEvent(new CustomEvent('sima-log-push', { detail: { agent: 'SIMA Core', kind: 'ok', msg: `${t('detail.deleted_log', '🗑 Deleted block')} ${m.id}` } })); } catch {}
                  if (onClose) onClose();
                } else {
                  try { window.dispatchEvent(new CustomEvent('sima-log-push', { detail: { agent: 'SIMA Core', kind: 'fail', msg: `${t('detail.delete_failed_log', 'Delete')} ${m.id} ${t('detail.delete_failed_log_b', 'failed:')} ${r?.error || 'unknown'}` } })); } catch {}
                }
              }}
              title={t('detail.delete_title', 'Delete block (hard, from disk)')}
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
              placeholder={t('detail.title_placeholder', 'block name…')}
            />
          ) : m.title}
        </h1>
        <div className="meta">
          <span className="status-pill"><span className="dot" style={{ background: `var(--st-${status})` }} />{statusLabel(status)}</span>
          <span className="status-pill mono">P{m.priority}</span>
          <span className="status-pill mono">layer/{m.layer}</span>
          {m.checked && <span className="status-pill">{t('detail.checked', '✓ checked')}</span>}
          {/* R-7.44 — для подмодуля показываем родителя как clickable pill;
              кликом переключаемся на родителя в правой панели. */}
          {m.parent_block_id && (() => {
            const parent = (liveModules || data.modules || []).find(x => x.id === m.parent_block_id) || (data.modules || []).find(x => x.id === m.parent_block_id);
            const parentTitle = parent?.title || m.parent_block_id;
            return (
              <span
                className="status-pill mono"
                onClick={() => onSelect && onSelect(m.parent_block_id)}
                style={{ cursor: onSelect ? 'pointer' : 'default', background: 'rgba(80, 120, 200, 0.12)', color: 'var(--ink)' }}
                title={`${t('detail.parent_title', 'Parent block:')} ${m.parent_block_id} (${parentTitle}). ${t('detail.parent_click', 'Click to open.')}`}
              >
                ↑ parent: {m.parent_block_id}
              </span>
            );
          })()}
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
            <strong style={{ color: 'var(--ink-2)' }}>{t('detail.gate_hint', 'to advance status — fill:')}</strong>{' '}
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

// R-7.48 — выбор слоя блока inline. Цвет ноды на канвасе и фильтрация
// в layered-view зависят от поля layer (backend/frontend/logic/tests).
// До R-7.48 у нас не было способа сменить layer уже созданного блока —
// все top-level блоки оставались дефолтным `logic`, канвас был одного
// цвета. Теперь — клик по пилюле → patchBlock → refresh.
function LayerPicker({ block }) {
  if (!block || !block.id || !String(block.id).startsWith('b.')) return null;
  // Re-render on locale change driven by App() root — see index.html.
  const t = window.__SIMA_T || ((_, fb) => fb);
  const current = block.layer || 'logic';
  const LAYERS = [
    { id: 'backend',  label: t('layer.backend',  'Backend'),  hint: t('layer.backend_hint',  'API, persistence, server logic') },
    { id: 'logic',    label: t('layer.logic',    'Logic'),    hint: t('layer.logic_hint',    'business rules, pure functions') },
    { id: 'frontend', label: t('layer.frontend', 'Frontend'), hint: t('layer.frontend_hint', 'UI components, screens') },
    { id: 'tests',    label: t('layer.tests',    'Tests'),    hint: t('layer.tests_hint',    'unit, e2e, validations') },
  ];
  const onPick = async (layer) => {
    if (layer === current) return;
    if (!window.SIMA_API?.patchBlock) return;
    await window.SIMA_API.patchBlock(block.id, { layer });
  };
  return (
    <div className="layer-pill-row" style={{ marginBottom: 14 }}>
      <span className="lp-label">{t('layer.picker_label', 'Layer')}</span>
      {LAYERS.map((L) => (
        <button
          key={L.id}
          className={`lp-pill lp-${L.id} ${L.id === current ? 'active' : ''}`}
          onClick={() => onPick(L.id)}
          title={L.hint}
        >
          {L.label}
        </button>
      ))}
    </div>
  );
}

function Overview({ m, status, desyncResolved, onSendToAgent, onDrillDown, hasSubsystem, onOpenTz, onClaudeAdvice }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
  // R-7.69 — Overview was reading legacy hardcoded MODULE_DESC for
  // Logic/Backend/Frontend/KPI sections. Operator: «Backend / Logic /
  // Block KPIs — not editable, missing from Contract». They were
  // display-only labels for legacy demo blocks; new blocks rendered
  // empty sections that confused operators. Now we load the actual
  // contract files (mission.md / kpi.md / acceptance.md / depends_on.md /
  // provides.md) and surface a live summary. To edit them, click
  // «Open Contract →» which switches the right-side tab.
  const desc = MODULE_DESC[m.id] || {};
  const [missionText, setMissionText] = useState2('');
  const [kpiText, setKpiText] = useState2('');
  const [acceptText, setAcceptText] = useState2('');
  const [depsText, setDepsText] = useState2('');
  const [providesText, setProvidesText] = useState2('');
  // R-7.86 — also load narrative + decisions for the Implementation
  // Status panel (counters: how many runs documented, how many
  // architectural decisions logged for this block).
  const [narrativeText, setNarrativeText] = useState2('');
  const [decisionsText, setDecisionsText] = useState2('');
  const [tasksText, setTasksText] = useState2('');
  const [loaded, setLoaded] = useState2(false);

  useEffect2(() => {
    setLoaded(false);
    if (!m.id || !m.id.startsWith('b.')) { setLoaded(true); return; }
    let cancelled = false;
    const load = async (file) => {
      try {
        const r = await window.SIMA_API?.meta?.blockFile(m.id, file);
        if (cancelled) return '';
        return r?.ok ? String(r.content || '') : '';
      } catch { return ''; }
    };
    (async () => {
      const [mission, kpi, accept, deps, prov, narr, dec, tk] = await Promise.all([
        load('mission.md'), load('kpi.md'), load('acceptance.md'),
        load('depends_on.md'), load('provides.md'),
        load('narrative.md'), load('decisions.log'), load('tasks.md'),
      ]);
      if (cancelled) return;
      const stripHead = (s) => s.replace(/^#[^\n]*\n+/, '').replace(/\n+##\s+Layer[\s\S]*$/i, '').trim();
      setMissionText(stripHead(mission));
      setKpiText(stripHead(kpi));
      setAcceptText(stripHead(accept));
      setDepsText(stripHead(deps));
      setProvidesText(stripHead(prov));
      setNarrativeText(narr || '');
      setDecisionsText(dec || '');
      setTasksText(stripHead(tk));
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [m.id]);

  const isPlaceholder = (s) => !s || /Заполни через детальную панель|добавь конкретную метрику|fill in via the detail panel|first task|none/i.test(s);
  const liveMission = !isPlaceholder(missionText) ? missionText : '';
  const whyText = liveMission || desc.why || (loaded ? t('overview.module_desc_placeholder', 'No mission yet. Open the «Contract» tab and click ✎ Edit next to mission.md to fill it in.') : t('overview.loading', 'Loading…'));

  // Parse KPI markdown — list items become rows; 1st number/percentage gets badge.
  const kpiRows = !isPlaceholder(kpiText)
    ? kpiText.split(/\r?\n/).filter(l => /^\s*[-*]\s/.test(l)).map(l => l.replace(/^\s*[-*]\s+/, '').trim())
    : [];

  // Parse acceptance — count - [ ] / - [x] checkboxes
  const acceptItems = !isPlaceholder(acceptText)
    ? acceptText.split(/\r?\n/).filter(l => /^\s*-\s*\[[ xX]\]/.test(l))
    : [];
  const acceptDone = acceptItems.filter(l => /\[\s*[xX]\s*\]/.test(l)).length;

  // Parse depends_on / provides — list items
  const parseList = (s) => !isPlaceholder(s)
    ? s.split(/\r?\n/).filter(l => /^\s*-\s/.test(l)).map(l => l.replace(/^\s*-\s+/, '').trim())
    : [];
  const depsList = parseList(depsText);
  const providesList = parseList(providesText);

  return (
    <>
      {hasSubsystem && (
        <div style={{ background: 'var(--ink)', color: 'var(--paper)', padding: '12px 14px', borderRadius: 8, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, opacity: 0.7, fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.06em', marginBottom: 3 }}>{t('overview.subsystem', 'SUBSYSTEM')}</div>
            <div style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 15 }}>{t('overview.subsystem_title', 'This is a whole subsystem with its own contour')}</div>
            <div style={{ fontSize: 11.5, opacity: 0.7, marginTop: 2 }}>{t('overview.subsystem_sub', 'modules, KPIs, stack, tasks — open the schema inside')}</div>
          </div>
          <button onClick={() => onDrillDown(m.id)} style={{ background: 'var(--paper)', color: 'var(--ink)', border: 0, padding: '8px 14px', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600 }}>{t('overview.open_schema', 'Open schema →')}</button>
        </div>
      )}
      {m.warn && status !== 'progress' && (
        <div className="lesson bad" style={{ marginBottom: 14 }}>
          <div className="verdict">{t('overview.warn_attention', 'attention · sima-core')}</div>
          {m.warn}
        </div>
      )}
      <LayerPicker block={m} />

      {/* R-7.86 — Implementation Status dashboard. Operator: «можно
          ли в модуле/блоке увидеть что реализовал?» — yes, this panel
          aggregates contract-vs-reality progress at a glance. Each
          row shows status with a color marker so the operator
          immediately sees what's filled vs what's missing. */}
      {(() => {
        const v = (s) => s && !isPlaceholder(s);
        const missionFilled = v(missionText);
        const kpiCount = kpiRows.length;
        const acceptTotal = acceptItems.length;
        const acceptDoneCount = acceptDone;
        const taskCount = (tasksText || '').split(/\r?\n/).filter(l => /^\s*-\s*\[[ xX]\]/.test(l)).length;
        const taskDone = (tasksText || '').split(/\r?\n/).filter(l => /^\s*-\s*\[[xX]\]/.test(l)).length;
        const filesAliveCount = (m.contract && m.contract.filled) || 0;
        // Count append-only entries by counting `## ` headings (each entry = one section)
        const decisionsCount = decisionsText ? (decisionsText.match(/^[0-9]{4}-[0-9]{2}-[0-9]{2}/gm) || []).length : 0;
        const narrativeRuns = narrativeText ? (narrativeText.match(/^## /gm) || []).length : 0;
        const dot = (state) => ({
          good:  { bg: 'var(--st-done)',     mark: '✓' },
          warn:  { bg: 'var(--st-progress)', mark: '~' },
          bad:   { bg: 'var(--st-fail)',     mark: '✗' },
          empty: { bg: 'var(--ink-4)',       mark: '·' },
        }[state]);
        const rows = [
          { label: t('status.mission', 'Mission'),    state: missionFilled ? 'good' : 'empty', value: missionFilled ? `${missionText.length} chars` : t('status.not_filled', 'not filled') },
          { label: t('status.kpi',     'KPIs'),       state: kpiCount > 0 ? 'good' : 'empty', value: `${kpiCount} ${t('status.defined', 'defined')}` },
          { label: t('status.acceptance', 'Acceptance'), state: acceptTotal === 0 ? 'empty' : (acceptDoneCount === acceptTotal ? 'good' : 'warn'), value: acceptTotal > 0 ? `${acceptDoneCount}/${acceptTotal} ${t('status.done', 'done')}` : t('status.no_assertions', 'no assertions') },
          { label: t('status.tasks',    'Tasks'),       state: taskCount === 0 ? 'empty' : (taskDone === taskCount ? 'good' : 'warn'), value: taskCount > 0 ? `${taskDone}/${taskCount} ${t('status.done', 'done')}` : t('status.no_tasks', 'no tasks') },
          { label: t('status.files',    'Files alive'), state: filesAliveCount > 0 ? 'good' : 'empty', value: filesAliveCount > 0 ? `${filesAliveCount} ${t('status.files_word', 'files')}` : t('status.no_files', 'none') },
          { label: t('status.decisions', 'Decisions logged'), state: decisionsCount > 0 ? 'good' : 'empty', value: decisionsCount > 0 ? `${decisionsCount} ${t('status.entries', 'entries')}` : t('status.empty', 'empty') },
          { label: t('status.narrative', 'Run history'), state: narrativeRuns > 0 ? 'good' : 'empty', value: narrativeRuns > 0 ? `${narrativeRuns} ${t('status.runs_documented', 'run(s) documented')}` : t('status.no_runs', 'no runs yet') },
          { label: t('status.block_status', 'Block status'), state: m.status === 'done' ? 'good' : (m.status === 'desync' || m.status === 'fail' ? 'bad' : 'warn'), value: m.status },
        ];
        return (
          <div className="ov-section">
            <div className="ov-head">
              <h3>{t('overview.implementation_status', '🎯 Implementation Status')}</h3>
            </div>
            <div className="impl-status-grid">
              {rows.map((r, i) => {
                const d = dot(r.state);
                return (
                  <div key={i} className={`impl-status-row impl-state-${r.state}`}>
                    <span className="impl-status-mark" style={{ background: d.bg }}>{d.mark}</span>
                    <span className="impl-status-label">{r.label}</span>
                    <span className="impl-status-value">{r.value}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Mission / Why */}
      <div className="ov-section">
        <div className="ov-head">
          <h3>{t('overview.mission', 'Mission')} <span className="ov-file">mission.md</span></h3>
          {liveMission && <button className="ov-edit-link" onClick={() => onSendToAgent && (() => {})()} title={t('overview.edit_in_contract','Edit in Contract tab')}>✎</button>}
        </div>
        <p className="lede" style={{ whiteSpace: 'pre-wrap' }}>{whyText}</p>
      </div>

      {/* KPIs */}
      <div className="ov-section">
        <div className="ov-head">
          <h3>{t('overview.kpi', 'Block KPIs')} <span className="ov-file">kpi.md</span></h3>
        </div>
        {kpiRows.length ? (
          <div className="ov-kpi-list">
            {kpiRows.map((row, i) => (
              <div key={i} className="ov-kpi-row">{row}</div>
            ))}
          </div>
        ) : (
          <p className="meta" style={{ fontSize: 12 }}>{t('overview.kpi_empty', 'No KPIs defined yet. Open the «Contract» tab → kpi.md.')}</p>
        )}
      </div>

      {/* Acceptance */}
      <div className="ov-section">
        <div className="ov-head">
          <h3>{t('overview.acceptance', 'Acceptance')} <span className="ov-file">acceptance.md</span></h3>
          {acceptItems.length > 0 && (
            <span className="ov-badge">{acceptDone}/{acceptItems.length} {t('overview.acceptance_done','done')}</span>
          )}
        </div>
        {acceptItems.length === 0 && (
          <p className="meta" style={{ fontSize: 12 }}>{t('overview.acceptance_empty', 'No acceptance criteria yet. Open the «Contract» tab → acceptance.md.')}</p>
        )}
      </div>

      {/* Dependencies */}
      <div className="ov-section">
        <div className="ov-head">
          <h3>{t('overview.dependencies', 'Dependencies')} <span className="ov-file">depends_on.md / provides.md</span></h3>
        </div>
        <div className="ov-deps-grid">
          <div>
            <div className="ov-deps-label">{t('overview.depends_on', 'depends on')}</div>
            {depsList.length
              ? <div className="chips">{depsList.map((d, i) => <span key={i} className="chip mono" style={{ fontSize: 11 }}>{d.split(/[:\s]/)[0]}</span>)}</div>
              : <span className="meta" style={{ fontSize: 11 }}>—</span>}
          </div>
          <div>
            <div className="ov-deps-label">{t('overview.provides', 'provides')}</div>
            {providesList.length
              ? <div className="chips">{providesList.map((d, i) => <span key={i} className="chip mono" style={{ fontSize: 11 }}>{d.split(/[:\s]/)[0]}</span>)}</div>
              : <span className="meta" style={{ fontSize: 11 }}>—</span>}
          </div>
        </div>
      </div>

      {/* Block tech stack — from graph.json (live) */}
      {Array.isArray(m.tech_stack) && m.tech_stack.length > 0 && (
        <div className="ov-section">
          <div className="ov-head">
            <h3>{t('overview.tech_stack', 'Block tech stack')} <span className="ov-file">graph.json</span></h3>
          </div>
          <div className="chips">{m.tech_stack.map(x => <span key={x} className="chip mono" style={{ fontSize: 11 }}>{x}</span>)}</div>
          <div className="meta" style={{ fontSize: 11, marginTop: 4 }}>
            {t('overview.tech_stack_meta_pre', 'from')} <code>graph.json</code> — {t('overview.tech_stack_meta_post', 'sync-checked against global tech_stack.md')}.
          </div>
        </div>
      )}

      {/* Send to agent */}
      <h3>{t('overview.send_to_agent', 'Send to agent')}</h3>
      <div className="send-task">
        <span className="lab">{t('overview.this_block_ctx', 'This block\'s context →')}</span>
        <button onClick={() => onSendToAgent('claude', m)}>Claude Code</button>
        <button onClick={() => onSendToAgent('cursor', m)}>Cursor</button>
        <button onClick={() => onSendToAgent('codex', m)}>Codex</button>
      </div>

      <BlockScreenshot block={m} />

      <h3>{t('overview.documents', 'Documents')}</h3>
      <div className="send-task">
        <span className="lab">{t('overview.generate_export', 'Generate / export →')}</span>
        {onOpenTz && <button onClick={() => onOpenTz(m.id)}>{t('overview.tz_block', '✎ Block spec')}</button>}
        <UserDocsButton blockId={m.id} />
        {onClaudeAdvice && <button onClick={() => onClaudeAdvice(m)}>{t('overview.claude_advice', '✨ Claude\'s advice')}</button>}
      </div>
    </>
  );
}

// P-3 — block screenshot section. Shows latest captured image (or empty
// state) and a button to trigger a fresh capture against block.ui_url.
// Operator can edit the ui_url inline; saves via patchBlock.
function BlockScreenshot({ block }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
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
      setUrlSaveMsg({ kind: 'fail', text: t('screenshot.url_invalid', 'URL must start with http:// or https://') });
      return;
    }
    const r = await window.SIMA_API.patchBlock(block.id, { ui_url: u });
    if (r?.ok) {
      setEditing(false);
      setUrlSaveMsg({ kind: 'ok', text: t('screenshot.saved', '✓ saved') });
      setTimeout(() => setUrlSaveMsg(null), 2200);
    } else {
      setUrlSaveMsg({ kind: 'fail', text: r?.error || t('screenshot.save_failed', 'save failed') });
    }
  };

  if (!block?.id || !block.id.startsWith('b.')) return null;
  const apiBase = (window.SIMA_API_BASE || 'http://localhost:8787').replace(/\/$/, '');
  const hasShot = info?.has_latest;
  const imgSrc = hasShot ? `${apiBase}/atlas/blocks/${encodeURIComponent(block.id)}/screenshot-file?name=latest.png&t=${bumper}` : null;

  return (
    <>
      <h3>{t('screenshot.title', 'Block screenshot')}</h3>
      <div className="block-screenshot">
        {hasShot ? (
          <a href={imgSrc} target="_blank" rel="noreferrer" className="block-screenshot-img-wrap">
            <img src={imgSrc} alt={`screenshot of ${block.id}`} />
          </a>
        ) : (
          <div className="block-screenshot-empty meta">
            {block.ui_url
              ? t('screenshot.no_shot', 'Screenshot not taken yet. Click below.')
              : t('screenshot.set_url', 'Set the block\'s ui_url so Sima can capture a screenshot.')}
          </div>
        )}
        <div className="block-screenshot-meta meta">
          {info?.files?.[0] && <span>{t('screenshot.updated', 'updated:')} {String(info.files[0].mtime).slice(0, 16).replace('T', ' ')} · {(info.files[0].bytes / 1024).toFixed(1)} {t('screenshot.kb', 'KB')}</span>}
          {info?.files?.length > 1 && <span style={{ marginLeft: 8 }}>{t('screenshot.history', 'history:')} {info.files.length}</span>}
        </div>
      </div>
      <div className="send-task" style={{ marginTop: 8, alignItems: 'flex-start' }}>
        <span className="lab" style={{ paddingTop: 6 }}>{t('screenshot.ui_url', 'UI URL →')}</span>
        {editing ? (
          <>
            <input
              className="composer-input"
              placeholder="https://your-app.example.com/feature"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
            <button onClick={saveUrl}>{t('screenshot.save', '💾 save')}</button>
            <button onClick={() => { setEditing(false); setUrlDraft(block.ui_url || ''); }}>{t('screenshot.cancel', 'cancel')}</button>
          </>
        ) : (
          <>
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', flex: 1 }}>
              {block.ui_url || t('screenshot.not_set', '_(not set)_')}
            </span>
            <button onClick={() => setEditing(true)}>{t('screenshot.edit', '✎ edit')}</button>
          </>
        )}
        <button onClick={capture} disabled={busy || !block.ui_url}>{busy ? t('screenshot.taking', 'capturing…') : t('screenshot.take', '📸 take screenshot')}</button>
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
  const t = window.__SIMA_T || ((_, fb) => fb);
  const [busy, setBusy] = useState2(false);
  const [msg, setMsg] = useState2(null);
  if (!blockId || !blockId.startsWith('b.')) return null;
  const click = async () => {
    setBusy(true); setMsg(null);
    const r = await window.SIMA_API?.meta?.userDocsRegenerate(blockId);
    setBusy(false);
    if (!r) { setMsg({ kind: 'fail', text: t('userdocs.no_response', 'no response') }); return; }
    setMsg({
      kind: r.ok ? 'ok' : 'fail',
      text: r.ok ? t('userdocs.ok', '✓ docs generated — open 📖 Docs → User') : `✗ ${r.error || 'failed'}`,
    });
    setTimeout(() => setMsg(null), 3500);
  };
  return (
    <>
      <button onClick={click} disabled={busy} title={t('userdocs.title', 'Generate a step-by-step guide for the end user (Click X → field Y → button Z)')}>
        {busy ? '…' : t('userdocs.label', '📖 User guide')}
      </button>
      {msg && <span className={`composer-result ${msg.kind}`} style={{ fontSize: 11, padding: '2px 8px', marginLeft: 6 }}>{msg.text}</span>}
    </>
  );
}

function TasksList({ tasks, desyncResolved, moduleId, onSendToAgent, missionText, layer }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
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
    if (r?.ok) setSuggested(r.tasks.map((tk) => ({ ...tk, _mock: r.mock })));
  };

  return (
    <>
      <h3>{t('tasks.decomposition', 'Decomposition')}</h3>
      {!tasks.length && <p style={{ color: 'var(--ink-3)' }}>{t('tasks.no_tasks', 'Tasks will appear when the agent starts decomposition.')}</p>}
      {tasks.map(tk => {
        const st = (moduleId === 'metrics' && tk.id === 'T-202' && desyncResolved) ? 'progress' : tk.status;
        return (
          <div key={tk.id} className="task-row">
            <span className="tid">{tk.id}</span>
            <div>
              <div className="ttitle">{tk.title}</div>
              {tk.note && st !== 'progress' && <div className="tnote">⚠ {tk.note}</div>}
              <div className="tmeta">
                <span className="mono">{tk.priority}</span>
                {tk.agent && <span className="agent-chip">{tk.agent}</span>}
              </div>
            </div>
            <div className="tstatus" data-st={st} title={statusLabel(st)} />
          </div>
        );
      })}

      {moduleId && moduleId.startsWith('b.') && (
        <>
          <h3>{t('tasks.sima_will_decompose', '✦ Sima will decompose into tasks')}</h3>
          <div className="send-task" style={{ marginBottom: 8 }}>
            <span className="lab">{t('tasks.from_block_mission', 'From block mission →')}</span>
            <button onClick={askSima} disabled={busy}>{busy ? t('tasks.thinking', 'thinking…') : t('tasks.propose_decomp', '✦ propose decomposition')}</button>
          </div>
          {suggested[0]?._mock && (
            <div className="composer-result fail" style={{ marginBottom: 8 }}>{t('tasks.demo_need_key', 'Demo mode — ANTHROPIC_API_KEY required.')}</div>
          )}
          {suggested.map((tk) => (
            <div key={tk.id} className="synth-task">
              <span className="mono" style={{ fontSize: 11, color: 'var(--ink-3)' }}>{tk.id}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13 }}>{tk.title}</div>
                {tk.note && <div className="meta" style={{ fontSize: 11 }}>{tk.note}</div>}
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <span className="acc-pill mono">{tk.priority}</span>
                  <span className="acc-pill mono">{tk.agent}</span>
                </div>
              </div>
            </div>
          ))}
          {suggested.length > 0 && (
            <div className="meta" style={{ fontSize: 11, marginTop: 4 }}>
              {t('tasks.suggestions_hint', 'Suggestions are display-only — to write them to tasks.md use «Send to Claude Code» with this context.')}
            </div>
          )}
        </>
      )}
    </>
  );
}

function SubsList({ subs, desyncResolved, moduleId }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
  if (!subs.length) return <p style={{ color: 'var(--ink-3)' }}>{t('subs.no_subs', 'This block has no submodules yet.')}</p>;
  return (
    <>
      <h3>{t('subs.title', 'Submodules')}</h3>
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
  const t = window.__SIMA_T || ((_, fb) => fb);
  // R-7.79 — Memory tab now surfaces the FULL block memory layer:
  // narrative.md (human-readable run history), decisions.log,
  // patterns.md, code_summary.md, checks.log tail. Operator: «логи
  // должны быть человеческим языком — что пробовала, как, почему не
  // работало», so narrative.md is the new primary view (rendered as
  // markdown), decisions/patterns/checks are reference panels below.
  const [narrative, setNarrative] = useState2(null);
  const [decisions, setDecisions] = useState2(null);
  const [patterns, setPatterns] = useState2(null);
  const [codeSummary, setCodeSummary] = useState2(null);
  const [checksLog, setChecksLog] = useState2(null);
  const [packBusy, setPackBusy] = useState2(false);
  const [packResult, setPackResult] = useState2(null);
  const apiBase = (window.SIMA_API_BASE || 'http://localhost:8787').replace(/\/$/, '');

  useEffect2(() => {
    let alive = true;
    (async () => {
      if (!moduleId || !moduleId.startsWith('b.')) {
        setNarrative(null); setDecisions(null); setPatterns(null);
        setCodeSummary(null); setChecksLog(null);
        return;
      }
      const [n, d, p, cs, cl] = await Promise.all([
        window.SIMA_API?.meta?.blockFile(moduleId, 'narrative.md'),
        window.SIMA_API?.meta?.blockFile(moduleId, 'decisions.log'),
        window.SIMA_API?.meta?.blockFile(moduleId, 'patterns.md'),
        window.SIMA_API?.meta?.blockFile(moduleId, 'code_summary.md'),
        window.SIMA_API?.meta?.blockFile(moduleId, 'checks.log'),
      ]);
      if (!alive) return;
      setNarrative(n?.ok ? n.content : null);
      setDecisions(d?.ok ? d.content : null);
      setPatterns(p?.ok ? p.content : null);
      setCodeSummary(cs?.ok ? cs.content : null);
      setChecksLog(cl?.ok ? cl.content : null);
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
          <span className="lab">{t('memory.context_pack', 'Context pack →')}</span>
          <button onClick={buildPack} disabled={packBusy}>{packBusy ? t('memory.collecting', 'Building…') : t('memory.build_pack', '🗂 Build context_pack')}</button>
          {packResult && (
            <span className={`composer-result ${packResult.ok ? 'ok' : 'fail'}`} style={{ marginLeft: 8, padding: '4px 10px' }}>
              {packResult.ok ? <>✓ <span className="mono">{packResult.file}</span></> : <>✗ {packResult.error}</>}
            </span>
          )}
        </div>
      )}

      {/* R-7.79 — Narrative log: human-readable history of what was
          tried, what worked, what was rejected, with sections written
          by the agent in plain English. Primary memory view. */}
      {narrative && narrative.trim() && narrative.trim() !== '# narrative' ? (
        <>
          <h3>{t('memory.narrative_title', '📖 Run history (human-readable)')}</h3>
          <div className="memory-narrative">
            <div className="contract-body md" dangerouslySetInnerHTML={{
              __html: (window.marked?.parse ? window.marked.parse(narrative) : `<pre>${narrative.replace(/[<>&]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;' }[c]))}</pre>`)
            }} />
          </div>
        </>
      ) : (moduleId && moduleId.startsWith('b.')) ? (
        <div className="memory-narrative-empty">
          <h3>{t('memory.narrative_title', '📖 Run history (human-readable)')}</h3>
          <p style={{ color: 'var(--ink-3)', fontSize: 12.5, lineHeight: 1.5 }}>
            {t('memory.narrative_empty', 'No run history yet. After the first agent run, narrative.md will accumulate here: what was tried, what worked, what was rejected and why — written in plain language so you can pick up context after weeks away from the block.')}
          </p>
        </div>
      ) : null}

      {/* R-7.79 — Code summary: auto-generated each successful run */}
      {codeSummary && codeSummary.trim() && !/_не сгенерировано_|not generated/i.test(codeSummary) && (
        <>
          <h3>{t('memory.code_summary_title', '🔧 Code summary')}</h3>
          <div className="contract-body md" dangerouslySetInnerHTML={{
            __html: (window.marked?.parse ? window.marked.parse(codeSummary) : `<pre>${codeSummary.replace(/[<>&]/g, c => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;' }[c]))}</pre>`)
          }} />
        </>
      )}

      <h3>{t('memory.decisions_title', 'Block decisions (decisions.log)')}</h3>
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
          {moduleId && moduleId.startsWith('b.') ? t('memory.decisions_empty', 'decisions.log is empty for this block.') : t('memory.only_b_blocks', 'Memory — for b.* atlas blocks only.')}
        </p>
      )}

      {patterns && patterns.trim() && patterns.trim() !== '# patterns' && (
        <>
          <h3>{t('memory.patterns_title', 'Patterns (patterns.md)')}</h3>
          <pre className="memory-patterns">{patterns}</pre>
        </>
      )}

      <h3>{t('memory.lessons_title', 'Lessons (bootstrap)')}</h3>
      {lessons.length ? lessons.map((l, i) => (
        <div key={i} className={`lesson ${l.verdict}`}>
          <div className="verdict">{l.verdict === 'good' ? t('memory.lesson_good', '✓ what worked') : t('memory.lesson_bad', '✗ what didn\'t')}</div>
          {l.note}
        </div>
      )) : <p style={{ color: 'var(--ink-3)' }}>{t('memory.no_lessons', 'No lessons for this block.')}</p>}

      {checksLog && checksLog.trim() && (
        <>
          <h3>{t('memory.checks_log_title', 'Recent run log (checks.log tail)')}</h3>
          <pre className="memory-checks-log">{checksLog.split(/\n/).slice(-15).join('\n')}</pre>
        </>
      )}

      <h3>{t('memory.events', 'Events')}</h3>
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
      )) : <p style={{ color: 'var(--ink-3)' }}>{t('memory.no_events', 'No events for this block.')}</p>}
    </>
  );
}

function ConnectionsTab({ inEdges, outEdges, moduleById, moduleId, allModules, allEdges, onAddEdge, onClaudeAdvice }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
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
      <h3>{t('conn.incoming', 'Incoming')} ({inEdges.length})</h3>
      <div className="subm-list" style={{ marginBottom: 14 }}>
        {inEdges.map((e, i) => <Row key={i} e={e} dir="in" />)}
        {!inEdges.length && <p style={{ color: 'var(--ink-3)', margin: 0 }}>—</p>}
      </div>
      <h3>{t('conn.outgoing', 'Outgoing')} ({outEdges.length})</h3>
      <div className="subm-list" style={{ marginBottom: 14 }}>
        {outEdges.map((e, i) => <Row key={i} e={e} dir="out" />)}
        {!outEdges.length && <p style={{ color: 'var(--ink-3)', margin: 0 }}>—</p>}
      </div>

      {moduleId && moduleId.startsWith('b.') && (
        <>
          <h3>{t('conn.sima_suggest_edges', '✦ Sima will suggest edges')}</h3>
          <div className="send-task" style={{ marginBottom: 8 }}>
            <span className="lab">{t('conn.based_on_graph', 'Based on the graph →')}</span>
            <button onClick={askSima} disabled={busy}>{busy ? t('conn.thinking', 'thinking…') : t('conn.suggest', '✦ suggest')}</button>
            {onClaudeAdvice && (
              <button onClick={() => onClaudeAdvice(allModules.find(x => x.id === moduleId), {
                kind: 'block_connections',
                context: {
                  in: inEdges.map(e => e.from),
                  out: outEdges.map(e => e.to),
                  neighbors: allModules.filter(m => m.id !== moduleId).slice(0, 20).map(m => ({ id: m.id, title: m.title, layer: m.layer })),
                },
              })}>{t('conn.what_missing', '✨ what am I missing?')}</button>
            )}
          </div>
          {suggested[0]?._mock && (
            <div className="composer-result fail" style={{ marginBottom: 8 }}>{t('conn.demo_need_key', 'Demo mode — ANTHROPIC_API_KEY required.')}</div>
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
                    <button className="pill primary" onClick={() => acceptSuggestion(e)}>{t('conn.accept', '＋ accept')}</button>
                    <button className="pill" onClick={() => setSuggested((S) => S.filter((x) => edgeKey(x) !== key))}>{t('conn.skip', '✗ skip')}</button>
                  </div>
                )}
                {isAccepted && <div className="meta" style={{ fontSize: 11, marginTop: 4 }}>{t('conn.added', '✓ added')}</div>}
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
  const t = window.__SIMA_T || ((_, fb) => fb);
  const termRef = React.useRef(null);
  useEffect2(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [log]);

  const filtered = log.filter(l => activeAgent === 'all' || l.agent === activeAgent);

  // R-7.43 — agent monogram badges. Раньше были однотонные цветные точки,
  // не различимы между Cursor / Claude / Codex / SIMA Core. Теперь круг с
  // буквой первой и фирменным оттенком — без trademark issues.
  const AGENT_STYLE = {
    'Claude Code': { letter: 'C', bg: '#c97a3a', fg: '#fff' }, // Anthropic warm orange
    'Cursor':      { letter: 'C', bg: '#2c75d8', fg: '#fff' }, // Cursor blue
    'Codex':       { letter: '⌘', bg: '#11a37f', fg: '#fff' }, // OpenAI green
    'SIMA Core':   { letter: 'S', bg: '#222',    fg: '#fff' },
    'Claude':      { letter: 'C', bg: '#c97a3a', fg: '#fff' },
    'Claude (demo)':{letter: 'C', bg: '#c97a3a', fg: '#fff' },
  };
  const AgentBadge = ({ name, size = 14 }) => {
    const cfg = AGENT_STYLE[name] || { letter: (name || '?')[0].toUpperCase(), bg: 'var(--ink-3)', fg: '#fff' };
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '50%', fontSize: Math.round(size * 0.6),
        fontFamily: 'JetBrains Mono, monospace', fontWeight: 700,
        background: cfg.bg, color: cfg.fg, marginRight: 6, flexShrink: 0,
      }}>{cfg.letter}</span>
    );
  };

  return (
    <div className={`dock ${collapsed ? 'collapsed' : ''}`}>
      <div className="dock-tabs">
        <button className={`tab ${activeAgent === 'all' ? 'active' : ''}`} onClick={() => setActiveAgent('all')}>
          <span className="agent-dot" style={{ background: 'var(--ink)' }} />{t('dock.all_agents', 'All agents')} <span className="ct">{log.length}</span>
        </button>
        {data.agents.filter(a => a.id !== 'sima').map(a => (
          <button key={a.id} className={`tab ${activeAgent === a.title ? 'active' : ''}`} onClick={() => setActiveAgent(a.title)}>
            <AgentBadge name={a.title} size={13} />
            {a.title} <span className="ct">{log.filter(l => l.agent === a.title).length}</span>
          </button>
        ))}
        <div className="spacer" />
        <span style={{ fontSize: 11, color: 'var(--ink-4)', marginRight: 8 }}>
          <span className="kbd">⌘K</span> {t('dock.cmd_for_command', 'for command')}
        </span>
        <button className="icon-btn" onClick={() => setCollapsed(c => !c)} title={collapsed ? t('dock.expand', 'Expand') : t('dock.collapse', 'Collapse')}>
          {collapsed ? '⌃' : '⌄'}
        </button>
      </div>
      {!collapsed && (
        <div className="dock-body">
          <div className="term" ref={termRef}>
            {filtered.map((l, i) => (
              <div key={i} className={`ln ${l.kind}`} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span className="ts" style={{ flexShrink: 0 }}>{l.ts}</span>
                {l.agent && <AgentBadge name={l.agent} size={14} />}
                {l.agent && <span style={{ color: 'var(--ink-4)', flexShrink: 0 }}>{l.agent}</span>}
                <span style={{ flex: 1, minWidth: 0, wordBreak: 'break-word' }}>{l.msg}</span>
              </div>
            ))}
            {filtered.length === 0 && <div className="ln note">{t('dock.log_empty', 'Log is empty. Send a task from the detail panel — agent events will appear here.')}</div>}
          </div>
          <div className="roadmap">
            <h4>{t('dock.roadmap', 'Roadmap')}</h4>
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
  const t = window.__SIMA_T || ((_, fb) => fb);
  const order = [
    { key: 'frontend', title: t('layered.fe_title', 'Frontend · UI'), code: t('layered.fe_code', 'L3 · what the user sees') },
    { key: 'logic',    title: t('layered.lo_title', 'Domain · Logic'), code: t('layered.lo_code', 'L2 · how the product thinks') },
    { key: 'backend',  title: t('layered.be_title', 'Backend · Data'), code: t('layered.be_code', 'L1 · what it stores and computes') },
    { key: 'tests',    title: t('layered.te_title', 'Tests · Ops'),    code: t('layered.te_code', 'L4 · how we verify') },
  ];
  return (
    <div className="layered-v2">
      <div style={{ marginBottom: 22, paddingBottom: 14, borderBottom: '1px dashed var(--rule)' }}>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{t('layered.view_label', 'view · layered')}</div>
        <h2 style={{ fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 28, fontWeight: 500, margin: '4px 0 6px' }}>{data.product.title} {t('layered.title_suffix', '— by layers')}</h2>
        <div style={{ fontSize: 13, color: 'var(--ink-3)', maxWidth: 720 }}>
          {t('layered.intro', 'Same product as in the graph, but split into layers of responsibility. Layer → modules → description + progress. Click any module to open its details on the right.')}
        </div>
      </div>
      {order.map(g => {
        const mods = modules.filter(m => m.layer === g.key);
        return (
          <div key={g.key} className={`layer-card ${g.key}`}>
            <div className="layer-head">
              <h3>{g.title}</h3>
              <span className="lc">{g.code} · {mods.length} {t('layered.modules', 'modules')}</span>
            </div>
            <div className="layer-mods">
              {mods.map(m => {
                const st = (m.id === 'metrics' && desyncResolved) ? 'progress' : m.status;
                const tasks = data.tasks[m.id] || [];
                const done = tasks.filter(tk => tk.status === 'done').length;
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
              {!mods.length && <div style={{ color: 'var(--ink-4)', fontStyle: 'italic', fontSize: 12 }}>{t('layered.empty', 'empty for now')}</div>}
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
  const t = window.__SIMA_T || ((_, fb) => fb);
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
    if (!window.confirm(`${t('detail.cancel_run_confirm', 'Cancel run')} ${run_id}?`)) return;
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
      <h3>{t('runs.start_agent', 'Agent run')}</h3>
      <div className="send-task" style={{ marginBottom: 14 }}>
        <span className="lab">{t('runs.start_block', 'Run block →')}</span>
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
              title={t('runs.cancel_title', 'Cancel')}
            >{t('runs.cancel_btn', '✕ Cancel')}</button>
          </div>
          <div className="meta" style={{ fontSize: 11.5 }}>
            agent={live.agent} · started {short(live.started_at)} · last event {short(live.last_event_at)}
          </div>
        </div>
      )}

      {openLogFor && (
        <div className="run-log-wrap">
          <div className="run-log-head">
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{t('runs.log_label', 'log ·')} {openLogFor}</span>
            <span className="meta" style={{ fontSize: 10.5 }}>{logSize} {t('runs.bytes', 'bytes')}</span>
          </div>
          {/* R-7.41 — external run'ы (запись в checks.log агентом напрямую,
              без orchestrator'а) не имеют отдельного run_logs/<id>.log.
              Покажем summary из самой checks.log записи. */}
          <pre className="run-log">{(() => {
            const open = (runs || []).find((r) => r.run_id === openLogFor);
            if (open?.external) {
              return [
                `# external run`,
                `block: ${open.block_id}`,
                `agent: ${open.agent}`,
                `kind:  ${open.source_kind}`,
                `at:    ${open.started_at}`,
                ``,
                open.summary || t('runs.external_no_desc', '(no description in checks.log)'),
                ``,
                `(${t('runs.external_note_a', 'this run was written to')} atlas/clients/<id>/blocks/${open.block_id}/checks.log ${t('runs.external_note_b', 'by the agent directly,')}`,
                t('runs.external_note_c', 'without calling /runs/start; no full log.)'),
              ].join('\n');
            }
            return logText || (live ? t('runs.waiting_output', 'waiting for output…') : t('runs.log_empty', 'log empty or deleted'));
          })()}</pre>
          {files.length > 0 && (
            <div className="run-files">
              <div className="meta" style={{ fontSize: 10.5, marginBottom: 4, letterSpacing: '0.06em' }}>{t('runs.changed_label', 'CHANGED')}</div>
              <div className="chips">
                {files.slice(0, 12).map((f) => <span key={f} className="chip mono">{f}</span>)}
                {files.length > 12 && <span className="chip">+{files.length - 12}</span>}
              </div>
            </div>
          )}
        </div>
      )}

      <h3>{t('runs.history', 'History')}</h3>
      {!runs.length && <p style={{ color: 'var(--ink-3)' }}>{t('runs.no_runs', 'No runs yet — click the button above.')}</p>}
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
              {r.external && (
                <span className="meta" style={{ fontSize: 10, color: 'var(--ink-4)', border: '1px solid var(--rule-2)', borderRadius: 999, padding: '1px 6px' }} title={t('runs.extern_title', 'External run — written to checks.log by the agent directly (Cursor IDE / Claude in another terminal, etc.)')}>{t('runs.extern', 'extern')}</span>
              )}
            </div>
            {(acc || enr.file_count > 0 || enr.cost_usd > 0) && (
              <div className="run-card-enriched">
                {acc && (
                  <span className={`acc-pill ${acc.verdict === 'pass' ? 'ok' : acc.verdict === 'fail' ? 'bad' : 'skip'}`}>
                    {t('runs.acceptance', 'acceptance')} {acc.verdict}
                    {acc.counts && <span className="meta" style={{ fontSize: 10, marginLeft: 4 }}>{acc.counts.pass}/{(acc.counts.pass||0)+(acc.counts.fail||0)+(acc.counts.skipped||0)}</span>}
                  </span>
                )}
                {enr.file_count > 0 && (
                  <span className="acc-pill mono" title={t('runs.changed_files', 'files changed')}>↑ {enr.file_count} {t('runs.changed_label2', 'files')}</span>
                )}
                {enr.cost_usd > 0 && (
                  <span className="acc-pill mono" title={`${enr.trace_count} LLM calls`}>
                    ${enr.cost_usd.toFixed(4)}
                  </span>
                )}
                {enr.trace_count > 0 && enr.cost_usd === 0 && (
                  <span className="acc-pill mono" title={t('runs.mock_title', 'LLM calls (mock, no charge)')}>{enr.trace_count} {t('runs.mock', 'mock')}</span>
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
        {t('runs.poll_pre', 'Polling every')} {live ? '2' : '12'} {t('runs.poll_post', 's.')}
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
  const t = window.__SIMA_T || ((_, fb) => fb);
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
      `${t('acc.revise_prompt_intro', 'Block')} ${moduleId} ${t('acc.revise_prompt_intro2', 'failed acceptance. Fix the following, minimally invasive.')}`,
      '',
      ...failed.map((a) => `[FAIL] ${a.id}: ${a.text}\n   reasoning: ${a.reasoning || '(no reasoning)'}`),
      ...inconclusive.map((a) => `[INCONCL] ${a.id}: ${a.text}`),
      '',
      t('acc.revise_prompt_outro', 'After fixing make sure acceptance-verifier passes. Do not change anything outside this block\'s area of responsibility.'),
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
      if (j.ok) setReviseMsg({ kind: 'ok', text: `${t('acc.run_created', 'Run created:')} ${j.run_id}. ${t('acc.see_runs', 'Open «Runs» for progress.')}` });
      else setReviseMsg({ kind: 'fail', text: j.error || 'failed' });
    } catch (e) {
      setReviseMsg({ kind: 'fail', text: String(e.message || e) });
    }
    setReviseBusy(false);
  };

  if (loading) return <p style={{ color: 'var(--ink-3)' }}>{t('acc.loading', 'Loading…')}</p>;
  if (!data_) return <p style={{ color: 'var(--ink-3)' }}>{t('acc.no_data', 'No acceptance data. Run acceptance-verifier on this block.')}</p>;

  const { latest, previous, delta } = data_;
  const { verdict, checked_at, summary, assertions } = latest;
  const cls = verdict === 'pass' ? 'ok' : verdict === 'fail' ? 'bad' : 'warn';
  const hasFailures = (latest.summary.fail || 0) > 0;
  const regressedCount = Object.values(delta || {}).filter((d) => d.kind === 'regressed').length;
  const improvedCount  = Object.values(delta || {}).filter((d) => d.kind === 'improved').length;

  return (
    <>
      <h3>{t('acc.title', 'Block acceptance')}</h3>
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
            {improvedCount > 0 && <span className="acc-delta improved">↑ {improvedCount} {t('acc.improved_count', 'improved')}</span>}
            {regressedCount > 0 && <span className="acc-delta regressed">↓ {regressedCount} {t('acc.regressed_count', 'regressed')}</span>}
            <span className="meta" style={{ fontSize: 10.5 }}>
              vs {short(previous.checked_at)} (verdict={previous.verdict})
            </span>
          </div>
        )}
        {checked_at && <div className="meta" style={{ fontSize: 11, marginTop: 6 }}>{t('acc.checked_at', 'checked:')} {short(checked_at)}</div>}
        {hasFailures && (
          <div style={{ marginTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="pill primary" onClick={reviseAndRerun} disabled={reviseBusy}>
              {reviseBusy ? t('acc.starting', 'Starting…') : t('acc.fix_and_rerun', '↻ Fix and re-run')}
            </button>
            {onClaudeAdvice && moduleObj && (
              <button className="pill" onClick={() => onClaudeAdvice(moduleObj, {
                kind: 'block_acceptance',
                context: {
                  failed: latest.assertions.filter(a => a.verdict === 'fail').map(a => ({ id: a.id, text: a.text, reasoning: a.reasoning })),
                },
              })}>{t('acc.why_failed', '✨ Why did it fail?')}</button>
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
                    <span className="acc-changed-tag">{d.kind === 'improved' ? t('acc.improved_tag', '↑ improved') : t('acc.regressed_tag', '↓ regressed')}</span>
                  </div>
                )}
                {d && d.kind === 'new' && (
                  <div className="acc-changed mono"><span className="acc-changed-tag new">{t('acc.new_tag', '+ new')}</span></div>
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
// Labels/placeholders are i18n keys; resolved inside ContractSection via t().
const CONTRACT_FILES = [
  { file: 'mission.md',      labelKey: 'contract.file_mission',      labelFallback: 'Mission',      phKey: 'contract.file_mission_ph',      phFallback: 'Why does this block exist?' },
  { file: 'user_story.md',   labelKey: 'contract.file_user_story',   labelFallback: 'User story',   phKey: 'contract.file_user_story_ph',   phFallback: 'As X / When Y / I want Z / So that W — what the user actually wants.' },
  { file: 'kpi.md',          labelKey: 'contract.file_kpi',          labelFallback: 'KPI',          phKey: 'contract.file_kpi_ph',          phFallback: 'Measurable success metrics.' },
  { file: 'acceptance.md',   labelKey: 'contract.file_acceptance',   labelFallback: 'Acceptance',   phKey: 'contract.file_acceptance_ph',   phFallback: 'Testable readiness criteria.' },
  { file: 'depends_on.md',   labelKey: 'contract.file_depends_on',   labelFallback: 'Depends on',   phKey: 'contract.file_depends_on_ph',   phFallback: 'Which blocks are needed.' },
  { file: 'provides.md',     labelKey: 'contract.file_provides',     labelFallback: 'Provides',     phKey: 'contract.file_provides_ph',     phFallback: 'Which capabilities it exposes.' },
  { file: 'code_summary.md', labelKey: 'contract.file_code_summary', labelFallback: 'Code summary', phKey: 'contract.file_code_summary_ph', phFallback: 'Auto-gen after a run: what it\'s written in, how, why (sub-summary instead of re-reading all the code).' },
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
  const t = window.__SIMA_T || ((_, fb) => fb);
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
    return <p style={{ color: 'var(--ink-3)' }}>{t('val.b_only', 'Available only for b.* atlas blocks.')}</p>;
  }

  const verdictClass = latest?.verdict === 'aligned' ? 'ok' : latest?.verdict === 'broken' ? 'bad' : latest?.verdict === 'drift' ? 'warn' : '';
  const verdictLabel = { aligned: t('val.aligned', '✓ aligned'), drift: t('val.drift', '⚠ drift'), broken: t('val.broken', '✗ broken') }[latest?.verdict] || latest?.verdict;

  return (
    <>
      <h3>{t('val.title', 'LLM compliance validator')}</h3>
      <div className="meta" style={{ fontSize: 11.5, marginBottom: 10 }}>
        {t('val.intro', 'Sima compares the block\'s mission / KPI / acceptance with what\'s actually been done (decisions / checks / files), and checks compliance with rules.md and tech_stack.md.')}
      </div>
      <div className="send-task" style={{ marginBottom: 12 }}>
        <span className="lab">{t('val.judge', 'Sima judge →')}</span>
        <button onClick={runCheck} disabled={busy}>{busy ? t('val.checking', 'checking…') : t('val.check_compliance', '✦ Check compliance')}</button>
        {latest?.checked_at && (
          <span className="meta" style={{ fontSize: 11 }}>{t('val.last', 'last:')} {short(latest.checked_at)}</span>
        )}
      </div>
      {error && <div className="lesson bad" style={{ marginBottom: 10 }}>{error}</div>}
      {!latest && !busy && <p style={{ color: 'var(--ink-3)' }}>{t('val.not_yet', 'Not yet checked — click the button above.')}</p>}
      {latest?.mock && (
        <div className="composer-result fail" style={{ marginBottom: 8 }}>{t('val.demo_need_key', 'Demo mode — set ANTHROPIC_API_KEY for a real check.')}</div>
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
          <h3>{t('val.violations', 'Violations')}</h3>
          <div className="acc-list">
            {latest.violations.map((v, i) => (
              <div key={i} className={`acc-row v-${v.severity === 'high' ? 'fail' : v.severity === 'med' ? 'inconclusive' : 'skipped'}`}>
                <span className="acc-id mono">{v.kind}</span>
                <div style={{ flex: 1 }}>
                  <div className="acc-text">{v.evidence}</div>
                  {v.fix && <div className="meta" style={{ fontSize: 11, marginTop: 3 }}>{t('val.fix_suggestion', 'suggested fix:')} {v.fix}</div>}
                </div>
                <span className={`val-sev sev-${v.severity || 'low'}`}>{v.severity || 'low'}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {latest?.matches?.length > 0 && (
        <>
          <h3>{t('val.matches', 'Strengths')}</h3>
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
  const t = window.__SIMA_T || ((_, fb) => fb);
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
    return <p style={{ color: 'var(--ink-3)' }}>{t('files.b_only', 'File registry available only for b.* atlas blocks.')}</p>;
  }

  const counts = {
    alive: files.filter((f) => f.status === 'alive').length,
    dead: files.filter((f) => f.status === 'dead').length,
    archived: files.filter((f) => f.status === 'archived').length,
  };

  return (
    <>
      <h3>{t('files.title', 'Block files (alive / dead / archived)')}</h3>
      <div className="meta" style={{ fontSize: 11.5, marginBottom: 10 }}>
        {t('files.intro', 'dead and archived files are excluded from the context-pack that agents read — so they never stumble on stale code.')}
      </div>
      <div className="acc-counts mono" style={{ marginBottom: 10 }}>
        <span className="acc-pill ok">alive {counts.alive}</span>
        <span className="acc-pill bad">dead {counts.dead}</span>
        <span className="acc-pill skip">archived {counts.archived}</span>
      </div>
      <div className="send-task" style={{ marginBottom: 10 }}>
        <button onClick={importFromBlock} disabled={!!busy._import}>{busy._import ? t('files.importing', 'importing…') : t('files.import_from_block', '↻ import from block\'s files.md')}</button>
        <input
          className="composer-input"
          placeholder={t('files.add_placeholder', 'src/path/file.ts — add new')}
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          style={{ flex: 1, minWidth: 180 }}
        />
        <button onClick={addFile} disabled={!newPath.trim()}>{t('files.add_alive', '＋ alive')}</button>
      </div>
      {loading && <p style={{ color: 'var(--ink-3)' }}>{t('files.loading', 'Loading…')}</p>}
      {!loading && !files.length && (
        <p style={{ color: 'var(--ink-3)' }}>{t('files.empty', 'No files in registry. Import from block\'s files.md or add manually.')}</p>
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
              {f.status !== 'dead'     && <button onClick={() => setStatus(f.path, 'dead', window.prompt(t('files.reason_prompt', 'Reason (optional):')) || 'replaced')} disabled={busy[f.path]}>dead</button>}
              {f.status !== 'archived' && <button onClick={() => setStatus(f.path, 'archived')} disabled={busy[f.path]}>archived</button>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ContractSection({ moduleId, layer }) {
  const t = window.__SIMA_T || ((_, fb) => fb);
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
      setError(t('contract.fill_unavailable', 'SIMA_API.synthesis.fillField unavailable. Open DevTools → Console.'));
      setBusy(false); setEditing(null);
      try { console.error('[panels] SIMA_API.synthesis.fillField is undefined', window.SIMA_API); } catch {}
      return;
    }
    const r = await window.SIMA_API.synthesis.fillField({
      block_id: moduleId, field: file, layer,
      mission_context: files['mission.md'] || '',
      neighbors: { kpi: files['kpi.md'], acceptance: files['acceptance.md'], depends_on: files['depends_on.md'] },
    });
    try { console.log('[panels] fillField response', { ok: r?.ok, mock: r?.mock, contentLen: (r?.content || '').length, error: r?.error }); } catch {}
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
      setError(t('contract.rewrite_unavailable', 'SIMA_API.synthesis.rewriteField unavailable. Open DevTools → Console.'));
      setBusy(false); setEditing(null);
      try { console.error('[panels] SIMA_API.synthesis.rewriteField is undefined', window.SIMA_API); } catch {}
      return;
    }
    const r = await window.SIMA_API.synthesis.rewriteField({
      block_id: moduleId, field: file,
      current_content: files[file] || '',
      mission_context: files['mission.md'] || '',
    });
    try { console.log('[panels] rewriteField response', { ok: r?.ok, mock: r?.mock, contentLen: (r?.content || '').length, error: r?.error }); } catch {}
    setBusy(false);
    if (!r?.ok) { setError(r?.error || 'rewrite failed'); setEditing(null); return; }
    setEditing({ file, mode: 'rewrite', draft: r.content, original: files[file] || '', mock: r.mock });
  };

  // R-7.42 — «✨ Развернуть»: добавляет контекст к черновику (актеры, edge
  // cases, ссылки на соседей). Отличается от ✏ Переписать тем, что
  // намеренно ВНОСИТ новые факты используя project + neighbor + parent.
  const startExpand = async (file) => {
    try { console.log('[panels] startExpand invoked', { block_id: moduleId, file, hasApi: !!window.SIMA_API?.synthesis?.expandField }); } catch {}
    setEditing({ file, mode: 'expand', draft: '', original: files[file] || '' });
    setBusy(true); setError(null);
    if (!window.SIMA_API?.synthesis?.expandField) {
      setError(t('contract.expand_unavailable', 'SIMA_API.synthesis.expandField unavailable. Open DevTools → Console.'));
      setBusy(false); setEditing(null);
      return;
    }
    const r = await window.SIMA_API.synthesis.expandField({
      block_id: moduleId, field: file,
      current_content: files[file] || '',
      mission_context: files['mission.md'] || '',
    });
    try { console.log('[panels] expandField response', { ok: r?.ok, mock: r?.mock, contentLen: (r?.content || '').length, error: r?.error }); } catch {}
    setBusy(false);
    if (!r?.ok) { setError(r?.error || 'expand failed'); setEditing(null); return; }
    setEditing({ file, mode: 'expand', draft: r.content, original: files[file] || '', mock: r.mock });
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
      try { window.dispatchEvent(new CustomEvent('sima-log-push', { detail: { agent: 'SIMA Core', kind: 'ok', msg: `${t('contract.saved_log', '💾 Saved')} ${moduleId} · ${editing.file}` } })); } catch {}
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
      try { window.dispatchEvent(new CustomEvent('sima-log-push', { detail: { agent: 'SIMA Core', kind: 'fail', msg: `${t('contract.save_failed_log_a', 'Save')} ${editing.file} ${t('contract.save_failed_log_b', 'didn\'t reach disk:')} ${r?.error || 'unknown'}` } })); } catch {}
    }
  };

  if (loading) return <p style={{ color: 'var(--ink-3)' }}>{t('contract.loading', 'Loading contract…')}</p>;
  if (!moduleId || !moduleId.startsWith('b.')) {
    return <p style={{ color: 'var(--ink-3)' }}>{t('contract.b_only', 'Contract available only for b.* atlas blocks.')}</p>;
  }

  return (
    <>
      <h3>{t('contract.title', 'Block contract')}</h3>
      <div className="meta" style={{ fontSize: 11.5, marginBottom: 10 }}>
        {t('contract.intro', '! empty · ⚠ weak · ✓ filled. Sima can suggest a draft via ✨ or rephrase via ✏.')}
      </div>
      {error && <div className="lesson bad" style={{ marginBottom: 10 }}>{error}</div>}
      <div className="contract-list">
        {CONTRACT_FILES.map(({ file, labelKey, labelFallback, phKey, phFallback }) => {
          const content = files[file] || '';
          const klass = classifyContent(file, content);
          const symbol = klass === 'empty' ? '!' : klass === 'weak' ? '⚠' : '✓';
          const label = t(labelKey, labelFallback);
          const placeholder = t(phKey, phFallback);
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
                <button className="pill" onClick={() => startManual(file)} disabled={busy} title={t('contract.manual_title', 'Open a textarea and edit content manually (no LLM)')}>{t('contract.manual_btn', '✎ Edit')}</button>
                {klass === 'empty' && (
                  <button className="pill primary" onClick={() => startFill(file)} disabled={busy} title={t('contract.fill_title', 'Sima will generate a draft via LLM')}>{t('contract.fill_btn', '✨ Fill')}</button>
                )}
                {klass !== 'empty' && (
                  <button className="pill" onClick={() => startRewrite(file)} disabled={busy} title={t('contract.rewrite_title', 'Sima rewrites the draft without adding new facts (errors/style/clarity)')}>{t('contract.rewrite_btn', '✏ Rewrite')}</button>
                )}
                {klass !== 'empty' && (
                  <button className="pill" onClick={() => startExpand(file)} disabled={busy} title={t('contract.expand_title', 'Sima expands the draft: adds actors, edge cases, success criteria using project & neighbor context')}>{t('contract.expand_btn', '✨ Expand')}</button>
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
                  {editing.mode === 'fill' ? t('contract.mode_fill', 'SIMA · FILLING') :
                   editing.mode === 'rewrite' ? t('contract.mode_rewrite', 'SIMA · REPHRASING') :
                   editing.mode === 'expand' ? t('contract.mode_expand', 'SIMA · EXPANDING (adds context)') :
                   t('contract.mode_manual', 'MANUAL EDIT')}
                </div>
                <h3 style={{ margin: '4px 0 0', fontFamily: 'Newsreader, serif', fontStyle: 'italic', fontSize: 18 }}>
                  {moduleId} · {editing.file}
                </h3>
              </div>
              <button className="pill" onClick={() => setEditing(null)} disabled={busy}>✕</button>
            </div>
            {editing.mock && (
              <div className="composer-result fail" style={{ margin: '8px 18px 0' }}>
                {t('contract.demo_modal', 'Demo mode: set ANTHROPIC_API_KEY to receive real suggestions.')}
              </div>
            )}
            <div className="contract-modal-body">
              {(editing.mode === 'rewrite' || editing.mode === 'expand') && editing.original && (
                <div>
                  <div className="meta" style={{ fontSize: 10.5, marginBottom: 4, letterSpacing: '0.06em' }}>{t('contract.was', 'WAS')}</div>
                  <pre className="contract-modal-pre dim">{editing.original}</pre>
                </div>
              )}
              <div>
                <div className="meta" style={{ fontSize: 10.5, marginBottom: 4, letterSpacing: '0.06em' }}>
                  {editing.mode === 'rewrite' ? t('contract.became_rewrite', 'BECAME (you can fix it)') :
                   editing.mode === 'expand' ? t('contract.became_expand', 'EXPANDED (you can fix it)') :
                   editing.mode === 'manual' ? t('contract.became_manual', 'CURRENT CONTENT (edit directly)') :
                   t('contract.became_fill', 'DRAFT (you can fix it)')}
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
              <button className="pill" onClick={() => setEditing(null)} disabled={busy}>{t('contract.cancel', 'Cancel')}</button>
              <button className="pill primary" onClick={approve} disabled={busy || !editing.draft.trim()}>
                {busy ? t('contract.saving', 'saving…') : t('contract.approve', '💾 Accept and write')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

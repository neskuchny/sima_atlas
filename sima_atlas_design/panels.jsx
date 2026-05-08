// SIMA Atlas — left rail, detail panel, dock (terminal + roadmap), layered 3D, sync banner
const { useState: useState2, useEffect: useEffect2, useMemo: useMemo2 } = React;

/* ====================== LEFT RAIL ====================== */
function ContextRail({ data, onClose, onUpdateField }) {
  const p = data.product;
  return (
    <aside className="rail">
      {onClose && <button className="rail-collapse" onClick={onClose} title="Свернуть">◀</button>}
      <h2>Контекст продукта</h2>
      <div className="product-card">
        <div className="codename">{p.codename}</div>
        <div className="name serif">
          {onUpdateField ? <EditableText value={p.title} onChange={(v) => onUpdateField('title', v)} /> : p.title}
        </div>
        <div className="sub">
          {onUpdateField ? <EditableText value={p.subtitle} onChange={(v) => onUpdateField('subtitle', v)} multiline /> : p.subtitle}
        </div>
      </div>

      <div className="field italic">
        <div className="lbl">Цель <span className="tag">@goal</span></div>
        <div className="val">
          {onUpdateField ? <EditableText value={p.goal} onChange={(v) => onUpdateField('goal', v)} multiline /> : p.goal}
        </div>
      </div>

      <div className="field italic">
        <div className="lbl">Миссия <span className="tag">@mission</span></div>
        <div className="val">
          {onUpdateField ? <EditableText value={p.mission} onChange={(v) => onUpdateField('mission', v)} multiline /> : p.mission}
        </div>
      </div>

      <div className="field">
        <div className="lbl">Качество / KPI <span className="tag">@quality</span></div>
        {p.quality.map(q => (
          <div key={q.code} className="kpi-row">
            <span className="code">{q.code}</span>
            <span className="lbl2">{q.label}</span>
          </div>
        ))}
      </div>

      <div className="field">
        <div className="lbl">Условия / стек <span className="tag">@conditions</span></div>
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
function DetailPanel({ data, moduleId, onClose, desyncResolved, onSendToAgent, onDrillDown }) {
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

  const m = data.modules.find(x => x.id === moduleId);
  const tasks = data.tasks[moduleId] || [];
  const subs = data.submodules[moduleId] || [];
  const lessons = data.lessons.filter(l => l.module === moduleId || (m.layer === 'frontend' && l.module === 'frontend'));
  const status = (moduleId === 'metrics' && desyncResolved) ? 'progress' : m.status;

  const tabs = [
    { id: 'overview', label: 'Обзор' },
    { id: 'tasks', label: 'Задачи', count: tasks.length },
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="layer-tag mono">@{m.tag} · layer:{m.layer}</div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 0, color: 'var(--ink-3)',
            cursor: 'pointer', fontSize: 16, padding: 0, lineHeight: 1,
          }}>✕</button>
        </div>
        <h1>{m.title}</h1>
        <div className="meta">
          <span className="status-pill"><span className="dot" style={{ background: `var(--st-${status})` }} />{statusLabel(status)}</span>
          <span className="status-pill mono">P{m.priority}</span>
          <span className="status-pill mono">layer/{m.layer}</span>
          {m.checked && <span className="status-pill">✓ проверено</span>}
        </div>
      </div>

      <div className="tabs">
        {tabs.map(t => (
          <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.label}{t.count != null && <span className="ct">{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="dbody">
        {tab === 'overview' && <Overview m={m} status={status} desyncResolved={desyncResolved} onSendToAgent={onSendToAgent} onDrillDown={onDrillDown} hasSubsystem={!!data.subsystems?.[m.id]} />}
        {tab === 'tasks' && <TasksList tasks={tasks} desyncResolved={desyncResolved} moduleId={moduleId} onSendToAgent={onSendToAgent} />}
        {tab === 'subs' && <SubsList subs={subs} desyncResolved={desyncResolved} moduleId={moduleId} />}
        {tab === 'memory' && <Memory lessons={lessons} history={data.history.filter(h => h.module === moduleId)} />}
        {tab === 'connections' && <ConnectionsTab inEdges={inEdges} outEdges={outEdges} moduleById={moduleById} />}
      </div>
    </aside>
  );
}

function Overview({ m, status, desyncResolved, onSendToAgent, onDrillDown, hasSubsystem }) {
  const desc = MODULE_DESC[m.id] || {};
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
      <p className="lede">{desc.why || 'Описание модуля будет дополнено во время работы с агентом.'}</p>

      <h3>Логика</h3>
      <p>{desc.logic}</p>

      <h3>Бэкенд</h3>
      <div className="chips" style={{ marginBottom: 4 }}>{(desc.backend || []).map(x => <span key={x} className="chip">{x}</span>)}</div>

      {desc.frontend && <>
        <h3>Фронтенд</h3>
        <div className="chips">{desc.frontend.map(x => <span key={x} className="chip">{x}</span>)}</div>
      </>}

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
    </>
  );
}

function TasksList({ tasks, desyncResolved, moduleId, onSendToAgent }) {
  if (!tasks.length) return <p style={{ color: 'var(--ink-3)' }}>Задачи появятся, когда агент начнёт декомпозицию.</p>;
  return (
    <>
      <h3>Декомпозиция</h3>
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

function Memory({ lessons, history }) {
  return (
    <>
      <h3>Опыт / решения</h3>
      {lessons.length ? lessons.map((l, i) => (
        <div key={i} className={`lesson ${l.verdict}`}>
          <div className="verdict">{l.verdict === 'good' ? '✓ что сработало' : '✗ что не сработало'}</div>
          {l.note}
        </div>
      )) : <p style={{ color: 'var(--ink-3)' }}>Память по этому блоку пуста — она наполнится по ходу работы.</p>}

      <h3>Последние события</h3>
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

function ConnectionsTab({ inEdges, outEdges, moduleById }) {
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
  return (
    <>
      <h3>Входящие ({inEdges.length})</h3>
      <div className="subm-list" style={{ marginBottom: 14 }}>
        {inEdges.map((e, i) => <Row key={i} e={e} dir="in" />)}
        {!inEdges.length && <p style={{ color: 'var(--ink-3)', margin: 0 }}>—</p>}
      </div>
      <h3>Исходящие ({outEdges.length})</h3>
      <div className="subm-list">
        {outEdges.map((e, i) => <Row key={i} e={e} dir="out" />)}
        {!outEdges.length && <p style={{ color: 'var(--ink-3)', margin: 0 }}>—</p>}
      </div>
    </>
  );
}

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

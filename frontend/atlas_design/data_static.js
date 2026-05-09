// SIMA Atlas — sample product data: a SaaS analytics dashboard called "Acme"

window.SIMA_DATA = {
  product: {
    codename: "acme-core",
    title: "Acme Analytics",
    subtitle: "SaaS-аналитика для продуктовых команд",
    goal: "Дать продуктовым командам видеть метрики продукта без помощи аналитика — от события до инсайта за <10 секунд.",
    mission: "Сделать так, чтобы любой продакт мог собрать дашборд за 5 минут, без SQL и без подключения BI-инженера.",
    quality: [
      { code: "P95 < 800ms", label: "Время загрузки дашборда" },
      { code: "TTI < 2s", label: "Time to first chart" },
      { code: "≥ 99.9%", label: "Uptime ingest API" },
      { code: "≤ 0.1%", label: "Потеря событий" },
    ],
    conditions: {
      backend: ["Python 3.12 / FastAPI", "ClickHouse 24.x", "Kafka 3.7", "Redis 7"],
      frontend: ["React 18 + TS", "TanStack Query", "ECharts 5", "Tailwind"],
      logic: ["Event-driven ingest", "OLAP-агрегации в реальном времени", "RBAC на уровне dataset"],
      checks: ["unit ≥ 80%", "e2e: 12 happy paths", "load: 50k events/sec", "visual regression"],
    },
  },

  // Modules — 16 total, 5 with submodules
  modules: [
    // Layer 1 — core platform
    { id: "auth",        title: "Auth & RBAC",            tag: "auth",         layer: "backend", x: 80,   y: 100, status: "done",     priority: 1, checked: true,  size: "sm" },
    { id: "ingest",      title: "Ingest API",             tag: "ingest-api",   layer: "backend", x: 380,  y: 100, status: "done",     priority: 1, checked: true,  size: "md" },
    { id: "warehouse",   title: "Warehouse",              tag: "ch-warehouse", layer: "backend", x: 700,  y: 100, status: "done",     priority: 1, checked: true,  size: "md" },
    { id: "query",       title: "Query Engine",           tag: "query-engine", layer: "backend", x: 1020, y: 100, status: "progress", priority: 2, checked: false, size: "md" },

    // Layer 2 — domain
    { id: "events",      title: "Event Schema",           tag: "schema",       layer: "logic",   x: 380,  y: 320, status: "done",     priority: 2, checked: true,  size: "sm" },
    { id: "datasets",    title: "Datasets",               tag: "datasets",     layer: "logic",   x: 700,  y: 320, status: "progress", priority: 2, checked: false, size: "md" },
    { id: "metrics",     title: "Metrics DSL",            tag: "metrics-dsl",  layer: "logic",   x: 1020, y: 320, status: "desync",   priority: 2, checked: false, size: "md", warn: "Расходится с ingest-схемой" },
    { id: "cohorts",     title: "Cohorts",                tag: "cohorts",      layer: "logic",   x: 1340, y: 320, status: "blocked",  priority: 3, checked: false, size: "sm" },

    // Layer 3 — UI
    { id: "dashboard",   title: "Dashboard Builder",      tag: "dash-builder", layer: "frontend",x: 380,  y: 540, status: "progress", priority: 1, checked: false, size: "lg" },
    { id: "charts",      title: "Charts",                 tag: "charts",       layer: "frontend",x: 700,  y: 540, status: "progress", priority: 2, checked: false, size: "md" },
    { id: "filters",     title: "Filters / Segments",     tag: "filters",      layer: "frontend",x: 1020, y: 540, status: "todo",     priority: 3, checked: false, size: "sm" },
    { id: "share",       title: "Sharing & Embeds",       tag: "share",        layer: "frontend",x: 1340, y: 540, status: "todo",     priority: 4, checked: false, size: "sm" },

    // Layer 4 — ops
    { id: "alerts",      title: "Alerts",                 tag: "alerts",       layer: "logic",   x: 80,   y: 760, status: "todo",     priority: 4, checked: false, size: "sm" },
    { id: "billing",     title: "Billing",                tag: "billing",      layer: "backend", x: 380,  y: 760, status: "fail",     priority: 3, checked: false, size: "md", warn: "Тест провален: refund flow" },
    { id: "tests",       title: "Test Harness",           tag: "test-harness", layer: "tests",   x: 700,  y: 760, status: "progress", priority: 2, checked: false, size: "md" },
    { id: "observ",      title: "Observability",          tag: "observ",       layer: "backend", x: 1020, y: 760, status: "done",     priority: 2, checked: true,  size: "sm" },
  ],

  // Submodules attached to a parent module
  submodules: {
    ingest: [
      { id: "ingest-batch", title: "Batch endpoint", status: "done" },
      { id: "ingest-stream", title: "Stream / WS", status: "progress" },
      { id: "ingest-validate", title: "Schema validation", status: "done" },
    ],
    dashboard: [
      { id: "dash-grid", title: "Grid layout", status: "done" },
      { id: "dash-tile", title: "Tile editor", status: "progress" },
      { id: "dash-presets", title: "Presets", status: "todo" },
      { id: "dash-share", title: "Share modal", status: "todo" },
    ],
    metrics: [
      { id: "metrics-parse", title: "DSL parser", status: "done" },
      { id: "metrics-ast", title: "AST → SQL", status: "desync" },
      { id: "metrics-cache", title: "Result cache", status: "todo" },
    ],
    billing: [
      { id: "billing-stripe", title: "Stripe webhook", status: "done" },
      { id: "billing-refund", title: "Refund flow", status: "fail" },
      { id: "billing-invoice", title: "Invoice render", status: "progress" },
    ],
    charts: [
      { id: "ch-line", title: "Line / Area", status: "done" },
      { id: "ch-bar", title: "Bar / Stacked", status: "done" },
      { id: "ch-funnel", title: "Funnel", status: "progress" },
      { id: "ch-cohort", title: "Cohort grid", status: "todo" },
    ],
  },

  // Edges: from → to (with business-level labels)
  edges: [
    { from: "auth", to: "ingest", kind: "rbac", label: "проверяет токен SDK", biz: "Чужие SDK не могут слать события — каждый запрос подписан рабочим пространством." },
    { from: "auth", to: "dashboard", kind: "rbac", label: "роли и доступ", biz: "Кто что видит — viewer/editor/admin на уровне дашборда." },
    { from: "ingest", to: "warehouse", kind: "data", label: "поток событий", biz: "Каждое событие летит в хранилище exactly-once, никаких потерь." },
    { from: "ingest", to: "events", kind: "schema", label: "сверяет схему", biz: "Прежде чем принять — событие должно быть зарегистрировано в реестре." },
    { from: "warehouse", to: "query", kind: "data", label: "источник для запросов", biz: "Query Engine читает агрегаты из ClickHouse." },
    { from: "events", to: "datasets", kind: "schema", label: "поля для наборов", biz: "Datasets опираются на схему — без неё нельзя собрать осмысленный набор." },
    { from: "datasets", to: "metrics", kind: "data", label: "над чем считать", biz: "Метрики работают поверх Dataset’ов — границы данных и прав." },
    { from: "metrics", to: "cohorts", kind: "data", label: "формулы для когорт", biz: "Когорта = метрика-фильтр, обновляется по расписанию." },
    { from: "query", to: "metrics", kind: "data", label: "выполняет AST", desync: true, biz: "AST метрики переводится в SQL — здесь и расходится: поле user_id уже актуально как actor_id." },
    { from: "query", to: "charts", kind: "data", label: "результаты для графиков", biz: "Charts получают точки/серии прямо от Query Engine." },
    { from: "datasets", to: "dashboard", kind: "data", label: "доступные наборы", biz: "В конструкторе видны только Dataset’ы, к которым у юзера есть доступ." },
    { from: "dashboard", to: "charts", kind: "ui", label: "плитка → график", biz: "Каждый tile — это конфиг + ссылка на метрику + тип графика." },
    { from: "charts", to: "filters", kind: "ui", label: "реагирует на фильтры", biz: "Глобальные фильтры дашборда переписывают параметры графика." },
    { from: "dashboard", to: "share", kind: "ui", label: "публичная ссылка", biz: "Делимся дашбордом — внутри команды или embed на сайт." },
    { from: "metrics", to: "alerts", kind: "data", label: "пороги и тревоги", biz: "Alerts опрашивает метрику и сигналит, если ушла за порог." },
    { from: "auth", to: "billing", kind: "rbac", label: "проверка оплаты", biz: "Лимиты по событиям/seat зависят от тарифа — auth знает, какой тариф." },
    { from: "billing", to: "tests", kind: "test", label: "контракт refund", biz: "e2e на возврат должен зеленеть — иначе никаких релизов billing." },
    { from: "ingest", to: "observ", kind: "ops", label: "трейсы приёма", biz: "Видим, где затыки в приёме, до того как клиент нам напишет." },
    { from: "query", to: "observ", kind: "ops", label: "медленные запросы", biz: "Slow-log по запросам — ловим деградацию p95 за 5 минут." },
    { from: "dashboard", to: "tests", kind: "test", label: "визуальная регрессия", biz: "Скриншот-диффы по дашбордам, чтобы не ломать UX." },
    { from: "metrics", to: "tests", kind: "test", label: "контракт DSL", biz: "Каждый оператор DSL покрыт юнит-тестом — иначе боль на проде." },
  ],

  // Tasks per module (sample)
  tasks: {
    ingest: [
      { id: "T-101", title: "Подключить Kafka exactly-once", status: "done", priority: "P1", agent: "Claude Code",
        why: "Без exactly-once будут дубли событий → метрики врут на 2-5%.",
        accept: "Нагрузочный тест 50k/s, 0 дубликатов в Warehouse за 1 час прогона." },
      { id: "T-102", title: "Schema-registry для событий", status: "done", priority: "P1", agent: "Cursor",
        why: "Чтобы случайное переименование поля не сломало половину дашбордов.",
        accept: "Любое событие с unknown schema отбрасывается с 422 + DLQ-запись." },
      { id: "T-103", title: "Backpressure на стриме > 50k/s", status: "progress", priority: "P2", agent: "Codex",
        why: "Большие клиенты пушат пиками, не должны валить ingest для других.",
        accept: "При 80k/s p95 ack < 100ms, 0% дропов, нет влияния на других tenant'ов." },
      { id: "T-104", title: "DLQ + ретраи с экспоненциальным бэкоффом", status: "todo", priority: "P3", agent: null,
        why: "Сейчас непринятые события теряются — нужна очередь второго шанса.",
        accept: "Failed events попадают в dlq-topic, ретраи 1m/10m/1h, после 3-х — алерт." },
    ],
    metrics: [
      { id: "T-201", title: "Парсер Metrics DSL → AST", status: "done", priority: "P1", agent: "Claude Code",
        why: "Это базовая возможность — без парсера никаких метрик нет.",
        accept: "20 примеров формул из спеки парсятся в одинаковый AST." },
      { id: "T-202", title: "AST → SQL ClickHouse", status: "desync", priority: "P1", agent: "Cursor",
        note: "Использует поле user_id, которого нет в новой ingest-схеме",
        why: "Запрос должен попадать в ClickHouse с правильным диалектом и actor_id.",
        accept: "100% генерируемого SQL валидируется через EXPLAIN, поля сверены со схемой." },
      { id: "T-203", title: "Кеш результатов на Redis", status: "todo", priority: "P2", agent: null,
        why: "Одинаковые запросы юзеров не должны бить ClickHouse повторно.",
        accept: "Hit-rate ≥ 60% за неделю, инвалидация по schema-version." },
      { id: "T-204", title: "Документация DSL для FAQ", status: "todo", priority: "P3", agent: null,
        why: "Без доки юзеры пишут в саппорт — стоимость поддержки растёт.",
        accept: "Покрыты все 14 операторов, ≥ 3 примера на каждый." },
    ],
    dashboard: [
      { id: "T-301", title: "Grid layout drag-n-drop", status: "done", priority: "P1", agent: "Cursor",
        why: "Это и есть главный жест продукта — собирать дашборд руками.",
        accept: "Перетаскивание + ресайз + auto-pack без багов на 12 типах графиков." },
      { id: "T-302", title: "Tile editor с превью", status: "progress", priority: "P1", agent: "Claude Code",
        why: "Юзер должен видеть результат метрики ДО сохранения tile.",
        accept: "Превью обновляется ≤ 800ms после изменения формулы." },
      { id: "T-303", title: "Пресеты дашбордов (5 шт)", status: "todo", priority: "P2", agent: null,
        why: "Новый юзер не должен начинать с пустого экрана — это убивает активацию.",
        accept: "5 пресетов покрывают: Acquisition / Activation / Retention / Revenue / Churn." },
      { id: "T-304", title: "Share-modal с правами", status: "todo", priority: "P3", agent: null,
        why: "Шаринг — главный виральный канал, его нельзя отдавать коряво.",
        accept: "3 уровня: workspace / link with TTL / public embed. Аудит каждой раздачи." },
    ],
    billing: [
      { id: "T-401", title: "Webhook Stripe + idempotency", status: "done", priority: "P1", agent: "Claude Code",
        why: "Без идемпотентности один retry Stripe — двойная оплата у клиента.",
        accept: "Дубликаты webhook'ов обрабатываются один раз, есть тест на повтор." },
      { id: "T-402", title: "Refund flow с pro-rata", status: "fail", priority: "P1", agent: "Codex",
        note: "e2e падает: возврат больше суммы заказа",
        why: "Без корректного refund мы нарушаем закон о защите прав потребителей.",
        accept: "Pro-rata считается до округления Stripe, e2e зелёный, аудит-лог пишется." },
      { id: "T-403", title: "Invoice PDF рендер", status: "progress", priority: "P2", agent: "Cursor",
        why: "B2B-клиенты требуют PDF для бухгалтерии — без него не платят.",
        accept: "Рендер ≤ 2s, валидный PDF/A-3, реквизиты по ФЗ." },
    ],
  },

  // Hierarchical sub-systems — drilling into a module opens its OWN graph
  // Each subsystem mirrors product: title, mission, kpi, stack, lanes, modules, edges
  subsystems: {
    dashboard: {
      title: "Dashboard Builder",
      codename: "acme-dashboard",
      subtitle: "Конструктор дашбордов — главный пользовательский UI",
      mission: "За 5 минут собрать полезный дашборд из tile’ов, без SQL, с превью каждого изменения.",
      kpi: [
        { code: "TTI < 2s",  label: "первый рендер" },
        { code: "≤ 800ms",   label: "превью после правки tile" },
        { code: "5 пресетов", label: "стартовых дашбордов" },
      ],
      stack: ["React 18", "react-grid-layout", "TanStack Query", "ECharts 5", "Zustand"],
      lanes: [
        { id: "ds-ui",    title: "UI · экраны",    color: "frontend", y: 60,  height: 220 },
        { id: "ds-state", title: "State · логика", color: "logic",    y: 290, height: 220 },
        { id: "ds-api",   title: "API · контракт", color: "backend",  y: 520, height: 200 },
      ],
      modules: [
        { id: "ds-grid",    title: "Grid layout",    tag: "ds-grid",    layer: "frontend", x: 80,  y: 100, status: "done",     priority: 1, size: "md" },
        { id: "ds-tile",    title: "Tile editor",    tag: "ds-tile",    layer: "frontend", x: 380, y: 100, status: "progress", priority: 1, size: "md" },
        { id: "ds-presets", title: "Пресеты",        tag: "ds-presets", layer: "frontend", x: 700, y: 100, status: "todo",     priority: 2, size: "sm" },
        { id: "ds-share",   title: "Share modal",    tag: "ds-share",   layer: "frontend", x: 1020,y: 100, status: "todo",     priority: 3, size: "sm" },
        { id: "ds-state",   title: "Tile state store",tag: "ds-state",  layer: "logic",    x: 220, y: 320, status: "progress", priority: 1, size: "md" },
        { id: "ds-perms",   title: "Permissions",    tag: "ds-perms",   layer: "logic",    x: 560, y: 320, status: "done",     priority: 2, size: "sm" },
        { id: "ds-preview", title: "Preview engine", tag: "ds-preview", layer: "logic",    x: 820, y: 320, status: "progress", priority: 1, size: "md" },
        { id: "ds-api",     title: "REST /dashboards",tag: "ds-api",    layer: "backend",  x: 380, y: 540, status: "done",     priority: 1, size: "md" },
        { id: "ds-ws",      title: "WS live updates",tag: "ds-ws",      layer: "backend",  x: 720, y: 540, status: "todo",     priority: 3, size: "sm" },
      ],
      edges: [
        { from: "ds-grid",   to: "ds-state",   kind: "data",  label: "позиции tile’ов" },
        { from: "ds-tile",   to: "ds-state",   kind: "data",  label: "конфиг плитки" },
        { from: "ds-tile",   to: "ds-preview", kind: "data",  label: "live превью формулы" },
        { from: "ds-state",  to: "ds-api",     kind: "data",  label: "сохранение" },
        { from: "ds-state",  to: "ds-ws",      kind: "data",  label: "broadcast collab" },
        { from: "ds-perms",  to: "ds-api",     kind: "rbac",  label: "проверка прав" },
        { from: "ds-presets",to: "ds-state",   kind: "data",  label: "стартовый набор" },
        { from: "ds-share",  to: "ds-perms",   kind: "rbac",  label: "уровень доступа" },
        { from: "ds-preview",to: "ds-api",     kind: "data",  label: "запрос данных" },
      ],
    },
    metrics: {
      title: "Metrics DSL",
      codename: "acme-metrics",
      subtitle: "Domain language для метрик: формула → SQL → результат",
      mission: "Чтобы продакт мог писать формулы как в Excel, без SQL — а движок гарантировал безопасность и скорость.",
      kpi: [
        { code: "< 800ms", label: "p95 запроса" },
        { code: "100%",    label: "покрытие операторов DSL" },
        { code: "0",       label: "случаев SQL-injection" },
      ],
      stack: ["Python 3.12", "lark парсер", "ClickHouse-driver", "Redis 7", "pydantic v2"],
      lanes: [
        { id: "mt-parse", title: "Parser · DSL",   color: "frontend", y: 60,  height: 200 },
        { id: "mt-ast",   title: "AST · план",     color: "logic",    y: 270, height: 200 },
        { id: "mt-exec",  title: "Execution",      color: "backend",  y: 480, height: 200 },
      ],
      modules: [
        { id: "mt-lex",    title: "Лексер",         tag: "mt-lex",    layer: "frontend", x: 80,  y: 100, status: "done",     priority: 1, size: "sm" },
        { id: "mt-parser", title: "Парсер DSL",     tag: "mt-parser", layer: "frontend", x: 380, y: 100, status: "done",     priority: 1, size: "md" },
        { id: "mt-ast",    title: "AST builder",    tag: "mt-ast",    layer: "logic",    x: 220, y: 320, status: "desync",   priority: 1, size: "md", warn: "user_id → actor_id" },
        { id: "mt-opt",    title: "Optimizer",      tag: "mt-opt",    layer: "logic",    x: 540, y: 320, status: "progress", priority: 2, size: "md" },
        { id: "mt-sql",    title: "SQL generator",  tag: "mt-sql",    layer: "backend",  x: 220, y: 540, status: "progress", priority: 1, size: "md" },
        { id: "mt-cache",  title: "Redis cache",    tag: "mt-cache",  layer: "backend",  x: 540, y: 540, status: "todo",     priority: 2, size: "sm" },
        { id: "mt-exec",   title: "CH executor",    tag: "mt-exec",   layer: "backend",  x: 820, y: 540, status: "done",     priority: 1, size: "md" },
      ],
      edges: [
        { from: "mt-lex",    to: "mt-parser", kind: "data", label: "токены" },
        { from: "mt-parser", to: "mt-ast",    kind: "data", label: "AST", desync: true },
        { from: "mt-ast",    to: "mt-opt",    kind: "data", label: "план запроса" },
        { from: "mt-opt",    to: "mt-sql",    kind: "data", label: "оптимизированный AST" },
        { from: "mt-sql",    to: "mt-cache",  kind: "data", label: "ключ кеша" },
        { from: "mt-cache",  to: "mt-exec",   kind: "data", label: "miss → CH" },
        { from: "mt-sql",    to: "mt-exec",   kind: "data", label: "execute SQL" },
      ],
    },
    ingest: {
      title: "Ingest API",
      codename: "acme-ingest",
      subtitle: "Приём событий exactly-once, валидация, backpressure",
      mission: "Принять любую нагрузку клиента без потерь и без влияния на других tenant’ов.",
      kpi: [
        { code: "99.99%", label: "успешных приёмов" },
        { code: "50k/s",  label: "throughput" },
        { code: "< 25ms", label: "p95 ack" },
      ],
      stack: ["FastAPI", "Kafka 3.7", "pydantic v2", "idempotent producer"],
      lanes: [
        { id: "in-edge",  title: "Edge · приём",    color: "frontend", y: 60,  height: 200 },
        { id: "in-core",  title: "Core · логика",   color: "logic",    y: 270, height: 200 },
        { id: "in-store", title: "Store · хранение",color: "backend",  y: 480, height: 200 },
      ],
      modules: [
        { id: "in-http",   title: "HTTP /v1/events", tag: "in-http",   layer: "frontend", x: 80,  y: 100, status: "done",     priority: 1, size: "md" },
        { id: "in-ws",     title: "WS stream",       tag: "in-ws",     layer: "frontend", x: 380, y: 100, status: "progress", priority: 2, size: "sm" },
        { id: "in-validate",title: "Schema validate",tag: "in-validate",layer: "logic",   x: 80,  y: 320, status: "done",     priority: 1, size: "md" },
        { id: "in-backp",  title: "Backpressure",    tag: "in-backp",  layer: "logic",    x: 380, y: 320, status: "progress", priority: 2, size: "md" },
        { id: "in-dlq",    title: "DLQ + ретраи",    tag: "in-dlq",    layer: "logic",    x: 680, y: 320, status: "todo",     priority: 3, size: "sm" },
        { id: "in-kafka",  title: "Kafka producer",  tag: "in-kafka",  layer: "backend",  x: 220, y: 540, status: "done",     priority: 1, size: "md" },
        { id: "in-ch",     title: "ClickHouse sink", tag: "in-ch",     layer: "backend",  x: 540, y: 540, status: "done",     priority: 1, size: "md" },
      ],
      edges: [
        { from: "in-http",    to: "in-validate", kind: "data", label: "сырые события" },
        { from: "in-ws",      to: "in-validate", kind: "data", label: "стрим" },
        { from: "in-validate",to: "in-backp",    kind: "data", label: "valid events" },
        { from: "in-backp",   to: "in-kafka",    kind: "data", label: "поток в Kafka" },
        { from: "in-backp",   to: "in-dlq",      kind: "data", label: "перегрузка → DLQ" },
        { from: "in-kafka",   to: "in-ch",       kind: "data", label: "consume → write" },
      ],
    },
  },

  // Lanes (horizontal regions for layers — modules snap to these)
  lanes: [
    { id: "lane-backend",  title: "Backend · Data",   color: "backend",  y: 60,   height: 220 },
    { id: "lane-logic",    title: "Domain · Logic",   color: "logic",    y: 290,  height: 220 },
    { id: "lane-frontend", title: "Frontend · UI",    color: "frontend", y: 520,  height: 220 },
    { id: "lane-tests",    title: "Tests · Ops",      color: "tests",    y: 750,  height: 200 },
  ],

  // Per-module short descriptions (visible on detailed cards)
  moduleDocs: {
    auth:      { short: "Многотенантная авторизация. JWT, OIDC, RBAC по dataset." },
    ingest:    { short: "Принимает события, валидирует схему, шлёт exactly-once в Warehouse." },
    warehouse: { short: "ClickHouse: 3 шарда × 2 реплики, MV-агрегации." },
    query:     { short: "Безопасная сборка SQL из Metrics DSL с лимитами и кешем." },
    events:    { short: "Реестр event-схем. Без регистрации событие не примут." },
    datasets:  { short: "Логические наборы событий с ACL и retention." },
    metrics:   { short: "DSL для метрик: формула → AST → ClickHouse SQL → Redis-кеш." },
    cohorts:   { short: "Динамические группы юзеров, обновляемые по расписанию." },
    dashboard: { short: "Drag-n-drop конструктор дашбордов и tile-editor." },
    charts:    { short: "Line / Bar / Funnel / Cohort на ECharts. Подбор типа по метрике." },
    filters:   { short: "Глобальные фильтры дашборда, синхронизация tile’ов через URL-state." },
    share:     { short: "Подписанные ссылки и embed для дашбордов." },
    alerts:    { short: "Раз в 5 минут опрашивает метрику → Slack/email при выходе за порог." },
    billing:   { short: "Stripe, лимиты по seat/событиям, инвойсы и pro-rata refund." },
    tests:     { show: "tests", short: "pytest + Playwright + Locust в одном harness, отчёты для CI." },
    observ:    { short: "OTel → Prometheus / Tempo / Loki, Grafana-дашборды." },
  },

  // Old tasks key kept above replaced.

  // History / decisions log
  history: [
    { ts: "12:42", module: "metrics", agent: "sima-core", kind: "warn", msg: "Обнаружен рассинхрон: metrics-dsl ссылается на user_id, в ingest-schema поле переименовано в actor_id" },
    { ts: "12:31", module: "billing", agent: "Codex",     kind: "fail", msg: "e2e refund_flow упал — возврат больше суммы (прогон #214)" },
    { ts: "12:22", module: "dashboard", agent: "Cursor",  kind: "ok",   msg: "Tile editor: добавлен превью, тесты зелёные" },
    { ts: "12:08", module: "ingest",  agent: "Claude Code", kind: "ok", msg: "Backpressure включён, нагрузочный тест 50k/s — 47ms p95" },
    { ts: "11:55", module: "warehouse", agent: "sima-core", kind: "info", msg: "ClickHouse материализованные view обновлены (3 шт)" },
    { ts: "11:40", module: "auth",    agent: "Claude Code", kind: "ok", msg: "RBAC: добавлены роли viewer / editor / admin" },
    { ts: "11:21", module: "metrics", agent: "Cursor",     kind: "info", msg: "DSL парсер v0.4 — поддержка percentile / window" },
    { ts: "11:02", module: "tests",   agent: "sima-core", kind: "ok",   msg: "Покрытие 81.4% — KPI пройден" },
  ],

  // Decisions / lessons learned (memory)
  lessons: [
    { module: "warehouse", verdict: "good", note: "ClickHouse + materialized views — даёт p95 < 200ms на запросах до 10M строк" },
    { module: "metrics", verdict: "bad", note: "Не используй sqlglot для генерации CH-диалекта — теряются JOIN'ы по Nullable полям" },
    { module: "ingest", verdict: "good", note: "Kafka idempotent producer + transactional consumer = exactly-once без боли" },
    { module: "billing", verdict: "bad", note: "Refund на pro-rata вычислять до webhook'а — Stripe округляет иначе" },
    { module: "frontend", verdict: "good", note: "TanStack Query suspense-mode + boundary даёт чистый loading-UX без lifters" },
  ],

  // Agents available
  agents: [
    { id: "claude", title: "Claude Code", tag: "claude-code", color: "warm" },
    { id: "cursor", title: "Cursor",       tag: "cursor",      color: "blue" },
    { id: "codex",  title: "Codex",        tag: "codex",       color: "violet" },
    { id: "sima",   title: "SIMA Core",    tag: "sima-core",   color: "ink" },
  ],
};

# План реализации Sima Atlas (sync-first, schema-driven)

## 1) Цель продукта (в одном абзаце)
Sima Atlas — это визуально-документная система координации AI-кодинга, где единый источник истины хранится в структурированных файлах `/atlas`, а интерфейс показывает статус блоков, связи, критерии готовности и рассинхроны. Любой агент (Cursor/Claude/Codex/др.) получает одинаковый контекст-пак по выбранному блоку и работает по тем же правилам/стеку/смыслам.

---

## 2) Что берём из источников и зачем

### 2.1 Из текущего репозитория (`frontend`)
- Канвас-схему, слои, подсхемы, инспектор, галерею: как основу UI для отображения блоков и статусов.
- Модель статусов/типов связей: как визуальный контракт (`done/in-progress/drift/broken`).
- Рендерер графа: как основа для слоя “архитектура + прогресс”.

### 2.2 Из `agi_small_tess_test_new`
- Snapshot-diff/dedup: чтобы обновлять только изменённые части docs (patch-подход).
- Conflict/gap проверки: чтобы ловить рассинхрон между блоками и правилами.
- Nightly consolidation: автоматическая ночная сверка и пересборка roadmap/health.
- Principle/pattern extraction: перенос «уроков» в `patterns.md`, `decisions.log`, `rules.md`.

### 2.3 Из Cursor SDK / Hooks
- `beforePromptSent`: подмешивание context-pack именно выбранного блока.
- `afterFileEdit`: автоматическое обновление `files.md` и реестра живости файлов.
- `beforeShellExecution`: контроль команд и проверка против `rules.md`/`tech_stack.md`.

### 2.4 Из CodeWiki-подхода
- Wiki как слой представления поверх тех же файлов `/atlas`.
- Никаких параллельных «истин» (отдельных README/roadmap вне atlas).

---

## 3) Целевая структура памяти (source of truth)

```text
/atlas/
  project.md
  rules.md
  tech_stack.md
  roadmap.md
  files_registry.md
  decisions.log
  failures.log
  graph.json
  /blocks/<id>/
    mission.md
    kpi.md
    acceptance.md
    logic.md
    frontend.md
    backend.md
    depends_on.md
    provides.md
    tasks.md
    checks.log
    decisions.log
    patterns.md
    files.md
    screenshots/
    history/
```

Принцип: UI и агенты работают только через эту структуру; любой derived-документ генерируется из неё.

---

## 4) Главный рабочий цикл (человек + агент)
1. Человек выбирает блок на схеме.
2. Система собирает context-pack (global + block + прямые зависимости).
3. Агент получает задачу только по выбранному блоку.
4. После изменения кода — авто-обновление `tasks.md`, `checks.log`, `files.md`.
5. Запуск sync-check:
   - соответствие `rules.md`;
   - соответствие `tech_stack.md`;
   - согласование `depends_on` ↔ `provides`;
   - KPI/acceptance подтверждены логами.
6. UI перекрашивает блок и показывает причину (ok/drift/broken).

---

## 5) Подробная схема блоков продукта

## A. Presentation Layer (UI)
- **A1. Graph Canvas**: карта блоков, связи, статусы.
- **A2. Block Inspector**: mission/KPI/tasks/checks/decisions/patterns.
- **A3. Action Panel**: кнопки `Implement`, `Sync`, `Review`, `Mark Dead`.
- **A4. Wiki View**: чтение atlas-файлов как страниц.

## B. Atlas Core (Documentation Engine)
- **B1. Atlas FS Manager**: создание/валидирование структуры `/atlas`.
- **B2. Patch Writer**: точечные обновления `.md` + `history/`.
- **B3. Status Aggregator**: вычисление готовности и прогресса блока.
- **B4. Dead/Alive Registry**: единый реестр актуальных файлов.

## C. Sync Engine (Consistency)
- **C1. Rules Validator**: соответствие кодовых решений `rules.md`.
- **C2. Stack Validator**: единый стек против дрейфа библиотек/фреймворков.
- **C3. Dependency Contract Checker**: `depends_on` vs `provides`.
- **C4. KPI/Acceptance Verifier**: смысловая готовность, не только runtime.
- **C5. Drift Reporter**: отчёт причин рассинхрона для UI.

## D. Agent Orchestration
- **D1. Context Pack Builder**: минимальный релевантный контекст.
- **D2. Cursor Hook Adapter**.
- **D3. Claude/Codex Adapter**.
- **D4. MCP API**: `read_block`, `update_block`, `log_check`, `sync_report`.

## E. Quality & Consolidation
- **E1. Checks Logger**: компактные результаты тестов.
- **E2. Nightly Consolidation**: пересборка roadmap/health/drift.
- **E3. Product Review Mode**: ревью «соответствует ли логике блока».

---

## 6) Синхронизация: что считается «синхронно»
Блок синхронизирован, если одновременно:
1. Стек блока не противоречит `tech_stack.md`.
2. Практики блока не нарушают `rules.md`.
3. Все входные зависимости закрыты контрактами `provides.md`.
4. В `checks.log` есть проверка KPI и acceptance.
5. Все файлы из `files.md` имеют корректный статус в `files_registry.md`.

Иначе статус: `drift` или `broken` с машинно-читаемой причиной.

---

## 7) Формат “видно что сделано / что нет”
Для каждого блока в UI:
- Progress: `tasks_done / tasks_total`
- KPI: `kpi_passed / kpi_total`
- Acceptance: `accepted / required`
- Sync status: `ok | drift | broken`
- Last check time + owner agent

Это устраняет необходимость читать весь код/чат для оценки состояния.

---

## 8) План реализации по этапам

### Этап 1 — Atlas Foundation
- создать `/atlas` и шаблоны файлов;
- реализовать `graph.json` + привязку к canvas;
- поднять базовый инспектор блока.

### Этап 2 — Sync Engine MVP
- rules/stack/dependency проверки;
- отчёт рассинхрона и подсветка в UI;
- checks logger + KPI/acceptance verifier.

### Этап 3 — Agent Integration
- Context Pack Builder;
- Cursor hooks;
- CLI-адаптеры для Claude/Codex;
- запрет выполнения задач без block-context.

### Этап 4 — Governance и Hygiene
- files alive/dead registry;
- nightly consolidation;
- авто-обновление roadmap по статусам блоков.

### Этап 5 — Review & Scale
- режим продуктового ревью по блокам;
- метрика `sync_health` (% синхронизированных блоков);
- шаблоны для новых проектов.

---

## 9) Критерии приёмки всей системы
1. Любой агент может начать работу по блоку, прочитав только context-pack.
2. Человек за <60 секунд понимает на схеме что готово/не готово.
3. Рассинхрон между README/ROADMAP/кодом не возникает: всё генерируется из `/atlas`.
4. Переключение вкладки/агента не ломает continuity: состояние берётся из `/atlas`.
5. Токены на запуск задачи сокращаются за счёт модульного контекста.

---

## 10) Что не делаем в MVP
- Не строим обязательную векторную память как primary source.
- Не храним длинные чат-логи внутри atlas.
- Не внедряем сложный multi-hop RAG как основной маршрут.

MVP-фокус: **граф + блоковые документы + sync-check + agent hooks**.

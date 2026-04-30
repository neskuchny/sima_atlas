# Прогресс по ТЗ (`ТЗ/новое_тз.md` + `ТЗ/описание.md`)

Дата: 2026-04-30

## 1) Что уже реализовано (MVP-частично)

- [x] Базовая визуализация схемы в интерфейсе `Sima (Remix)` (арх-канвас + панель Atlas).
- [x] Базовый sync-check в runtime (`syncReport`, статусы ok/drift/broken).
- [x] Базовый context-pack export по выбранному блоку.
- [x] Базовый file registry поток: пометка файла как `dead` из UI.
- [x] Каркас `/atlas` как source-of-truth (graph/schema/blocks/roadmap/rules/tasks).

## 2) Что обязательно нужно доделать для полного соответствия ТЗ

### P0 — критично (без этого ТЗ не закрыт)
- [ ] **Полноценный DB-слой Atlas**: не только localStorage, но согласованный store c versioning/migrations и журналом изменений.
- [ ] **Sync Engine 2.0**: полная проверка миссии/KPI/acceptance/depends-provides/files/rules/stack + сохранение детального sync-report.
- [ ] **Agent Orchestrator**: единый pipeline `implement -> sync-check -> review -> done` для Cursor/Claude/Codex.
- [ ] **Контракт блоков**: mandatory `logic.md`, `frontend.md/backend.md`, `depends_on.md`, `provides.md`, `files.md`.

### P1 — очень важно
- [ ] **Hooks generator**: автогенерация `.cursor/hooks.json` и аналогов для других агентов.
- [ ] **UI-операции по блоку**: `Implement`, `Review`, `Done`, `Rollback`, с логированием причин.
- [ ] **История решений/ошибок**: `decisions.log`, `failures.log`, `patterns.md` в каждом активном блоке.
- [ ] **Roadmap auto-sync**: пересборка roadmap из `graph.json` и статусов блоков.

### P2 — системное завершение
- [ ] **Nightly consolidation**: ночная сверка и health-метрика синхронизации.
- [ ] **Wiki renderer**: читаемая wiki-оболочка поверх `/atlas`.
- [ ] **MCP server Sima Atlas**: tools `read_block`, `list_deps`, `update_block`, `log_check`, `sync_check`, `mark_file_dead`.
- [ ] **Backup semantic search (optional)**: поиск по эпизодам чатов как дополнительная, не основная память.

## 3) Явные пробелы относительно `ТЗ/описание.md`

- [ ] Автоматическое извлечение цели/миссии/условий из диалога пользователя в структурные поля блоков.
- [ ] Полноценная приоритизация тасков внутри блока + между блоками с влиянием на execution order.
- [ ] Полуавтоматические проверки логики «работает, но не то» (бизнес-смысл, не только тех. тесты).
- [ ] Полная трассировка «источник → решение → код → тест → статус» по каждому модулю.

## 4) Рекомендуемый порядок закрытия

1. Закрыть P0 целиком.
2. Закрыть P1, чтобы ежедневная работа стала стабильной.
3. Закрыть P2 для масштаба и мульти-агентного режима.

## 5) Definition of Done (для финального закрытия ТЗ)

ТЗ считается закрытым, когда:
- [ ] Все блоки в `graph.json` имеют полный комплект документов и проверок.
- [ ] Sync-check даёт воспроизводимый отчёт без ручных допущений.
- [ ] Любой агент может взять block-context и продолжить работу без чтения чатов.
- [ ] Человек по UI за <60 секунд понимает: что сделано, что сломано, что делать дальше.


## 6) Стоппоинт
- Текущая остановка зафиксирована в `atlas/STOPPOINT.md`.
- Следующий обязательный шаг: P0 Agent Orchestrator pipeline + state transitions.

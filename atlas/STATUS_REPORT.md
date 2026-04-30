# Sima Atlas — статус и остаток работ

Дата: 2026-04-30

## Где мы сейчас

### Выполнено
- Базовый Atlas runtime + UI-панель в `Sima (Remix)`.
- State transitions для блоков и transition audit trail.
- One-shot pipeline: transition -> selftest -> block contracts -> dependency contracts -> acceptance assertions -> roadmap rebuild.
- Блоки по статусам:
  - `b.agent-orchestrator` — `done`.
  - `b.ui-control` — `done`.
  - `b.core-sync` — `review`.
  - `b.db` — `wip`.

### Текущая стадия
Мы на этапе **P3/P7 stabilization** (после закрытия P1/P2 и P0-хвоста).

## Что осталось по плану

### P1 (следующий приоритет)
1. [x] Добавить `Rollback` в UI lifecycle-кнопки.
2. [x] Добавить фильтры `broken/drift/review/done` в Atlas-панели.
3. [x] Автообновление `files.md` и `checks.log` после UI/agent actions без ручной правки (UI + MCP + pipeline paths покрыты: transition/mark dead/set/update/pipeline step автологируют checks/files).
4. [x] Визуальный индикатор «готово к done» (все gates pass) + блокировка кнопки Done, если блок не готов.

### P2
1. [x] Nightly consolidation job (`scripts/nightly_consolidation.mjs` + MCP tool `nightly_consolidation`).
2. [x] Wiki renderer поверх `/atlas` (`scripts/render_wiki_html.mjs` + MCP tool `render_wiki_html`).
3. [x] MCP server (`read_block`, `sync_check`, `log_check`, `update_block`, `mark_file_dead`) — `update_block` добавлен как atomic tool.

### Открытый P0-хвост
- [x] Углублены acceptance assertions: добавлены смысловые проверки checklist/semantic tokens в `scripts/validate_acceptance_assertions.mjs`.

## Ближайший next step
- [x] Добавлен smoke-e2e сценарий MCP `update_block -> enqueue_ingestion -> apply_ingestion_queue -> build_context_pack -> validated_bundle -> render_wiki_html` и включён в nightly consolidation.
- [x] Добавлен расчёт `intelligence_health` и его публикация в nightly (`scripts/calc_intelligence_health.mjs`).
- [~] Старт P6 ingestion: добавлен distillate path (`ingest_chat_distillate`), MCP enqueue (`enqueue_ingestion`), nightly queue processor (`apply_ingestion_queue`) и gate `validate_ingestion_contracts`.
- [x] P10 parity закрыт (2026-04-30): deterministic context-packs для всех блоков + unified contracts + gates `sync_context_packs`/`validate_agent_parity`/`validate_parity_matrix`.

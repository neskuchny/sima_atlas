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
Мы на этапе **P1: UI lifecycle hardening** (после закрытия основной части P0 gates).

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
- Перейти к стабилизации P2/P3: добавить smoke-e2e сценарий MCP `update_block -> validated_bundle -> render_wiki_html` и зафиксировать его в nightly.

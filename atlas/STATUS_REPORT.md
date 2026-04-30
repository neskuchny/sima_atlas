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
1. Добавить `Rollback` в UI lifecycle-кнопки.
2. Добавить фильтры `broken/drift/review/done` в Atlas-панели.
3. Автообновление `files.md` и `checks.log` после UI/agent actions без ручной правки.
4. Визуальный индикатор «готово к done» (все gates pass).

### P2
1. Nightly consolidation job.
2. Wiki renderer поверх `/atlas`.
3. MCP server (`read_block`, `sync_check`, `log_check`, `update_block`, `mark_file_dead`).

### Открытый P0-хвост
- Углубить acceptance assertions до смысловых сценариев по логике блока (не только ключевые слова pass в checks.log).

## Ближайший next step
- Реализовать `Rollback` кнопку и transition `done/review -> wip` в UI с записью причины в transitions.log.

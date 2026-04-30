# STOPPOINT — где мы остановились

Обновлено: 2026-04-30

## Текущая точка
Мы завершили базовую фазу Atlas MVP:
- есть runtime sync engine (`SIMA_ATLAS_CORE`);
- есть визуальная Atlas-панель в `app_v2.jsx`;
- есть генератор Cursor hooks;
- есть автопересборка roadmap;
- есть self-test для runtime.

## Что уже работает
1. `sync-check` по блокам (ok/drift/broken) + причины.
2. `context-pack` export для выбранного блока.
3. Пометка файла как `dead` из UI и запись в file registry.
4. Автогенерация `.cursor/hooks.json` из `atlas/graph.json`.
5. Автопересборка `atlas/roadmap.md` из графа.

## Где именно остановились (следующий шаг)
Следующая незакрытая задача по плану: **P1: UI lifecycle hardening**
(rollback, фильтры broken/drift, автоматическое обновление files/checks после агентных правок).

## Что осталось сделать

### P0 (критично)
- [ ] Реализовать state machine блока (`idea/wip/review/done/broken`) + transition rules.
- [ ] Подключить `review` как обязательный этап перед `done`.
- [ ] Добавить persistent журнал переходов (`atlas/transitions.log`).
- [ ] Довести sync-check до проверки mission/logic/acceptance на уровне контракта.

### P1
- [ ] Добавить UI-кнопки жизненного цикла блока (`Implement`, `Review`, `Done`, `Rollback`).
- [ ] Добавить фильтры и быстрые переходы по broken/drift блокам.
- [ ] Добавить автообновление `files.md`/`checks.log` после агентных действий.

### P2
- [ ] Nightly consolidation job.
- [ ] Wiki renderer поверх `/atlas`.
- [ ] MCP server endpoints (`read_block`, `sync_check`, `log_check`, ...).

## Команды для восстановления контекста
```bash
node tests/atlas_sync.selftest.mjs
node scripts/generate_cursor_hooks.mjs
node scripts/rebuild_atlas_roadmap.mjs
```

## Быстрый handoff
Если продолжает другой агент:
1. Прочитать `atlas/progress_tz_checklist.md`.
2. Прочитать этот `atlas/STOPPOINT.md`.
3. Начать с реализации state machine переходов блока (P0).


## Новое (в этой итерации)
- Добавлен one-shot CLI `scripts/pipeline_step.mjs` (transition + selftest + roadmap rebuild).
- Блок `b.agent-orchestrator` доведён до статуса `done` через pipeline.

- Добавлена проверка block contracts: `scripts/validate_block_contracts.mjs` (включена в pipeline_step).

- Добавлена проверка dependency contracts: `scripts/validate_dependency_contracts.mjs` (включена в pipeline_step).

- Добавлен acceptance assertions gate: `scripts/validate_acceptance_assertions.mjs` (включен в pipeline_step).

- Текущий прогресс и остаток работ зафиксированы в `atlas/STATUS_REPORT.md`.

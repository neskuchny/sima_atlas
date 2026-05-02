# STOPPOINT — где мы остановились

Обновлено: 2026-05-02 (после PR1 honest reset)

## Текущая точка

Закрыт **PR1 — Honest Reset**. Что это значило:
- Из графа удалены 4 регекс-сгенерированных «Auto»-блока.
- Шаблонные mission/kpi/acceptance/tasks 5 оставшихся блоков заменены на содержательное описание с конкретными PR-привязками.
- Статусы блоков переведены на честные (`wip`, `idea`) с полем `status_reason`.
- Добавлен новый блок `b.llm-gateway` (idea) — критический gate для PR3.
- Добавлен валидатор `validate_no_template_placeholders.mjs` и подключён в `nightly_consolidation.mjs`.

Цель PR1 — **прекратить врать про done**. Никакие фичи не добавлены.

## Что работает по факту

1. React-канвас рендерится; layer-switcher / inspector / lifecycle-кнопки работают.
2. `runSyncWithChecks` детектит наличие файлов и контракты `depends/provides`.
3. Context-pack export по блоку (UI + CLI).
4. MCP-сервер с 21+ tools (доступен через `.cursor/mcp.json`).
5. Nightly pipeline (15+ валидаторов, теперь с `no_template_placeholders` gate).
6. Wiki-генератор и `auto_tz.md` (но содержательные только когда блоки заполнены).

## Что НЕ работает по факту (плановое)

| Симптом | Причина | Блок | План |
|---|---|---|---|
| Схема выглядит однослойной сеткой | В `graph.json` нет поля `layer`; `arch_canvas.jsx` ищет `b.layer === layerId` и не находит | b.ui-control / b.db | PR2 |
| LLM не извлекает смыслы из чата | regex `/(?:block|блок\p{L}*)\s+([a-z0-9._-]+)/giu` в `analyze_conversation_to_atlas.mjs` | b.llm-gateway | PR3 |
| Cursor-хуки игнорируются | `afterPromptSent` — выдуманное событие; `action.run_command` — невалидный формат | b.agent-orchestrator | PR4 |
| Sync пропускает «работает но не то» | sync смотрит только наличие файлов, не сравнивает mission ↔ реализацию | b.core-sync | PR3 (sem) + PR4 (code) |
| Пользовательский продукт не описан | Атлас описывает сам себя | глобально | PR5 |

## Следующий шаг — PR2 (Schema model + multi-layer)

Минимальный набор задач:
1. Расширить `atlas/db_schema.json` v2: блок имеет `layer`, `type`, `mvp`, `subschema_id`, `files: []`, `depends_on: [{block_id, capability}]`, `provides: [{capability, description}]`.
2. Migration runner v1→v2 (`scripts/migrate_v1_v2.mjs`) — добавляет поля в существующие 6 блоков.
3. Заполнить `layer` для текущих блоков:
   - b.ui-control → `front`
   - b.core-sync → `logic`
   - b.db → `data`
   - b.agent-orchestrator → `ai`
   - b.docs → `content`
   - b.llm-gateway → `ai`
4. Переписать `atlas_bootstrap.js` так, чтобы блоки расходились по `layer`-полосам (использовать `ARCH_LAYERS` из `arch_data.js`).
5. Подсветка drift/broken на канвасе с tooltip-причиной из `syncReport.details[].issues[]`.
6. Mermaid-диаграмма графа в `wiki.html`.
7. Roadmap topo-sort по `depends_on` (B перед A, если A зависит от B, независимо от статуса).

## Команды для проверки текущего состояния

```bash
node scripts/validate_block_contracts.mjs
node scripts/validate_no_template_placeholders.mjs
node scripts/validate_dependency_contracts.mjs
node scripts/nightly_consolidation.mjs
```

## Быстрый handoff

Если продолжает другой агент:
1. Прочитать `atlas/STATUS_REPORT.md` (актуальная картина после PR1).
2. Прочитать `atlas/progress_tz_checklist.md` (полный список разрывов с ТЗ).
3. Прочитать этот `STOPPOINT.md`.
4. **Не пытаться переводить блоки в `done` без реального acceptance.** Валидатор `validate_no_template_placeholders.mjs` теперь падает на любую шаблонную строку.
5. Начать с PR2 — расширение схемы блока полем `layer` и migration runner.

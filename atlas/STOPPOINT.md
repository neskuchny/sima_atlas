# STOPPOINT — где мы остановились

Обновлено: 2026-05-02 (после PR3 LLM gateway)

## Текущая точка

Закрыт **PR3 — Real LLM extraction**. Что добавлено сверх PR2:
- `scripts/llm_gateway.mjs` (Anthropic + Google + mock; structured output; trace; cost cap; provider fallback).
- `extractBlockSchema(dialogText)` через единый schema.
- Golden eval из 5 диалогов: avg precision = 1.0 на mock (target 0.7).
- `analyze_conversation_to_atlas.mjs` переписан — regex заменён на LLM с confidence-фильтром и safe-upsert (existing блоки защищены от перезаписи).
- Smoke `simulate_conversation_branches.mjs` теперь идемпотентный (восстанавливает state) и проверяет правильную семантику safe-upsert.
- `b.llm-gateway` → review, `b.agent-orchestrator` → depends_on b.llm-gateway.
- `.gitignore` для шума trace-логов.
- nightly: **PASS 21/21**.

PR2 (`Multi-layer Schema`) был раньше:
- graph.json v2 с decl `layers[]` и полями `layer/type/mvp/files/tech_stack` у блоков.
- Все 7 блоков разнесены по 6 layer-полосам (front / logic / ai / data / content / testing).
- `files.md` каждого блока заполнен реальными путями (95 alive файлов).
- Новые валидаторы: `validate_files_registry.mjs`, `tests/atlas_bootstrap.smoke.mjs`.
- Wiki теперь с Mermaid-диаграммой и секциями по слоям; HTML-рендер инлайнит mermaid.js с CDN.
- Roadmap — топосортинг по depends_on (Level 0 → Level 1 → Level 2).
- nightly: **PASS 18/18**.

PR1 (`Honest Reset`) был раньше:
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

## Следующий шаг — PR4 (Real Cursor / Claude observation)

Минимальный набор задач:
1. Заменить выдуманные хуки в `.cursor/hooks.json` (`afterPromptSent`) на валидные Cursor-события (`afterFileEdit`, `beforeShellExecution`, `beforeSubmitPrompt`).
2. `scripts/observe_file_edit.mjs`: получает путь файла → ищет в `files.md` всех блоков → дописывает в `checks.log` блока запись `cursor_edit pass <git diff --stat>`.
3. `scripts/guard_against_drift.mjs`: на `beforeShellExecution` сверяет команду с `tech_stack.md` (например, блокирует `pip install` если стек React+Node).
4. Adapter Claude Code: MCP tool `run_block_implementation(block_id)` → `claude --print --add-dir atlas/blocks/<id>`.
5. `validate_agent_parity.mjs` с настоящим diff-сравнением context-pack между Cursor (через MCP) и Claude (через CLI).
6. После PR4 — `b.agent-orchestrator` поднимется в review.

## Параллельные планы

- **PR3.5** (UI confidence/diff flow): когда `extractBlockSchema()` предлагает обновить существующий блок, UI должен показывать diff и кнопки Accept/Reject. Сейчас всё уходит только в `checks.log`.
- **PR2.5** (Drift visualization): подсветка drift/broken блоков на канвасе с tooltip-причиной из `syncReport.details[].issues[]`.
- **PR5** (Real-product example): один реальный пример пользовательского продукта в `/atlas/projects/<demo>/` (не сама Сима про себя).

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

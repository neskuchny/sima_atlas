# STOPPOINT — где мы остановились

Обновлено: 2026-05-02 (после PR2 multi-layer schema)

## Текущая точка

Закрыт **PR2 — Multi-layer Schema**. Что добавлено сверх PR1:
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

## Следующий шаг — PR3 (Real LLM extraction)

Минимальный набор задач:
1. Реализовать `scripts/llm_gateway.mjs` с структурированным выводом (Anthropic + Gemini + mock).
2. ENV-конфиг через `.env`: `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `LLM_DEFAULT_PROVIDER`.
3. Trace-логирование в `atlas/llm_traces/<timestamp>.json` (tokens, cost, prompt hash).
4. Заменить regex в `scripts/analyze_conversation_to_atlas.mjs` на `extractBlockSchema(text) → BlockSchema` через LLM.
5. UI: показывать `confidence` и diff перед записью в Atlas (accept/reject в `composer.jsx`).
6. Eval на golden set из 5 диалогов: precision извлечения mission ≥ 0.7.
7. `b.llm-gateway` → status `done` после прохождения eval.

После PR3 PR4 (Real Cursor observation) станет осмысленным: реальные file-edits Cursor смогут писаться в `checks.log` нужного блока через LLM-классификатор «какой блок изменён».

## Подсветка drift/broken на канвасе (перенесено в PR2.5)
- arch_canvas получает блок-status и `status_reason` через bootstrap, но визуального tooltip пока нет.
- Сделать в PR2.5 (полу-автоматически после первого визуального теста UI).

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

# AUTO ТЗ (из Atlas)

## b.ui-control (wip)

# b.ui-control — mission

Визуальная control plane Симы: один React-канвас, в котором человек видит схему продукта (слои, блоки, связи), статус каждого блока (idea/wip/review/done/broken/drift), запускает действия по блоку (Implement / Review / Done / Rollback / mark-dead) и собирает context-pack для агента.

Главное назначение — заменить чтение кода и переключение между чатами Cursor/Claude/Codex на одну визуальную карту, где видно: что сделано, что сломано, что синхронизировано с миссией продукта, что нет.

## Scope
- 4 layer switcher (Канвас источников / Карта продукта / ТЗ / Реализация) + Галерея.
- Архитектурный канвас (горизонтальные слои, блоки с портами, типизированные связи, drag&drop).
- Inspector блока: mission/kpi/tasks/checks, кнопки lifecycle, экспорт context-pack.
- Подсветка рассинхрона и broken/drift-фильтры.

## Out of scope (для PR1)
- LLM-вызовы из UI (PR3).
- Watcher событий Cursor (PR4).


# b.ui-control — tasks

- [ ] T1: Подключить пропавшие JSX в `Sima (Remix)/Сима - универсальный конструктор.html` (components.jsx, sidecol.jsx, canvas_tools.jsx, composer.jsx, library_view.jsx) — **PR1**
- [ ] T2: Развести блоки по слоям через поле `layer` из `graph.json` v2 — **PR2**
- [ ] T3: В `arch_canvas.jsx` корректно читать `layer` и рисовать каждый блок в соответствующей полосе — **PR2**
- [ ] T4: Live update схемы при изменениях в `/atlas/` (через WebSocket или polling) — **PR2**
- [ ] T5: Подсветка drift/broken блоков с tooltip-причиной из `syncReport.details` — **PR2**
- [ ] T6: Двойной клик по блоку с `subschema_id` открывает подсхему (рекурсия) — **PR2**
- [ ] T7: Кнопка «Implement» вызывает `composer.jsx` со сгенерированным context-pack для агента — **PR3**


## b.core-sync (wip)

# b.core-sync — mission

Sync Engine — движок проверки синхронизации блоков продукта с миссией, KPI, стэком и кодом. Главная задача — детектить «рассинхрон»: код пишется в одном фреймворке, ТЗ говорит про другой; блок A объявляет, что зависит от capability X у блока B, а B такой capability не предоставляет; KPI задан, но в `checks.log` нет ни одной измеренной записи.

Текущая реализация (`Sima (Remix)/atlas_sync.js` + `scripts/validate_*`) — каркас: проверяет наличие файлов, подсчитывает прогресс tasks/KPI, сравнивает `depends_on/provides`. Этого недостаточно для миссии «решить рассинхрон» — нужно семантическое сопоставление миссии блока с реализацией (требует LLM, PR3) и реальный анализ кода (PR4).

## Layer
logic

## Что должен делать в done-версии (роадмап)
1. Структурный sync (PR2): contract-валидация графа, layer/depends/provides консистентность.
2. Семантический sync (PR3): LLM проверяет `code(impl) ↔ mission/kpi блока`, выдаёт `drift_reason`.
3. Реальный sync с кодом (PR4): на каждый `git diff` сопоставляет изменённые файлы с `files.md` блоков и логирует факт изменения в `checks.log`.

## Out of scope
- Генерация документации (это `b.docs`).
- UI-визуализация sync-репорта (это `b.ui-control`).


# b.core-sync — tasks

- [ ] T1: Расширить модель блока в `graph.json` полями `layer/type/mvp/subschema_id/files` (схема v2) — **PR2**
- [ ] T2: Контракт `depends_on: [{block_id, capability}]` (структурный объект, не строка) — **PR2**
- [ ] T3: Stack-mismatch detector: сопоставлять `tech_stack` блока с расширениями файлов в `files.md` — **PR2**
- [ ] T4: Семантический gate через `b.llm-gateway.callLLM`: validate `mission ↔ files contents` → drift_reason — **PR3**
- [ ] T5: Сохранение детального `sync_report.json` (не только `details: []`, а с file/line ссылками) — **PR2**
- [ ] T6: false-positive guard: при двух запусках без изменений — отчёт идентичен — **PR2**


## b.db (idea)

# b.db — mission

Atlas storage слой: единый источник правды для графа продукта (`graph.json`), блоков (`blocks/<id>/*.md`), очереди ingestion (`ingestion_queue.jsonl`), журналов transitions/decisions/checks. Цель — предоставить детерминированный API для чтения/записи без дрейфа.

В MVP — это plain markdown + JSON файлы на диске + localStorage-кеш на клиенте через `atlas_sync.js`. В production-варианте — миграция на SQLite или Postgres с тем же файловым API через MCP-сервер (атомарность, версии, multi-tenant).

## Layer
data

## Что должен делать в done-версии
1. Атомарные write-операции (block update = single transaction, не оставляем half-written файлы при сбое).
2. Версионирование блока: каждое изменение mission/kpi/depends/provides пишется в `history/<timestamp>.diff`.
3. Migration runner: если схема `graph.json` меняется (как в PR2 при добавлении `layer/type/mvp`), мигратор обновляет старые блоки.
4. Read-API: `getBlock(id)`, `listBlocks(filter)`, `getDependencies(id)`, `getHistory(id)` — единый интерфейс для UI и MCP.

## Out of scope
- Векторный поиск (это backup-память, не основная).
- Multi-project namespacing (PR в стек после PR4).


# b.db — tasks

- [ ] T1: Atomic write через temp-file + rename для всех `update_block`-операций в MCP — **PR2**
- [ ] T2: Версионирование: каждый update сохраняет старый mission/kpi в `blocks/<id>/history/<timestamp>.md` — **PR2**
- [ ] T3: Migration runner `scripts/migrate_v1_v2.mjs` (добавляет layer/type/mvp в старые блоки) — **PR2**
- [ ] T4: Read-API через MCP: `get_block_history`, `list_blocks_by_layer` — **PR2**
- [ ] T5: Расширить `db_schema.json` валидной JSON Schema для `graph.json` и блоков — **PR2**
- [ ] T6: Multi-project namespace: `/atlas/projects/<name>/blocks/...` — **PR4**


## b.agent-orchestrator (review)

# b.agent-orchestrator — mission

Шина между Sima и любым coding-агентом (Cursor, Claude Code, Codex CLI, Antigravity). Главная задача — обеспечить, чтобы все агенты работали по **одному и тому же** context-pack, читали `/atlas/blocks/<id>/` перед написанием кода и пушили обратно реальные события (file edits, shell calls, status transitions), а не шаблонные «sync pass»-логи.

## Layer
ai

## Что реализовано (после PR4)

1. **MCP-сервер** `scripts/mcp_atlas_server.mjs` (21+ tools: read_block / list_dependencies / sync_check / build_context_pack / log_check / mark_file_dead / update_block / generate_validated_bundle / nightly_consolidation / render_wiki_html / ingest_chat_distillate / enqueue_ingestion / apply_ingestion_queue ...). Cursor подключает его через `.cursor/mcp.json`.
2. **Валидный `.cursor/hooks.json`** в формате Cursor (`{ version: 1, hooks: { event: [{ command }] } }`) с 4 событиями:
   - `beforeSubmitPrompt` → `node scripts/inject_context_pack.mjs` (вкладывает block-scoped context).
   - `afterFileEdit` → `node scripts/observe_file_edit.mjs` (записывает правку в `checks.log` блока через `files.md` reverse-mapping).
   - `beforeShellExecution` → `node scripts/guard_against_drift.mjs` (отклоняет команды против `tech_stack.md`).
   - `stop` → `node scripts/calc_intelligence_health.mjs` (обновляет дашборд).
3. **`validate_cursor_hooks.mjs`** — gate в nightly: фейлится если формат не соответствует Cursor или command ссылается на несуществующий скрипт.
4. **9-case integration test** `tests/cursor_hooks_actions.test.mjs`: known/unknown/empty path, pip-rejected / npm-approved / yarn-vue-rejected / empty-command, inject-by-env / inject-by-prompt-detection.
5. **AGENTS.md / CLAUDE.md** генерируются `scripts/generate_agent_contracts.mjs` и одинаковы для всех агентов.

## Что осталось до done
- Live-проверка с реальным Cursor в IDE: запустить пример pip-команды, убедиться, что она блокируется в реальном окружении (а не только в наших тестах через CLI argv).
- Adapter для Claude Code CLI: MCP tool `run_block_implementation(block_id)` → `claude --print --add-dir atlas/blocks/<id>`.
- Real diff-парити между Cursor MCP и Claude CLI context-packs (PR4.5).

## Out of scope
- LLM-извлечение смысла из чата (это `b.llm-gateway`).
- UI-операции по блоку (это `b.ui-control`).


# b.agent-orchestrator — tasks

- [ ] T1: Заменить выдуманный `afterPromptSent` в `.cursor/hooks.json` на валидные Cursor события — **PR4**
- [ ] T2: Реализовать `scripts/observe_file_edit.mjs`: на `afterFileEdit` пишет в `checks.log` блока с `git diff --stat` — **PR4**
- [ ] T3: `scripts/guard_against_drift.mjs`: на `beforeShellExecution` сверяет команду с `tech_stack.md` — **PR4**
- [ ] T4: Adapter для Claude Code CLI: MCP tool `run_block_implementation(block_id)` — **PR4**
- [ ] T5: `validate_agent_parity.mjs` — нечестная проверка форматов; нужно сравнение реального context-pack diff между агентами — **PR4**
- [ ] T6: Distillate генератор через `b.llm-gateway`: чат → factual notes → блок — **PR3**


## b.docs (wip)

# b.docs — mission

Документ-генератор Атласа: на каждый блок собирает живую страницу wiki из его `mission.md / kpi.md / acceptance.md / depends_on.md / provides.md / files.md / patterns.md`. На каждый проект собирает `auto_tz.md` (агрегированное ТЗ) и `roadmap.md` (приоритизированный список блоков по статусу и зависимостям).

Главное правило — **никакой генерации текста, не основанной на содержимом блоков**. Если у блока mission.md шаблонный или пустой, в wiki это блок попадает с явной пометкой `[требует заполнения]`, а не «Ключевая цель блока…».

Реализация: `scripts/generate_wiki.mjs`, `scripts/generate_tz_from_atlas.mjs`, `scripts/render_wiki_html.mjs`, `scripts/rebuild_atlas_roadmap.mjs`.

## Layer
content

## Что должен делать в done-версии
1. Wiki содержит секции по слоям (front/back/ai/data/...) и навигацию между блоками по `depends_on`.
2. Mermaid-диаграмма графа в `wiki.html` (по `graph.json`).
3. ТЗ автогенерируется только из non-template mission/kpi (контракт `validate_no_template_placeholders`).
4. Roadmap учитывает не только статус блока, но и `depends_on` (топологическая сортировка).
5. Скриншоты блоков (когда `b.ui-control` дойдёт до этой фичи) встраиваются в wiki.

## Out of scope
- Извлечение содержимого блоков из чата (это `b.llm-gateway` + `b.agent-orchestrator`).


# b.docs — tasks

- [ ] T1: Подключить `validate_no_template_placeholders` как gate в `generate_wiki.mjs` (PR1)
- [ ] T2: Mermaid-диаграмма графа в `wiki.html` (по `graph.json`) — **PR2**
- [ ] T3: Wiki-секции по слоям (front/logic/ai/data/...) — **PR2**
- [ ] T4: Roadmap topo-sort по `depends_on` — **PR2**
- [ ] T5: Skip blocks `idea+empty mission` в `auto_tz.md` — **PR1**
- [ ] T6: Cross-link между блоками через ссылки в wiki — **PR2**


## b.llm-gateway (review)

# b.llm-gateway — mission

Единая точка входа для всех LLM-вызовов внутри Атласа. Реализовано в `scripts/llm_gateway.mjs`:

- **Provider-agnostic API**: `callLLM({provider, model, system, prompt, schema, max_tokens, temperature, op, strict})` для anthropic / google / mock.
- **Structured output** через JSON Schema: для Anthropic — через tool-use (`submit_structured_response`), для Gemini — через `responseSchema`.
- **Mock-провайдер** с двумя уровнями lookup: точный hash (provider+model+prompt) и prompt-only hash. При отсутствии fixture — детерминированный пустой объект по schema. Используется в CI, golden-set eval'ах и при отсутствии API-ключей.
- **Trace-логирование**: каждый вызов пишет `atlas/llm_traces/<UTC>__<provider>__<hash>.json` с провайдером, моделью, в/о токенами, оценкой стоимости в USD, schema-валидностью и причинами ошибок. `.gitignore` отсекает шум, оставляя `.gitkeep`.
- **Token budget** (`LLM_MAX_INPUT_TOKENS`) и **per-run cost cap** (`LLM_MAX_USD_PER_RUN`) — оба читаются из `.env`. Превышение → выброс при `strict: true`.
- **Provider fallback**: если запрошенный провайдер недоступен или отвалился (5xx / timeout / auth), gateway без `strict` падает обратно на mock и логирует это в trace (`fallback_to_mock: true`).
- **Sugar-функция** `extractBlockSchema(dialogText)` принимает диалог и возвращает `{ blocks: [{id, title, mission, layer, type, mvp, status, depends_on, provides, tech_stack, confidence}] }` — это и есть «извлечение блоков из чата», которое требует ТЗ.

В PR3 заменён regex `/(?:block|блок)\s+([a-z0-9._-]+)/giu` в `scripts/analyze_conversation_to_atlas.mjs` на вызов `extractBlockSchema()` через этот gateway. Результат: новый блок создаётся в `graph.json` со всеми структурными полями и заметкой о происхождении (LLM extraction, confidence). Для существующих блоков LLM-предложения **не перезаписывают** content — только дописывают `llm_extraction` запись в `checks.log` (это будущий human-in-loop accept/reject в UI).

Golden eval: 5 эталонных диалогов, средняя точность ≥ 0.7 (на mock — 1.0).

## Layer
ai

## Что должен делать в done-версии (после review)
1. Live-test против реального Anthropic / Gemini API (нужен ключ в `.env`).
2. UI confidence/diff flow (composer.jsx) — accept/reject предложенных LLM блоков.
3. Eval на 30+ реальных диалогов вместо 5 синтетических.
4. Persistent eval suite в nightly с историей точности.
5. Подключить gateway во все остальные места, где имеет смысл LLM (sync semantic-check, distillate fact extraction).

## Out of scope
- Embeddings / vector search.
- Streaming.
- Fine-tuning или local-inference (vLLM и т.п.) — оставлено на enterprise mode.


# b.llm-gateway — tasks

- [ ] T1: Спроектировать единый интерфейс `callLLM({provider, model, prompt, schema, max_tokens, temperature})`
- [ ] T2: Реализовать adapter для Anthropic (Claude) с structured output через tool-use
- [ ] T3: Реализовать adapter для Google (Gemini) с responseSchema
- [ ] T4: Mock-режим (детерминированные ответы из `tests/llm_mocks/`)
- [ ] T5: Trace-логирование в `atlas/llm_traces/`
- [ ] T6: Cost-guard и fallback между провайдерами
- [ ] T7: CLI `llm_gateway.mjs --self-test` с mock-данными
- [ ] T8: Замена regex в `analyze_conversation_to_atlas.mjs` на `extractBlockSchema`
- [ ] T9: Eval на golden set из 5 диалогов (precision >= 0.7)


## b.smoke-sandbox (idea)

# b.smoke-sandbox — mission

Целевой блок для всех e2e/smoke-тестов Атласа. Реальный код продукта на него не ссылается. MCP smoke-сценарии (`scripts/mcp_smoke_e2e.mjs`, future smoke harnesses) пишут сюда mission/tasks/ingestion-queue, чтобы не повреждать содержание реальных блоков (b.ui-control, b.core-sync, b.db, b.agent-orchestrator, b.docs, b.llm-gateway).

Ожидаемый цикл жизни: блок постоянно в статусе `idea`, его tasks/checks log заполняются и затираются smoke-сценариями, что не считается дрейфом — это часть функции блока.

## Layer
testing

## Что должен делать в done-версии
Блок никогда не должен попадать в `done`. Это контейнер для тестов.

## Out of scope
- Любые продуктовые фичи.


# b.smoke-sandbox — tasks

- [ ] nightly smoke e2e task



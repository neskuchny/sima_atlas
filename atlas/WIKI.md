# Sima Atlas Wiki

## b.ui-control — UI Control Plane
- status: **wip**

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


## b.core-sync — Sync Engine
- status: **wip**

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


## b.db — Atlas Database
- status: **idea**

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


## b.agent-orchestrator — Agent Orchestrator
- status: **wip**

# b.agent-orchestrator — mission

Шина между Sima и любым coding-агентом (Cursor, Claude Code, Codex CLI, Antigravity). Главная задача — обеспечить, чтобы все агенты работали по **одному и тому же** context-pack, читали `/atlas/blocks/<id>/` перед написанием кода и пушили обратно реальные события (file edits, shell calls, status transitions), а не шаблонные «sync pass»-логи.

Текущая реализация: MCP-сервер (`scripts/mcp_atlas_server.mjs` с 21+ tools), `.cursor/hooks.json`, `AGENTS.md` / `CLAUDE.md` контракты. Главные пропуски — `.cursor/hooks.json` использует выдуманное событие `afterPromptSent` и формат `action.run_command`, который Cursor не интерпретирует; нет наблюдения за реальными file edits и tool calls агентов.

## Layer
ai

## Что должен делать в done-версии
1. Валидные Cursor hooks: `beforeShellExecution`, `afterFileEdit`, `beforeSubmitPrompt` с реальным запуском node-скриптов.
2. `observe_file_edit.mjs`: получает путь файла → ищет в `files.md` блоков → пишет в `checks.log` блока факт правки + `git diff --stat`.
3. `guard_against_drift.mjs`: проверяет shell-команды против `tech_stack.md` (например, блокирует `pip install` если стек React).
4. Adapter для Claude Code: `claude --print --add-dir /atlas/blocks/<id>` запускается из MCP-tool `run_block_implementation`.
5. Multi-agent parity: один и тот же context-pack JSON отдаётся через Cursor (MCP) и Claude (CLI flag).

## Out of scope
- LLM-извлечение смысла из чата (это `b.llm-gateway`).
- UI-операции по блоку (это `b.ui-control`).


## b.docs — Docs Builder
- status: **wip**

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


## b.llm-gateway — LLM Gateway (PR3)
- status: **idea**

# b.llm-gateway — mission

Тонкий слой к LLM-провайдерам (Claude / Gemini / OpenAI) с единым интерфейсом для всех движков Атласа: `extractBlockSchema(text) → BlockSchema`, `validateMissionMatch(mission, code) → DriftReport`, `summarizeChat(messages) → distillate`, `rerank(chunks, query) → ranked`. Без этого блока никакая «авто-генерация смыслов» в Атласе невозможна — сейчас всё делается regex-эвристиками, и поэтому система сейчас не соответствует ТЗ.

Этот блок — **критический gate для PR3**. До его done-версии любой блок с автозаполненными полями должен быть помечен `confidence: 0` и не пропускаться в roadmap/wiki.

## Layer
ai

## Что должен делать в done-версии
1. `scripts/llm_gateway.mjs` экспортирует `callLLM({ provider, model, prompt, schema, max_tokens })` с structured-output (JSON Schema).
2. ENV-конфиг через `.env`: `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY` + `LLM_DEFAULT_PROVIDER`.
3. Mock-режим (без ключей): возвращает фиксированный JSON, чтобы тесты в CI работали без сети.
4. Token budget guard: если запрос > 30k токенов на input — отклонить с понятной ошибкой.
5. Retry с exponential backoff на 429 / 5xx.
6. Trace: каждый вызов пишет в `atlas/llm_traces/<timestamp>.json` (provider, model, in/out tokens, cost-estimate, prompt hash).

## Out of scope
- Embeddings / vector search (в PR3 не нужно, остаётся backup-памятью на будущее).
- Streaming (Атлас работает по запрос-ответ).


## b.smoke-sandbox — Smoke Sandbox (test target)
- status: **idea**

# b.smoke-sandbox — mission

Целевой блок для всех e2e/smoke-тестов Атласа. Реальный код продукта на него не ссылается. MCP smoke-сценарии (`scripts/mcp_smoke_e2e.mjs`, future smoke harnesses) пишут сюда mission/tasks/ingestion-queue, чтобы не повреждать содержание реальных блоков (b.ui-control, b.core-sync, b.db, b.agent-orchestrator, b.docs, b.llm-gateway).

Ожидаемый цикл жизни: блок постоянно в статусе `idea`, его tasks/checks log заполняются и затираются smoke-сценариями, что не считается дрейфом — это часть функции блока.

## Layer
testing

## Что должен делать в done-версии
Блок никогда не должен попадать в `done`. Это контейнер для тестов.

## Out of scope
- Любые продуктовые фичи.



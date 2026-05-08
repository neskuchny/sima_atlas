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

- [ ] T1: Подключить пропавшие JSX в `frontend/Сима - универсальный конструктор.html` (components.jsx, sidecol.jsx, canvas_tools.jsx, composer.jsx, library_view.jsx) — **PR1**
- [ ] T2: Развести блоки по слоям через поле `layer` из `graph.json` v2 — **PR2**
- [ ] T3: В `arch_canvas.jsx` корректно читать `layer` и рисовать каждый блок в соответствующей полосе — **PR2**
- [ ] T4: Live update схемы при изменениях в `/atlas/` (через WebSocket или polling) — **PR2**
- [ ] T5: Подсветка drift/broken блоков с tooltip-причиной из `syncReport.details` — **PR2**
- [ ] T6: Двойной клик по блоку с `subschema_id` открывает подсхему (рекурсия) — **PR2**
- [ ] T7: Кнопка «Implement» вызывает `composer.jsx` со сгенерированным context-pack для агента — **PR3**


## b.core-sync (wip)

# b.core-sync — mission

Sync Engine — движок проверки синхронизации блоков продукта с миссией, KPI, стэком и кодом. Главная задача — детектить «рассинхрон»: код пишется в одном фреймворке, ТЗ говорит про другой; блок A объявляет, что зависит от capability X у блока B, а B такой capability не предоставляет; KPI задан, но в `checks.log` нет ни одной измеренной записи.

Текущая реализация (`frontend/atlas_sync.js` + `scripts/validate_*`) — каркас: проверяет наличие файлов, подсчитывает прогресс tasks/KPI, сравнивает `depends_on/provides`. Этого недостаточно для миссии «решить рассинхрон» — нужно семантическое сопоставление миссии блока с реализацией (требует LLM, PR3) и реальный анализ кода (PR4).

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

## Late-stage (Symphony-inspired) — после PR4.5 / PR-Live стабильны

- [x] T7: **Run-lifecycle FSM** done — `scripts/run_state.mjs` (`startRun / transitionRunState / getRun / listRuns / cancelRun / detectStalledRuns`) с состояниями `PreparingWorkspace → LaunchingAgent → Running → Verifying → Finishing → Succeeded | Failed | Stalled | TimedOut | Canceled`. ALLOWED_TRANSITIONS строго проверяет переходы, terminal states запрещают любые исходящие переходы. Stalled-detection: `last_event_at` > `max_idle_ms` (default 10 min, env `ATLAS_RUN_MAX_IDLE_MS`). State files: `atlas/run_state/<run_id>.json` с history-array. tests/run_state.selftest.mjs 8 групп (start, happy path, invalid transition, terminal lock, cancel + noop, listRuns active filter, detectStalled + fresh untouched, unknown state). Bootstrap exposes `runsByBlock` (last 7 days). ArchInspector RunStatusSection рендерит цветной badge + agent + timing + verifier verdict + Cancel кнопка. MCP tools list_runs/get_run/cancel_run/detect_stalled_runs. atlas_api endpoint /runs/cancel. Wired into nightly + run_block_implementation.mjs. — **PR-7 DONE**
- [x] T8: **Per-block sandboxed workspace** done — `scripts/agent_workspace.mjs` (`createWorkspace / captureDiff / writeDiffProposal / cleanupWorkspace / listWorkspaces`). Workspaces под `~/.atlas_workspaces/<run_id>/` (override `ATLAS_WORKSPACES_ROOT`). SKIP_DIRS пропускает `node_modules / atlas/llm_traces / process_runs / run_state / acceptance_runs / history / eval_history / dist / .git`. Diff capture через unix `diff -urN` + sha256 hash compare; truncate text >4KB. cleanupWorkspace safety: refuses paths outside WORKSPACES_ROOT AND requires `.atlas_workspace.json` marker. tests/agent_workspace.selftest.mjs 7 групп (create + marker; SKIP_DIRS not copied; zero-change; added/modified/removed detection; writeDiffProposal kind=agent_run_diff with changed_files + diff_preview; cleanup safety + happy path; listWorkspaces). MCP tools list_workspaces + cleanup_workspace. — **PR-8 DONE**
- [x] T9: **Workspace + verifier integration** done — `scripts/run_block_implementation.mjs` теперь: startRun → if `ATLAS_USE_WORKSPACE=1` createWorkspace → fsm('LaunchingAgent') → spawn agent с `cwd=workspace.workspace_path` → fsm('Running') → on exit: fsm('Finishing') → captureDiff (workspace mode) → writeDiffProposal kind=agent_run_diff → fsm('Verifying') → spawn verify_block_acceptance с `ATLAS_ROOT=<workspace>/atlas` → fsm('Succeeded'|'Failed') based on verdict → cleanup workspace ONLY if verdict !== fail AND no pending diff_proposal_id (preserve for inspection / Accept). ProposalsPanel renders kind=agent_run_diff blue card with changed_files list (+/− kind-coded), workspace_path, diff_truncated marker, Accept (apply diff) / Reject buttons. — **PR-9 DONE**


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


## b.operator-profile-learner (idea)

# b.operator-profile-learner — mission

Адаптивный модуль, который наблюдает за тем, **как именно** работает конкретный пользователь Атласа, запоминает его рабочие паттерны / стек / запреты / уроки из неудач, и адаптирует под них:

- что подмешивает в context-pack для агента (`inject_context_pack.mjs`)
- что предлагает при создании нового блока / нового проекта
- что блокирует через `guard_against_drift.mjs` (запрещённые фреймворки)
- что подсвечивает в sync-check как «warning: ты обычно делаешь иначе»
- какие шаблоны (backend / frontend / testing-stack) предлагает по умолчанию

Без этого блока Атлас одинаковый для всех — а должен быть **личным**.

## Layer
ai

## North Star
> При создании нового блока пользователь видит «персональный совет» (стек / агент / шаги работы), основанный на его собственной истории, а не на дефолтных шаблонах. И когда он отклоняется от своих успешных паттернов — Атлас об этом тихо говорит, не диктует.

---

## Что наблюдается (источники данных)

Все источники уже существуют в репо благодаря PR1–PR-Live; этот блок — read-only потребитель + агрегатор:

| Источник | Что вытягивается |
|---|---|
| `atlas/blocks/<id>/checks.log` | время на блок до `done`, частота `broken`, кто двигал статус |
| `atlas/transitions.log` | rollback rate (как часто `done → broken → wip` происходит у конкретных блоков) |
| `atlas/proposals/*.json` | accept-rate / reject-rate / topic-распределение LLM-предложений |
| `atlas/agent_invocations/*.txt` | какому агенту и сколько раз шёл prompt; success-summary в checks.log |
| `atlas/llm_traces/*.json` | какой провайдер, model, fallback_to_mock частота |
| `atlas/process_runs/cursor_observations/*.json` | какие файлы редактируются часто; типичный диаметр коммита |
| `atlas/blocks/<id>/decisions.log` | архитектурные решения и причины |
| `atlas/blocks/<id>/patterns.md` | формализованный «что работало / что не работало» |
| `atlas/projects/<proj>/tech_stack.md` | какой стек выбрал каждый раз |
| `atlas/transitions.log + checks.log` cross-ref | время между «принят план» и «появился первый код» |

## Что сохраняется (output, файлы)

```
atlas/operator_profile/
  profile.json                ← главная карточка пользователя
  patterns/
    work_style.json           ← spec_size_preference, test_each_step, ...
    agents.json               ← claude/openai/gemini статистика
    tech_stack.json           ← frequency × satisfaction по фреймворкам
    environment.json          ← os/node/python/shell
    failures.json             ← повторяющиеся проблемы
  templates/
    backend-mvp.json          ← готовый шаблон для нового MVP-бэка
    backend-prod.json
    frontend-spa.json
    testing-stack.json
  dont_use.json               ← жёсткий список запретов («никогда не предлагай vue»)
  lessons.json                ← уроки из неудач, могут устаревать
  history/<UTC>.json          ← snapshot каждой пере-агрегации (как eval_history)
```

`profile.json` — пример shape:

```json
{
  "operator_id": "default",
  "updated_at": "2026-05-02T...",
  "work_style": {
    "spec_size_preference": "big_first",
    "test_each_step": false,
    "common_failure_modes": ["шаг недотестирован", "framework not scaling"],
    "median_time_idea_to_done_h": 6.5
  },
  "agents_used": {
    "claude": { "count": 142, "success_rate": 0.78, "best_for": ["architecture", "schema"] },
    "openai": { "count":  23, "success_rate": 0.81, "best_for": ["debug", "specific_implementation"] },
    "gemini": { "count":  51, "success_rate": 0.62, "best_for": ["batch_extraction"] }
  },
  "tech_stack_history": {
    "frontend": [{ "name": "react",   "uses": 12, "satisfaction": "high" }],
    "backend":  [{ "name": "fastify", "uses":  4, "satisfaction": "medium" }]
  },
  "dont_use":   ["mongo", "vue", "django"],
  "always_use": [{ "category": "language", "value": "typescript" }],
  "environment": { "os": "windows", "node": "22.x", "shell": "powershell" },
  "scale_preference": "MVP_then_grow",
  "lessons_learned": [
    { "id": "L-001",
      "lesson": "Большое ТЗ + delegate-without-checks → 2 раза получили нерабочий код. Перепроверять каждые 30 мин.",
      "evidence": ["b.payments@2026-04-12", "b.search@2026-04-19"],
      "expires_at": null }
  ]
}
```

---

## Когда работает (триггеры)

| Тип | Когда | Что делает |
|---|---|---|
| **Real-time point-update** | После каждого `accept_proposal` / `reject_proposal` / `agent_invocation` / `transition_block` (done/broken) | мутирует один counter в нужной патч-секции profile.json (10–50ms работа, без LLM) |
| **Nightly aggregation** | В составе `nightly_consolidation.mjs` | пере-агрегирует все источники с нуля, пишет `history/<UTC>.json`, обновляет `profile.json` |
| **On-demand LLM analysis** | По MCP-tool `recompute_operator_profile {analyze_failures: true}` или по кнопке в UI | через `b.llm-gateway` достаёт уроки из `decisions.log + checks.log fail` записей, кладёт в `lessons.json` |
| **Project-start hint** | Когда в `analyze_conversation_to_atlas` появляется новый блок без `tech_stack` | подбирает шаблон из `templates/` и пишет в proposal `suggested_template: backend-mvp` |

**Минимум данных для запуска**: ≥ 5 transitions `done` ИЛИ ≥ 10 `agent_invocations` за всю историю. Иначе модуль просто молчит — никаких advice.

---

## Где применяется (потребители)

| Потребитель | Как использует profile |
|---|---|
| `inject_context_pack.mjs` | Добавляет секцию `## Operator profile (likely preferences)`: «Этот оператор предпочитает ... никогда не использует ... в прошлом был bad case с ...». Агент видит эти подсказки прямо в промпте. |
| `analyze_conversation_to_atlas.mjs` | При создании нового блока в `proposed.tech_stack` подставляет `templates/<scope>.json` если LLM ничего конкретного не предложил. |
| `guard_against_drift.mjs` | Дополняет `forbidden_substrings` из `tech_stack.md` файлами из `dont_use.json` оператора (личные запреты). |
| `validate_*` валидаторы | Раз в nightly выкидывают `warning` если в активном блоке используется фреймворк, помеченный `dont_use`. Не fail, только warn. |
| UI (PR3.5 ProposalsPanel + Inspector) | На карточке предложения показывает badge `соответствует/противоречит профилю` рядом с Accept/Reject. |
| UI (Layer 2 Inspector) | Под mission блока — секция `Подсказки от профиля`: «попробуй заменить fastify на express — у тебя 12 успешных запусков на нём». |
| `run_block_implementation.mjs` | Если у пользователя есть строка `agents_used.claude.best_for: ["architecture"]` и блок касается архитектуры — выбирает claude по умолчанию. |
| MCP-tools | `read_operator_profile`, `recompute_operator_profile`, `set_dont_use`, `set_always_use`, `add_lesson` |

---

## UX-принципы

1. **Тихо, не громко.** Профиль — это **подсказки** в context-pack агента и тёплые badge'и в UI. Не модальные окна, не блокировки (кроме явных `dont_use`).
2. **Ревёрсивно.** Любая запись в profile может быть откатана через UI «забыть этот паттерн» / `revoke_lesson`.
3. **Прозрачно.** Каждое поле в `profile.json` имеет `evidence: [block_id]` — пользователь видит **на основе чего** Атлас сделал вывод.
4. **Не auto-применяется к коду.** Профиль — это *совет*, не *патч*. Чтобы изменить блок, нужен явный Accept (через PR3.5 proposals flow).
5. **Privacy by default.** `atlas/operator_profile/` локально, `.gitignore` опционально для multi-user сценариев. PII не собирается.

---

## Out of scope

- Cross-user / team-wide profile — это позже (`b.team-profile-learner` как наследник).
- Реальные ML-модели на профиле — только counters и rule-based аналитика. Если нужно умнее — через `b.llm-gateway` по запросу, не как hot path.
- Авто-fine-tuning LLM на пользователе — нет, мы остаёмся на context-pack уровне.

---

## Интеграция с уже существующими блоками

- **depends_on**: `b.db` (read), `b.core-sync` (read checks.log), `b.agent-orchestrator` (read invocations + write context-pack hints), `b.llm-gateway` (для on-demand failure analysis), `b.docs` (для рендеринга в wiki «карточка пользователя»).
- **provides**: `operator_profile` (для inject_context_pack), `personal_templates` (для analyze_conversation_to_atlas), `personal_dont_use` (для guard_against_drift).

---

## Backlog priority

- **Position**: один из последних milestone-ов. Текущая Sima Atlas (PR1–PR-Live) — это «инфраструктура для одного пользователя без личной памяти». PR-OperatorProfile — это «персонализация поверх инфраструктуры». Делается **после** того, как хоть один пользователь реально пройдёт 10+ блоков done и накопит данных, иначе наблюдать нечего.

- **Estimate**: 4–6 PR-ов по образцу PR3 (LLM gateway) и PR3.5 (proposals flow):
  1. `data collector` — пакет агрегаторов из источников в profile.json (без LLM)
  2. `templates set` — backend/frontend/testing JSON-шаблоны + UI выбор
  3. `dont-use list` — UI и guard-интеграция
  4. `lessons LLM analyser` — periodic LLM-обзор decisions.log + checks.log
  5. `inject_context_pack hook` — добавление секции «Operator profile»
  6. `UI hints` — badge'и в Inspector / ProposalsPanel


# b.operator-profile-learner — tasks

Разбит на 6 PR-ов по образцу PR3 (LLM gateway) и PR3.5 (proposals flow). Каждый PR — независимо мержабельный.

## PR-1 — Data collector (без LLM)
- [x] T1.1: создать `scripts/aggregate_operator_profile.mjs` — single entry point read-only. **DONE PR-1**.
- [x] T1.2: readers: `readChecksLogs`, `readTransitions`, `readProposals`, `readLlmTraces`, `readDecisionsLogs`, `readPatternsCounts`, `readTechStacks`. (`readCursorObservations` отложен до PR-1.5 — у нас нет реальных данных в `atlas/process_runs/cursor_observations/` сегодня.) **DONE PR-1**.
- [x] T1.3: aggregator: `work_style.median_time_idea_to_done_h` через linear scan + median; `agents_used.<x>.{count, success_rate, blocks_touched}`; `tech_stack_history.<scope>` с satisfaction inferred из rollback_rate per block (high < 0.1, medium < 0.3, low ≥ 0.3); `proposals_stats.{accept_rate, reject_rate}`; `llm_provider_stats.<provider>.{fallback_rate, schema_ok_rate, avg_cost_usd}`. **DONE PR-1**.
- [x] T1.4: writer: пишет `atlas/operator_profile/profile.json` + `patterns/{work_style,agents,tech_stack,environment,failures}.json` + snapshot в `history/<UTC>.json`. **DONE PR-1**.
- [x] T1.5: min-data guard: env `OPERATOR_PROFILE_MIN_DONE` (default 5) И `OPERATOR_PROFILE_MIN_INVOCATIONS` (default 10). При < threshold → `_status: "warming_up"`, агрегаты не пишутся в верхний уровень profile, patterns/*.json получают `{_status: "warming_up"}`, а `_preview` всегда содержит счётчики для UI ("3/5 done, 8/10 invocations"). **DONE PR-1**.
- [x] T1.6: selftest `tests/operator_profile.selftest.mjs` — 7 групп (empty / below threshold / at threshold / work_style median+rollback / agents_used / tech_stack satisfaction / proposals accept-rate). **DONE PR-1**.
- [x] T1.7: интеграция в `nightly_consolidation.mjs` как `operator_profile_selftest` + `aggregate_operator_profile` steps. **DONE PR-1**.
- [x] T1.8: MCP tools `read_operator_profile` + `recompute_operator_profile`. **DONE PR-1**.

PR-1 закрыт. PR-2 (templates set + pickTemplate) уже закрыт ранее. Live переключение `warming_up → live` сработает когда оператор пройдёт 5 done транзишнов или 10 agent_invocations.

## PR-2 — Templates set
- [x] T2.1: написать 4 JSON-шаблона `atlas/operator_profile/templates/{backend-mvp,backend-prod,frontend-spa,testing-stack}.json` с дефолтным стеком. **DONE in PR-Backlog**: starter templates + applicability + must_have_acceptance + anti-patterns + scaffold + estimated_hours.
- [x] T2.2: `pickTemplate(scope, profile)` — `scripts/pick_template.mjs` с экспортами `pickTemplate / scopeFromLayer / flattenTechStack`. Поддерживает adjustments по `tech_stack_history` (winner: uses ≥ 3 + satisfaction === 'high') и по `dont_use`. CLI: `node scripts/pick_template.mjs <backend|frontend|testing> [--json]`. Selftest 8 групп зелёный. **DONE PR-2**.
- [x] T2.3: интеграция в `analyze_conversation_to_atlas.mjs` — для каждого extracted блока без `tech_stack` подмешивает шаблон по `scopeFromLayer(block.layer)`, заполняет `tech_stack` flat-listом и пишет `suggested_template_id` + `suggested_template_scope` + `suggested_template_profile_state` + `suggested_template_adjustments` в proposal JSON. Подтверждено: `simulate_conversation_branches.mjs` на mock LLM привязал backend-mvp к b.core-sync proposal. **DONE PR-2**.
- [x] T2.4: ProposalsPanel — badge `template: backend-mvp` рядом с провайдером/confidence; tooltip показывает profile_state (warming_up / live). **DONE PR-2**.

PR-2 закрыт. Остаются PR-3..PR-6.

## PR-3 — Dont-use list (hard constraints)
- [x] T3.1: `scripts/manage_dont_use.mjs` экспортирует `setDontUse / clearDontUse / listDontUse / setAlwaysUse / clearAlwaysUse / listAlwaysUse / effectiveDontUseValues`. CLI `add / clear / list / always {add,clear,list} / effective`. MCP tools `set_dont_use / clear_dont_use / list_dont_use / set_always_use / clear_always_use / list_always_use`. **DONE PR-3**.
- [x] T3.2: `scripts/guard_against_drift.mjs` читает `atlas/operator_profile/dont_use.json` + `profile.dont_use` и сливает с `forbidden_substrings` из tech_stack.md. На блокировку показывает источник (operator_profile/dont_use.json vs tech_stack.md) и команду `manage_dont_use.mjs clear <value>` для снятия личного запрета. **DONE PR-3**.
- [x] T3.3: `scripts/validate_dont_use_compliance.mjs` — nightly info-only step (exit 0 always). Для каждого блока с `tech_stack ∋ banned` пишет proposal `<UTC>__<block>__dont_use_warning.json` с `hits` + `retry_prompt_hint`. Dedup: skip если pending proposal с тем же набором hits уже есть. **DONE PR-3**.
- [x] T3.4: UI — `ProfileHintsSection` в `frontend/arch_canvas.jsx` (PR-6) уже рендерит секцию запретов с кнопками «🔓 Снять запрет» / «🗑 Забыть урок» / «🗑 Забыть паттерн». В `scripts/atlas_api_server.mjs` добавлены endpoints `/profile/forget`, `/lessons/revoke`, `/dont-use/add` — UI кнопки реально мутируют состояние через MCP-обёрточные вызовы. **DONE PR-3**.

PR-3 закрыт. tests/dont_use_management.selftest.mjs 7 групп зелёный (set/update/clear/missing; alwaysUse round-trip; effectiveDontUseValues sources merge; guard блокирует с цитатой источника + hint; validator пишет dont_use_warning proposal).

## PR-4 — Lessons LLM analyser
- [x] T4.1: `scripts/analyze_lessons_from_history.mjs` — `analyzeLessons({window_days, dry_run})` через `b.llm-gateway.callLLM` со схемой `{lessons: [{lesson, evidence[], expires_at}]}`. **DONE PR-4**.
- [x] T4.2: prompt включает последние N дней failed checks + decisions, требует ≥ 2 evidence per lesson, явно запрещает «выглядит ок», JSON-only output. **DONE PR-4**.
- [x] T4.3: cost cap `LLM_MAX_USD_PER_RUN` (default $0.05) → если превышен возвращает `{cost_capped: true}`; min-data guard (< 2 fail+decision items → warming_up без LLM-вызова); post-LLM фильтр `< 2 evidence` (LLM может срезать правило); dedupe по тексту + 50% evidence overlap. Mock-friendly через `tests/llm_mocks/<hash>.json`. **DONE PR-4**.
- [x] T4.4: nightly step `analyze_lessons_from_history` запускается раз в сутки, append в `atlas/operator_profile/lessons.json` (без перезаписи). **DONE PR-4**.
- [x] T4.5: MCP tools `add_lesson` (требует ≥ 2 evidence) + `revoke_lesson` + `list_lessons` + `analyze_lessons` (trigger). **DONE PR-4**.
- [x] T4.6: smoke `tests/operator_profile_lessons.smoke.mjs` — 6 групп: warming_up no-data; seeded fixture → 2 lessons (1 filtered <2 evidence); dedupe не двоит; addLesson L-001/L-002; revokeLesson by id + missing→false; <2 evidence фильтр. **DONE PR-4**.

## PR-5 — inject_context_pack hook
- [x] T5.1: `scripts/inject_context_pack.mjs` читает `atlas/operator_profile/profile.json` через `fs.readFileSync` (внутри try/catch для graceful degradation). При `_status === "warming_up"` секция не emit'ится. **DONE PR-5**.
- [x] T5.2: рендерит секцию `## Operator profile (likely preferences)` с `work_style.median_time_idea_to_done_h` + `rollback_rate` + top tech_stack по scope (high satisfaction + uses≥2) + top agent + dont_use list (из profile.dont_use + atlas/operator_profile/dont_use.json) + last 3 unexpired lessons с evidence. **DONE PR-5**.
- [x] T5.3: `tests/operator_profile_inject.smoke.mjs` — 4 группы: warming_up без секции; live profile с tech-preferences («оператор предпочитает react / fastify»); lessons surfaced («Большое ТЗ → сбой 2 раза» + evidence cited); --no-profile flag + SIMA_NO_PROFILE=1 silences. **DONE PR-5**.
- [x] T5.4: `--no-profile` flag + `SIMA_NO_PROFILE=1` env override отключают секцию (для воспроизводимости evals). **DONE PR-5**.

## PR-6 — UI hints
- [x] T6.1: `frontend/proposals_panel.jsx` — `complianceWithProfile(proposal)` смотрит `proposed.tech_stack` против `profile.tech_stack_history` (high satisfaction + uses≥2) и `dont_use`. Returns `{kind: match|conflict|neutral, items, reason}` или `null` при warming_up. **DONE PR-6**.
- [x] T6.2: Badge palette: ✓ зелёный (match) / ⛔ красный (conflict) / · серый (neutral); tooltip с reason + items. **DONE PR-6**.
- [x] T6.3: `frontend/arch_canvas.jsx` — компонент `<ProfileHintsSection>` рендерит до 6 хинтов (median time / rollback warn / per-scope tech preferences / dont_use bans / lessons). Click → expand с evidence (block_ids из истории). **DONE PR-6**.
- [x] T6.4: Под expanded хинтом — кнопки «🔓 Снять запрет» (kind=block) / «🗑 Забыть урок» (kind=lesson) / «🗑 Забыть паттерн» (kind=info с tech-history) → POST на MCP-обёрточные endpoints `/lessons/revoke` + `/profile/forget` (TODO в atlas_api_server: backed by revoke_lesson MCP). **DONE PR-6 (UI часть)**; endpoint stubs ждут PR-Hardening.
- [x] T6.5: При `_status === "warming_up"` секция показывает `Профиль ещё учится: N/M done, K/L invocations` из `profile._preview` + `_min_data`. **DONE PR-6**.

PR-3 (dont-use list) формально не закрыт — но `inject_context_pack` уже умеет читать `atlas/operator_profile/dont_use.json` если файл есть, UI badge тоже читает. PR-3 остаётся как «MCP tools `set_dont_use` / `set_always_use` + guard_against_drift integration» — это узкая работа на ~30 строк, сделается по запросу.


## b.acceptance-verifier-loop (idea)

# b.acceptance-verifier-loop — mission

«Закрывающий контур» для каждого агент-прогона. Сейчас `run_block_implementation.mjs` отдаёт результат и забывает: `done` ставится «на честном слове» оператора. Этот блок добавляет **обязательную пост-проверку**: после того как агент сказал «готово», LLM-judge (через `b.llm-gateway`) сверяет результат **построчно против `acceptance.md`** блока. Каждый пункт получает `pass / fail / skipped + evidence + reasoning`. Если хоть один `fail` — блок **не может перейти в `done`** через `transition_block`, а получает proposal `acceptance_blocked` с конкретным описанием, что не сошлось.

Без этого блока «верификация» = ручной пересмотр чек-листа человеком. С ним — Атлас сам говорит «ты сказал готово, но A2 (selftest) не прошёл, потому что файла X нет, и A4 (trace write) не прошёл, потому что в `atlas/llm_traces/` нет новых записей за последние 5 минут».

## Layer
testing

## North Star
> После любого `run_block_implementation` блок не может перейти в `done`, пока ВСЕ пункты `acceptance.md` не получили `pass` с зафиксированным evidence. И каждый `fail` сопровождается конкретной обратной связью, которая сразу подходит как prompt для retry-прогона того же агента.

---

## Что наблюдается (источники данных)

| Источник | Что вытягивается |
|---|---|
| `atlas/blocks/<id>/acceptance.md` | список assertion-пунктов A1..AN с описанием и (опц.) машинно-читаемым evidence-spec |
| `run_block_implementation` stdout/exit code | факт «агент закончил» + последние модифицированные файлы |
| `git diff` за окно прогона | какие файлы реально изменились (для evidence-кросс-чека) |
| `atlas/blocks/<id>/checks.log` (новые записи) | `acceptance pass A1` / `acceptance fail A2 ...` |
| `atlas/llm_traces/*` (новые) | были ли LLM-вызовы в окне прогона (для KPI: «А3 требует live API») |
| Output of `tests/<block>.selftest.mjs` (если упомянут в acceptance) | exit code + stderr |
| `atlas/proposals/*` | acceptance_blocked proposal становится Accept-able блокером |

## Что сохраняется (output, файлы)

```
atlas/acceptance_runs/
  <block_id>/<UTC>__<run_id>.json   ← полный отчёт прогона (per-item pass/fail/evidence/reasoning)
  <block_id>/_latest.json            ← последний отчёт (для UI)
atlas/proposals/<UTC>__<block_id>__acceptance_blocked.json  ← если есть fail
atlas/blocks/<block_id>/checks.log   ← append: 'acceptance_verifier <pass|fail> <Aitem> note'
```

`acceptance_runs/<id>/<UTC>__.json` shape:

```json
{
  "block_id": "b.llm-gateway",
  "run_id": "2026-05-03T10:30:00Z__claude",
  "agent": "claude",
  "started_at": "...",
  "finished_at": "...",
  "items": [
    { "id": "A1",
      "assertion": "Selftest tests/llm_gateway.selftest.mjs проходит (4 case)",
      "verdict": "pass",
      "evidence_kind": "exit_code",
      "evidence": "node tests/llm_gateway.selftest.mjs → exit 0; output: 'OK (4 cases)'",
      "reasoning": "Все 4 case прошли; selftest зелёный.",
      "checked_at": "..."
    },
    { "id": "A4",
      "assertion": "Каждый вызов пишет trace в atlas/llm_traces/",
      "verdict": "fail",
      "evidence_kind": "fs_glob",
      "evidence": "ls atlas/llm_traces/*.json --since=5m → 0 new files",
      "reasoning": "Selftest test 3 проверяет trace, но в окне прогона новых traces нет → trace-writer не сработал.",
      "checked_at": "..."
    }
  ],
  "verdict": "fail",
  "blocked_transition": "wip → done",
  "retry_prompt_hint": "А4 не прошёл: trace-writer не пишет в atlas/llm_traces. Проверь функцию writeTrace() в scripts/llm_gateway.mjs — вероятно, fs.writeFileSync вызывается в try-catch с подавлением ошибки."
}
```

---

## Когда работает (триггеры)

| Тип | Когда | Что делает |
|---|---|---|
| **Auto после run_block_implementation** | exit code 0 от агента | сразу запускает `verify_block_acceptance.mjs <block_id>`; пишет `_latest.json` |
| **Pre-transition gate** | `transition_block <id> done` через CLI/MCP/UI | читает `_latest.json`; если `verdict !== "pass"` — блокирует переход с понятной ошибкой |
| **On-demand re-verify** | MCP tool `verify_block_acceptance {block_id}` | прогоняет проверку даже без агент-прогона (для ручной проверки уже-в-done блоков) |
| **Nightly re-verify of done** | в `nightly_consolidation.mjs` | проверяет, что блоки в `done` всё ещё проходят acceptance; если нет — авто-rollback `done → broken` + proposal |
| **Retry-loop hook (опц.)** | при verdict=fail и `auto_retry: true` в env | подмешивает `retry_prompt_hint` в новый run_block_implementation, max 2 retry |

**Что нельзя**: не проверять блоки без `acceptance.md` (это контрактная ошибка валидатора, не verifier'а). Не подменять структурные валидаторы (`validate_block_contracts` и т. д.) — verifier работает поверх них.

---

## Где применяется (потребители)

| Потребитель | Как использует |
|---|---|
| `scripts/run_block_implementation.mjs` | После exit code 0 — спавнит verifier; кладёт `_latest.json` рядом с trace |
| `scripts/log_transition.mjs` | Перед `wip → done` читает `_latest.json`; verdict !== pass → reject с описанием |
| `scripts/nightly_consolidation.mjs` | Step `verify_done_blocks_still_green` |
| UI Inspector | Под mission блока — секция «Acceptance verifier»: список A1..AN с зелёным/красным badge + reasoning по клику |
| ProposalsPanel | `acceptance_blocked` proposal с retry-кнопкой, которая дёргает `/run-block` с `retry_prompt_hint` |
| MCP tools | `verify_block_acceptance`, `read_acceptance_run`, `list_failed_acceptances` |

---

## UX-принципы

1. **Жёсткий gate, мягкий совет.** Verdict=fail **физически блокирует** `→ done` (это hard gate; KPI продукта). Но retry — добровольный (proposal в UI, не auto-апдейт кода без accept).
2. **Каждый fail подходит как prompt.** `retry_prompt_hint` пишется так, чтобы его можно было сразу скормить тому же агенту: конкретный файл, конкретная строка, что должно произойти.
3. **Прозрачность evidence.** Поле `evidence_kind` ∈ `{exit_code, fs_glob, file_diff, log_grep, llm_judge, manual}` — UI показывает разные иконки. `llm_judge` всегда сопровождается `reasoning` (нельзя «потому что я так считаю»).
4. **Не подменяет тесты.** Если пункт acceptance говорит «selftest зелёный» — verifier именно запускает selftest и читает exit code, а не «спрашивает Claude, кажется ли что selftest прошёл бы».
5. **Кэшируемо.** Если в окне после последнего verifier-прогона нет новых коммитов / нет новых traces / нет новых checks.log записей — verifier возвращает закэшированный результат за < 50ms.

---

## Out of scope

- Авто-fix кода блока — verifier только сообщает, не правит. Правка идёт через proposals + agent run.
- Acceptance-генератор (LLM пишет acceptance.md за пользователя) — это отдельный плагин на `b.docs` или `b.llm-gateway`.
- Cross-block acceptance («все блоки в layer:ai green») — это уровнем выше; пусть будет `intelligence_health` или новый `b.suite-verifier`.

---

## Интеграция с уже существующими блоками

- **depends_on**: `b.db` (read graph + acceptance.md), `b.core-sync` (write checks.log), `b.agent-orchestrator` (hook после run_block_implementation), `b.llm-gateway` (LLM-judge для assertion-пунктов, которые без exit-code/fs evidence).
- **provides**: `acceptance_run_report`, `acceptance_gate_decision`, `retry_prompt_hint`.

---

## Backlog priority

- **Position**: после `b.operator-profile-learner` (тот учится на готовых данных, этот — генерирует данные о done/blocked). По важности — **выше** profile-learner'а: это фактически **закрывающий контур качества**, без которого `done` остаётся empty signal.
- **Estimate**: 4–5 PR-ов:
  1. `assertion parser` — структурированный парсинг `acceptance.md` (A1..AN + опц. evidence-spec в YAML-блоке)
  2. `evidence collectors` — exit_code / fs_glob / file_diff / log_grep раннеры (без LLM)
  3. `LLM-judge fallback` — для пунктов без явного evidence-spec, через `b.llm-gateway`
  4. `gate hooks` — интеграция в `log_transition` + `run_block_implementation` + nightly
  5. `UI surface` — Inspector секция + ProposalsPanel acceptance_blocked + retry-кнопка


# b.acceptance-verifier-loop — tasks

5 PR-ов. PR-1..PR-3 — pure-deterministic (без LLM); PR-3 добавляет LLM fallback; PR-4..PR-5 — интеграция.

## PR-1 — Assertion parser
- [x] T1.1: `scripts/parse_acceptance.mjs` — строгий парсер `acceptance.md`. **DONE PR-1**.
- [x] T1.2: формат: `- [ ] **A1.** <text>` или `- [x] **A1 (label).** <text>`; опц. fenced YAML-блок сразу после bullet (перед следующим bullet или section header) с `evidence_kind` + `evidence_spec`. **DONE PR-1**.
- [x] T1.3: extract `id` (A1..AN), `label`, `text`, `checked`, `line`, `evidence_kind` (default = `llm_judge`), `evidence_spec`. Поддерживаемые kinds: `exit_code, fs_glob, file_diff, log_grep, selftest_run, llm_judge`. Section header останавливает parsing после первого bullet (защита от попадания текста из NOT-acceptance секций). **DONE PR-1**.
- [x] T1.4: selftest на 7 реальных блоках репо (b.llm-gateway / b.agent-orchestrator / b.docs / b.core-sync / b.db / b.ui-control / b.operator-profile-learner) — 39 assertions parsed без warnings. Плюс синтетические тесты на варианты bullet'ов / YAML / duplicate id / gap / invalid kind / malformed YAML / empty file. 9 групп всего. **DONE PR-1**.
- [x] T1.5: MCP tool `parse_acceptance {block_id}` возвращает структурированный JSON. CLI `node scripts/parse_acceptance.mjs <id> [--json]`. **DONE PR-1**.

PR-1 закрыт. Следующее — PR-2 (deterministic evidence collectors).

## PR-2 — Deterministic evidence collectors
- [x] T2.1: `scripts/collect_evidence.mjs` — единый диспетчер `collectEvidence({evidence_kind, evidence_spec, cwd, timeout_ms})` + `verifyBlock(blockId)` (parser + collectors → aggregate {pass, fail, skipped, verdict}). Result shape: `{verdict, evidence_kind, evidence, reasoning, raw, duration_ms}`. **DONE PR-2**.
- [x] T2.2: `exit_code` collector — `spawnSync(cmd, {shell:true})`, exit + stdout/stderr capture (truncate at 4KB), опц. `expect_in_stdout` regex, timeout default 30s. **DONE PR-2**.
- [x] T2.3: `fs_glob` collector — использует `fs.globSync` (Node 22+) с fallback на `readdirSync` для простых паттернов; `min_count` (default 1) + `max_age_min` (опц.) — все файлы должны быть свежее. Возвращает count, newest_minutes_ago, sample_paths. **DONE PR-2**.
- [x] T2.4: `file_diff` collector — `git diff --name-only <since_ref>` (default HEAD~1); проверяет `must_touch: [...]` и `must_not_touch: [...]`. Если не git-репо — graceful `verdict: skipped`. **DONE PR-2**.
- [x] T2.5: `log_grep` collector — regex match по строкам файла; опц. `since_time` (ISO) фильтрует по timestamp в начале строки. **DONE PR-2**.
- [x] T2.6: `selftest_run` collector — alias для `exit_code` с явным namespace; в acceptance.md можно отличить «просто запусти команду» от «прогони тестсуит». **DONE PR-2**.
- [x] T2.7: selftest `tests/evidence_collectors.selftest.mjs` — 11 групп: positive+negative для каждого kind + max_age_min fresh/stale + log_grep since_time + missing file + git missing → skipped + llm_judge defer + unknown kind + verifyBlock e2e на синтетическом блоке (4 assertions: exit_code pass / fs_glob pass / llm_judge skipped / exit_code fail → counts {2,1,1}, verdict=fail). **DONE PR-2**.

PR-2 закрыт. MCP tools `collect_evidence` + `verify_block_acceptance` живые. Следующий — PR-3 (LLM-judge для llm_judge kind).

## PR-3 — LLM-judge fallback
- [x] T3.1: `scripts/judge_assertion.mjs` — через `b.llm-gateway.callLLM` со схемой `{verdict: inconclusive|pass|fail, reasoning, evidence_quote}`. Enum-порядок умышленно ставит `inconclusive` первым: deterministic-empty фолбэк (mock без fixture, без API ключа) → safe `inconclusive`, никогда не silent `pass`. **DONE PR-3**.
- [x] T3.2: prompt включает: BLOCK id + ASSERTION id (label) + mission.md excerpt (≤ 800 chars) + recent checks.log (last 50 lines) + (опц.) recent diff filenames. Жёсткие правила: «pass требует concrete evidence, fail требует concrete отрицательное evidence, иначе inconclusive — не угадывать. evidence_quote ≤ 200 chars verbatim». **DONE PR-3**.
- [x] T3.3: cost cap `LLM_MAX_USD_PER_RUN` (default $0.02); если trace.cost_usd > cap → возвращает `{verdict: inconclusive, cost_capped: true, reasoning: 'cost cap exceeded'}`. Mock-режим через `tests/llm_mocks/<hash>.json` — фикстуры записываются по `mockHashForPrompt(prompt)` (тот же механизм, что в llm_extraction.eval). **DONE PR-3**.
- [x] T3.4: smoke `tests/llm_judge.smoke.mjs` — 4 group: (1) no fixture → inconclusive с reasoning о mock-unavailable; (2) seeded fixture verdict=pass → pass + reasoning + evidence_quote; (3) seeded fixture verdict=fail → fail + reasoning; (4) cost_capped:false на mock (cost=0). **DONE PR-3**.

PR-3 закрыт. Wired into `collect_evidence.mjs` → llm_judge case теперь зовёт реальный judge (через verifyBlock контекст). MCP tool `judge_assertion` живой. После добавления API ключа все 47 skipped assertions из verify_all_summary.json автоматически получат реальные verdicts без правок acceptance.md.

## PR-4 — Gate hooks
- [x] T4.1: `scripts/verify_block_acceptance.mjs <block_id>` — оркестратор parse → collect → judge → write `acceptance_runs/<block>/<UTC>.json` + `_latest.json` + append одиночной строки `acceptance_verifier <pass|fail> <counts>` в `checks.log`. Exit code = verdict (0 pass / 1 fail / 2 inconclusive). Поддерживает `ATLAS_ROOT` env для тестов в tmpdir. **DONE PR-4**.
- [x] T4.2: `scripts/log_transition.mjs` gate — перед `→ done` (если from !== done) читает `_latest.json`. Если файла нет ИЛИ verdict !== pass → REJECTED с подробной ошибкой (sample failures + fix command + bypass hint). Override: `--allow-no-verifier` или `ATLAS_ALLOW_NO_VERIFIER=1` (override логируется в transitions.log как `gate=overridden(...)`). Successful pass пишется как `gate=pass(N/M)`. **DONE PR-4**.
- [x] T4.3: `scripts/run_block_implementation.mjs` — после агент-прогона exit 0 авто-спавнит `verify_block_acceptance.mjs <id>` через `spawnSync stdio:inherit`. Печатает summary («✓ acceptance: pass — block is gate-eligible for → done» / «✗ acceptance: fail — log_transition will block → done until fixed» / «· inconclusive»). Skip via `ATLAS_SKIP_VERIFIER=1` (для tight CI loops). В print-only mode (когда CLI агента нет на PATH) — печатается hint без вызова verifier'а (потому что код ещё не написан). **DONE PR-4**.
- [x] T4.4: `scripts/verify_done_blocks_still_green.mjs` — nightly regression check. Для каждого блока с `status === done` ре-прогоняет verifier; verdict !== pass → пишет proposal `<UTC>__<block>__acceptance_regression.json` с `proposed.status: broken` + `retry_prompt_hint` готовый как промпт ретраю. Dedup: не пишет если уже есть pending proposal на тот же блок. **Никогда** не auto-flips done → broken — всегда proposal через human-in-the-loop. **DONE PR-4**.
- [x] T4.5: MCP tools `read_acceptance_run {block_id}` (читает `_latest.json` или возвращает `_status: no_run`) + `list_failed_acceptances` (обходит все блоки, возвращает массив с verdict !== pass + sample_failures). `verify_block_acceptance` уже был добавлен в PR-2. **DONE PR-4**.
- [x] T4.6: e2e smoke `tests/acceptance_verifier.e2e.smoke.mjs` — 5 фаз в tmpdir-based fake atlas/: (1) verifier пишет fail report + _latest.json; (2) log_transition REJECTS wip→done с verdict=fail + transitions.log не получает запись; (3) фикс probe.txt + ре-verifier → pass; (4) log_transition ACCEPTS wip→done с `gate=pass(1/1)` в transitions.log; (5) regression: status→done + удаляем probe + verify_done_blocks_still_green → proposal `acceptance_regression` написан с `retry_prompt_hint`. ATLAS_ROOT env override прокидывается в spawn. **DONE PR-4**.

PR-4 закрыт. Verifier теперь — реальный hard gate против `wip → done`. Остаётся PR-5 (UI surface).

## PR-5 — UI surface
- [x] T5.1: AcceptanceSection в `frontend/arch_canvas.jsx` — секция «Acceptance verifier» в ArchInspector над «Слой». Цветной badge: ✓ зелёный `pass · N/M`, ✗ красный `fail · K/M (X fail)`, · оранжевый `inconclusive`. Список assertions с tick-mark + evidence_kind + текстом. **DONE PR-5**.
- [x] T5.2: Click на красный/skipped пункт → expand с `evidence + reasoning + 📋 Скопировать как prompt для retry` (формирует готовый промпт со ссылкой на assertion + evidence + reasoning + fix command для следующего агент-прогона). **DONE PR-5**.
- [x] T5.3: ProposalsPanel — специализированная карточка для `kind === 'acceptance_regression'`: красный фон, sample_failures с evidence снимками, кнопка «🔁 Прогнать снова с подсказкой» → `POST /run-block {block_id, prompt: retry_prompt_hint}` (использует существующий endpoint), Accept (→ broken) красный, Reject ghost. accept_proposal.mjs расширен: понимает новый shape `proposal.proposed.{status, status_reason}` (только safe fields) для kind=acceptance_regression. **DONE PR-5**.
- [x] T5.4: Под названием секции — relative-time stamp («last run: 30 sec ago / 5 min ago / 2h ago / 3d ago»). **DONE PR-5**.
- [ ] T5.5: Playwright smoke screenshots — общая инфраструктура реализована в b.user-docs-generator PR-3 (`scripts/take_screenshots.mjs`, `tests/playwright/user_docs_screenshots.spec.ts`). Когда Playwright реально установится в проекте, дописать spec под acceptance_runs/ shape: для каждого блока с `verdict !== pass` снимать скриншот Inspector с раскрытым AcceptanceSection. Сейчас остаётся pending до live Playwright wiring.

PR-5 закрыт (T5.1-T5.4). T5.5 unblocked (инфраструктура готова), но fizzle-test ждёт Playwright.

## Stretch (post-PR5)
- [ ] S1: Авто-retry loop (max 2) при `auto_retry: true` — экспериментальный режим, по умолчанию off.
- [ ] S2: Cross-block acceptance suites («все блоки в layer:ai green») — отдельный gate `validate_layer_acceptance.mjs`.
- [ ] S3: Acceptance-генератор от LLM (наполняет пустой acceptance.md проекта) — но как proposal, не auto-write.


## b.user-docs-generator (idea)

# b.user-docs-generator — mission

Атлас сам пишет UI и backend каждого пользовательского блока — следовательно, **знает** где какая кнопка, какой endpoint, какой happy path. Этот блок берёт это знание и для **каждого user-facing блока** генерирует обучающую страницу для **конечного пользователя продукта**: «чтобы создать задачу, нажми + в правом верхнем углу → откроется форма → введи название → Enter».

Не путать с `b.docs` — тот делает developer-facing wiki по архитектуре блоков (mission/kpi/acceptance Атласа). Этот делает **end-user** документацию: то, что увидит конечный юзер построенного продукта (`demo-todo`, `e-shop`, что угодно), а не разработчик Атласа.

Без этого блока: пользователь Атласа должен сам писать tutorial.md для своего продукта вручную. С ним: tutorial обновляется **автоматически** при каждом изменении UI / API блока — никакой документ-долг, описание всегда соответствует коду.

## Layer
content

## North Star
> Когда `b.todo-ui` блок переходит в `done`, в проекте `demo-todo` появляется `docs/end-user/todo-ui.md` со скриншотом и пошаговой инструкцией, где каждое «нажми X» подтверждено реальным селектором из `frontend/<file>.jsx` и реальным endpoint'ом из `b.todo-api`. Если кнопка переименована — туториал обновляется в следующий nightly.

---

## Что наблюдается (источники данных)

| Источник | Что вытягивается |
|---|---|
| `atlas/blocks/<id>/mission.md` | какую user story закрывает блок |
| `atlas/blocks/<id>/files.md` (alive) | список JSX/HTML/route-файлов блока |
| Содержимое JSX/HTML файлов блока | список кнопок (`<button>`), полей (`<input>`), маршрутов, обработчиков |
| `atlas/blocks/<id>/depends_on.md` | связанные API-блоки → endpoints, которые юзер косвенно дёргает |
| `atlas/process_runs/cursor_observations/*` | какие user-flow реально проходились в IDE (если есть) |
| `frontend/screenshots/*.png` (если PR4.5+ генерится Playwright'ом) | визуал для встраивания |
| `atlas/blocks/<id>/patterns.md` | gotchas / edge cases, которые стоит упомянуть |
| `atlas/projects/<proj>/user_stories/*.md` (если b.user-stories блок есть) | язык целевой аудитории, jobs-to-be-done |

## Что сохраняется (output, файлы)

```
atlas/projects/<proj>/docs/end-user/
  index.md                       ← навигация по фичам
  <block_id>.md                  ← per-block tutorial (заменяет b.todo-ui → docs/end-user/todo-ui.md)
  _screenshots/<block_id>__<flow>.png  ← Playwright-снимки конкретного шага (если доступны)
  _meta/<block_id>.json          ← machine-readable: список кнопок/полей/endpoints, hash источников (для cache)
atlas/projects/<proj>/docs/end-user/AUTOGENERATED.md  ← маркер «не редактируй вручную»
```

`<block_id>.md` shape (генерируется LLM-ом через `b.llm-gateway` со схемой):

```md
# Как пользоваться: <user-friendly title>

> Эта страница автогенерирована Атласом. Не редактируй вручную — изменения перезапишутся.

## Что это делает (1 строка)
<derived from mission.md user story>

## Шаги
1. **Открой** `<route from JSX>` — например, `/tasks`.
2. **Нажми** кнопку `+ Новая задача` (правый верхний угол).
3. **Заполни** поле `Название` — обязательное.
4. **Нажми** `Enter` или кнопку `Сохранить`.

## Что ты увидишь
<screenshot ![](./_screenshots/todo-ui__create.png)>

## Если не получилось
- Кнопка `Сохранить` не активна → проверь, что поле `Название` не пустое.
- Список не обновился → fetch к `<endpoint from b.todo-api/provides>` мог зафейлиться; см. консоль.

## Под капотом (опц., для любопытных)
- Модуль: `b.todo-ui`
- Связанный API: `b.todo-api` → `POST /tasks`
```

---

## Когда работает (триггеры)

| Тип | Когда | Что делает |
|---|---|---|
| **Auto при `done` user-facing блока** | `transition_block <id> done` где `layer ∈ {user, front}` | спавнит generator на этом блоке; пишет `<block_id>.md` |
| **Nightly drift-check** | в `nightly_consolidation.mjs` | проверяет hash источников (JSX + mission); если изменились — regen; если нет — skip |
| **On-demand** | MCP tool `regenerate_user_docs {block_id|project}` | принудительный пересбор |
| **Project bootstrap** | при создании нового проекта через `analyze_conversation_to_atlas` | пишет пустой `docs/end-user/index.md` с TOC из планируемых блоков |

**Не работает на**: блоки с `layer ∈ {data, ext, ai, testing, content}` (там нет user-facing UI). Для них — только если явно указано `user_facing: true` во frontmatter блока.

---

## Где применяется (потребители)

| Потребитель | Как использует |
|---|---|
| Пользователь Атласа (читатель) | открывает `docs/end-user/<block>.md` в репо своего продукта, видит готовый tutorial |
| `b.docs` | в wiki-странице блока добавляет ссылку «End-user docs: docs/end-user/<id>.md» |
| UI Inspector | под mission блока — кнопка «Открыть end-user туториал» |
| `nightly_consolidation` | drift-check; если меняется JSX — пересобирает |
| `analyze_conversation_to_atlas` | при создании нового user-facing блока — добавляет в proposal `expects_user_docs: true` |
| MCP tools | `regenerate_user_docs`, `read_user_docs`, `list_user_docs` |

---

## UX-принципы

1. **Авто-маркер.** Каждый файл начинается с «АВТОГЕНЕРИРОВАНО — не редактируй». Pre-commit hook предотвращает ручные правки (или предлагает либо унаследовать через mission/patterns, либо явно `LOCKED: true` в meta).
2. **Скриншоты опциональны.** Если Playwright не настроен — текст без картинок, но всё ещё валидный markdown.
3. **Язык — пользовательский.** Не «module b.todo-ui implements a TaskCreator component»; а «чтобы создать задачу, нажми +». LLM-prompt явно требует «not technical jargon».
4. **Idempotent.** Регенерация без изменений источников даёт **байт-в-байт** тот же файл (cache на hash).
5. **Локализация.** В meta/<id>.json — поле `lang: "ru"`; LLM-prompt получает язык из `atlas/project.md` или env `ATLAS_USER_DOCS_LANG`.

---

## Out of scope

- Реальный hosting (gh-pages / vercel deploy) — пусть пользователь сам подключит, мы только пишем markdown.
- Видео-туториалы — за рамками.
- A/B test разных формулировок — за рамками.
- Локализация в больше чем 2 языка одновременно — генерим по 1 языку за прогон.

---

## Интеграция с уже существующими блоками

- **depends_on**: `b.db` (read graph + project files), `b.docs` (общий wiki-pipeline), `b.agent-orchestrator` (cursor_observations + Playwright screenshots в будущем), `b.llm-gateway` (генерация текста через structured output).
- **provides**: `end_user_docs_set`, `user_docs_meta`, `tutorial_renderer`.

---

## Backlog priority

- **Position**: после `b.acceptance-verifier-loop` и `b.operator-profile-learner`. Не критично для функциональности Атласа, но **сильно повышает ценность** для конечного пользователя продукта (=пользователя Атласа). Потенциально — самый «продаваемый» feature: «при разработке продукт сам пишет себе manual».
- **Estimate**: 3–4 PR-а:
  1. `block introspection` — парсер JSX/HTML → структура (кнопки, поля, маршруты, handlers)
  2. `LLM tutorial writer` — single-shot per block через `b.llm-gateway`, JSON Schema-driven вывод
  3. `screenshot integration` — Playwright snapshot per flow (опц.; работает без него)
  4. `auto-regen + UI` — nightly drift-check + Inspector кнопка + locked-flag protection


# b.user-docs-generator — tasks

3–4 PR-а. PR-3 (Playwright) опционален и может быть отложен.

## PR-1 — Block introspection
- [x] T1.1: `scripts/introspect_block_ui.mjs <block_id>` — single entry, без LLM. Reads atlas/blocks/<id>/files.md (alive entries with .jsx/.tsx/.js/.ts/.html/.htm extensions), parses each file with brace-aware regex, returns structured output. **DONE PR-1**.
- [x] T1.2: brace-aware token parser handles `<button>`/`<input>`/`<textarea>`/`<form>`/`<Link>`/`<NavLink>`/`<a>`/`<Route>` and `fetch(...)` calls. Brace-counting + string-literal awareness avoids the historical naive-regex break where `=>` in arrow-function `onClick={()=>...}` corrupted attribute extraction. cleanLabel strips JSX expressions and nested tags from inner text. **DONE PR-1**.
- [x] T1.3: output shape `{block_id, files_scanned, buttons: [{label, on_click, file, line}], inputs: [{type, placeholder, name, required, file, line}], textareas: [{placeholder, name, rows, file, line}], forms: [{on_submit, action, method, file, line}], links: [{kind: Link|NavLink|a, target, label, file, line}], routes: [{path, element, file, line}], fetches: [{url, method, file, line}], warnings}`. **DONE PR-1**.
- [x] T1.4: tests/introspect_block_ui.selftest.mjs — 7 groups: empty files.md → warning; synthetic fixture buttons (3 cleaned labels: "Создать задачу", "Очистить всё", "Сохранить"); inputs (placeholder + required + name); textareas (rows + placeholder); form (action + method + onSubmit captured); links (Link/NavLink/a all parsed with labels); routes + fetch (POST detected); real block b.llm-gateway clean labels (no leftover `{`/`}`/`=>`). tests/fixtures/jsx/synthetic_panel.jsx covers every shape including arrow-function onClick. **DONE PR-1**.
- [x] T1.5: MCP tool `introspect_block_ui {block_id}`. CLI `node scripts/introspect_block_ui.mjs <id> [--json]`. Wired into nightly. **DONE PR-1**.

PR-1 закрыт. Foundation для PR-2 (LLM tutorial writer): introspectBlock дает ему чистые UI-tokens, которые он превратит в "нажми X → откроется Y → введи Z" markdown.

## PR-2 — LLM tutorial writer
- [x] T2.1: `scripts/generate_user_docs.mjs <block_id>` оркестратор: read mission.md → introspectBlock → compactIntrospection (trim noisy fields) → buildPrompt → callLLM → validate → render markdown → atomic write. Поддерживает `ATLAS_ROOT` env override + `LLM_MAX_USD_PER_RUN`. **DONE PR-2**.
- [x] T2.2: prompt template включает: BLOCK id + mission excerpt (≤ 600 chars) + JSON-структура UI elements + жёсткие правила («Не используй technical words: module/component/endpoint/state/...», «Cite real UI labels — не выдумывай кнопки»). Lang ru/en через `--lang` или env `ATLAS_USER_DOCS_LANG`. **DONE PR-2**.
- [x] T2.3: JSON Schema `USER_TUTORIAL_SCHEMA` = `{title, oneliner, steps: [{action, target, expected}], troubleshooting: [{problem, fix}], under_the_hood: {block_id, related_apis}}`; required = title+oneliner+steps. **DONE PR-2**.
- [x] T2.4: renderer пишет markdown с `<!-- AUTOGENERATED -->` маркером + 5-line frontmatter (block_id / hash / generated_at / lang) + warning «Не редактируй вручную» + Шаги/Steps секция с нумерацией + Troubleshooting + Под капотом + sources trailer. Meta файл `_meta/<block>.json` хранит hash + cost + provider + locked флаг. **DONE PR-2**.
- [x] T2.5: cost cap `LLM_MAX_USD_PER_RUN` (default $0.03) → exceeded возвращает `status: 'cost_capped'` без записи; mock-режим (определяется по `mockHashForPrompt` в smoke); detectJargon post-LLM сканирует title/oneliner/steps/troubleshooting (не under_the_hood) на 14 forbidden tokens, добавляет warning. **DONE PR-2**.
- [x] T2.6: smoke `tests/user_docs.smoke.mjs` — 5 групп: первая генерация → файл + meta; idempotent re-run → status=unchanged + mtime preserved; meta hash mismatch → status=written; locked: true → status=locked, ручная правка сохраняется; seeded mock fixture с реальными labels (Accept/Reject) → markdown цитирует «Нажми Accept». **DONE PR-2**.

PR-2 закрыт. С реальным API ключом или seeded fixture orchestrator пишет работающий end-user туториал; без ключа — defensive defaults (title="<block> — обзор", пустые steps), идемпотентность работает в обоих режимах.

## PR-3 — Screenshot integration (опц.)
- [x] T3.1: `scripts/take_screenshots.mjs` `detectPlaywright()` ищет `playwright.config.{js,ts,mjs,cjs}` + `node_modules/@playwright/test`. Если нет ни конфига ни модуля → `{available: false, reason}`. Никогда не fail. **DONE PR-3**.
- [x] T3.2: `tests/playwright/user_docs_screenshots.spec.ts` — template-spec, читает manifest `_screenshots/_manifest.json` (writes происходит из `take_screenshots.tryCapture`), для каждого `block_id × route` делает `page.goto(route) → networkidle → page.screenshot()`. Параметрические маршруты (`/tasks/:id`) пропускаются. Filter via `--grep <block_id>` + env `ATLAS_USER_DOCS_BLOCK`. **DONE PR-3**.
- [x] T3.3: `generate_user_docs.mjs` после LLM-записи зовёт `tryCapture(blockId, introspection)`. На `status: captured` подмешивается `## Что ты увидишь / ## Screenshots` секция с `![alt](./_screenshots/<block>__<slug>.png)`. На `skipped` (no routes) — benign, без warning. На `failed` / `skipped (playwright unavailable, with routes)` — warning. Meta хранит `screenshots: {status, reason}` + `screenshot_files` для cleanup. **DONE PR-3**.
- [x] T3.4: `cleanupOrphanScreenshots(activeBlockIds, {dry_run})` обходит `_screenshots/*.png`, удаляет файлы блоков отсутствующих в graph.json (любого проекта). Также pruнит `_manifest.json.entries`. CLI `take_screenshots cleanup`. MCP tool `cleanup_orphan_screenshots`. **DONE PR-3**.

PR-3 закрыт. T5.5 b.acceptance-verifier-loop (Playwright smoke screenshots) теперь имеет ту же инфраструктуру для использования — в их случае поверх `acceptance_runs/` data shape. tests/screenshots_integration.selftest.mjs 7 групп зелёный (detectPlaywright skip; slugifyRoute; expectedScreenshots; tryCapture skip "no routes"; tryCapture skip "playwright unavailable" with routes; cleanupOrphanScreenshots removes orphans + prunes manifest; e2e generate_user_docs no benign warning when route-less).

## PR-4 — Auto-regen + UI + safety
- [x] T4.1: `scripts/regenerate_user_docs_drift.mjs` walks user-facing blocks (layer ∈ {user, front} OR `user_facing: true` в graph; и в основном atlas/graph.json и в projects/<proj>/graph.json), читает `_meta/<block>.json`, сравнивает hash. Three-way: no meta → seed; hash matches → skip; hash drifted + locked=false → regen; hash drifted + locked=true → write `user_docs_locked` proposal (dedup — skip если pending для того же new_hash уже есть). Пишет `atlas/docs/end-user/_drift_summary.json`. **DONE PR-4**.
- [x] T4.2: `scripts/log_transition.mjs` после успешного `→ done` для user-facing блока (детект через graph.json + projects/*/graph.json) спавнит `generate_user_docs.mjs <id>` через `child_process.spawn({detached, stdio: 'ignore'}) + child.unref()` — не блокирует transition. Skip via `ATLAS_SKIP_USER_DOCS=1`. **DONE PR-4**.
- [x] T4.3: `scripts/check_user_docs_locked.mjs` — pre-commit guard, читает `git diff --name-only [--cached] -- atlas/docs/end-user/`, для каждого изменённого `.md` проверяет meta.locked; если false → exit 1 с подробным сообщением и инструкцией fix. Wiring (manual): `.git/hooks/pre-commit: node scripts/check_user_docs_locked.mjs --staged`. CLI `--staged | --json`. **DONE PR-4**.
- [x] T4.4: `frontend/arch_canvas.jsx` `<UserDocsLink blockId={...}>` рисует blue-tinted панель под mission блока со ссылкой `/atlas/docs/end-user/<block>.md` + кнопками 🔁 Regenerate / 🔒 Lock | 🔓 Unlock + relative-time stamp + 🔒 locked badge. Появляется только когда `window.SIMA_BOOTSTRAP.userDocsByBlock[blockId]` существует. **DONE PR-4**.
- [x] T4.5: `frontend/proposals_panel.jsx` распознаёт `kind === 'user_docs_locked'` — рисует amber карточку с hash diff (`old` → `new`) + retry_prompt_hint preview + кнопками 🔓 Unlock + regen / Keep locked (Reject). **DONE PR-4**.
- [x] T4.6: MCP tools `list_user_docs / read_user_docs / lock_user_docs / regenerate_user_docs_drift`. atlas_api endpoints `/user-docs/regenerate`, `/user-docs/lock`, `/user-docs/unlock-and-regen` — UI кнопки реально мутируют state. **DONE PR-4**.
- [x] T4.7: Localization уже работает через `ATLAS_USER_DOCS_LANG` env (PR-2) + `--lang` flag; UserDocsLink показывает текущий lang в meta-line. UI-toggle отложен. **DONE PR-4 (env path)**.

PR-4 закрыт. tests/user_docs_drift.selftest.mjs 5 групп зелёный (bare repo seed; idempotent re-run; hash drift unlocked → refreshed; hash drift locked → proposal + dedup; list/read/lock helpers). b.user-docs-generator закрыт целиком — все 4 PR'а (1 introspection / 2 LLM writer / 3 screenshots / 4 auto-regen+UI).


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



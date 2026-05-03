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

## Late-stage (Symphony-inspired) — после PR4.5 / PR-Live стабильны

- [ ] T7: **Run-lifecycle FSM** — заменить fire-and-forget `run_block_implementation.mjs` на FSM с явными состояниями `PreparingWorkspace → BuildingPrompt → LaunchingAgent → InitializingSession → StreamingTurn → Finishing → Succeeded|Failed|TimedOut|Stalled|CanceledByReconciliation`. Хранить состояние в `atlas/run_state/<block_id>__<UTC>.json`, мутировать через единый `transition_run_state(run_id, new_state)`. UI читает live-state, показывает прогресс/застрял. Stalled-detection по `max_turn_idle_ms`. Cancel-ability через MCP tool. Reference: openai/symphony SPEC §7.2. — **PR-7**
- [ ] T8: **Per-block sandboxed workspace** — каждый агент-прогон работает в `~/.atlas_workspaces/<block_id>__<UTC>/` (deterministic path), НЕ в основной рабочей директории. После Succeeded — `git diff --no-index` против origin → пишется как proposal, требует Accept чтобы попасть в реальный repo. Это позволит запускать 2–3 блока параллельно без конфликтов. Reference: openai/symphony SPEC §4.1 Workspace. — **PR-8**
- [ ] T9: Интеграция T7/T8 с `b.acceptance-verifier-loop`: после `Succeeded` авто-спавн verifier'а в том же workspace (до Accept в реальный repo) — fail blocks Accept. — **PR-9**


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
- [ ] T3.1: MCP tools `set_dont_use {value, reason}`, `set_always_use {category, value}`, `clear_dont_use {value}`.
- [ ] T3.2: `guard_against_drift.mjs` читает `atlas/operator_profile/dont_use.json` и расширяет `forbidden_substrings` персональными запретами.
- [ ] T3.3: validator `validate_dont_use_compliance.mjs` — раз в nightly выкидывает `warning` (не fail) если в активном блоке используется framework из dont_use.
- [ ] T3.4: UI Inspector: секция `Запреты оператора` со списком и кнопкой `снять запрет`.

## PR-4 — Lessons LLM analyser
- [ ] T4.1: `scripts/analyze_lessons_from_history.mjs` — single shot через b.llm-gateway.
- [ ] T4.2: prompt: «Вот decisions.log + checks.log fail записи за последние 30 дней. Найди повторяющиеся проблемы (≥ 2 evidence). Верни JSON `[{lesson, evidence: [block_id@date], expires_at}]`.»
- [ ] T4.3: cost cap LLM_MAX_USD_PER_RUN ≤ $0.05; mock-режим для тестов.
- [ ] T4.4: nightly запускает раз в сутки, append в `lessons.json` (без перезаписи).
- [ ] T4.5: MCP tools `add_lesson`, `revoke_lesson`, `list_lessons`.
- [ ] T4.6: smoke `tests/operator_profile_lessons.smoke.mjs`.

## PR-5 — inject_context_pack hook
- [ ] T5.1: `inject_context_pack.mjs` читает `atlas/operator_profile/profile.json` (если `_status !== "warming_up"`).
- [ ] T5.2: рендерит секцию `## Operator profile (likely preferences)` с work_style + dont_use + last 3 lessons.
- [ ] T5.3: smoke-тест: после prompt — context-pack содержит «Этот оператор предпочитает react. Никогда не использует mongo. В прошлом: <lesson>».
- [ ] T5.4: при `--no-profile` flag модуль молчит (для воспроизводимости evals).

## PR-6 — UI hints
- [ ] T6.1: ProposalsPanel: вычисляет `complianceWithProfile(proposal, profile)` → `match | conflict | neutral`.
- [ ] T6.2: badge цвет: green (match) / amber (conflict) / gray (neutral).
- [ ] T6.3: Inspector под mission блока: секция `Подсказки от профиля` со списком; click на подсказку открывает `evidence` (список block_id из истории).
- [ ] T6.4: UI кнопка «забыть этот паттерн» / «снять запрет» → дёргает MCP tool.
- [ ] T6.5: privacy: если `_status === "warming_up"` — UI показывает `Профиль ещё учится: 3/5 done, 7/10 invocations`.


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
- [ ] T2.1: `scripts/collect_evidence.mjs` — диспетчер по `evidence_kind`.
- [ ] T2.2: `exit_code` collector: запуск shell-команды из `evidence_spec.cmd`, capture exit code + stdout (≤ 4KB).
- [ ] T2.3: `fs_glob` collector: `evidence_spec.pattern` (glob) + `evidence_spec.min_count` / `max_age_min`.
- [ ] T2.4: `file_diff` collector: `git diff --name-only` за окно прогона; `evidence_spec.must_touch: [path...]` / `must_not_touch`.
- [ ] T2.5: `log_grep` collector: `evidence_spec.file` + `evidence_spec.pattern` (regex) + `since_time`.
- [ ] T2.6: `selftest_run` collector: `evidence_spec.cmd` + ожидание `exit 0` + (опц.) regex для `expect_in_stdout`.
- [ ] T2.7: selftest `tests/evidence_collectors.selftest.mjs` (по 1 case на kind + 1 negative для каждого).

## PR-3 — LLM-judge fallback
- [ ] T3.1: `scripts/judge_assertion.mjs` — через `b.llm-gateway.callLLM` со схемой `{verdict: pass|fail|skipped, reasoning, evidence_quote}`.
- [ ] T3.2: prompt: «Вот пункт acceptance: <assertion>. Вот контекст: mission.md / последний git diff / последние 200 строк checks.log. Сделай verdict с reasoning. Нельзя просто "выглядит ок" — нужно цитировать конкретный фрагмент кода или лога.»
- [ ] T3.3: cost cap LLM_MAX_USD_PER_RUN ≤ $0.02; mock-режим из `tests/llm_mocks/`.
- [ ] T3.4: smoke `tests/llm_judge.smoke.mjs` (3 case: pass / fail / borderline).

## PR-4 — Gate hooks
- [ ] T4.1: `scripts/verify_block_acceptance.mjs <block_id>` — оркестратор: parse → collect (deterministic) → judge (fallback) → write `acceptance_runs/<block>/<UTC>__.json` + `_latest.json` + append `checks.log`.
- [ ] T4.2: `scripts/log_transition.mjs` модификация: перед `wip → done` читает `_latest.json`; verdict !== pass → exit 1 с понятной ошибкой и подсказкой `node scripts/verify_block_acceptance.mjs <id>`.
- [ ] T4.3: `scripts/run_block_implementation.mjs` модификация: после exit 0 агента — авто-спавн verifier; вывод verdict в stdout.
- [ ] T4.4: `scripts/nightly_consolidation.mjs` step `verify_done_blocks_still_green` — re-verify всех `done`; при regress → `done → broken` proposal.
- [ ] T4.5: MCP tools `verify_block_acceptance`, `read_acceptance_run`, `list_failed_acceptances`.
- [ ] T4.6: e2e smoke `tests/acceptance_verifier.e2e.smoke.mjs`.

## PR-5 — UI surface
- [ ] T5.1: Inspector секция «Acceptance verifier» (под mission блока): зелёный badge `5/5 pass` или красный `3/5 — A2/A4 fail`.
- [ ] T5.2: Click на красный пункт → раскрытие с `reasoning + evidence + retry_prompt_hint` + кнопка «Скопировать как prompt для retry».
- [ ] T5.3: ProposalsPanel: новый тип proposal `acceptance_blocked` с кнопкой «Прогнать снова с подсказкой» → дёргает `/run-block` с `retry_prompt_hint` в prompt.
- [ ] T5.4: Под mission блока — счётчик «последний прогон: 30 секунд назад / 2 минуты назад / out-of-date».
- [ ] T5.5: Playwright smoke screenshots для обоих сценариев (pass / fail).

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
> Когда `b.todo-ui` блок переходит в `done`, в проекте `demo-todo` появляется `docs/end-user/todo-ui.md` со скриншотом и пошаговой инструкцией, где каждое «нажми X» подтверждено реальным селектором из `Sima (Remix)/<file>.jsx` и реальным endpoint'ом из `b.todo-api`. Если кнопка переименована — туториал обновляется в следующий nightly.

---

## Что наблюдается (источники данных)

| Источник | Что вытягивается |
|---|---|
| `atlas/blocks/<id>/mission.md` | какую user story закрывает блок |
| `atlas/blocks/<id>/files.md` (alive) | список JSX/HTML/route-файлов блока |
| Содержимое JSX/HTML файлов блока | список кнопок (`<button>`), полей (`<input>`), маршрутов, обработчиков |
| `atlas/blocks/<id>/depends_on.md` | связанные API-блоки → endpoints, которые юзер косвенно дёргает |
| `atlas/process_runs/cursor_observations/*` | какие user-flow реально проходились в IDE (если есть) |
| `Sima (Remix)/screenshots/*.png` (если PR4.5+ генерится Playwright'ом) | визуал для встраивания |
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
- [ ] T1.1: `scripts/introspect_block_ui.mjs <block_id>` — single entry, без LLM.
- [ ] T1.2: парсер JSX через лёгкий regex / esprima-fallback: `<button>` / `<input>` / `<form>` / `onClick={...}` / `<Link to="...">` / fetch-вызовы.
- [ ] T1.3: структура output: `{buttons: [{label, selector, handler}], inputs: [{name, label, required, placeholder}], routes: [{path, component}], fetches: [{method, url, where}]}`.
- [ ] T1.4: selftest на `b.todo-ui` если демо-todo есть, иначе на синтетических fixtures в `tests/fixtures/jsx/`.
- [ ] T1.5: MCP tool `introspect_block_ui {block_id}`.

## PR-2 — LLM tutorial writer
- [ ] T2.1: `scripts/generate_user_docs.mjs <block_id>` оркестратор: introspect → build prompt → callLLM → validate → write file.
- [ ] T2.2: prompt template: «Вот mission блока: ... Вот UI elements: ... Сгенерируй markdown-туториал для конечного пользователя на языке `<lang>`. Не используй технические термины. Каждый шаг должен ссылаться на конкретный label кнопки или поля.»
- [ ] T2.3: JSON Schema `UserTutorial`: `{title, oneliner, steps: [{action, target, expected}], troubleshooting: [{problem, fix}], under_the_hood: {block_id, related_apis}}`.
- [ ] T2.4: writer: рендерит JSON → markdown с `<!-- AUTOGENERATED -->` маркером + frontmatter с hash источников.
- [ ] T2.5: cost cap LLM_MAX_USD_PER_RUN ≤ $0.03; mock-режим из `tests/llm_mocks/`.
- [ ] T2.6: smoke `tests/user_docs.smoke.mjs` (создание / regen / no-change idempotent).

## PR-3 — Screenshot integration (опц.)
- [ ] T3.1: проверка `playwright.config.js` существования; если нет — skip + warn в stdout (не fail).
- [ ] T3.2: `tests/playwright/user_docs_screenshots.spec.ts` — для каждого user-facing блока playwright-сценарий: open route → screenshot.
- [ ] T3.3: интеграция в `generate_user_docs.mjs`: после LLM записи markdown — попытка screenshot; success → подмешиваем `![](./_screenshots/<block>__<flow>.png)` в нужное место.
- [ ] T3.4: cleanup: удаление screenshots для блоков, которые удалены/переименованы.

## PR-4 — Auto-regen + UI + safety
- [ ] T4.1: `scripts/regenerate_user_docs_drift.mjs` — nightly step: обходит все user-facing блоки, сравнивает hash; regen только при изменениях.
- [ ] T4.2: `scripts/log_transition.mjs` hook: при `→ done` user-facing блока — спавнит `generate_user_docs.mjs` (асинхронно, не блокирует переход).
- [ ] T4.3: pre-commit hook: проверка ручных правок `docs/end-user/*.md` без `LOCKED: true` в meta — warning + предложение снять auto-regen.
- [ ] T4.4: Inspector кнопка «Открыть end-user docs» (под mission).
- [ ] T4.5: ProposalsPanel: `user_docs_locked` proposal — когда блок locked, но источники изменились (нужно вмешательство оператора).
- [ ] T4.6: MCP tools `regenerate_user_docs`, `read_user_docs`, `list_user_docs`, `lock_user_docs`.
- [ ] T4.7: Localization: `ATLAS_USER_DOCS_LANG` env (default `ru`); UI-toggle позже.


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



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

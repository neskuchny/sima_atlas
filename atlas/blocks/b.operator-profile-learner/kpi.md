# b.operator-profile-learner — KPI

> **Статус замера (R-8.05, аудит самоконтроля).** Файл содержал `Сейчас: ✗`
> по всем пунктам, включая «✗ (блока нет)» — шаблон, не обновлённый после
> того, как блок был реализован и переведён в `done`. Ниже: измеренное
> помечено ✓/✗ со ссылкой на доказательство, неизмеренное — честно
> «не измерено» (не ✗, потому что ✗ означало бы «проверено и не выполнено»).

- **KPI-1 (signal coverage)**: `profile.json` агрегирует ≥ 6 из 10 источников из mission.md (checks.log / transitions.log / proposals / agent_invocations / llm_traces / cursor_observations / decisions.log / patterns.md / tech_stack.md / cross-ref). Сейчас: ✓ — `atlas/operator_profile/profile.json` содержит 8 агрегатов: `work_style`, `agents_used`, `tech_stack_history`, `llm_provider_stats`, `proposals_stats`, `decisions_stats`, `patterns_stats`, `failures` (57) + `invocations_total` (14).
- **KPI-2 (real-time freshness)**: `accept_proposal` / `transition_block done|broken` / `agent_invocation` мутирует profile.json без LLM-вызова за < 100 ms. Сейчас: не измерено (нет детерминистического замера в nightly).
- **KPI-3 (silent under min-data)**: при < 5 transitions `done` И < 10 `agent_invocations` модуль молчит — не подмешивает советы в context-pack, не пишет proposals. Сейчас: не измерено (нет детерминистического замера в nightly).
- **KPI-4 (advice ROI)**: при `accept_rate` proposal с badge `соответствует профилю` ≥ accept_rate без badge на 20% (на горизонте 30 проколов). Сейчас: n/a.
- **KPI-5 (lessons retention)**: после `add_lesson` урок попадает в `inject_context_pack` секцию `## Operator profile` для всех агент-вызовов, пока не `revoke_lesson` или `expires_at` не наступит. Сейчас: не измерено (нет детерминистического замера в nightly).
- **KPI-6 (privacy & reversibility)**: 100% записей в profile имеют `evidence: [block_id]`; любой урок / dont_use / always_use можно отозвать одной MCP-tool — вернёт identical context-pack как до записи. Сейчас: не измерено (нет детерминистического замера в nightly).
- **KPI-7 (low cost)**: nightly aggregation работает без LLM-вызовов (только rule-based counters). Только `recompute_operator_profile {analyze_failures: true}` стоит ≤ $0.05 / запуск через b.llm-gateway. Сейчас: ✓ — в `scripts/aggregate_operator_profile.mjs` нет ни одного вхождения `llm_gateway` / `callLLM`; скрипт зарегистрирован в nightly и выполняется без LLM.

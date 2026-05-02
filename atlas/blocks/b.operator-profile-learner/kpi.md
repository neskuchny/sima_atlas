# b.operator-profile-learner — KPI

- **KPI-1 (signal coverage)**: `profile.json` агрегирует ≥ 6 из 10 источников из mission.md (checks.log / transitions.log / proposals / agent_invocations / llm_traces / cursor_observations / decisions.log / patterns.md / tech_stack.md / cross-ref). Сейчас: ✗ (блока нет).
- **KPI-2 (real-time freshness)**: `accept_proposal` / `transition_block done|broken` / `agent_invocation` мутирует profile.json без LLM-вызова за < 100 ms. Сейчас: ✗.
- **KPI-3 (silent under min-data)**: при < 5 transitions `done` И < 10 `agent_invocations` модуль молчит — не подмешивает советы в context-pack, не пишет proposals. Сейчас: ✗.
- **KPI-4 (advice ROI)**: при `accept_rate` proposal с badge `соответствует профилю` ≥ accept_rate без badge на 20% (на горизонте 30 проколов). Сейчас: n/a.
- **KPI-5 (lessons retention)**: после `add_lesson` урок попадает в `inject_context_pack` секцию `## Operator profile` для всех агент-вызовов, пока не `revoke_lesson` или `expires_at` не наступит. Сейчас: ✗.
- **KPI-6 (privacy & reversibility)**: 100% записей в profile имеют `evidence: [block_id]`; любой урок / dont_use / always_use можно отозвать одной MCP-tool — вернёт identical context-pack как до записи. Сейчас: ✗.
- **KPI-7 (low cost)**: nightly aggregation работает без LLM-вызовов (только rule-based counters). Только `recompute_operator_profile {analyze_failures: true}` стоит ≤ $0.05 / запуск через b.llm-gateway. Сейчас: ✗.

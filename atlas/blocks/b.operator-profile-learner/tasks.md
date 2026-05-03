# b.operator-profile-learner — tasks

Разбит на 6 PR-ов по образцу PR3 (LLM gateway) и PR3.5 (proposals flow). Каждый PR — независимо мержабельный.

## PR-1 — Data collector (без LLM)
- [ ] T1.1: создать `scripts/aggregate_operator_profile.mjs` — single entry point read-only.
- [ ] T1.2: реализовать readers: `readChecksLogs`, `readTransitions`, `readProposals`, `readAgentInvocations`, `readLlmTraces`, `readCursorObservations`, `readDecisionsLogs`, `readPatterns`, `readTechStacks`.
- [ ] T1.3: aggregator: вычисляет `work_style.median_time_idea_to_done_h`, `agents_used.{claude|openai|gemini}.success_rate`, `tech_stack_history` с frequency × satisfaction (satisfaction = 1 - rollback_rate).
- [ ] T1.4: writer: пишет `atlas/operator_profile/profile.json` + `patterns/*.json` + snapshot в `history/<UTC>.json`.
- [ ] T1.5: min-data guard: если transitions < 5 И invocations < 10 → пишет profile.json с `_status: "warming_up"` и пустые patterns; downstream'ы это видят и молчат.
- [ ] T1.6: selftest `tests/operator_profile.selftest.mjs` (≥ 6 case с фиксированными fixtures).
- [ ] T1.7: интеграция в `nightly_consolidation.mjs` как `aggregate_operator_profile` step.
- [ ] T1.8: MCP tool `read_operator_profile` (read-only).

## PR-2 — Templates set
- [x] T2.1: написать 4 JSON-шаблона `atlas/operator_profile/templates/{backend-mvp,backend-prod,frontend-spa,testing-stack}.json` с дефолтным стеком. **DONE in PR-Backlog**: starter templates + applicability + must_have_acceptance + anti-patterns + scaffold + estimated_hours.
- [ ] T2.2: `pickTemplate(scope, profile)` — функция, возвращающая шаблон, скорректированный под `tech_stack_history` оператора.
- [ ] T2.3: интегрировать в `analyze_conversation_to_atlas.mjs`: если LLM вернул блок без `tech_stack` — подмешать `pickTemplate` и пометить `suggested_template_id` в proposal.
- [ ] T2.4: UI ProposalsPanel: badge `template: backend-mvp` рядом с tech_stack.

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

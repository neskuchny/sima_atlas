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

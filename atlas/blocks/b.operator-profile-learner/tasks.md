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

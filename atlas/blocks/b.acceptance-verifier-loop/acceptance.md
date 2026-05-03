# b.acceptance-verifier-loop — acceptance

Acceptance gate для перехода `idea → wip → review → done`. Каждый пункт должен иметь признак прохождения в `checks.log` либо в auto-evidence из nightly.

- [ ] **A1.** PR-1 (assertion parser) merged: `scripts/parse_acceptance.mjs` парсит `atlas/blocks/<id>/acceptance.md`, возвращает массив `{id, assertion, evidence_kind, evidence_spec}`. Selftest (≥ 8 cases) на разные форматы acceptance.md существующих блоков (b.llm-gateway/b.docs/b.core-sync).
- [ ] **A2.** PR-2 (evidence collectors) merged: `scripts/collect_evidence.mjs` поддерживает `exit_code`, `fs_glob`, `file_diff`, `log_grep`, `selftest_run` без LLM-вызова; selftest (≥ 6 cases) на каждый kind зелёный.
- [ ] **A3.** PR-3 (LLM-judge fallback) merged: `scripts/judge_assertion.mjs` через `b.llm-gateway` оценивает пункт без явного evidence_spec; cost ≤ $0.02 per assertion; mock-режим для тестов; smoke green.
- [ ] **A4.** PR-4 (gate hooks) merged: `log_transition.mjs` блокирует `wip → done` если `_latest.json` отсутствует или `verdict !== "pass"`; `run_block_implementation.mjs` после exit 0 спавнит verifier; nightly включает `verify_done_blocks_still_green` step.
- [ ] **A5.** PR-5 (UI) merged: Inspector секция «Acceptance verifier» (зелёные/красные badge per item, click → reasoning + evidence); ProposalsPanel `acceptance_blocked` proposal с retry-кнопкой; smoke (Playwright) подтверждает оба сценария.
- [ ] **A6.** End-to-end smoke `tests/acceptance_verifier.e2e.smoke.mjs`: создать тестовый блок с 3 acceptance items (1 deterministic, 1 LLM-judge, 1 заведомо-fail) → run agent (mock) → verifier даёт verdict=fail с правильным `retry_prompt_hint` → `transition_block done` блокируется.
- [ ] **A7.** Cache: при повторном вызове без новых коммитов и без новых traces — verdict из `_latest.json` без LLM-вызова; integration test проверяет, что cost_usd на 2-й вызов = 0.
- [ ] **A8.** Privacy/safety: verifier не пишет в `acceptance.md` блока (read-only по контракту); pre-commit hook предотвращает.

## Что считается NOT acceptance
- Полная автоматизация retry-loop без явного Accept оператором (нарушает UX-принцип «не auto-применяется к коду»).
- Замена структурных валидаторов (`validate_block_contracts` и т. д.) — verifier работает поверх них, не вместо.
- LLM-judge без `reasoning` поля в результате (нельзя «потому что я так считаю»).

## Logic-flow при review
- Каждый verdict сопровождается evidence_kind + evidence + reasoning (для llm_judge).
- `acceptance_runs/<block>/<UTC>__.json` хранится append-only (не перезаписывается); `_latest.json` — symlink/copy последнего.
- Если acceptance.md изменился — кэш инвалидируется автоматически (hash acceptance.md в run-report'е).

## Зависимости
- b.acceptance-verifier-loop → читает b.db, b.core-sync, b.agent-orchestrator (post-run hook), b.llm-gateway (judge fallback).
- Никто из других блоков не блокируется этим (это аддитивный gate; по умолчанию `done` без verifier'а уже работал в PR1–PR-Live).

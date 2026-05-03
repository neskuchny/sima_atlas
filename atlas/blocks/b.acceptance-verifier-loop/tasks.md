# b.acceptance-verifier-loop — tasks

5 PR-ов. PR-1..PR-3 — pure-deterministic (без LLM); PR-3 добавляет LLM fallback; PR-4..PR-5 — интеграция.

## PR-1 — Assertion parser
- [ ] T1.1: `scripts/parse_acceptance.mjs` — строгий парсер `acceptance.md`.
- [ ] T1.2: формат: `- [ ] **A1.** <assertion text>` обязателен; опц. YAML-блок ниже с `evidence_kind: ...` + `evidence_spec: {...}`.
- [ ] T1.3: extract `id` (A1..AN), `text`, `evidence_kind` (default = `llm_judge` если не указан), `evidence_spec`.
- [ ] T1.4: selftest на acceptance.md от b.llm-gateway / b.docs / b.core-sync (≥ 3 блока × 5 пунктов = 15 assertions, parser должен извлечь все).
- [ ] T1.5: MCP tool `parse_acceptance {block_id}` возвращает массив assertions.

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

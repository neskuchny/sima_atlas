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
- [ ] T5.1: Inspector секция «Acceptance verifier» (под mission блока): зелёный badge `5/5 pass` или красный `3/5 — A2/A4 fail`.
- [ ] T5.2: Click на красный пункт → раскрытие с `reasoning + evidence + retry_prompt_hint` + кнопка «Скопировать как prompt для retry».
- [ ] T5.3: ProposalsPanel: новый тип proposal `acceptance_blocked` с кнопкой «Прогнать снова с подсказкой» → дёргает `/run-block` с `retry_prompt_hint` в prompt.
- [ ] T5.4: Под mission блока — счётчик «последний прогон: 30 секунд назад / 2 минуты назад / out-of-date».
- [ ] T5.5: Playwright smoke screenshots для обоих сценариев (pass / fail).

## Stretch (post-PR5)
- [ ] S1: Авто-retry loop (max 2) при `auto_retry: true` — экспериментальный режим, по умолчанию off.
- [ ] S2: Cross-block acceptance suites («все блоки в layer:ai green») — отдельный gate `validate_layer_acceptance.mjs`.
- [ ] S3: Acceptance-генератор от LLM (наполняет пустой acceptance.md проекта) — но как proposal, не auto-write.

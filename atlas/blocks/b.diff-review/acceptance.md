# b.diff-review — acceptance

Acceptance gate для перехода `idea → wip → review → done`. Детерминистические проверки + один selftest.

- [x] **A1.** `scripts/review_diff.mjs` существует и на пустом diff'е (нечего ревьюить) детерминистически выходит с `inconclusive` — независимо от наличия LLM-ключа.
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: printf '' | node scripts/review_diff.mjs --block b.nonexistent-empty --json
  expect_in_stdout: "inconclusive"
```

- [x] **A2.** Selftest `tests/review_diff.selftest.mjs` зелёный: tri-state честность, blocking→fail / warning→pass, пустой diff→inconclusive, budget-усечение с полным списком файлов.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/review_diff.selftest.mjs
  expect_in_stdout: "OK"
```

- [x] **A3.** `review_diff.mjs` экспортирует `reviewDiff({ diff_text, block_id })` как library-функцию (для вызова из V-1 без subprocess).
```yaml
evidence_kind: log_grep
evidence_spec:
  file: scripts/review_diff.mjs
  pattern: "export async function reviewDiff"
```

- [x] **A4.** Schema-enum вердикта упорядочен `inconclusive` первым — гарантия безопасного mock-fallback (no false pass).
```yaml
evidence_kind: log_grep
evidence_spec:
  file: scripts/review_diff.mjs
  pattern: "VERDICT_ENUM.*'inconclusive', 'pass', 'fail'"
```

- [x] **A5.** `agent_loop_daemon.mjs` вызывает diff-review как гейт (после verifier, рядом с семантическим).
```yaml
evidence_kind: log_grep
evidence_spec:
  file: scripts/agent_loop_daemon.mjs
  pattern: "review_diff"
```

- [x] **A6.** `diff_review_selftest` зарегистрирован в nightly.
```yaml
evidence_kind: log_grep
evidence_spec:
  file: scripts/nightly_consolidation.mjs
  pattern: "review_diff.selftest"
```

## inconclusive_if

- Нет git-репозитория (`.git` отсутствует) — `--since` не сможет построить diff.
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: test -d .git
```

## Не считается acceptance

- Реальное качество находок живого LLM — не детерминистично, проверяется операторски на живых прогонах, не в nightly.
- Авто-фикс найденных проблем — out of scope, это работа следующей итерации агента.

# b.clarify — acceptance

Acceptance gate для перехода `idea → wip → review → done`. Детерминистические
проверки + один selftest. Каждая ассерция проверяет поведение, а не наличие
файла.

- [x] **A1.** `VERDICT_ENUM` упорядочен `inconclusive` первым — гарантия, что
  mock/отсутствие ключа даёт безопасный вердикт, а не «всё ясно». «Clear» без
  живой модели — это тихий зелёный ровно в том месте, которое создано ловить
  непонимание.
```yaml
evidence_kind: log_grep
evidence_spec:
  file: scripts/clarify_block.mjs
  pattern: "VERDICT_ENUM.*'inconclusive', 'clear', 'questions'"
```

- [x] **A2.** Selftest зелёный: честная деградация, отбраковка ярлыка вместо
  вопроса, отбраковка вопроса без выбора, сортировка по цене поздней находки,
  поиск маркеров, append-only лог, снятие маркера без остатка, срабатывание
  done-гейта.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/clarify_block.selftest.mjs
  expect_in_stdout: "OK"
```

- [x] **A3.** На mock-провайдере вердикт детерминистически `inconclusive`, независимо от содержимого контракта. Проверяется по вердикту в выводе, а не по коду возврата: `inconclusive` намеренно выходит с кодом 2, поэтому ассерция на `exit 0` проверяла бы здесь ровно противоположное.
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: ATLAS_FORCE_MOCK_LLM=1 node scripts/clarify_block.mjs b.desktop --json | grep -q '"verdict": "inconclusive"'
```

- [x] **A4.** `clarifyBlock` экспортируется как library-функция — вызов из UI
  и MCP без subprocess.
```yaml
evidence_kind: log_grep
evidence_spec:
  file: scripts/clarify_block.mjs
  pattern: "export async function clarifyBlock"
```

- [x] **A5.** Валидатор маркеров зарегистрирован в nightly, то есть
  неразрешённая неопределённость не может пережить ночь незамеченной.
```yaml
evidence_kind: log_grep
evidence_spec:
  file: scripts/nightly_consolidation.mjs
  pattern: "validate_clarifications"
```

- [x] **A6.** Валидатор проходит на текущем атласе (нет `done`-блока с
  открытым маркером).
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: node scripts/validate_clarifications.mjs
  expect_in_stdout: "open marker"
```

- [x] **A7.** Selftest зарегистрирован в nightly.
```yaml
evidence_kind: log_grep
evidence_spec:
  file: scripts/nightly_consolidation.mjs
  pattern: "clarify_block.selftest"
```

## inconclusive_if

- Нет живого LLM-провайдера — качество вопросов операторски не проверяемо в
  nightly (структура проверяется, содержание нет).
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: test -n "$ANTHROPIC_API_KEY$GOOGLE_API_KEY$OPENAI_API_KEY"
```

## Не считается acceptance

- Реальное качество вопросов живой модели — не детерминистично, проверяется
  операторски на живых прогонах, не в nightly.
- Автоответ на собственные вопросы — вне scope по замыслу: право записи в
  контракт остаётся у человека.

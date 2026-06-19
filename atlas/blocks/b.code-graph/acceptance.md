# b.code-graph — acceptance

Acceptance gate для перехода `idea → wip → review → done`. Каждая ассерция
имеет детерминистический evidence_kind — судья-LLM здесь не нужен,
структурные проверки самодостаточны.

- [ ] **A1.** `node scripts/build_code_graph.mjs` собирает `atlas/code_graph.json`;
  файл валидный JSON со строго отсортированными ключами на верхнем уровне.
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: node scripts/build_code_graph.mjs && node -e "JSON.parse(require('fs').readFileSync('atlas/code_graph.json','utf8'))"
  expect_in_stdout: ""
```

- [ ] **A2.** Selftest парсера ES-модулей зелёный: статичные `import`,
  динамический `import()`, named/default/re-export — все распознаются;
  внешние пакеты помечаются `external: true`.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/code_graph_extractor.selftest.mjs
  expect_in_stdout: "OK"
```

- [ ] **A3.** Selftest валидатора зелёный: на синтетическом мини-атласе
  показывает `undeclared_code_dependency` и `provided_capability_not_exported`,
  и НЕ показывает drift'ов когда контракт совпадает с кодом.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/code_graph_validator.selftest.mjs
  expect_in_stdout: "OK"
```

- [ ] **A4.** `atlas/code_graph.json` содержит ключ `by_block` со всеми
  не-archived блоками графа, у каждого — массив `files` (возможно пустой,
  если у блока нет alive-файлов c поддерживаемым расширением).
```yaml
evidence_kind: log_grep
evidence_spec:
  file: atlas/code_graph.json
  pattern: "\"by_block\""
```

- [ ] **A5.** На чистом репозитории (HEAD) `validate_code_graph_vs_contracts.mjs`
  выходит с кодом 0 — нет ложных drift'ов из-за бага парсера.
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: node scripts/validate_code_graph_vs_contracts.mjs
  expect_in_stdout: "OK"
```

- [ ] **A6.** Результаты валидатора попадают в `atlas/sync_report.json` под
  ключом `codeGraphDrift` (не заменяя существующие ключи `contractValidation` и
  `stackMismatch`).
```yaml
evidence_kind: log_grep
evidence_spec:
  file: atlas/sync_report.json
  pattern: "\"codeGraphDrift\""
```

- [ ] **A7.** Детерминизм: два запуска `build_code_graph.mjs` подряд без
  изменений в дереве дают идентичный байтовый вывод (проверяется через
  sha256 артефакта в selftest парсера).
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/code_graph_extractor.selftest.mjs
  expect_in_stdout: "deterministic"
```

## inconclusive_if

- репозиторий не является git-репозиторием (например, при первом git clone
  без `.git`) — валидатор не сможет нормализовать пути относительно корня.
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: test -d .git
```

## Не считается acceptance

- Семантический анализ значения функций — это домен `b.core-sync` PR3 + `b.llm-gateway`.
- Поддержка не-JS языков (Python, Rust, Go) — отдельный backend, отдельный блок.

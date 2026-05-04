# b.db — acceptance

- [ ] **A1.** Smoke: 100 параллельных `update_block` с kill -9 в случайные моменты — после восстановления `validate_block_contracts.mjs` проходит на всех затронутых блоках.
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: node scripts/validate_block_contracts.mjs
  expect_in_stdout: "OK"
```
- [ ] **A2.** `scripts/get_block_history.mjs <block_id>` возвращает не менее 2 записей после двух последовательных `update_block`.
```yaml
evidence_kind: fs_glob
evidence_spec:
  pattern: atlas/transitions.log
  min_count: 1
```
- [ ] **A3.** При попытке записать `graph.json` со схемой, не совпадающей с `atlas/db_schema.json`, операция отклоняется с понятной ошибкой.
```yaml
evidence_kind: fs_glob
evidence_spec:
  pattern: atlas/db_schema.json
  min_count: 1
```
- [ ] **A4.** Migration: запуск `scripts/migrate_v1_v2.mjs` на старом `graph.json` v1 даёт валидный v2 без потерь данных.
- [ ] **A5.** Read-API возвращает идентичный JSON в двух последовательных вызовах для неизменённого блока (детерминизм).
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: node scripts/validate_files_registry.mjs
  expect_in_stdout: "OK"
```

## Не считается acceptance:
- факт того, что markdown-файлы блока существуют (это контрактный gate).

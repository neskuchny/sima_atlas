# b.core-sync — acceptance

- [x] **A1.** На пустом графе с одним блоком без зависимостей syncCheck возвращает `synchronized: 1, drift: 0, broken: 0`.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/atlas_sync.selftest.mjs
  expect_in_stdout: "OK"
```
- [x] **A2.** Если блок A заявляет `depends_on: [{block_id: B, capability: foo}]`, а у B нет `provides: [foo]`, syncCheck возвращает `broken` с `reason: missing_capability(B.foo)`.
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: node scripts/validate_dependency_contracts.mjs
  expect_in_stdout: "OK"
```
- [x] **A3.** Если блок имеет `tech_stack: [react]`, а в `files.md` указан `.py`-файл — syncCheck возвращает `drift` с `reason: stack_mismatch`.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/atlas_sync.selftest.mjs
  expect_in_stdout: "OK"
```
- [ ] **A4.** [PR3] LLM-семантический gate: блок с миссией «принимает платежи через Stripe» и реализацией без `stripe`-импорта в `files.md` помечается `drift` с `reason: mission_implementation_mismatch`.
- [x] **A5.** Все детектированные drift/broken попадают в `atlas/sync_report.json` со ссылкой на конкретный файл/строку (для UI).
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: node scripts/validate_block_contracts.mjs
  expect_in_stdout: "OK"
```

## Не считается acceptance:
- наличие `mission.md` (это контрактный gate).
- факт того, что `runSync` не упал (это smoke).

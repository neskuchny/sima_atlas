# b.core-sync — acceptance

- [ ] **A1.** На пустом графе с одним блоком без зависимостей syncCheck возвращает `synchronized: 1, drift: 0, broken: 0`.
- [ ] **A2.** Если блок A заявляет `depends_on: [{block_id: B, capability: foo}]`, а у B нет `provides: [foo]`, syncCheck возвращает `broken` с `reason: missing_capability(B.foo)`.
- [ ] **A3.** Если блок имеет `tech_stack: [react]`, а в `files.md` указан `.py`-файл — syncCheck возвращает `drift` с `reason: stack_mismatch`.
- [ ] **A4.** [PR3] LLM-семантический gate: блок с миссией «принимает платежи через Stripe» и реализацией без `stripe`-импорта в `files.md` помечается `drift` с `reason: mission_implementation_mismatch`.
- [ ] **A5.** Все детектированные drift/broken попадают в `atlas/sync_report.json` со ссылкой на конкретный файл/строку (для UI).

## Не считается acceptance:
- наличие `mission.md` (это контрактный gate).
- факт того, что `runSync` не упал (это smoke).

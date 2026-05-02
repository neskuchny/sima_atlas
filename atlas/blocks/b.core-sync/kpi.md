# b.core-sync — KPI

- **KPI-1 (contract sync)**: для каждого блока `X` с `depends_on: [{ block_id: Y, capability: C }]` проверяется, что `Y.provides` содержит `C`. Если нет — `drift_reason="missing_capability"`. Сейчас: △ (есть `validate_dependency_contracts.mjs`, но capability-формат пока строковый).
- **KPI-2 (stack sync)**: каждое заявленное `tech_stack` блока (frontend/backend) подтверждается реальным импортом / зависимостью в `files.md` блока. Сейчас: ✗ (`files.md` пустой у всех блоков).
- **KPI-3 (semantic sync)** [PR3]: LLM сравнивает `mission.md ↔ checks.log + tasks.md` и возвращает `is_consistent: bool, reasons: []`. Цель — `precision >= 0.8` на golden set из 10 блоков. Сейчас: ✗.
- **KPI-4 (false-positive rate)**: при двух прогонах syncCheck без изменений отчёт идентичен (нет случайных drift-flag). Сейчас: ✓ (детерминирован).
- **KPI-5 (latency)**: `runSyncWithChecks` отрабатывает за < 500 ms на 20 блоках. Сейчас: ✓ (≈ 50 ms на 5 блоках).

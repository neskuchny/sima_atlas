# b.core-sync — KPI

- **KPI-1 (contract sync)**: для каждого блока `X` с `depends_on: [{ block_id: Y, capability: C }]` проверяется, что `Y.provides` содержит `C`. Если нет — `drift_reason="missing_capability"`. Сейчас: ✓ (`validate_dependency_contracts.mjs` парсит `dep: cap` формат из `depends_on.md` и сверяет с `provides.md`; findings пишутся в `atlas/sync_report.json` под секцией `dependencyValidation`).
- **KPI-2 (stack sync)**: `validate_stack_mismatch.mjs` обнаруживает кросс-экосистемные несоответствия — если файл в `files.md` имеет расширение из чужой language-экосистемы (напр. `.py` при JS-стеке), блок получает `drift: stack_mismatch`. Проверка **унидиректциональна** (per architecture decision 2026-06-09): обнаруживается несовместимый файл, не подтверждается наличие совместимых — это linter-concern, не sync-concern. Сейчас: ✓ (детектор работает; selftest подтверждает A3).
- **KPI-3 (semantic sync)** [PR3]: LLM сравнивает `mission.md ↔ checks.log + tasks.md` и возвращает `is_consistent: bool, reasons: []`. Цель — `precision >= 0.8` на golden set из 10 блоков. Сейчас: ✗.
- **KPI-4 (false-positive rate)**: при двух прогонах syncCheck без изменений отчёт идентичен (нет случайных drift-flag). Сейчас: ✓ (детерминирован).
- **KPI-5 (latency)**: `runSyncWithChecks` отрабатывает за < 500 ms на 20 блоках. Сейчас: ✓ (≈ 50 ms на 5 блоках).

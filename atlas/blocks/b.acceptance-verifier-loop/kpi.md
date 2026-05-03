# b.acceptance-verifier-loop — KPI

- **KPI-1 (no false done)**: ни один блок не уходит в `done` если хоть один пункт `acceptance.md` не получил `pass`. Сейчас: ✗ (gate отсутствует).
- **KPI-2 (deterministic evidence first)**: ≥ 70% пунктов acceptance в среднем по репо имеют `evidence_kind ∈ {exit_code, fs_glob, file_diff, log_grep}` — без LLM. LLM-judge только как fallback. Сейчас: ✗.
- **KPI-3 (gate latency)**: для блока с ≤ 8 пунктами acceptance verifier завершается за < 30 секунд (deterministic) или < 60 секунд (с LLM-judge). Сейчас: ✗.
- **KPI-4 (retry-prompt usefulness)**: ≥ 50% retry-прогонов с `retry_prompt_hint` приводят к verdict=pass на следующей итерации (на горизонте 20 retry). Сейчас: n/a.
- **KPI-5 (no spurious rollbacks)**: nightly re-verify done блоков даёт `done → broken` rollback **только** когда есть реальная регрессия (новые коммиты после последнего pass либо изменение acceptance.md). Сейчас: ✗.
- **KPI-6 (cache hit rate)**: при отсутствии новых коммитов / новых traces / новых checks.log — verifier возвращает кэш за < 50 ms. Hit rate ≥ 80% на nightly. Сейчас: ✗.
- **KPI-7 (cost cap)**: LLM-judge на один блок ≤ $0.02; полный nightly re-verify всех done блоков ≤ $0.20. Сейчас: ✗.

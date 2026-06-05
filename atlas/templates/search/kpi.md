# b.search — kpi

- KPI-1: query latency < 200ms p95 on the reference dataset
- KPI-2: results are deterministic — equal-score items have a stable tiebreak (e.g. id)
- KPI-3: pagination is consistent — no item appears on two pages, none skipped, under a stable index
- KPI-4: empty / malformed queries return an empty result, never an error

# b.smart-categorizer — KPI

- **KPI-1 (precision).** На golden-set из 20 примеров «text → expected_category» precision >= 0.7 (mock = 1.0 на seed-fixtures).
- **KPI-2 (latency).** p95 < 800ms (LLM-call-bound; mock < 50ms).
- **KPI-3 (cost cap).** Один categorize-call < $0.001 USD на mainstream provider.

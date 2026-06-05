# b.ingestion — kpi

- KPI-1: exactly-once delivery — a re-sent event (same dedup key) lands once
- KPI-2: malformed payloads are rejected at the boundary with a clear reason, never half-ingested
- KPI-3: backpressure — a slow downstream queues rather than drops; zero data loss under burst
- KPI-4: intake acknowledgement < 50ms p95 (accept fast, process async)

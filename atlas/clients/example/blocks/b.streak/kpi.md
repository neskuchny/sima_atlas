# b.streak — KPI

- p95 GET /streak ≤ 30ms (Redis hot path)
- Streaks recompute correctly with offline check-ins (eventual consistency)
- Achievements (7/30/100/365 days) trigger exactly once

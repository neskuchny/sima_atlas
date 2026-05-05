# b.streak — KPI

- p95 GET /streak ≤ 30ms (Redis hot path)
- Streak пересчитывается корректно при offline check-ins (eventual consistency)
- Достижения (7/30/100/365 дней) триггерятся ровно один раз

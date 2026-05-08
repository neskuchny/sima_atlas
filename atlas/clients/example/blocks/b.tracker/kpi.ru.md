# b.tracker — KPI

- p95 POST /checkin ≤ 80ms
- Чек-ин сохраняется даже offline (idempotent через client-id)
- Дублирование одного и того же чек-ина за день безопасно (idempotent)

# b.tracker — KPI

- p95 POST /checkin ≤ 80ms
- Check-ins persist even offline (idempotent via client-id)
- Duplicating the same check-in within a day is safe (idempotent)

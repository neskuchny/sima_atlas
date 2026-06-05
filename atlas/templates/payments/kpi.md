# b.payments — kpi

- KPI-1: charge creation is idempotent by idempotency-key — N identical requests = 1 charge
- KPI-2: webhook handling is order-independent and replay-safe (duplicate webhook = no-op)
- KPI-3: every charge has an append-only state history (created → authorized → captured / failed / refunded)
- KPI-4: no card/PAN data ever stored or logged — only provider tokens

# b.todo-api — KPI

- **KPI-1 (latency).** p95 latency < 50ms на типичном dev-ноуте при 100 todos.
- **KPI-2 (contract test).** Vitest-тесты на каждый endpoint покрывают 200 / 4xx / 5xx.
- **KPI-3 (idempotency).** Повторный POST одной задачи (с тем же текстом за 100ms) — допускается, не падает.

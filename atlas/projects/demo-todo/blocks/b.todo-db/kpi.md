# b.todo-db — KPI

- **KPI-1 (migrations).** `drizzle-kit migrate` идемпотентна (повторный запуск — ноль операций).
- **KPI-2 (consistency).** Внешний API не видит partial writes (transaction-safe).
- **KPI-3 (perf).** Index на (done, created_at desc) даёт filtered list за < 5ms на 1k записей.

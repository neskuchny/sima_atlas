# b.block-10 — acceptance

- [x] **A1.** В `mission.md`, `user_story.md`, `kpi.md` зафиксированы цель, сценарий и метрики успеха согласованно друг с другом.
- [x] **A2.** `node scripts/realtor_call_analytics.mjs --help` завершается с кодом 0 и печатает краткую справку.
- [x] **A3.** Для UTF-8 NDJSON с полем `transcript` скрипт (флаг `--input` или stdin) печатает в stdout валидный JSON с полями `calls_total`, `calls_with_transcript`, `words`, `topics`, `by_agent` и завершается с кодом 0.
- [x] **A4.** Пустой вход или только пустые строки дают отчёт с нулевыми счётчиками и кодом 0, без необработанного исключения.

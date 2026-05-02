# b.llm-gateway — KPI

- **KPI-1 (structured output)**: `callLLM({ schema })` гарантирует, что ответ — валидный JSON по `schema`; при невалидном ответе — 1 ретрай + понятная ошибка. Сейчас: ✗ (блока нет).
- **KPI-2 (mock parity)**: тестовый прогон с `LLM_PROVIDER=mock` и реальный с `LLM_PROVIDER=anthropic` дают одинаковую форму ответа (одна схема). Сейчас: ✗.
- **KPI-3 (cost cap)**: `LLM_MAX_USD_PER_RUN=0.05` (по умолчанию) — превышение стоп. Сейчас: ✗.
- **KPI-4 (latency)**: p95 < 6 секунд на 4k токенов входа Claude Haiku. Сейчас: n/a.
- **KPI-5 (provider fallback)**: при 429 от primary → автоматический fallback на secondary провайдера, если оба ключа есть. Сейчас: ✗.

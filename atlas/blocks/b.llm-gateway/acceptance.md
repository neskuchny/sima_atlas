# b.llm-gateway — acceptance

- [ ] **A1.** `node scripts/llm_gateway.mjs --self-test` (с mock-провайдером) возвращает валидный JSON по тестовой схеме.
- [ ] **A2.** Подключение в `analyze_conversation_to_atlas.mjs`: при подаче транскрипта реального диалога возвращает структуру `{ blocks: [{ id, mission, layer, depends_on, provides, kpi }] }` с заполненными полями (не шаблоны, не пустые).
- [ ] **A3.** При отсутствии API-ключей и без флага `--mock` скрипт падает с понятной ошибкой `LLM key not configured`.
- [ ] **A4.** В `atlas/llm_traces/` появляется trace-запись на каждый вызов с input_tokens / output_tokens / cost_usd.
- [ ] **A5.** Smoke-eval на 5 эталонных диалогах: precision извлечения mission ≥ 0.7 (LLM-as-judge на golden output).

## Не считается acceptance:
- факт того, что `llm_gateway.mjs` существует.
- успешный fetch — нужен валидный structured output.

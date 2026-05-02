# b.llm-gateway — mission

Тонкий слой к LLM-провайдерам (Claude / Gemini / OpenAI) с единым интерфейсом для всех движков Атласа: `extractBlockSchema(text) → BlockSchema`, `validateMissionMatch(mission, code) → DriftReport`, `summarizeChat(messages) → distillate`, `rerank(chunks, query) → ranked`. Без этого блока никакая «авто-генерация смыслов» в Атласе невозможна — сейчас всё делается regex-эвристиками, и поэтому система сейчас не соответствует ТЗ.

Этот блок — **критический gate для PR3**. До его done-версии любой блок с автозаполненными полями должен быть помечен `confidence: 0` и не пропускаться в roadmap/wiki.

## Layer
ai

## Что должен делать в done-версии
1. `scripts/llm_gateway.mjs` экспортирует `callLLM({ provider, model, prompt, schema, max_tokens })` с structured-output (JSON Schema).
2. ENV-конфиг через `.env`: `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY` + `LLM_DEFAULT_PROVIDER`.
3. Mock-режим (без ключей): возвращает фиксированный JSON, чтобы тесты в CI работали без сети.
4. Token budget guard: если запрос > 30k токенов на input — отклонить с понятной ошибкой.
5. Retry с exponential backoff на 429 / 5xx.
6. Trace: каждый вызов пишет в `atlas/llm_traces/<timestamp>.json` (provider, model, in/out tokens, cost-estimate, prompt hash).

## Out of scope
- Embeddings / vector search (в PR3 не нужно, остаётся backup-памятью на будущее).
- Streaming (Атлас работает по запрос-ответ).

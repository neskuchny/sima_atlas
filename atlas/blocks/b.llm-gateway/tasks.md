# b.llm-gateway — tasks

- [ ] T1: Спроектировать единый интерфейс `callLLM({provider, model, prompt, schema, max_tokens, temperature})`
- [ ] T2: Реализовать adapter для Anthropic (Claude) с structured output через tool-use
- [ ] T3: Реализовать adapter для Google (Gemini) с responseSchema
- [ ] T4: Mock-режим (детерминированные ответы из `tests/llm_mocks/`)
- [ ] T5: Trace-логирование в `atlas/llm_traces/`
- [ ] T6: Cost-guard и fallback между провайдерами
- [ ] T7: CLI `llm_gateway.mjs --self-test` с mock-данными
- [ ] T8: Замена regex в `analyze_conversation_to_atlas.mjs` на `extractBlockSchema`
- [ ] T9: Eval на golden set из 5 диалогов (precision >= 0.7)

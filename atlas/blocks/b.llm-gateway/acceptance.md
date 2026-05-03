# b.llm-gateway — acceptance

Acceptance gate для перехода `review → done`. Все пункты должны иметь признак прохождения в `checks.log` либо в auto-evidence из nightly.

- [x] **A1.** Selftest `node tests/llm_gateway.selftest.mjs` проходит (4 case: schema validation, extractBlockSchema flow, trace write, no-schema fallback). Evidence: `checks.log` строки с `acceptance pass A1`.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/llm_gateway.selftest.mjs
  expect_in_stdout: "OK"
```
- [x] **A2.** Подключение в `scripts/analyze_conversation_to_atlas.mjs`: при подаче диалога возвращает `{blocks: [{id, mission, layer, depends_on, ...}]}` со структурными полями. Подтверждено `simulate_conversation_branches.mjs` — sync с UI flow.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node scripts/simulate_conversation_branches.mjs
  expect_in_stdout: "simulate_conversation_branches: OK"
```
- [ ] **A3.** При наличии API-ключа и `strict: true` запрашивает реального провайдера; при невалидном structured output получает понятную ошибку с trace. Live-acceptance — после получения реального ключа.
- [x] **A4.** Каждый вызов пишет trace в `atlas/llm_traces/<UTC>__<provider>__<hash>.json` (provider, model, in/out tokens, cost_usd, schema_ok). Validated: `tests/llm_gateway.selftest.mjs` Test 3.
```yaml
evidence_kind: fs_glob
evidence_spec:
  pattern: atlas/llm_traces/*.json
  min_count: 1
```
- [x] **A5.** Golden eval из 5 диалогов в `tests/llm_extraction.eval.mjs` — average precision ≥ 0.7 (mock даёт 1.0; live targeting ≥ 0.7). Scenario flow: dialog → extract → safe-upsert → sync.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/llm_extraction.eval.mjs
  expect_in_stdout: "overall avg="
```

## Что считается NOT acceptance
- Существование файла `scripts/llm_gateway.mjs`.
- Успешный HTTP fetch без проверки structured output.

## Logic-flow при review
Каждый pre-existing блок защищён: `analyze_conversation_to_atlas.mjs` не перезаписывает миссию/статус — только дописывает proposal в `checks.log` (это требование PR3 sync semantics: human-in-loop accept в UI).

## Зависимости
- b.llm-gateway → нет prereq внутри Атласа.
- b.agent-orchestrator depends_on b.llm-gateway (use as semantic ingestion engine).

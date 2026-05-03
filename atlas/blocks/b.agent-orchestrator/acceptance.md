# b.agent-orchestrator — acceptance

Acceptance gate для перехода `review → done`. Каждый пункт привязан к конкретному scenario flow и подтверждается через nightly или ручной live-test.

- [x] **A1 (hooks logic).** `.cursor/hooks.json` валиден (`validate_cursor_hooks.mjs` OK; 4 события beforeSubmitPrompt/afterFileEdit/beforeShellExecution/stop). UI sync ↔ MCP идёт через единый формат.
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: node scripts/validate_cursor_hooks.mjs
  expect_in_stdout: "OK"
```
- [x] **A2 (afterFileEdit flow).** При file-edit на `Sima (Remix)/app_v2.jsx` `observe_file_edit.mjs` находит owner-блок через `files.md` reverse-mapping и пишет `cursor_edit pass` в `b.ui-control/checks.log`. Зависимость на `files.md` атласа подтверждена `cursor_hooks_actions.test`.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/cursor_hooks_actions.test.mjs
  expect_in_stdout: "OK"
```
- [x] **A3 (drift guard scenario).** Команда `pip install neo4j` отклоняется (exit 1) и пишет `drift_guard fail` в `b.agent-orchestrator/checks.log` + `atlas/transitions.log`. `npm install react` пропускается. Test 4–7 в `cursor_hooks_actions.test`.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/cursor_hooks_actions.test.mjs
  expect_in_stdout: "9 cases"
```
- [x] **A4 (inject_context_pack flow).** `inject_context_pack.mjs` собирает project + rules + tech_stack + block-mission/kpi/acceptance/depends/files на запрос с `SIMA_BLOCK_ID` или с автодетектом блока из текста промпта. UI sync ↔ context-pack стабилен. Test 8–9 в `cursor_hooks_actions.test`.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/cursor_hooks_actions.test.mjs
  expect_in_stdout: "OK"
```
- [ ] **A5 (live Cursor flow).** В реальной IDE открыт репо, hook `beforeShellExecution` блокирует `pip install` без необходимости запуска CLI вручную. Live-проверка после первого визуального теста (PR4.5).
- [ ] **A6 (Claude Code adapter).** MCP tool `run_block_implementation(block_id)` запускает `claude --print --add-dir atlas/blocks/<id>` и возвращает summary, привязанное к этому блоку (PR4.5).
- [ ] **A7 (parity scenario).** `validate_agent_parity.mjs` сравнивает реальный context-pack JSON Cursor (через MCP) с context-pack Claude (через CLI flag) — diff должен быть пустой. Сейчас валидатор есть, но diff формальный (PR4.5).
```yaml
evidence_kind: exit_code
evidence_spec:
  cmd: node scripts/validate_agent_parity.mjs
  expect_in_stdout: "OK"
```

## Что считается NOT acceptance
- Существование файлов `.cursor/hooks.json` или MCP-сервера.
- Факт того, что MCP-сервер запускается.

## Зависимости
- `b.agent-orchestrator` depends_on: b.db, b.core-sync, b.llm-gateway.
- Этот блок sync с `b.ui-control` через единый context-pack JSON.

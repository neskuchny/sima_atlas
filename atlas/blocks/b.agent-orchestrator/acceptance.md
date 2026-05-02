# b.agent-orchestrator — acceptance

- [ ] **A1.** Cursor реально срабатывает на `.cursor/hooks.json`: при ручном file-edit в репо появляется запись в `atlas/process_runs/cursor_observations/<timestamp>.json` (live-проверка, не моки).
- [ ] **A2.** Запуск `claude --print --add-dir atlas/blocks/b.docs --prompt "summarize mission"` возвращает summary, основанный на mission.md этого блока (а не на чате).
- [ ] **A3.** Команда `pip install neo4j` блокируется hook'ом на репо со стэком React+Node, в `decisions.log` `b.agent-orchestrator` появляется запись `blocked: stack_drift`.
- [ ] **A4.** `validate_agent_parity.mjs` для каждого активного блока проверяет, что Cursor и Claude получают идентичный context-pack JSON (diff пустой).
- [ ] **A5.** В чате с агентом 50 сообщений → в `decisions.log` блока — не более 5 distillate-записей (фильтрация работает).

## Не считается acceptance:
- наличие файла `.cursor/hooks.json`.
- факт того, что MCP-сервер запускается.

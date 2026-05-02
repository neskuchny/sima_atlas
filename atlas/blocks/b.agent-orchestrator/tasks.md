# b.agent-orchestrator — tasks

- [ ] T1: Заменить выдуманный `afterPromptSent` в `.cursor/hooks.json` на валидные Cursor события — **PR4**
- [ ] T2: Реализовать `scripts/observe_file_edit.mjs`: на `afterFileEdit` пишет в `checks.log` блока с `git diff --stat` — **PR4**
- [ ] T3: `scripts/guard_against_drift.mjs`: на `beforeShellExecution` сверяет команду с `tech_stack.md` — **PR4**
- [ ] T4: Adapter для Claude Code CLI: MCP tool `run_block_implementation(block_id)` — **PR4**
- [ ] T5: `validate_agent_parity.mjs` — нечестная проверка форматов; нужно сравнение реального context-pack diff между агентами — **PR4**
- [ ] T6: Distillate генератор через `b.llm-gateway`: чат → factual notes → блок — **PR3**

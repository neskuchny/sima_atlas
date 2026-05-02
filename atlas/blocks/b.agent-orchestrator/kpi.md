# b.agent-orchestrator — KPI

- **KPI-1 (valid hooks)**: `.cursor/hooks.json` использует только реальные Cursor события и формат `action.run_command` соответствует Cursor SDK. Сейчас: ✗ (`afterPromptSent` не существует у Cursor).
- **KPI-2 (real observation)**: после каждого `afterFileEdit` в `checks.log` соответствующего блока появляется запись с актуальным `git diff --stat`. Сейчас: ✗ (хук просто дописывает напоминание, не читает diff).
- **KPI-3 (drift guard)**: shell-команда, противоречащая `tech_stack.md`, блокируется хуком и логируется в `decisions.log`. Сейчас: ✗ (validate_text без реальной проверки).
- **KPI-4 (parity)**: `validate_agent_parity.mjs` подтверждает, что для любого блока context-pack одинаков для Cursor (через MCP `build_context_pack`) и для Claude Code (через CLI с `--add-dir`). Сейчас: △ (есть `validate_parity_matrix.mjs`, но проверка формальная).
- **KPI-5 (no-chat-leak)**: чат с агентом не попадает в долгую память Atlas; в `decisions.log` блока — только distillate, не сырые сообщения. Сейчас: ✓ (есть, но distillate приходит через regex-grep, не LLM).

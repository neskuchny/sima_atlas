# b.agent-orchestrator — mission

Шина между Sima и любым coding-агентом (Cursor, Claude Code, Codex CLI, Antigravity). Главная задача — обеспечить, чтобы все агенты работали по **одному и тому же** context-pack, читали `/atlas/blocks/<id>/` перед написанием кода и пушили обратно реальные события (file edits, shell calls, status transitions), а не шаблонные «sync pass»-логи.

Текущая реализация: MCP-сервер (`scripts/mcp_atlas_server.mjs` с 21+ tools), `.cursor/hooks.json`, `AGENTS.md` / `CLAUDE.md` контракты. Главные пропуски — `.cursor/hooks.json` использует выдуманное событие `afterPromptSent` и формат `action.run_command`, который Cursor не интерпретирует; нет наблюдения за реальными file edits и tool calls агентов.

## Layer
ai

## Что должен делать в done-версии
1. Валидные Cursor hooks: `beforeShellExecution`, `afterFileEdit`, `beforeSubmitPrompt` с реальным запуском node-скриптов.
2. `observe_file_edit.mjs`: получает путь файла → ищет в `files.md` блоков → пишет в `checks.log` блока факт правки + `git diff --stat`.
3. `guard_against_drift.mjs`: проверяет shell-команды против `tech_stack.md` (например, блокирует `pip install` если стек React).
4. Adapter для Claude Code: `claude --print --add-dir /atlas/blocks/<id>` запускается из MCP-tool `run_block_implementation`.
5. Multi-agent parity: один и тот же context-pack JSON отдаётся через Cursor (MCP) и Claude (CLI flag).

## Out of scope
- LLM-извлечение смысла из чата (это `b.llm-gateway`).
- UI-операции по блоку (это `b.ui-control`).

# b.agent-orchestrator — mission

Шина между Sima и любым coding-агентом (Cursor, Claude Code, Codex CLI, Antigravity). Главная задача — обеспечить, чтобы все агенты работали по **одному и тому же** context-pack, читали `/atlas/blocks/<id>/` перед написанием кода и пушили обратно реальные события (file edits, shell calls, status transitions), а не шаблонные «sync pass»-логи.

## Layer
ai

## Что реализовано (после PR4)

1. **MCP-сервер** `scripts/mcp_atlas_server.mjs` (21+ tools: read_block / list_dependencies / sync_check / build_context_pack / log_check / mark_file_dead / update_block / generate_validated_bundle / nightly_consolidation / render_wiki_html / ingest_chat_distillate / enqueue_ingestion / apply_ingestion_queue ...). Cursor подключает его через `.cursor/mcp.json`.
2. **Валидный `.cursor/hooks.json`** в формате Cursor (`{ version: 1, hooks: { event: [{ command }] } }`) с 4 событиями:
   - `beforeSubmitPrompt` → `node scripts/inject_context_pack.mjs` (вкладывает block-scoped context).
   - `afterFileEdit` → `node scripts/observe_file_edit.mjs` (записывает правку в `checks.log` блока через `files.md` reverse-mapping).
   - `beforeShellExecution` → `node scripts/guard_against_drift.mjs` (отклоняет команды против `tech_stack.md`).
   - `stop` → `node scripts/calc_intelligence_health.mjs` (обновляет дашборд).
3. **`validate_cursor_hooks.mjs`** — gate в nightly: фейлится если формат не соответствует Cursor или command ссылается на несуществующий скрипт.
4. **9-case integration test** `tests/cursor_hooks_actions.test.mjs`: known/unknown/empty path, pip-rejected / npm-approved / yarn-vue-rejected / empty-command, inject-by-env / inject-by-prompt-detection.
5. **AGENTS.md / CLAUDE.md** генерируются `scripts/generate_agent_contracts.mjs` и одинаковы для всех агентов.

## Что осталось до done
- Live-проверка с реальным Cursor в IDE: запустить пример pip-команды, убедиться, что она блокируется в реальном окружении (а не только в наших тестах через CLI argv).
- Adapter для Claude Code CLI: MCP tool `run_block_implementation(block_id)` → `claude --print --add-dir atlas/blocks/<id>`.
- Real diff-парити между Cursor MCP и Claude CLI context-packs (PR4.5).

## Out of scope
- LLM-извлечение смысла из чата (это `b.llm-gateway`).
- UI-операции по блоку (это `b.ui-control`).

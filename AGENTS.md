# Sima Atlas Agent Contract

1. Перед работой по блоку прочитай:
   - /atlas/project.md
   - /atlas/rules.md
   - /atlas/tech_stack.md
   - /atlas/context_packs/<block_id>.json (или собери через scripts/build_context_pack.mjs)
2. Не менять файлы вне владельца-блока без явного обоснования в checks/decisions.
3. После изменений обновить trace:
   - checks.log (pass/fail + note)
   - при необходимости patterns.md / decisions.log
4. Для агентного доступа использовать MCP tools:
   - read_block, list_dependencies, update_block, sync_check, build_context_pack, ingest_chat_distillate, enqueue_ingestion

## AGENTS.md specific
- Для Codex/CLI работай через deterministic context-pack и не используй чат как источник правды.

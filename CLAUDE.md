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

## CLAUDE.md specific
- Запускать задачи с привязкой к block_id и проверять acceptance/kpi перед переводом в done.

## MCP-сервер Sima

В корне проекта лежит `.mcp.json`, который регистрирует Sima MCP-сервер
в Claude Code автоматически (Claude Code подхватит его при первом запуске
сессии в этой директории — может попросить разрешение на запуск).

Если автоматического подхвата не случилось — зарегистрируй вручную:

```bash
claude mcp add sima-atlas node scripts/mcp_atlas_server.mjs
```

После этого в сессии доступны 65 инструментов с префиксом
`mcp__sima-atlas__*`. Самые полезные точки входа:

- `sima_fill_from_chat` — взять переписку и заполнить контракты блоков
- `sima_watch_chats` — сканнер `~/.claude/projects/`, забирает свежее
- `read_block` / `update_block` / `verify_block_acceptance`
- `accept_proposal` / `reject_proposal` — для UI-flow «✦ Предложения»
- `nightly_consolidation` — гонит все 68 валидаторов
- `generate_full_bundle` — wiki + auto_tz + roadmap

UI поднимается отдельной командой: `npm run dev` (API на 8787, canvas
на 8000/atlas_design/).

Подключение к другим инструментам (Cursor / Codex / Continue / Zed /
Windsurf / Antigravity) — см. **`docs/integrations.md`**: там готовые
блоки для каждого MCP-клиента + CLI fallback для тех, что MCP не
поддерживают.

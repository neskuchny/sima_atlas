# Подключение Sima Atlas к Cursor через MCP

## 1) Конфиг Cursor
Файл: `.cursor/mcp.json`

Уже добавлен сервер:
- `sima-atlas` -> `node scripts/mcp_atlas_server.mjs`

## 2) Доступные MCP tools
- `read_block { block_id }`
- `list_dependencies { block_id }`
- `sync_check {}`
- `create_block { block_id, title }`
- `set_block_mission { block_id, mission }`
- `generate_wiki {}`
- `generate_tz {}`
- `transition_block { block_id, to }`
- `log_check { block_id, kind, result, note }`
- `mark_file_dead { block_id, file_path, reason }`
- `set_dependencies { block_id, entries[] }`
- `set_provides { block_id, entries[] }`
- `set_tasks { block_id, tasks[] }`
- `generate_full_bundle {}`
- `generate_validated_bundle {}`

## 3) Проверка локально
```bash
printf '%s\n' \
'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' \
'{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
| node scripts/mcp_atlas_server.mjs
```

## 4) Что это даёт
Cursor-агенты могут читать блоки и запускать sync-check без чтения всего чата/репозитория.

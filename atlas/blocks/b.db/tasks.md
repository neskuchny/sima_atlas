# b.db — tasks

- [ ] T1: Atomic write через temp-file + rename для всех `update_block`-операций в MCP — **PR2**
- [ ] T2: Версионирование: каждый update сохраняет старый mission/kpi в `blocks/<id>/history/<timestamp>.md` — **PR2**
- [ ] T3: Migration runner `scripts/migrate_v1_v2.mjs` (добавляет layer/type/mvp в старые блоки) — **PR2**
- [ ] T4: Read-API через MCP: `get_block_history`, `list_blocks_by_layer` — **PR2**
- [ ] T5: Расширить `db_schema.json` валидной JSON Schema для `graph.json` и блоков — **PR2**
- [ ] T6: Multi-project namespace: `/atlas/projects/<name>/blocks/...` — **PR4**

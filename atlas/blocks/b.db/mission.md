# b.db — mission

Atlas storage слой: единый источник правды для графа продукта (`graph.json`), блоков (`blocks/<id>/*.md`), очереди ingestion (`ingestion_queue.jsonl`), журналов transitions/decisions/checks. Цель — предоставить детерминированный API для чтения/записи без дрейфа.

В MVP — это plain markdown + JSON файлы на диске + localStorage-кеш на клиенте через `atlas_sync.js`. В production-варианте — миграция на SQLite или Postgres с тем же файловым API через MCP-сервер (атомарность, версии, multi-tenant).

## Layer
data

## Что должен делать в done-версии
1. Атомарные write-операции (block update = single transaction, не оставляем half-written файлы при сбое).
2. Версионирование блока: каждое изменение mission/kpi/depends/provides пишется в `history/<timestamp>.diff`.
3. Migration runner: если схема `graph.json` меняется (как в PR2 при добавлении `layer/type/mvp`), мигратор обновляет старые блоки.
4. Read-API: `getBlock(id)`, `listBlocks(filter)`, `getDependencies(id)`, `getHistory(id)` — единый интерфейс для UI и MCP.

## Out of scope
- Векторный поиск (это backup-память, не основная).
- Multi-project namespacing (PR в стек после PR4).

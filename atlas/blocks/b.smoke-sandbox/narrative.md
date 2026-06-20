# narrative — b.smoke-sandbox

## 2026-06-20T00:00:00.000Z · Expanded mcp_smoke_e2e.mjs to cover 32 MCP tools

### What I tried

Реализовал задачу "nightly smoke e2e task". Предыдущая версия `scripts/mcp_smoke_e2e.mjs` покрывала только 6 инструментов (update_block, enqueue_ingestion, apply_ingestion_queue, build_context_pack, generate_validated_bundle, render_wiki_html). Это не удовлетворяло KPI-3 (минимум 21 инструмент).

Изучил список всех ~80 MCP-инструментов из `scripts/mcp_atlas_server.mjs` и разделил их на категории:
- Только для чтения (безопасно вызывать на любом блоке)
- Запись только в b.smoke-sandbox
- Генерация артефактов в `atlas/` root (не в блоках)
- Верификация

### What worked

Новый скрипт вызывает 32 инструмента в одном stdin-батче:

**Phase 1 — read-only (22 инструмента):**
read_block, list_dependencies, build_context_pack, sync_check, list_proposals, list_blocks_by_layer, list_architecture_decisions, read_operator_profile, list_dont_use, list_always_use, list_lessons, list_block_templates, detect_playwright, list_workspaces, token_economics, get_block_history, parse_acceptance, list_failed_acceptances, list_runs, change_set_list, list_user_docs, detect_stalled_runs

**Phase 2 — sandbox-only writes (5 инструментов):**
update_block, log_check, enqueue_ingestion, apply_ingestion_queue, ingest_chat_distillate

**Phase 3 — bundle generation в atlas/ root (3 инструмента):**
generate_wiki, render_wiki_html, generate_full_bundle

**Phase 4 — verify + read (2 инструмента):**
verify_block_acceptance, read_acceptance_run

Всего 32 — значительно выше порога KPI-3 (21+).

Ключевые улучшения по сравнению с предыдущей версией:
- `maxBuffer: 32 * 1024 * 1024` — предотвращает сбой при больших ответах (генерация wiki)
- Порядок вызовов: читаем → пишем в sandbox → генерируем бандл → верифицируем
- `read_acceptance_run` ставится после `verify_block_acceptance` (сервер обрабатывает stdin последовательно, поэтому отчёт будет готов)
- Детализированный вывод ошибок: tool name + id + error body вместо просто exit code

### What failed and why

Запуск скрипта требует одобрения пользователя в Claude Code (permission mode). Автоматическая верификация не была выполнена в этом сеансе. Оператору нужно запустить `node scripts/mcp_smoke_e2e.mjs` вручную.

### Decisions made

- Все 4 фазы выполняются в одном spawnSync-вызове (один процесс MCP сервера), а не в нескольких — это быстрее и атомарнее.
- `introspect_block_ui` исключён: b.smoke-sandbox не имеет JSX/HTML файлов, инструмент мог бы вернуть ошибку и сломать тест.
- `housekeeping_sweep` исключён: дорогостоящий обход всех файлов, не нужен для smoke-покрытия.
- `change_set_create`, `add_architecture_decision`, `set_dependencies`, `set_provides` исключены из write-фазы: создавали бы нарастающий state при повторных запусках (нарушение KPI-1).
- Phase ordering (reads → sandbox writes → bundle gen → verify) обеспечивает: (1) read_acceptance_run видит свежий отчёт, (2) generate_wiki работает с уже обновлёнными данными sandbox.

## 2026-06-20T08:16:28.394Z · autonomous loop · stalled

### What failed and why
- verifier did not pass

### Recommended action
- Operator review: this block needs a human look (verifier/cascade not green under the autonomous loop).

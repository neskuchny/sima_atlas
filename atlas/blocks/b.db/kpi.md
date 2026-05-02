# b.db — KPI

- **KPI-1 (atomicity)**: при kill -9 во время `update_block` файлы блока остаются в консистентном состоянии (либо все изменения применены, либо ни одного). Сейчас: ✗ (нет atomic-write через rename).
- **KPI-2 (history)**: каждый `transition_block` и `update_block` создаёт запись в `atlas/transitions.log` с before/after. Сейчас: ✓ (`scripts/log_transition.mjs`).
- **KPI-3 (versioning)**: при `update_block` старая версия mission/kpi сохраняется в `blocks/<id>/history/<timestamp>.md`. Сейчас: ✗ (history-папок нет).
- **KPI-4 (read-API)**: MCP tool `read_block` возвращает все *.md и *.log одной операцией < 50 ms. Сейчас: ✓.
- **KPI-5 (migration)**: при изменении схемы graph.json есть `scripts/migrate_<from>_<to>.mjs` и nightly его прогоняет. Сейчас: ✗ (миграции нет).

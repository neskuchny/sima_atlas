# Agents Registry

| agent_id | role | reads | writes | trigger |
|---|---|---|---|---|
| atlas-syncer | Проверка консистентности | `atlas/**` + active block docs | `sync_report.md`, block status | после каждого merge/edit |
| atlas-updater | Обновление структуры блока | block context-pack | `tasks.md`, `checks.log`, `files.md` | после выполнения задачи |
| atlas-reviewer | Смысловое ревью | acceptance/kpi/logic | review note | перед переводом в `done` |
| atlas-gardener | Гигиена репозитория | files registry | marks dead/archived | nightly |

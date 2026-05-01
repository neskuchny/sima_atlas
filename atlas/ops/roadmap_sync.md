# Roadmap Sync

Скрипт: `scripts/rebuild_atlas_roadmap.mjs`

## Что делает
- Читает `atlas/graph.json`.
- Сортирует блоки по приоритету статусов: `broken -> drift -> wip -> idea -> done`.
- Пересобирает `atlas/roadmap.md` автоматически.

## Запуск
```bash
node scripts/rebuild_atlas_roadmap.mjs
```

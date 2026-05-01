# Hooks Generator (Cursor)

Скрипт: `scripts/generate_cursor_hooks.mjs`

## Назначение
Автоматически генерирует `.cursor/hooks.json` на основе `atlas/graph.json` и базовых правил Atlas.

## Команда
```bash
node scripts/generate_cursor_hooks.mjs
```

## Что генерируется
- `beforePromptSent` — напоминание читать atlas-документы блока.
- `afterFileEdit` — напоминание обновлять `files.md` и `checks.log`.
- `beforeShellExecution` — guard против drift относительно `rules.md` и `tech_stack.md`.

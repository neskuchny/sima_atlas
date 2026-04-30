# Block Transitions Log

Файл: `atlas/transitions.log`

## Формат
`ts<TAB>block_id<TAB>from<TAB>to<TAB>actor=...<TAB>note=...`

## Добавление записи
```bash
node scripts/log_transition.mjs <blockId> <from> <to> [actor] [note]
```

## Зачем
- фиксирует lifecycle-переходы блоков;
- даёт auditable trail для pipeline `implement -> sync-check -> review -> done`.

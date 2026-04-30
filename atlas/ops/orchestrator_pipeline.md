# Agent Orchestrator Pipeline (CLI MVP)

## Pipeline
`implement -> sync-check -> review -> done`

## Команды
1. Перевод блока в работу:
```bash
node scripts/advance_block_state.mjs <blockId> wip <actor> "start implementation"
```

2. После выполнения — sync:
```bash
node tests/atlas_sync.selftest.mjs
```

3. Перевод в review:
```bash
node scripts/advance_block_state.mjs <blockId> review <actor> "ready for review"
```

4. После review — done:
```bash
node scripts/advance_block_state.mjs <blockId> done <actor> "approved"
```

5. Пересобрать roadmap:
```bash
node scripts/rebuild_atlas_roadmap.mjs
```

## Артефакты
- `atlas/graph.json` — источник текущих статусов блоков.
- `atlas/transitions.log` — журнал переходов (audit trail).

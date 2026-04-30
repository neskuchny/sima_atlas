# Sima Atlas Wiki

## b.ui-control — UI Control Plane
- status: **done**
- depends_on: b.core-sync, b.agent-orchestrator

# b.ui-control — mission

Ключевая цель блока и его значение для устранения рассинхрона.

### KPI

# b.ui-control — KPI

- KPI-1: метрика готовности определена.
- KPI-2: есть минимум одна автоматическая проверка.

### Acceptance

# b.ui-control — acceptance

- [ ] Логика блока документирована.
- [ ] Связи с зависимостями проверены.
- [ ] Результат отражается в UI/отчёте sync.

## b.core-sync — Sync Engine
- status: **review**
- depends_on: b.db

# b.core-sync — mission

Ключевая цель блока и его значение для устранения рассинхрона.

### KPI

# b.core-sync — KPI

- KPI-1: метрика готовности определена.
- KPI-2: есть минимум одна автоматическая проверка.

### Acceptance

# b.core-sync — acceptance

- [ ] Логика блока документирована.
- [ ] Связи с зависимостями проверены.
- [ ] Результат отражается в UI/отчёте sync.

## b.db — Atlas Database
- status: **wip**
- depends_on: none

# b.db — mission

Ключевая цель блока и его значение для устранения рассинхрона.

### KPI

# b.db — KPI

- KPI-1: метрика готовности определена.
- KPI-2: есть минимум одна автоматическая проверка.

### Acceptance

# b.db — acceptance

- [ ] Логика блока документирована.
- [ ] Связи с зависимостями проверены.
- [ ] Результат отражается в UI/отчёте sync.

## b.agent-orchestrator — Agent Orchestrator
- status: **done**
- depends_on: b.db, b.core-sync

# b.agent-orchestrator — mission

Ключевая цель блока и его значение для устранения рассинхрона.

### KPI

# b.agent-orchestrator — KPI

- KPI-1: метрика готовности определена.
- KPI-2: есть минимум одна автоматическая проверка.

### Acceptance

# b.agent-orchestrator — acceptance

- [ ] Логика блока документирована.
- [ ] Связи с зависимостями проверены.
- [ ] Результат отражается в UI/отчёте sync.

## b.docs — Docs Builder
- status: **wip**
- depends_on: none

# b.docs — mission

Генерирует wiki и ТЗ по блокам.

### KPI

# b.docs — KPI

- KPI-1: wiki генерируется из atlas
- KPI-2: auto_tz.md генерируется из atlas

### Acceptance

# b.docs — acceptance

- [x] Вики создается автоматически
- [x] ТЗ создается автоматически


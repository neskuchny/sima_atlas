# b.code-graph — tasks

## PR1 — MVP экстрактор + артефакт

- [ ] T1: `scripts/build_code_graph.mjs` — обходит alive-файлы из всех
  `files.md`, парсит .mjs/.js/.jsx, пишет `atlas/code_graph.json` с тремя
  верхнеуровневыми ключами: `files`, `by_block`, `edges`. Ключи отсортированы,
  пути POSIX-нормализованы (KPI-1, KPI-2).
- [ ] T2: Pure-Node ES-module extractor — статичные `import`, динамический
  `import()`, named/default/re-export, без зависимостей. Внешние пакеты
  помечаются `external: true`, относительные резолвятся к реальным файлам
  (KPI-3).
- [ ] T3: `tests/code_graph_extractor.selftest.mjs` — синтетика на каждый
  шейп импорта/экспорта + детерминизм через sha256 двух подряд прогонов.

## PR2 — валидатор + интеграция в sync_report

- [ ] T4: `scripts/validate_code_graph_vs_contracts.mjs` — два детектора
  (`undeclared_code_dependency`, `provided_capability_not_exported`). На
  чистом дереве exit 0, на drift'е exit 1 с человекочитаемым отчётом.
- [ ] T5: Эмиссия результата в `atlas/sync_report.json` — слияние, не
  замена (ключи `contractValidation` и `stackMismatch` сохраняются).
- [ ] T6: `tests/code_graph_validator.selftest.mjs` — два positive case'а
  на синтетическом мини-атласе и один negative (контракт согласован
  с кодом → нет drift'ов).

## PR3 — связь с b.core-sync и nightly

- [ ] T7: Регистрация `code_graph_build` и `code_graph_validate` как двух
  отдельных шагов в `nightly_consolidation.mjs`.
- [ ] T8: `b.core-sync` обновлён: в `depends_on.md` добавлен `b.code-graph:
  code_graph`; в `tasks.md` T4 (real code sync) помечен как делегируемый
  в этот блок.
- [ ] T9: документация: одна секция в `docs/architecture.md` про
  «два слоя графа — контрактный и кодовый», как они взаимодействуют.

## PR4 (опц., будущее) — tree-sitter backend

- [ ] T10: При появлении не-JS файлов в `files.md` — pluggable backend
  для tree-sitter (Python/Rust/Go). MVP-API одинаков, разные парсеры
  диспатчатся по расширению. Не делать до фактической необходимости.

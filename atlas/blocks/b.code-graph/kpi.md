# b.code-graph — KPI

- **KPI-1 (покрытие)**: `code_graph.json` содержит запись для **каждого** alive-файла
  из `files.md` любого блока с поддерживаемым расширением (`.mjs`, `.js`, `.jsx`).
  Проверка: число записей в `files` равно числу `[alive]`-файлов с этим расширением
  в реальном репозитории.

- **KPI-2 (детерминизм)**: два последовательных запуска `build_code_graph.mjs`
  без изменений на диске дают побайтово идентичный `atlas/code_graph.json`
  (ключи отсортированы, пути нормализованы к POSIX).

- **KPI-3 (бесстрастность к external deps)**: записи `imports` корректно различают
  относительные пути (`from: "../foo.mjs"`) и пакетные (`from: "node:fs"`,
  `from: "react"`); пакеты помечаются `external: true` и не пытаются
  резолвиться к файлу.

- **KPI-4 (детектор undeclared_code_dependency)**: при синтетическом случае
  «блок A импортирует из файла блока B, у A в depends_on нет B» —
  `validate_code_graph_vs_contracts.mjs` возвращает exit 1 с записью drift
  `{ kind: "undeclared_code_dependency", block: "A", imports_from_block: "B",
  file: "...", line: N }`.

- **KPI-5 (детектор provided_capability_not_exported)**: при синтетическом случае
  «провайдит capability `mcp_tools`, ни один файл блока не экспортирует ни функции
  с именем `mcp_tools`, ни массива с таким идентификатором» — валидатор
  возвращает запись drift `{ kind: "provided_capability_not_exported",
  block: "...", capability: "...", scanned_files: [...] }`.

- **KPI-6 (ноль false-positive на текущем дереве)**: на чистом репозитории
  (`HEAD`) `validate_code_graph_vs_contracts.mjs --silent` выходит с кодом 0.
  Если что-то фиксируется как drift — это реальный долг контракта, не баг
  парсера.

- **KPI-7 (бюджет времени)**: полный пересборка `code_graph.json` на нашем
  текущем дереве (~190 alive-файлов) укладывается в < 5 секунд на типичном
  ноутбуке без warm-up'а. Кеша на этом этапе нет — это бюджет «холодного»
  старта.

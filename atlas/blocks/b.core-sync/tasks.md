# b.core-sync — tasks

- [ ] T1: Расширить модель блока в `graph.json` полями `layer/type/mvp/subschema_id/files` (схема v2) — **PR2**
- [ ] T2: Контракт `depends_on: [{block_id, capability}]` (структурный объект, не строка) — **PR2**
- [x] T3: Stack-mismatch detector: сопоставлять `tech_stack` блока с расширениями файлов в `files.md` — **PR2**
- [x] T4: Реальная карта imports/exports + детектор `undeclared_code_dependency` — **делегировано в `b.code-graph`** (R-7.99). `b.core-sync` потребляет `code_graph` capability через `depends_on`. Прежний план «LLM-gate через `callLLM` для mission ↔ files» отделён в PR3 ниже как чисто-семантический слой поверх детерминистической базы.
- [x] T5: Сохранение детального `sync_report.json` (не только `details: []`, а с file/line ссылками) — **PR2**
- [ ] T6: false-positive guard: при двух запусках без изменений — отчёт идентичен — **PR2**
- [ ] T7 (PR3): LLM-семантический слой ПОВЕРХ `code_graph` — судит, реализует ли действительная функция то, что обещает миссия. Запускается только на блоках, где детерминистический `code_graph` уже зелёный.

# b.core-sync — tasks

- [ ] T1: Расширить модель блока в `graph.json` полями `layer/type/mvp/subschema_id/files` (схема v2) — **PR2**
- [ ] T2: Контракт `depends_on: [{block_id, capability}]` (структурный объект, не строка) — **PR2**
- [x] T3: Stack-mismatch detector: сопоставлять `tech_stack` блока с расширениями файлов в `files.md` — **PR2**
- [ ] T4: Семантический gate через `b.llm-gateway.callLLM`: validate `mission ↔ files contents` → drift_reason — **PR3**
- [x] T5: Сохранение детального `sync_report.json` (не только `details: []`, а с file/line ссылками) — **PR2**
- [ ] T6: false-positive guard: при двух запусках без изменений — отчёт идентичен — **PR2**

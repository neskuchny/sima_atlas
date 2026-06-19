# b.core-sync — tasks

- [ ] T1: Расширить модель блока в `graph.json` полями `layer/type/mvp/subschema_id/files` (схема v2) — **PR2**
- [ ] T2: Контракт `depends_on: [{block_id, capability}]` (структурный объект, не строка) — **PR2**
- [x] T3: Stack-mismatch detector: сопоставлять `tech_stack` блока с расширениями файлов в `files.md` — **PR2**
- [x] T4: Реальная карта imports/exports + детектор `undeclared_code_dependency` — **делегировано в `b.code-graph`** (R-7.99). `b.core-sync` потребляет `code_graph` capability через `depends_on`. Прежний план «LLM-gate через `callLLM` для mission ↔ files» отделён в PR3 ниже как чисто-семантический слой поверх детерминистической базы.
- [x] T5: Сохранение детального `sync_report.json` (не только `details: []`, а с file/line ссылками) — **PR2**
- [ ] T6: false-positive guard: при двух запусках без изменений — отчёт идентичен — **PR2**
- [ ] T7 (PR3): LLM-семантический слой ПОВЕРХ `code_graph` — судит, реализует ли действительная функция то, что обещает миссия. Запускается только на блоках, где детерминистический `code_graph` уже зелёный. Фактически вызов уже реализован в `scripts/semantic_verify.mjs` (R-7.94); T7 — перенос его под контрактную крышу этого блока, добавление в `sync_report.json` агрегации и параметризация по списку блоков.
- [x] T8: Унификация источника правды `checks.log`: `frontend/atlas_sync.js` `logCheck` теперь параллельно с `localStorage` POST'ит в новый эндпоинт `POST /atlas/checks/append` (R-7.99), который дописывает TSV-строку в `atlas/blocks/<id>/checks.log` на диске. Эндпоинт защищён валидацией `block_id` (whitelist `[a-zA-Z0-9._-]+`, 404 на неизвестный блок), санитизирует embedded `\t/\n/\r` в note, fire-and-forget — UI не стоит на запросе. Selftest `tests/checks_append_endpoint.selftest.mjs` 6 групп зелёные. Закрывает методологическое нарушение Rule 1 из вердикта 2026-06-09.

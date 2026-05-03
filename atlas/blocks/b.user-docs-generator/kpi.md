# b.user-docs-generator — KPI

- **KPI-1 (coverage)**: 100% блоков с `layer ∈ {user, front}` или `user_facing: true` имеют свежий `docs/end-user/<block>.md` (т.е. hash источников совпадает с hash в `_meta/<block>.json`). Сейчас: ✗.
- **KPI-2 (idempotent)**: regen без изменений источников даёт diff = пустой (байт-в-байт идентичный файл). Сейчас: ✗.
- **KPI-3 (cost cap)**: одна регенерация одного блока ≤ $0.03 (LLM tokens); полный regen всех user-facing блоков среднего проекта (8 блоков) ≤ $0.25. Сейчас: ✗.
- **KPI-4 (no jargon)**: 0 случаев технических терминов (`module`, `component`, `endpoint`, `prop`, `state`) в финальном markdown — LLM-prompt + post-validation. Сейчас: ✗.
- **KPI-5 (drift detection)**: при ручной правке `<block>.md` без `LOCKED: true` — pre-commit hook просит подтвердить либо отменить (warn, не fail). Сейчас: ✗.
- **KPI-6 (latency)**: один блок ≤ 30 секунд (только LLM, без Playwright); с Playwright ≤ 60 секунд. Сейчас: ✗.
- **KPI-7 (graceful degradation)**: если Playwright не настроен — текст всё равно валидный, без `[broken image]`. Сейчас: ✗.

# b.block-10 — code summary

Node.js 18+ (ESM): `scripts/realtor_call_analytics.mjs` — потоковое чтение NDJSON (`readline`), парсинг JSON на строку, подсчёт слов (`transcript`), опционально `durationSec`/`duration`, группировка по `agentName`/`agent`, эвристические темы (регулярки по русским лексемам: ипотека, показ, объект, цена, намерение). Выход: один объект JSON в stdout. Без LLM и без встроенных записей.

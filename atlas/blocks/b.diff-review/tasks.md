# b.diff-review — tasks

## PR1 — ядро + selftest

- [ ] T1: `scripts/review_diff.mjs` — CLI + `export async function reviewDiff({ diff_text, block_id, context })`. Источники diff'а: `--since <ref>`, `--workspace <path>`, `--block <id>`, stdin. LLM-judge через `b.llm-gateway`. Tri-state schema (enum `[inconclusive, pass, fail]`), structured findings, budget-усечение с полным file-inventory. Результат в `atlas/blocks/<id>/diff_review.json`.
- [ ] T2: `tests/review_diff.selftest.mjs` — mock-режим: пустой diff→inconclusive; diff с явным eval/regex → mock возвращает structured; blocking→fail / warning→pass агрегация; budget-усечение сохраняет полный список файлов; library-функция и CLI оба работают.

## PR2 — интеграция в V-1 + nightly

- [ ] T3: Вшить `reviewDiff` в `agent_loop_daemon.mjs` как четвёртый гейт после verifier-pass. Hard `fail` (≥1 blocking) блокирует promote; `inconclusive` не блокирует. Находки в `entry.diff_review_findings`.
- [ ] T4: Регистрация `review_diff.selftest` в `nightly_consolidation.mjs`.
- [ ] T5: `b.acceptance-verifier-loop` или V-1-отчёт показывает diff-review-вердикт рядом с семантическим (визибилити в утреннем отчёте).

## PR3 (future) — расширения

- [ ] T6: Кеш по diff-hash — не пере-ревьюить идентичный diff дважды (экономия токенов в повторных прогонах).
- [ ] T7: Per-category severity-override через operator_profile (например, оператор может понизить `perf_regex` до warning для прототипа).
- [ ] T8: Ревью diff'ов внешних репо (для codebase-harness когда Sima строит продукт в новом репозитории).

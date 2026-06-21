# b.diff-review — KPI

- **KPI-1 (tri-state честность)**: при отсутствии `ANTHROPIC_API_KEY` /
  `GOOGLE_API_KEY` / `OPENAI_API_KEY` / claude_cli и в mock-режиме
  `review_diff.mjs` возвращает `verdict: inconclusive`, **никогда** `pass`.
  Schema enum упорядочен `[inconclusive, pass, fail]` — fallback безопасен.

- **KPI-2 (только diff, не весь файл)**: ревьюер получает на вход
  unified-diff текст, не полные файлы. Находки ссылаются на файлы из diff'а;
  ни одна находка не должна быть про код, отсутствующий в diff'е.

- **KPI-3 (структурированные находки)**: каждая BLOCKING-находка несёт
  `{ category, file, severity, why }`, где `category` ∈ {correctness,
  runtime_env, security, regression, perf_regex, type_error, other},
  `severity` ∈ {blocking, warning}.

- **KPI-4 (blocking → fail, warning → pass)**: вердикт `fail` тогда и только
  тогда, когда есть ≥1 находка с `severity: blocking`. Только warnings →
  `pass` (с surface'ом warnings). Пустой diff → `inconclusive`
  («нечего ревьюить»).

- **KPI-5 (gate в V-1)**: `agent_loop_daemon.mjs` запускает diff-review
  после verifier-pass; hard `fail` блокирует promote, `inconclusive` —
  нет. Поведение симметрично семантическому гейту.

- **KPI-6 (бюджет diff'а)**: при diff'е больше ~24K символов ревьюер
  получает diff с пометкой об усечении (по числу строк), но всегда видит
  список изменённых файлов целиком — чтобы не объявить файл «не тронут»,
  если его кусок вырезан бюджетом.

- **KPI-7 (детерминистическая деградация)**: при пустом diff'е, при
  отсутствии git, при невалидном `--since` ref — выход `inconclusive` с
  понятной причиной, без краха.

# b.acceptance-verifier-loop — mission

«Закрывающий контур» для каждого агент-прогона. Сейчас `run_block_implementation.mjs` отдаёт результат и забывает: `done` ставится «на честном слове» оператора. Этот блок добавляет **обязательную пост-проверку**: после того как агент сказал «готово», LLM-judge (через `b.llm-gateway`) сверяет результат **построчно против `acceptance.md`** блока. Каждый пункт получает `pass / fail / skipped + evidence + reasoning`. Если хоть один `fail` — блок **не может перейти в `done`** через `transition_block`, а получает proposal `acceptance_blocked` с конкретным описанием, что не сошлось.

Без этого блока «верификация» = ручной пересмотр чек-листа человеком. С ним — Атлас сам говорит «ты сказал готово, но A2 (selftest) не прошёл, потому что файла X нет, и A4 (trace write) не прошёл, потому что в `atlas/llm_traces/` нет новых записей за последние 5 минут».

## Layer
testing

## North Star
> После любого `run_block_implementation` блок не может перейти в `done`, пока ВСЕ пункты `acceptance.md` не получили `pass` с зафиксированным evidence. И каждый `fail` сопровождается конкретной обратной связью, которая сразу подходит как prompt для retry-прогона того же агента.

---

## Что наблюдается (источники данных)

| Источник | Что вытягивается |
|---|---|
| `atlas/blocks/<id>/acceptance.md` | список assertion-пунктов A1..AN с описанием и (опц.) машинно-читаемым evidence-spec |
| `run_block_implementation` stdout/exit code | факт «агент закончил» + последние модифицированные файлы |
| `git diff` за окно прогона | какие файлы реально изменились (для evidence-кросс-чека) |
| `atlas/blocks/<id>/checks.log` (новые записи) | `acceptance pass A1` / `acceptance fail A2 ...` |
| `atlas/llm_traces/*` (новые) | были ли LLM-вызовы в окне прогона (для KPI: «А3 требует live API») |
| Output of `tests/<block>.selftest.mjs` (если упомянут в acceptance) | exit code + stderr |
| `atlas/proposals/*` | acceptance_blocked proposal становится Accept-able блокером |

## Что сохраняется (output, файлы)

```
atlas/acceptance_runs/
  <block_id>/<UTC>__<run_id>.json   ← полный отчёт прогона (per-item pass/fail/evidence/reasoning)
  <block_id>/_latest.json            ← последний отчёт (для UI)
atlas/proposals/<UTC>__<block_id>__acceptance_blocked.json  ← если есть fail
atlas/blocks/<block_id>/checks.log   ← append: 'acceptance_verifier <pass|fail> <Aitem> note'
```

`acceptance_runs/<id>/<UTC>__.json` shape:

```json
{
  "block_id": "b.llm-gateway",
  "run_id": "2026-05-03T10:30:00Z__claude",
  "agent": "claude",
  "started_at": "...",
  "finished_at": "...",
  "items": [
    { "id": "A1",
      "assertion": "Selftest tests/llm_gateway.selftest.mjs проходит (4 case)",
      "verdict": "pass",
      "evidence_kind": "exit_code",
      "evidence": "node tests/llm_gateway.selftest.mjs → exit 0; output: 'OK (4 cases)'",
      "reasoning": "Все 4 case прошли; selftest зелёный.",
      "checked_at": "..."
    },
    { "id": "A4",
      "assertion": "Каждый вызов пишет trace в atlas/llm_traces/",
      "verdict": "fail",
      "evidence_kind": "fs_glob",
      "evidence": "ls atlas/llm_traces/*.json --since=5m → 0 new files",
      "reasoning": "Selftest test 3 проверяет trace, но в окне прогона новых traces нет → trace-writer не сработал.",
      "checked_at": "..."
    }
  ],
  "verdict": "fail",
  "blocked_transition": "wip → done",
  "retry_prompt_hint": "А4 не прошёл: trace-writer не пишет в atlas/llm_traces. Проверь функцию writeTrace() в scripts/llm_gateway.mjs — вероятно, fs.writeFileSync вызывается в try-catch с подавлением ошибки."
}
```

---

## Когда работает (триггеры)

| Тип | Когда | Что делает |
|---|---|---|
| **Auto после run_block_implementation** | exit code 0 от агента | сразу запускает `verify_block_acceptance.mjs <block_id>`; пишет `_latest.json` |
| **Pre-transition gate** | `transition_block <id> done` через CLI/MCP/UI | читает `_latest.json`; если `verdict !== "pass"` — блокирует переход с понятной ошибкой |
| **On-demand re-verify** | MCP tool `verify_block_acceptance {block_id}` | прогоняет проверку даже без агент-прогона (для ручной проверки уже-в-done блоков) |
| **Nightly re-verify of done** | в `nightly_consolidation.mjs` | проверяет, что блоки в `done` всё ещё проходят acceptance; если нет — авто-rollback `done → broken` + proposal |
| **Retry-loop hook (опц.)** | при verdict=fail и `auto_retry: true` в env | подмешивает `retry_prompt_hint` в новый run_block_implementation, max 2 retry |

**Что нельзя**: не проверять блоки без `acceptance.md` (это контрактная ошибка валидатора, не verifier'а). Не подменять структурные валидаторы (`validate_block_contracts` и т. д.) — verifier работает поверх них.

---

## Где применяется (потребители)

| Потребитель | Как использует |
|---|---|
| `scripts/run_block_implementation.mjs` | После exit code 0 — спавнит verifier; кладёт `_latest.json` рядом с trace |
| `scripts/log_transition.mjs` | Перед `wip → done` читает `_latest.json`; verdict !== pass → reject с описанием |
| `scripts/nightly_consolidation.mjs` | Step `verify_done_blocks_still_green` |
| UI Inspector | Под mission блока — секция «Acceptance verifier»: список A1..AN с зелёным/красным badge + reasoning по клику |
| ProposalsPanel | `acceptance_blocked` proposal с retry-кнопкой, которая дёргает `/run-block` с `retry_prompt_hint` |
| MCP tools | `verify_block_acceptance`, `read_acceptance_run`, `list_failed_acceptances` |

---

## UX-принципы

1. **Жёсткий gate, мягкий совет.** Verdict=fail **физически блокирует** `→ done` (это hard gate; KPI продукта). Но retry — добровольный (proposal в UI, не auto-апдейт кода без accept).
2. **Каждый fail подходит как prompt.** `retry_prompt_hint` пишется так, чтобы его можно было сразу скормить тому же агенту: конкретный файл, конкретная строка, что должно произойти.
3. **Прозрачность evidence.** Поле `evidence_kind` ∈ `{exit_code, fs_glob, file_diff, log_grep, llm_judge, manual}` — UI показывает разные иконки. `llm_judge` всегда сопровождается `reasoning` (нельзя «потому что я так считаю»).
4. **Не подменяет тесты.** Если пункт acceptance говорит «selftest зелёный» — verifier именно запускает selftest и читает exit code, а не «спрашивает Claude, кажется ли что selftest прошёл бы».
5. **Кэшируемо.** Если в окне после последнего verifier-прогона нет новых коммитов / нет новых traces / нет новых checks.log записей — verifier возвращает закэшированный результат за < 50ms.

---

## Out of scope

- Авто-fix кода блока — verifier только сообщает, не правит. Правка идёт через proposals + agent run.
- Acceptance-генератор (LLM пишет acceptance.md за пользователя) — это отдельный плагин на `b.docs` или `b.llm-gateway`.
- Cross-block acceptance («все блоки в layer:ai green») — это уровнем выше; пусть будет `intelligence_health` или новый `b.suite-verifier`.

---

## Интеграция с уже существующими блоками

- **depends_on**: `b.db` (read graph + acceptance.md), `b.core-sync` (write checks.log), `b.agent-orchestrator` (hook после run_block_implementation), `b.llm-gateway` (LLM-judge для assertion-пунктов, которые без exit-code/fs evidence).
- **provides**: `acceptance_run_report`, `acceptance_gate_decision`, `retry_prompt_hint`.

---

## Backlog priority

- **Position**: после `b.operator-profile-learner` (тот учится на готовых данных, этот — генерирует данные о done/blocked). По важности — **выше** profile-learner'а: это фактически **закрывающий контур качества**, без которого `done` остаётся empty signal.
- **Estimate**: 4–5 PR-ов:
  1. `assertion parser` — структурированный парсинг `acceptance.md` (A1..AN + опц. evidence-spec в YAML-блоке)
  2. `evidence collectors` — exit_code / fs_glob / file_diff / log_grep раннеры (без LLM)
  3. `LLM-judge fallback` — для пунктов без явного evidence-spec, через `b.llm-gateway`
  4. `gate hooks` — интеграция в `log_transition` + `run_block_implementation` + nightly
  5. `UI surface` — Inspector секция + ProposalsPanel acceptance_blocked + retry-кнопка

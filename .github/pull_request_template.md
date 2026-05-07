<!--
  Спасибо за PR. Заполните секции ниже — это резко ускоряет review.
  Удалите секции, которые не применимы к вашему PR.
-->

## Что и зачем

<!--
  Кратко: что делает PR и почему это нужно.
  Если фиксит баг — опишите симптом до фикса.
  Если новая фича — что она даёт пользователю.
-->



## Связанные issues

<!--
  `Fixes #123` или `Closes #123` — закроет issue автоматически после merge.
  `Refs #123` — упомянёт без закрытия.
-->



## Тип изменения

- [ ] Bugfix (исправление, обратно-совместимое)
- [ ] Feature (новая возможность, обратно-совместимая)
- [ ] Breaking change (несовместимое с предыдущей версией)
- [ ] Refactor (без изменения поведения)
- [ ] Docs (только документация)
- [ ] CI / dev tooling (без production-изменений)

## Затронутые слои

- [ ] UI canvas (`Sima (Remix)/atlas_design/`)
- [ ] MCP-сервер (`scripts/mcp_atlas_server.mjs`)
- [ ] HTTP API (`scripts/atlas_api_server.mjs`)
- [ ] LLM gateway (`scripts/llm_gateway.mjs`)
- [ ] Acceptance verifier (`scripts/{collect_evidence,judge_assertion,acceptance_verifier}.mjs`)
- [ ] Block contracts (`atlas/blocks/<id>/`)
- [ ] Multi-tenant (`atlas/clients/<id>/`)
- [ ] Документация (`README`, `docs/`, `ТЗ/`, `CLAUDE.md`)
- [ ] CI / nightly / selftests
- [ ] Другое: ___

## Чек-лист перед review

- [ ] `npm run verify` проходит зелёным локально
- [ ] Если изменён код, который покрыт selftest'ом — selftest обновлён
- [ ] Если изменён UI — Playwright e2e (`npx playwright test`) проходит
- [ ] Если добавлен новый блок — есть mission/kpi/acceptance/tasks/checks.log минимум
- [ ] Если изменён публичный API (HTTP / MCP) — обновлена соответствующая документация
- [ ] Commit messages в conventional-style (`feat(scope) — ...`, `fix(scope) — ...`, и т.д.)

## Скриншоты / логи (для UI / acceptance changes)

<!--
  Перед-после скриншоты для UI; tail логов acceptance-loop для evidence-changes.
-->



## Дополнительный контекст для reviewer'а

<!--
  Что-то, что не очевидно из diff'а: альтернативы, которые рассматривались;
  trade-off'ы; известные ограничения; следующие шаги в отдельном PR.
-->



---

<!--
  Спасибо ещё раз. Maintainer обычно отвечает в течение 48 часов.
-->

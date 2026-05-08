# Master Tasks

## Критические задачи (реализовать в первую очередь)
- [ ] DB-слой: формализовать хранилище Atlas (schema + registry + migration policy).
- [ ] Sync Engine: автоматическая проверка рассинхрона между блоками и правилами.
- [ ] Agent Orchestration: единый формат context-pack для Cursor/Claude/Codex.
- [ ] UI Control Plane: панель статусов блоков и управление задачами.

## Что еще у тебя есть как задачи (по сути backlog владельца продукта)
- [ ] Определить MVP-границы по каждому блоку (что значит «достаточно хорошо»).
- [ ] Назначить приоритеты блоков по бизнес-ценности (P0/P1/P2).
- [ ] Зафиксировать acceptance и KPI по каждому блоку.
- [ ] Определить policy для dead/legacy файлов (когда удаляем, когда архивируем).
- [ ] Выбрать обязательный набор агентов и их полномочия (кто может менять что).
- [ ] Утвердить цикл релиза: implement -> sync-check -> review -> done.

## Late-stage milestones (один из последних)

### PR-OperatorProfile — b.operator-profile-learner
Персонализация поверх инфраструктуры PR1–PR-Live. Делается **после** того, как реальный пользователь пройдёт ≥10 done блоков и накопит данные. До тех пор модуль молчит (warming_up). Подробный design — `atlas/blocks/b.operator-profile-learner/mission.md`.

- [ ] PR-1: data collector (read-only агрегатор 10 источников → profile.json + patterns/*.json + history/<UTC>.json)
- [ ] PR-2: templates set (backend-mvp / backend-prod / frontend-spa / testing-stack JSON шаблоны + tech_stack default в analyze_conversation_to_atlas)
- [ ] PR-3: dont-use list (MCP tools set_dont_use / set_always_use + расширение guard_against_drift + UI Inspector)
- [ ] PR-4: lessons LLM analyser (single-shot через b.llm-gateway по decisions.log + checks.log fail; cost cap ≤ $0.05; nightly раз в сутки)
- [ ] PR-5: inject_context_pack hook (секция `## Operator profile (likely preferences)` в промпте агента; молчит если warming_up)
- [ ] PR-6: UI hints (badge match/conflict/neutral в ProposalsPanel; секция «Подсказки от профиля» в Inspector; «забыть паттерн» / «снять запрет» buttons)

### PR-AcceptanceVerifier — b.acceptance-verifier-loop
Закрывающий контур качества: после агент-прогона проверяет каждый пункт `acceptance.md` блока, блокирует `wip → done` пока есть `fail`. Детерминированные evidence-collectors (exit_code / fs_glob / file_diff / log_grep / selftest_run) + LLM-judge только как fallback. Подробный design — `atlas/blocks/b.acceptance-verifier-loop/mission.md`. По важности **выше** operator-profile-learner'а.

- [ ] PR-1: assertion parser (`scripts/parse_acceptance.mjs` + опц. YAML-блок с evidence_spec)
- [ ] PR-2: deterministic evidence collectors (5 видов без LLM)
- [ ] PR-3: LLM-judge fallback через b.llm-gateway (cost ≤ $0.02 per assertion)
- [ ] PR-4: gate hooks (log_transition блокирует, run_block_implementation авто-спавнит, nightly re-verify)
- [ ] PR-5: UI surface (Inspector секция + ProposalsPanel acceptance_blocked + retry-кнопка)

### PR-UserDocsGenerator — b.user-docs-generator
Атлас сам пишет UI каждого user-facing блока → знает все кнопки и поля → пишет end-user туториал «нажми + → откроется форма → введи название → Enter». Auto-regen на каждое изменение JSX. Не путать с `b.docs` (тот — developer wiki). Подробный design — `atlas/blocks/b.user-docs-generator/mission.md`.

- [ ] PR-1: block introspection (парсер JSX → buttons/inputs/routes/handlers)
- [ ] PR-2: LLM tutorial writer (через b.llm-gateway, JSON Schema-driven, no-jargon validator)
- [ ] PR-3: Playwright screenshot integration (опц., работает без)
- [ ] PR-4: auto-regen drift-check + Inspector кнопка + locked-flag protection

### PR-RunLifecycle (subtasks внутри b.agent-orchestrator)
Symphony-inspired — но как T7/T8/T9 в существующем `b.agent-orchestrator/tasks.md`, не отдельный блок:
- [ ] PR-7 (T7): Run-lifecycle FSM (PreparingWorkspace → ... → Succeeded/Stalled/Cancelled)
- [ ] PR-8 (T8): Per-block sandboxed workspace (`~/.atlas_workspaces/<block>__<UTC>/`) + diff-as-proposal
- [ ] PR-9 (T9): Интеграция T7/T8 с b.acceptance-verifier-loop (verifier в workspace до Accept)

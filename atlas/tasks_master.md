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

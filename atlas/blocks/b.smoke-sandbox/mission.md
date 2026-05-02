# b.smoke-sandbox — mission

Целевой блок для всех e2e/smoke-тестов Атласа. Реальный код продукта на него не ссылается. MCP smoke-сценарии (`scripts/mcp_smoke_e2e.mjs`, future smoke harnesses) пишут сюда mission/tasks/ingestion-queue, чтобы не повреждать содержание реальных блоков (b.ui-control, b.core-sync, b.db, b.agent-orchestrator, b.docs, b.llm-gateway).

Ожидаемый цикл жизни: блок постоянно в статусе `idea`, его tasks/checks log заполняются и затираются smoke-сценариями, что не считается дрейфом — это часть функции блока.

## Layer
testing

## Что должен делать в done-версии
Блок никогда не должен попадать в `done`. Это контейнер для тестов.

## Out of scope
- Любые продуктовые фичи.

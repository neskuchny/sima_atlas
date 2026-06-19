# Roadmap (auto-generated, PR2 topo-sort)

_Generated: 2026-06-19T18:23:30.110Z_

Приоритет внутри уровня: 🔴 broken → 🟣 drift → 🟠 wip → 🔵 review → 🟡 idea → 🟢 done.
Каждый следующий уровень зависит от предыдущих — реализовывать сверху вниз.

## Порядок реализации (топосорт)

### Level 0 — без зависимостей

- 🔵 **b.llm-gateway** (review) — LLM Gateway · _ai_
  - Phase I: verifier FAIL on A2 (simulate_conversation_branches) — test fixture asserts b.core-sync is NOT done, but it legitimately IS done now. Test-state coupling; provider code works. Needs fixture decoupling.
- 🟡 **b.db** (idea) — Atlas Database · _data_
  - Storage is markdown + localStorage; no real DB layer yet
- 🟡 **b.product-auth** (idea) — Auth · _logic_
  - Created via design UI at 2026-05-05T20:57:52.201Z
- 🟡 **b.product-billing** (idea) — Billing · _logic_
  - Created via design UI at 2026-05-05T20:57:52.257Z
- 🟡 **b.product-dashboard** (idea) — Dashboard · _front_
  - Created via design UI at 2026-05-05T20:57:52.242Z
- 🟡 **b.product-ingest** (idea) — Ingest · _logic_
  - Created via design UI at 2026-05-05T20:57:52.212Z
- 🟡 **b.product-warehouse** (idea) — Warehouse · _data_
  - Created via design UI at 2026-05-05T20:57:52.230Z
- 🟡 **b.smoke-sandbox** (idea) — Smoke Sandbox (test target) · _testing_
  - Reserved write-target for e2e/smoke scripts so they never touch real product blocks
- ⚪ **b.block-1** (archived) — Новый модуль · _logic_
  - Archived via design UI at 2026-06-05T22:09:40.500Z
- ⚪ **b.block-2** (archived) — Новый модуль · _logic_
  - Archived via design UI at 2026-06-05T22:09:40.503Z

### Level 1 — требует Level 0

- 🟡 **b.code-graph** (idea) — Code Graph · _data_ · deps: `b.db`
  - New block scoped — extracts deterministic imports/exports map from alive files; consumed by b.core-sync PR4. R-7.99.

### Level 2 — требует Level 1

- 🟢 **b.core-sync** (done) — Sync Engine · _logic_ · deps: `b.db`, `b.code-graph`
  - syncCheck only validates file presence, not mission/KPI semantics

### Level 3 — требует Level 2

- 🟢 **b.docs** (done) — Docs Builder · _content_ · deps: `b.db`, `b.core-sync`
  - Generators run but feed on template missions; needs layer-aware wiki and mermaid (PR2)

### Level 4 — требует Level 3

- 🟠 **b.ui-control** (wip) — UI Control Plane · _front_ · deps: `b.core-sync`, `b.agent-orchestrator`
  - HTML loses references to components.jsx/sidecol.jsx/canvas_tools.jsx — UI does not boot in production; multi-layer rendering depends on PR2 (this PR)
- 🔵 **b.agent-orchestrator** (review) — Agent Orchestrator · _ai_ · deps: `b.db`, `b.core-sync`, `b.llm-gateway`, `b.operator-profile-learner`
  - Phase I: verifier FAIL on A5 (cursor_live.headless.smoke) — needs a live cursor-agent CLI, not installed in this env. Env-blocked, not code-blocked. A1-A4+A7 pass.
- 🟢 **b.operator-profile-learner** (done) — Operator Profile Learner · _ai_ · deps: `b.db`, `b.core-sync`, `b.agent-orchestrator`, `b.llm-gateway`, `b.docs`
  - Phase I: verifier FAIL on A6 — profile-compliance UI badge (complianceWithProfile) was lost in the R-7.30 single-file→atlas_design refactor and not reimplemented. Genuine feature gap, honestly not done.
- 🟢 **b.acceptance-verifier-loop** (done) — Acceptance Verifier Loop · _testing_ · deps: `b.db`, `b.core-sync`, `b.agent-orchestrator`, `b.llm-gateway`
  - cascade: parent b.core-sync edit at 2026-06-09T19:50:57 broke acceptance
- 🟢 **b.user-docs-generator** (done) — End-User Docs Generator · _content_ · deps: `b.db`, `b.docs`, `b.agent-orchestrator`, `b.llm-gateway`
  - Phase I: verifier FAIL on A1 (introspect_block_ui.selftest) — coupled to deleted frontend/proposals_panel.jsx. Test fixture needs repointing to a current JSX file.

## Сводка по слоям

### Фронтенд (`front`)

- 🟠 **b.ui-control** — UI Control Plane _(wip)_
- 🟡 **b.product-dashboard** — Dashboard _(idea)_

### Логика / бэкенд (`logic`)

- 🟢 **b.core-sync** — Sync Engine _(done)_
- 🟡 **b.product-auth** — Auth _(idea)_
- 🟡 **b.product-ingest** — Ingest _(idea)_
- 🟡 **b.product-billing** — Billing _(idea)_
- ⚪ **b.block-1** — Новый модуль _(archived)_
- ⚪ **b.block-2** — Новый модуль _(archived)_

### ИИ / агенты (`ai`)

- 🔵 **b.agent-orchestrator** — Agent Orchestrator _(review)_
- 🔵 **b.llm-gateway** — LLM Gateway _(review)_
- 🟢 **b.operator-profile-learner** — Operator Profile Learner _(done)_

### Данные / хранилище (`data`)

- 🟡 **b.db** — Atlas Database _(idea)_
- 🟡 **b.code-graph** — Code Graph _(idea)_
- 🟡 **b.product-warehouse** — Warehouse _(idea)_

### Контент / документация (`content`)

- 🟢 **b.docs** — Docs Builder _(done)_
- 🟢 **b.user-docs-generator** — End-User Docs Generator _(done)_

### Тестирование (`testing`)

- 🟢 **b.acceptance-verifier-loop** — Acceptance Verifier Loop _(done)_
- 🟡 **b.smoke-sandbox** — Smoke Sandbox (test target) _(idea)_

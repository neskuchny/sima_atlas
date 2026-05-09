# Roadmap (auto-generated, PR2 topo-sort)

_Generated: 2026-05-09T12:21:27.009Z_

Приоритет внутри уровня: 🔴 broken → 🟣 drift → 🟠 wip → 🔵 review → 🟡 idea → 🟢 done.
Каждый следующий уровень зависит от предыдущих — реализовывать сверху вниз.

## Порядок реализации (топосорт)

### Level 0 — без зависимостей

- 🔵 **b.llm-gateway** (review) — LLM Gateway · _ai_
  - PR3: gateway implemented (Anthropic + Google + mock), structured output via JSON schema, trace+cost cap, golden eval avg 1.0 in mock. Review needed: live providers untested without keys; UI confidence/diff flow pending PR3.5.
- 🟡 **b.block-1** (idea) — Новый модуль · _logic_
  - Created via design UI at 2026-05-05T20:58:12.722Z
- 🟡 **b.block-2** (idea) — Новый модуль · _logic_
  - Created via design UI at 2026-05-07T16:27:02.089Z
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

### Level 1 — требует Level 0

- 🟢 **b.core-sync** (done) — Sync Engine · _logic_ · deps: `b.db`
  - syncCheck only validates file presence, not mission/KPI semantics

### Level 2 — требует Level 1

- 🟠 **b.docs** (wip) — Docs Builder · _content_ · deps: `b.db`, `b.core-sync`
  - Generators run but feed on template missions; needs layer-aware wiki and mermaid (PR2)
- 🔵 **b.agent-orchestrator** (review) — Agent Orchestrator · _ai_ · deps: `b.db`, `b.core-sync`, `b.llm-gateway`
  - PR4: .cursor/hooks.json now uses valid Cursor events (beforeSubmitPrompt/afterFileEdit/beforeShellExecution/stop) wired to real action scripts. Cursor edits write to checks.log of the right block via files.md mapping. Drift guard rejects pip/yarn-add-vue/etc. inject_context_pack provides per-block context. Live Cursor wiring (real env vars) needs UI test (PR4.5).

### Level 3 — требует Level 2

- 🟠 **b.ui-control** (wip) — UI Control Plane · _front_ · deps: `b.core-sync`, `b.agent-orchestrator`
  - HTML loses references to components.jsx/sidecol.jsx/canvas_tools.jsx — UI does not boot in production; multi-layer rendering depends on PR2 (this PR)
- 🟡 **b.acceptance-verifier-loop** (idea) — Acceptance Verifier Loop · _testing_ · deps: `b.db`, `b.core-sync`, `b.agent-orchestrator`, `b.llm-gateway`
  - PR-Backlog: design-only milestone. Closes the verification gap (Symphony trusts agent output, Hermes has no contract layer). После любого run_block_implementation проверяет каждый пункт acceptance.md через детерминированные collectors (exit_code/fs_glob/file_diff/log_grep) + LLM-judge fallback; блокирует wip→done если verdict !== pass. 5-PR breakdown.
- 🟡 **b.operator-profile-learner** (idea) — Operator Profile Learner · _ai_ · deps: `b.db`, `b.core-sync`, `b.agent-orchestrator`, `b.llm-gateway`, `b.docs`
  - PR-Backlog: design-only milestone; one of the LAST PRs. Реальная имплементация (PR-1…PR-6) делается после того, как реальный пользователь пройдёт ≥10 done и накопит данные — иначе наблюдать нечего. Сейчас зарегистрирован как карта будущей работы.
- 🟡 **b.user-docs-generator** (idea) — End-User Docs Generator · _content_ · deps: `b.db`, `b.docs`, `b.agent-orchestrator`, `b.llm-gateway`
  - PR-Backlog: design-only milestone. Closes the end-user tutorial gap — Атлас сам пишет UI блоков, значит знает все кнопки и поля; этот блок генерирует 'как пользоваться' markdown для конечного пользователя продукта (не developer wiki — это делает b.docs). Auto-regen на каждое изменение JSX. 3-4 PR breakdown.

## Сводка по слоям

### Фронтенд (`front`)

- 🟠 **b.ui-control** — UI Control Plane _(wip)_
- 🟡 **b.product-dashboard** — Dashboard _(idea)_

### Логика / бэкенд (`logic`)

- 🟢 **b.core-sync** — Sync Engine _(done)_
- 🟡 **b.product-auth** — Auth _(idea)_
- 🟡 **b.product-ingest** — Ingest _(idea)_
- 🟡 **b.product-billing** — Billing _(idea)_
- 🟡 **b.block-1** — Новый модуль _(idea)_
- 🟡 **b.block-2** — Новый модуль _(idea)_

### ИИ / агенты (`ai`)

- 🔵 **b.agent-orchestrator** — Agent Orchestrator _(review)_
- 🔵 **b.llm-gateway** — LLM Gateway _(review)_
- 🟡 **b.operator-profile-learner** — Operator Profile Learner _(idea)_

### Данные / хранилище (`data`)

- 🟡 **b.db** — Atlas Database _(idea)_
- 🟡 **b.product-warehouse** — Warehouse _(idea)_

### Контент / документация (`content`)

- 🟠 **b.docs** — Docs Builder _(wip)_
- 🟡 **b.user-docs-generator** — End-User Docs Generator _(idea)_

### Тестирование (`testing`)

- 🟡 **b.acceptance-verifier-loop** — Acceptance Verifier Loop _(idea)_
- 🟡 **b.smoke-sandbox** — Smoke Sandbox (test target) _(idea)_

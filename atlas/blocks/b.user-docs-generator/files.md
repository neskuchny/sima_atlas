# b.user-docs-generator — files

Все пути с тегом `[pending]` — *планируемые* (status: idea).

## Introspection (PR-1)
- scripts/introspect_block_ui.mjs [alive]
- tests/fixtures/jsx/synthetic_panel.jsx [alive]
- tests/introspect_block_ui.selftest.mjs [alive]

## LLM writer (PR-2)
- scripts/generate_user_docs.mjs [alive]
- tests/user_docs.smoke.mjs [alive]

## Screenshots (PR-3, опц.)
- scripts/take_screenshots.mjs [alive]
- tests/playwright/user_docs_screenshots.spec.ts [alive]
- tests/screenshots_integration.selftest.mjs [alive]

## Auto-regen + UI (PR-4)
- scripts/regenerate_user_docs_drift.mjs [alive]
- scripts/check_user_docs_locked.mjs [alive]
- tests/user_docs_drift.selftest.mjs [alive]

PR-4 also touches files owned by other blocks (cross-cutting; documented
in checks.log + tasks.md):

  • `frontend/arch_canvas.jsx` (owned by b.ui-control) gained
    UserDocsLink component
  • `frontend/proposals_panel.jsx` (owned by b.llm-gateway) gained
    user_docs_locked card branch
  • `scripts/generate_atlas_bootstrap_js.mjs` (owned by b.ui-control)
    now exposes userDocsByBlock
  • `scripts/log_transition.mjs` (owned by b.db) gained the
    user-facing-block auto-regen spawn
  • `scripts/atlas_api_server.mjs` (owned by b.agent-orchestrator)
    gained /user-docs/{regenerate,lock,unlock-and-regen} endpoints

## Documentation
- atlas/blocks/b.user-docs-generator/mission.md [alive]
- atlas/blocks/b.user-docs-generator/kpi.md [alive]
- atlas/blocks/b.user-docs-generator/acceptance.md [alive]
- atlas/blocks/b.user-docs-generator/tasks.md [alive]
- atlas/blocks/b.user-docs-generator/depends_on.md [alive]
- atlas/blocks/b.user-docs-generator/provides.md [alive]
- atlas/blocks/b.user-docs-generator/files.md [alive]
- atlas/blocks/b.user-docs-generator/checks.log [alive]

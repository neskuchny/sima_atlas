# b.ui-control — files

- index.html [alive] (PR4.1: repo-root redirect to frontend/index.html)
- frontend/atlas_bootstrap.js [alive] (auto-generated)
- frontend/atlas_design/index.html [alive] (R-7.30 — current canvas entry; R-8.09: «Send to agent» goes through SIMA_API.meta.startRun — client-scoped — and logs what the frame gate did; R-8.10: the LLM badge in the toolbar, the selected block survives the live-refresh re-mount)
- frontend/atlas_design/panels.jsx [alive] (DetailPanel + Overview + AcceptanceSection + Implementation Status + Token Spend + R-8.08 MeaningSection: the agent's frame, assumptions, staleness, trajectory; R-8.09: the operator's answer — «Right — write the code» / «Not quite» with a correction, gate state in words, 5 s refresh; R-8.10: LlmProviderBadge, the trajectory editor, useSticky — per-block UI state and the open tab survive the live-refresh re-mount; R-8.12: ContractDelta — what changed since the confirmation, unit by unit; ContractQualitySection + the «Contract wording» status row)
- frontend/atlas_design/views.jsx [alive] (composer, proposals Accept/Reject, modals)
- frontend/atlas_design/graph.jsx [alive] (canvas graph + edges + drill-down; R-8.10: frame marker on the node)
- frontend/atlas_design/tweaks-panel.jsx [alive]
- frontend/atlas_design/data_loader.js [alive] (live API loader + write-side SIMA_API; R-8.08: meta.blockMeaning; R-8.09: meta.frameReview, meta.startRun — client-scoped; R-8.10: meta.llmProvider, meta.setTrajectory, and /atlas/state?client= so a client canvas refreshes on its own files)
- frontend/atlas_design/data_static.js [alive] (offline fallback demo)
- frontend/atlas_design/i18n.js [alive] (644-key EN/RU dictionary)
- frontend/atlas_design/styles.css [alive]
- frontend/result_view.jsx [archived] (legacy)
- frontend/schema_view.jsx [archived] (legacy)
- frontend/data.js [archived] (v1 data, replaced by data_v2.js)
- frontend/app.jsx [archived] (v1 root, replaced by app_v2.jsx)

## R-8.10 — previously unowned

These files had no owner in any files.md, so the code-graph check never saw their imports.
- scripts/build_sima_design_payload.mjs [alive] (builds the canvas payload (/atlas/design-payload); R-8.10: frame marker per node from b.clarify)
- scripts/dev_server.mjs [alive] (npm run dev: API + canvas)
- scripts/seed_example_client.mjs [alive] (demo client for a first look at the canvas)
- tests/sima_design_payload.selftest.mjs [alive]
- tests/atlas_bootstrap.smoke.mjs [alive]
- tests/atlas_live_polling.smoke.mjs [alive]
- tests/connection_drift.smoke.mjs [alive]
- tests/playwright/meaning_panel.spec.ts [alive] (R-8.10/R-8.12: + the contract delta after a change, the wording section; the meaning panel in Chromium against a live API — LLM badge, node marker, correction draft and notice surviving a live refresh, confirm without a run, trajectory saved to mission.md; `npm run test:ui`)
- playwright.config.js [alive] (R-8.10: webServer waits for atlas_design/index.html — the old frontend/index.html no longer exists, so no spec could start)

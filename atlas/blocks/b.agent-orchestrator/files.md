# b.agent-orchestrator — files

- scripts/mcp_atlas_server.mjs [alive] (21+ tools over JSON-RPC stdio)
- scripts/atlas_api_server.mjs [alive] (HTTP facade for orchestration; R-8.08: GET /atlas/blocks/<id>/meaning — blockMeaningSummary from b.clarify, served verbatim to the canvas; R-8.09: POST /atlas/frame-review — the operator's «right»/«wrong» from the canvas, optionally starting the next phase; R-8.10: GET /llm/provider (cached 60 s), POST /atlas/blocks/trajectory, /atlas/state?client=)
- scripts/generate_cursor_hooks.mjs [alive] (PR4: emits valid Cursor format with real action scripts)
- scripts/validate_cursor_hooks.mjs [alive] (PR4: gate; fails if hooks.json has wrong shape or missing scripts)
- scripts/observe_file_edit.mjs [alive] (PR4: afterFileEdit action — files.md → block reverse-map)
- scripts/guard_against_drift.mjs [alive] (PR4: beforeShellExecution action — tech_stack.md guard)
- scripts/inject_context_pack.mjs [alive] (PR4: beforeSubmitPrompt action — block-scoped context)
- tests/cursor_hooks_actions.test.mjs [alive] (PR4: 9-case integration test for the three actions)
- scripts/run_block_implementation.mjs [alive] (PR4.5: build prompt + invoke claude/codex/cursor CLI; R-8.09: two-phase by default through the frame gate — declare → operator confirms → implement; --phase=, --frame-review=skip)
- scripts/atlas_runs_api.mjs [alive] (async run start for the canvas + run/acceptance read helpers; R-8.09: does not spawn while the frame awaits the operator. Was unowned until R-8.09)
- tests/agent_loop_budget.selftest.mjs [alive] (R-8.10: the loop's budget counts only traces written since the loop started — token_economics --since)
- tests/frame_gate_flow.selftest.mjs [alive] (R-8.09: 3 groups — the real two-phase run through every gate state + startRunAsync, the canvas routes vs the library, the autonomous loop on an unconfirmed frame)
- scripts/agent_loop_daemon.mjs [alive] (V-1 autonomous loop; R-8.09: blocks awaiting the operator's frame answer are reported as awaiting-frame — not verified, promoted or counted as failures. Was unowned until R-8.09)
- tests/agent_parity_real.smoke.mjs [alive] (PR4.5: real MCP pack ≡ Claude --add-dir disk parity)
- scripts/generate_agent_contracts.mjs [alive] (writes AGENTS.md / CLAUDE.md)
- scripts/build_context_pack.mjs [alive]
- scripts/sync_context_packs.mjs [alive]
- scripts/finalize_cursor_iteration.mjs [alive]
- scripts/run_block_process.mjs [alive]
- scripts/pipeline_step.mjs [alive]
- scripts/auto_sync_iteration.mjs [alive] (regex-only flow; will be replaced after PR3 wiring)
- scripts/analyze_conversation_to_atlas.mjs [alive] (PR3: replaced regex with extractBlockSchema via b.llm-gateway)
- scripts/simulate_conversation_branches.mjs [alive] (PR3: rewritten as smoke for the LLM extraction + safe-upsert flow)
- .cursor/hooks.json [alive] (current content uses invented Cursor events — PR4)
- .cursor/mcp.json [alive]
- AGENTS.md [alive]
- CLAUDE.md [alive]
- scripts/run_state.mjs [alive] (PR-7 Symphony-inspired FSM; runs are tracked in atlas/run_state/<run_id>.json)
- tests/run_state.selftest.mjs [alive] (PR-7; 8 test groups)
- scripts/agent_workspace.mjs [alive] (PR-8 sandboxed workspaces under ~/.atlas_workspaces/)
- tests/agent_workspace.selftest.mjs [alive] (PR-8; 7 test groups)

## R-8.10 — previously unowned

These files had no owner in any files.md, so the code-graph check never saw their imports.
- scripts/atlas_synthesis_api.mjs [alive] (LLM «fill / suggest / decompose» helpers served by the HTTP facade)
- scripts/architecture_decisions_api.mjs [alive] (project-level architecture decisions injected into agent prompts)
- scripts/sima_fill_from_chat.mjs [alive] (conversation → block proposals (uses the synthesis helpers, so it lives here, not with ingestion in b.db: b.db → orchestrator would be a cycle))
- scripts/sima_watch_chats.mjs [alive] (scanner for fresh chat transcripts → sima_fill_from_chat)
- scripts/chat_sources/_shared.mjs [alive]
- scripts/chat_sources/claude.mjs [alive]
- scripts/chat_sources/codex.mjs [alive]
- scripts/chat_sources/cursor.mjs [alive]
- scripts/distill_run_log.mjs [alive] (post-run: atomic decisions → decisions.log)
- scripts/reflect_after_run.mjs [alive] (post-run: short lesson → patterns.md)
- scripts/summarize_block_code.mjs [alive] (post-run: code_summary.md)
- scripts/cleanup_block_memory.mjs [alive] (post-run: keeps decisions.log / patterns.md bounded)
- scripts/scan_run_for_drift.mjs [alive] (post-run: content drift against dont_use / always_use)
- scripts/screenshot_block.mjs [alive] (block screenshots for the /atlas/blocks/<id>/screenshot route of the HTTP facade)
- scripts/run_playwright_guarded.mjs [alive] (Playwright launcher used by screenshot_block)
- tests/atlas_synthesis_api.selftest.mjs [alive]
- tests/atlas_runs_api.selftest.mjs [alive]
- tests/cleanup_block_memory.selftest.mjs [alive]
- tests/codex_source.selftest.mjs [alive]
- tests/cursor_source.selftest.mjs [alive]
- tests/sima_watch_chats.selftest.mjs [alive]
- tests/chat_fill_accept.selftest.mjs [alive]
- tests/cursor_live.headless.smoke.mjs [alive] ((A5 evidence))

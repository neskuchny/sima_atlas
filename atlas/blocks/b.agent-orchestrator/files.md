# b.agent-orchestrator — files

- scripts/mcp_atlas_server.mjs [alive] (21+ tools over JSON-RPC stdio)
- scripts/atlas_api_server.mjs [alive] (HTTP facade for orchestration)
- scripts/generate_cursor_hooks.mjs [alive] (currently emits invalid hook events — fix in PR4)
- scripts/generate_agent_contracts.mjs [alive] (writes AGENTS.md / CLAUDE.md)
- scripts/build_context_pack.mjs [alive]
- scripts/sync_context_packs.mjs [alive]
- scripts/finalize_cursor_iteration.mjs [alive]
- scripts/run_block_process.mjs [alive]
- scripts/pipeline_step.mjs [alive]
- scripts/auto_sync_iteration.mjs [alive] (regex-only flow; replace via PR3 b.llm-gateway)
- scripts/analyze_conversation_to_atlas.mjs [alive] (regex-only — PR3 must replace with LLM)
- scripts/simulate_conversation_branches.mjs [alive] (smoke for the regex flow)
- .cursor/hooks.json [alive] (current content uses invented Cursor events — PR4)
- .cursor/mcp.json [alive]
- AGENTS.md [alive]
- CLAUDE.md [alive]

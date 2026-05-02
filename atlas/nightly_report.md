# Atlas Nightly Consolidation Report

_Generated: 2026-05-02T11:34:24.882Z_

- ✅ ingestion_queue: ok
  - output: ingestion_queue: empty
- ✅ ingestion_contracts: ok
  - output: Ingestion contracts validation: OK
- ✅ ingestion_quality: ok
  - output: Ingestion quality validation: OK
- ✅ block_contracts: ok
  - output: Block contract validation: OK
- ✅ no_template_placeholders: ok
  - output: Template-placeholder validation: OK (7 blocks scanned)
- ✅ files_registry: ok
  - output: Files registry validation: OK (alive=115, archived=4, dead=0)
- ✅ dependency_contracts: ok
  - output: Dependency contract validation: OK
- ✅ acceptance_assertions: ok
  - output: Acceptance assertions validation: OK
- ✅ atlas_selftest: ok
  - output: atlas_sync.selftest: OK
- ✅ bootstrap_layered_smoke: ok
  - output: atlas_bootstrap smoke: OK (layers=6, blocks=7, links=7)
- ✅ llm_gateway_selftest: ok
  - output: llm_gateway.selftest: OK (4 cases)
- ✅ llm_extraction_eval: ok
  - output: llm_extraction.eval: OK — avg 1.00 on 5 cases (target 0.70)
- ✅ simulate_conversation_branches: ok
  - output: PASS: created b.realtime-ingestion in graph.json
- ✅ validate_cursor_hooks: ok
  - output: cursor hooks validation: OK (4 events, 4 commands)
- ✅ cursor_hooks_actions: ok
  - output: cursor_hooks_actions.test: OK (9 cases)
- ✅ sync_context_packs: ok
  - output: Context packs synced: 7
- ✅ agent_parity: ok
  - output: Agent parity validation: OK
- ✅ parity_matrix: ok
  - output: Parity matrix validation: OK
- ✅ generate_wiki: ok
  - output: Generated /home/user/sima_atlas/atlas/WIKI.md
- ✅ generate_tz: ok
  - output: Generated /home/user/sima_atlas/ТЗ/auto_tz.md
- ✅ rebuild_roadmap: ok
  - output: Rebuilt /home/user/sima_atlas/atlas/roadmap.md
- ✅ mcp_smoke_e2e: ok
  - output: mcp_smoke_e2e: OK
- ✅ intelligence_health: ok
  - output: Intelligence health: 1 (7/7)

Summary: PASS (23/23)

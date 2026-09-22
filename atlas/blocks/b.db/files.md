# b.db — files

- atlas/graph.json [alive] (v2 — main schema source of truth)
- atlas/db_schema.json [alive]
- atlas/project.md [alive]
- atlas/rules.md [alive]
- atlas/tech_stack.md [alive] (project-wide stack lock)
- atlas/operator_profile.json [alive]
- atlas/transitions.log [alive]
- atlas/ingestion_queue.jsonl [alive]
- atlas/intelligence_health.json [alive]
- atlas/intelligence_health.md [alive]
- atlas/STATUS_REPORT.md [alive]
- atlas/STOPPOINT.md [alive]
- atlas/progress_tz_checklist.md [alive]
- atlas/IMPLEMENTATION_PROGRESS.md [alive]
- atlas/production_audit_report.md [alive]
- atlas/tasks_master.md [alive]
- scripts/log_transition.mjs [alive]
- scripts/manage_block.mjs [alive]
- scripts/advance_block_state.mjs [alive]
- scripts/lifecycle_gate.mjs [alive] (R-8.05, owner fixed in R-8.07: the single writer of block status + transitions.log + checks.log. Extracted core of advance_block_state/log_transition, so it belongs to the storage layer that owns the transitions journal. First filed under b.acceptance-verifier-loop, which created two dependency cycles — every status writer had to import «upward» into a block that itself depends on them.)
- tests/lifecycle_gate.selftest.mjs [alive] (R-8.05: 7 groups — → done refused without a passing verdict / on fail / on inconclusive; logged override; adjacency; desync cannot invent a done; desync→done needs a green run newer than the mark; checkTransition is pure)
- scripts/dedup_block_memory.mjs [alive]
- scripts/enqueue_ingestion_item.mjs [alive]
- scripts/apply_ingestion_queue.mjs [alive]
- scripts/ingest_chat_distillate.mjs [alive]
- scripts/ingest_chat_batches.mjs [alive]
- scripts/hook_ingest_recent_chat.mjs [alive] (waiting for PR4 valid hooks)

## R-8.10 — previously unowned

These files had no owner in any files.md, so the code-graph check never saw their imports.
- scripts/atlas_blocks_api.mjs [alive] (block CRUD + the one writer of block files (patchBlockFile: history snapshot, etag, audit line))
- scripts/atlas_files_api.mjs [alive] (per-block file registry reads for the canvas)
- scripts/atlas_artifacts_api.mjs [alive] (artifact storage under atlas/artifacts/)
- scripts/atlas_subsystems_api.mjs [alive] (subsystem state)
- scripts/change_set.mjs [alive] (transactional change-sets across blocks)
- scripts/get_block_history.mjs [alive] (list history snapshots of a block)
- scripts/migrate_v1_v2.mjs [alive] (one-off atlas migration)
- scripts/migrate_subsystems_to_blocks.mjs [alive] (one-off migration of subsystems into blocks)
- scripts/apply_block_template.mjs [alive] (create a block from a template through atlas_blocks_api)
- scripts/validate_lifecycle_gates.mjs [alive] (validator for the lifecycle gate this block owns)
- tests/atlas_blocks_api.selftest.mjs [alive]
- tests/atlas_files_api.selftest.mjs [alive]
- tests/atlas_artifacts_api.selftest.mjs [alive]
- tests/atlas_subsystems_api.selftest.mjs [alive]
- tests/multi_tenant_block_routing.selftest.mjs [alive]
- tests/validate_lifecycle_gates.selftest.mjs [alive]

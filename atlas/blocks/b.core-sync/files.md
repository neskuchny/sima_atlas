# b.core-sync — files

- frontend/atlas_sync.js [alive] (client-side syncCheck + transitions; T8: logCheck now POSTs /atlas/checks/append → checks.log on disk)
- tests/checks_append_endpoint.selftest.mjs [alive] (T8 — selftest for the unified-checks-log endpoint)
- scripts/validate_block_contracts.mjs [alive]
- scripts/validate_dependency_contracts.mjs [alive]
- scripts/validate_acceptance_assertions.mjs [alive]
- scripts/validate_no_template_placeholders.mjs [alive] (PR1)
- scripts/validate_files_registry.mjs [alive] (PR2 — checks files in files.md exist on disk)
- scripts/validate_stack_mismatch.mjs [alive] (PR2 — detects cross-language stack mismatches, writes sync_report.json)
- scripts/validate_ingestion_contracts.mjs [alive]
- scripts/validate_ingestion_quality.mjs [alive]
- scripts/validate_agent_parity.mjs [alive]
- scripts/validate_parity_matrix.mjs [alive]
- scripts/validate_bootstrap_projection.mjs [alive]
- scripts/validate_bootstrap_regeneration.mjs [alive]
- scripts/calc_intelligence_health.mjs [alive]
- scripts/audit_production_readiness.mjs [alive]
- scripts/log_transition.mjs [alive]
- atlas/transitions.log [alive]

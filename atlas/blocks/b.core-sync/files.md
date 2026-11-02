# b.core-sync — files

- frontend/atlas_sync.js [alive] (client-side syncCheck + transitions; T8: logCheck now POSTs /atlas/checks/append → checks.log on disk)
- tests/checks_append_endpoint.selftest.mjs [alive] (T8 — selftest for the unified-checks-log endpoint)
- scripts/validate_block_contracts.mjs [alive] (R-8.14: проверяет, что у каждого блока есть обязательные файлы контракта — mission, kpi, acceptance, tasks, checks.log — и указывает строку блока в graph.json)
- scripts/validate_dependency_contracts.mjs [alive] (R-8.14: сверяет зависимости: каждая строка depends_on блока должна совпасть с capability в provides.md соседа)
- scripts/validate_acceptance_assertions.mjs [alive]
- scripts/validate_no_template_placeholders.mjs [alive] (PR1)
- scripts/validate_files_registry.mjs [alive] (PR2 — checks files in files.md exist on disk)
- scripts/validate_stack_mismatch.mjs [alive] (PR2 — detects cross-language stack mismatches, writes sync_report.json)
- scripts/validate_code_graph_sync.mjs [alive] (PR2 — consumes b.code-graph: code_graph; writes codeGraphSummary to sync_report.json)
- scripts/validate_ingestion_contracts.mjs [alive] (R-8.14: проверяет формат очереди памяти atlas/ingestion_queue.jsonl: у каждой записи есть блок и заметка, флаги правильного типа)
- scripts/validate_ingestion_quality.mjs [alive] (R-8.14: проверяет, что каждая выжимка из чата, попавшая в decisions.log блока, отражена и в его patterns.md)
- scripts/validate_agent_parity.mjs [alive] (R-8.14: проверяет, что AGENTS.md и CLAUDE.md учат агентов одному и тому же — project.md, rules.md, build_context_pack, sync_check, — а MCP-сервер даёт нужные инструменты)
- scripts/validate_parity_matrix.mjs [alive] (R-8.14: проверяет, что AGENTS.md и CLAUDE.md упоминают ключевые инструменты агентов, а у каждого блока есть context pack)
- scripts/validate_bootstrap_projection.mjs [alive] (R-8.14: проверяет, что сгенерированный frontend/atlas_bootstrap.js содержит всё, что ждёт канвас: SIMA_BOOTSTRAP, источники, user story)
- scripts/validate_bootstrap_regeneration.mjs [alive] (R-8.14: пересобирает frontend/atlas_bootstrap.js и сразу проверяет результат — ловит сломавшийся генератор)
- scripts/calc_intelligence_health.mjs [alive] (R-8.14: считает здоровье атласа: у каких блоков нет обязательных файлов контракта и где depends_on не совпадает с provides соседа; пишет intelligence_health.json и .md)
- scripts/audit_production_readiness.mjs [alive] (R-8.14: аудит готовности: запускает пять проверок — контракты блоков, зависимости, очередь памяти, её качество, симуляцию разговоров — и пишет отчёт PASS/FAIL в markdown)
- scripts/validate_dependency_graph.mjs [alive] (R-8.07: parity graph.json ↔ depends_on.md, bare-id format of the mirror, cycle detection with justified exemptions; every error carries a fix line)
- tests/dependency_graph.selftest.mjs [alive] (R-8.07: 11 groups, incl. the R-8.06 regression — an edge added to depends_on.md only must fail parity AND report the cycle it creates; an exemption must not cover a larger cycle routed through the exempted pair)
- atlas/dependency_cycle_exemptions.json [alive] (R-8.07: the only escape hatch for a cycle — what it is, why tolerated, and when the exemption must go; stale entries are reported)

## R-8.10 — previously unowned

These files had no owner in any files.md, so the code-graph check never saw their imports.
- scripts/nightly_consolidation.mjs [alive] (the nightly: runs every validator and selftest, writes atlas/nightly_report.md)
- scripts/verify_all.mjs [alive]
- scripts/housekeeping_sweeper.mjs [alive] (proposes cleanups, never applies them)
- scripts/apply_cleanup_proposal.mjs [alive] (applies an operator-approved cleanup by moving with a breadcrumb, never deleting)
- scripts/validate_projects.mjs [alive]
- scripts/validate_subschemas.mjs [alive]
- scripts/subagent_schema_syncer.mjs [alive]
- scripts/validate_ownership.mjs [alive] (R-8.10: every script / test / canvas / desktop file has exactly one owning block — unowned or doubled is an error)
- atlas/blocks/b.core-sync/calls.md [alive] (R-8.15: что блок вызывает во время работы — запускает процессом или по HTTP; не порядок сборки, поэтому может идти «вверх»)

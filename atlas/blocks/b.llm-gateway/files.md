# b.llm-gateway — files

- scripts/llm_gateway.mjs [alive] (PR3 — main implementation)
- tests/llm_gateway.selftest.mjs [alive] (4 cases: schema validation, extractBlockSchema, trace write, no-schema fallback)
- tests/llm_extraction.eval.mjs [alive] (5-case golden eval, target precision >= 0.7)
- tests/fixtures/extraction_golden.json [alive]
- tests/llm_mocks/_default.json [alive]
- tests/llm_mocks/c2d381615a8dc73a.json [alive] (payments_stripe golden)
- tests/llm_mocks/3b627c7e1be3704b.json [alive] (auth_jwt golden)
- tests/llm_mocks/bd85bbb8b0c013de.json [alive] (search_block golden)
- tests/llm_mocks/b5ad6311ecc46c29.json [alive] (notifications_dual golden)
- tests/llm_mocks/052b57272d7d7d4c.json [alive] (no_block_chat golden)
- tests/llm_mocks/6a03ef6e33f5d57e.json [alive] (legacy fixture: realtime-ingestion)
- tests/llm_mocks/f0b0bb99c4c1a99f.json [alive] (legacy fixture: core-sync done proposal)
- atlas/llm_traces/.gitkeep [alive] (trace directory placeholder; runtime traces are .gitignored)

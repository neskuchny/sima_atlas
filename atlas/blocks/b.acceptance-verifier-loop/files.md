# b.acceptance-verifier-loop — files

Все пути с тегом `[pending]` — *планируемые* (status: idea). Реальные `[alive]` помечаются по мере мержа PR-1…PR-5.

## Parser (PR-1)
- scripts/parse_acceptance.mjs [alive]
- tests/parse_acceptance.selftest.mjs [alive]

## Evidence collectors (PR-2)
- scripts/collect_evidence.mjs [alive]
- tests/evidence_collectors.selftest.mjs [alive]

## LLM-judge (PR-3)
- scripts/judge_assertion.mjs [pending] (PR-3)
- tests/llm_judge.smoke.mjs [pending] (PR-3)
- tests/llm_mocks/judge_pass.json [pending] (PR-3)
- tests/llm_mocks/judge_fail.json [pending] (PR-3)
- tests/llm_mocks/judge_borderline.json [pending] (PR-3)

## Gate hooks (PR-4)
- scripts/verify_block_acceptance.mjs [pending] (PR-4: оркестратор parse→collect→judge→write report)
- atlas/acceptance_runs/.gitkeep [pending] (PR-4)
- tests/acceptance_verifier.e2e.smoke.mjs [pending] (PR-4)

## UI (PR-5)
- Sima (Remix)/inspector_acceptance_section.jsx [pending] (PR-5)
- Sima (Remix)/proposals_panel_acceptance_blocked.jsx [pending] (PR-5)

## Documentation
- atlas/blocks/b.acceptance-verifier-loop/mission.md [alive]
- atlas/blocks/b.acceptance-verifier-loop/kpi.md [alive]
- atlas/blocks/b.acceptance-verifier-loop/acceptance.md [alive]
- atlas/blocks/b.acceptance-verifier-loop/tasks.md [alive]
- atlas/blocks/b.acceptance-verifier-loop/depends_on.md [alive]
- atlas/blocks/b.acceptance-verifier-loop/provides.md [alive]
- atlas/blocks/b.acceptance-verifier-loop/files.md [alive]
- atlas/blocks/b.acceptance-verifier-loop/checks.log [alive]

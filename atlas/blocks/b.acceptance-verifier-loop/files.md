# b.acceptance-verifier-loop — files

Все пути с тегом `[pending]` — *планируемые* (status: idea). Реальные `[alive]` помечаются по мере мержа PR-1…PR-5.

## Parser (PR-1)
- scripts/parse_acceptance.mjs [alive]
- tests/parse_acceptance.selftest.mjs [alive]

## Evidence collectors (PR-2)
- scripts/collect_evidence.mjs [alive]
- tests/evidence_collectors.selftest.mjs [alive]

## LLM-judge (PR-3)
- scripts/judge_assertion.mjs [alive]
- tests/llm_judge.smoke.mjs [alive]

## Gate hooks (PR-4)
- scripts/verify_block_acceptance.mjs [alive]
- scripts/verify_all_acceptance.mjs [alive] (PR-2 migration: walks all blocks, writes acceptance_runs/<block>/<UTC>.json + _latest.json + _summary.json; nightly-friendly, exit 0 always)
- atlas/acceptance_runs/_summary.json [alive] (PR-2 migration: aggregate verdicts across all blocks)
- scripts/verify_done_blocks_still_green.mjs [alive] (PR-4: nightly regression check; writes acceptance_regression proposals, never auto-flips done→broken)
- tests/acceptance_verifier.e2e.smoke.mjs [alive]

## UI (PR-5)
PR-5 touches files owned by other blocks (UI host blocks own JSX; bootstrap
generator is owned by b.ui-control). Cross-cutting changes are documented
in checks.log + tasks.md (not listed here because files.md only enumerates
this block's own owned files):

  • `Sima (Remix)/arch_canvas.jsx` (owned by b.ui-control) gained AcceptanceSection
  • `Sima (Remix)/proposals_panel.jsx` (owned by b.llm-gateway) gained acceptance_regression card
  • `scripts/generate_atlas_bootstrap_js.mjs` (owned by b.ui-control) now exposes acceptanceRuns + acceptanceSummary in the payload

## Documentation
- atlas/blocks/b.acceptance-verifier-loop/mission.md [alive]
- atlas/blocks/b.acceptance-verifier-loop/kpi.md [alive]
- atlas/blocks/b.acceptance-verifier-loop/acceptance.md [alive]
- atlas/blocks/b.acceptance-verifier-loop/tasks.md [alive]
- atlas/blocks/b.acceptance-verifier-loop/depends_on.md [alive]
- atlas/blocks/b.acceptance-verifier-loop/provides.md [alive]
- atlas/blocks/b.acceptance-verifier-loop/files.md [alive]
- atlas/blocks/b.acceptance-verifier-loop/checks.log [alive]

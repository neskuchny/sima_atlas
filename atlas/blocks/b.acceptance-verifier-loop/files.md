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

  • `frontend/arch_canvas.jsx` (owned by b.ui-control) gained AcceptanceSection
  • `frontend/proposals_panel.jsx` (owned by b.llm-gateway) gained acceptance_regression card
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

## R-8.10 — previously unowned

These files had no owner in any files.md, so the code-graph check never saw their imports.
- scripts/cascade_verify.mjs [alive] (re-verifies reverse dependencies after a green run)
- scripts/semantic_verify.mjs [alive] (the semantic judge (Contract as Arbiter))
- scripts/subagent_verifier.mjs [alive]
- tests/desync_restore.selftest.mjs [alive] (R-8.10: the real verifier on a synthetic atlas — every desync restore is a gated transition; idea / legacy marks are left to the operator)
- scripts/verify_cache.mjs [alive] (R-8.11, KPI-6: verifier cache — conservative key: code via git, contracts, verdict summary, the block's evidence targets, LLM mode; pass cached, inconclusive only under the mock, fail never; `stats` CLI for hit rate / latency)
- tests/verify_cache.selftest.mjs [alive] (R-8.11: the real verifier on a synthetic atlas — every key part invalidates on its own, the never-cached rules, TTL, switches, ledger consistency, hit latency)
- atlas/blocks/b.acceptance-verifier-loop/understanding.md [alive] (R-8.11: the declared frame for the cache work)
- atlas/blocks/b.acceptance-verifier-loop/frame_reviews.jsonl [alive] (R-8.11: the frame journal for this block — declared / confirmed / corrected)

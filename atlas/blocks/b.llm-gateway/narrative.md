
## 2026-06-09T18:07:02.147Z · semantic verify · fail

### Contract-as-Arbiter judgment
- The `b.llm-gateway` block provides a robust foundation for LLM interactions, fulfilling its core mission and adhering to methodology. However, critical aspects like cost cap enforcement, token budget limits, and structured output retry mechanisms are not verifiable from the provided code, leading to a failure in functional correctness and meeting key performance indicators. Additionally, the `provides` list is not fully consistent with the visible exports.

### To genuinely satisfy the contract
- Implement and verify the token budget (`LLM_MAX_INPUT_TOKENS`) and per-run cost cap (`LLM_MAX_USD_PER_RUN`) enforcement logic within `callLLM`, ensuring it throws an error when limits are exceeded with `strict: true`. Add a selftest for this.
- Implement the '1 retry' mechanism for `callLLM` when the LLM returns invalid structured output, ensuring a clear error message is provided if the retry also fails. Update selftests to cover this scenario.
- Address Acceptance A3 by performing live testing with a real API key and `strict: true` to confirm that invalid structured output from a live provider results in a clear error with trace.
- Either implement and export `llm_validate_drift` and `llm_summarize_distillate` from `llm_gateway.mjs`, or remove them from the `provides` list to ensure consistency between the contract and the implementation.

## 2026-09-22 — R-8.10: say which provider answers; an honest eval; a declared dependency

`describeProvider()` runs the same resolution as a real call — forced mock,
explicit `LLM_DEFAULT_PROVIDER`, or the subscription-first cascade — without
calling and without logging, and returns the provider, its kind
(subscription / api_key / local / none) and the reason. `pickProvider` now
uses the same `resolveProvider`, so the canvas badge cannot drift from what
`callLLM` actually does; selftest case 6 checks exactly that on both mock
paths, and that a malformed `LLM_DEFAULT_PROVIDER` is named in the reason.

`tests/llm_extraction.eval.mjs` was circular on the mock provider:
`seed_llm_mocks` writes the golden answers themselves into the fixtures, so
the eval scored the golden set against itself — 1.00 every night — and all
35 of those snapshots became the regression baseline, which would have
failed the first real run at a healthy 0.85 as a «regression». The eval now
says which provider answered: on mock it is a plumbing check (anything below
1.00 is a broken pipeline) and prints that quality was NOT measured; only
live runs set the baseline; a run where some cases fell back to mock is
reported inconclusive.

`token_economics.mjs` (now owned here) gained `--since`, used by the
autonomous loop's budget. `accept_proposal.mjs` — this block's Accept/Reject
inbox — writes blocks through b.db's `atlas_blocks_api`; that file had no
owner, so the dependency was invisible. It is declared now:
`b.db: atlas_state_store`, in both depends_on.md and graph.json.

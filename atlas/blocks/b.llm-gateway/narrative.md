
## 2026-06-09T18:07:02.147Z · semantic verify · fail

### Contract-as-Arbiter judgment
- The `b.llm-gateway` block provides a robust foundation for LLM interactions, fulfilling its core mission and adhering to methodology. However, critical aspects like cost cap enforcement, token budget limits, and structured output retry mechanisms are not verifiable from the provided code, leading to a failure in functional correctness and meeting key performance indicators. Additionally, the `provides` list is not fully consistent with the visible exports.

### To genuinely satisfy the contract
- Implement and verify the token budget (`LLM_MAX_INPUT_TOKENS`) and per-run cost cap (`LLM_MAX_USD_PER_RUN`) enforcement logic within `callLLM`, ensuring it throws an error when limits are exceeded with `strict: true`. Add a selftest for this.
- Implement the '1 retry' mechanism for `callLLM` when the LLM returns invalid structured output, ensuring a clear error message is provided if the retry also fails. Update selftests to cover this scenario.
- Address Acceptance A3 by performing live testing with a real API key and `strict: true` to confirm that invalid structured output from a live provider results in a clear error with trace.
- Either implement and export `llm_validate_drift` and `llm_summarize_distillate` from `llm_gateway.mjs`, or remove them from the `provides` list to ensure consistency between the contract and the implementation.

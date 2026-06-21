
## 2026-05-09T11:06:56.506Z · cascade break detected

### What failed and why
- Parent block `b.core-sync` was edited at 2026-05-09T11:06:56.
- Acceptance on this block (`b.agent-orchestrator`) failed when re-verified.
- Likely cause: b.core-sync's public contract (provides) changed in a way that violates this block's expectations (depends_on).

### Recommended action
1. Open b.core-sync → check what changed in its files
2. Either:
   - Adapt this block's code to match the new b.core-sync contract, OR
   - Revert the breaking change in b.core-sync (operator decision)
3. Re-run `verify_block_acceptance b.agent-orchestrator` to clear the desync status

## 2026-06-09T18:07:34.226Z · semantic verify · fail

### Contract-as-Arbiter judgment
- The b.agent-orchestrator block provides a robust framework for Cursor integration, with its core hook logic and context injection well-tested in a simulated environment. However, it critically fails to fulfill its mission of supporting *all* coding agents due to incomplete Claude Code integration. Furthermore, crucial live verification for Cursor's drift guard is pending, and a reported cascade break from an upstream dependency highlights a semantic inconsistency.

### To genuinely satisfy the contract
- Complete Claude Code Adapter: Implement the MCP tool run_block_implementation(block_id) to launch claude --print --add-dir atlas/blocks/<id> and return a summary, as per acceptance A6.
- Implement Real Parity Check: Develop validate_agent_parity.mjs to perform a real diff comparison between Cursor's MCP-generated context-pack JSON and Claude's CLI-generated context-pack, ensuring they are identical, as per acceptance A7 and KPI-4.
- Verify Live Cursor Flow: Conduct and pass the tests/cursor_live.headless.smoke.mjs test or equivalent live verification in a real Cursor IDE to confirm that beforeShellExecution correctly blocks pip install commands, as per acceptance A5.
- Address Upstream Cascade Break: Investigate and resolve the 'cascade break detected' issue with b.core-sync, adapting b.agent-orchestrator to the updated b.core-sync contract or reverting the breaking change in b.core-sync to restore connection consistency.
- Update KPI Descriptions: Review and update the KPI descriptions (KPI-1, KPI-2, KPI-3) to accurately reflect the current implementation, as the code appears to fulfill the intent of these KPIs despite their '✗' status in the contract.

## 2026-06-21T23:00:00Z · R-8.02 — contract-bounded sizing steer in agent prompt

### What I tried
Studied DietrichGebert/ponytail (a YAGNI-injection plugin that makes agents
«think like the laziest senior dev»). Its philosophy directly conflicts with
Kanon Principle II (counter-force to the simplification gradient) — adopting
it wholesale would make the agent mock-instead-of-implement.

### What worked
Extracted ONLY the safe, valuable half: Ponytail's real leverage is the
PRE-generation steer (less code → cheaper, faster), and we can take it
contract-bounded. Added a «## How much to build (right-size to the contract)»
section to the agent prompt in run_block_implementation.mjs. Framing is the
whole trick: «exactly what the mission + acceptance require — no more, no
less» REINFORCES Principle II (explicitly says «don't cut what the contract
requires: a mock where the mission demands real logic FAILS») while trimming
gold-plating.

### What failed and why
Rejected the obvious move (an `over_engineering` warning category in
b.diff-review): checked the daemon and confirmed V-1 discards all non-blocking
findings (agent_loop_daemon filters severity==='blocking'). A warning nobody
reads in autonomous mode is dead signal. Pre-gen steer captures the value;
post-gen warning doesn't.

### Decisions made
- No new block, no warning lens. One 6-line prompt section, framed as
  calibration-to-contract, not laziness.
- The biggest takeaway from ponytail wasn't code — it was the axis:
  under-engineering (Principle II fights it) ↔ over-engineering (this steer
  trims it), contract in the middle as the calibration point.

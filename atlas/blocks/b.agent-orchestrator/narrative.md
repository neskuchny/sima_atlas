
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

## 2026-09-22 — R-8.08: the meaning endpoint

`atlas_api_server.mjs` gained `GET /atlas/blocks/<id>/meaning[?client=]`. It
returns `blockMeaningSummary` from `scripts/block_meaning.mjs` (b.clarify)
verbatim: the agent's declared frame, the trajectory, staleness, warnings.
No parsing happens here or in the browser — the nightly report reads the same
function, and b.clarify's selftest (group 9) asserts the API body equals the
library's output. `client` is validated against a safe-id pattern (no `..`),
unknown blocks return `not_found` rather than an empty all-clear.

No new graph edge: this block already depends on b.clarify since R-8.08
(`run_block_implementation.mjs` imports the same library). Status left at
`review` — the addition is read-only and does not change what the existing
acceptance claims; acceptance re-run below.

## 2026-09-22 — R-8.09: two-phase runs

`run_block_implementation.mjs` now asks b.clarify's `frameGate` what it may
do before building a prompt. No declaration, a changed contract, or an
operator correction → the declare phase: the agent may write only
`understanding.md`, the owned files are hashed before and after (a phase-1
agent that wrote code anyway is reported), and the run ends with
`frame declared — awaiting operator` — no verifier, drift scan, cascade or
reflection, since no code was supposed to change. A declaration nobody has
answered → the agent is not started at all. A confirmed frame → the
implement phase gets it as data and is told not to rewrite it; if it does,
checks.log says so and the next run stops for a new confirmation. Every run
prints `frame_gate: phase=<p> state=<s>` first, which is what the daemon
parses.

`--frame-review=skip` keeps the old single run for unattended nights; each
use is written to checks.log. The daemon got `--frame-review skip` too, and
without it treats declare/awaiting runs as «awaiting-frame». A mutation test
showed why this mattered: with the parse removed, the daemon promoted a
block wip → review after a run that only declared.

`atlas_runs_api.startRunAsync` returns `{ started: false, frame_gate }`
instead of spawning when a frame waits. `POST /atlas/frame-review` records
the canvas answer (actor «operator (canvas)») and can start the next phase
with the agent that declared. There is deliberately no MCP tool for it.
`agent_loop_daemon.mjs` and `atlas_runs_api.mjs` had no owner in any
files.md; both are registered here now.

Found while testing: the loop's budget guard reads the whole repo's
cost-equivalent for the last 24 h (`token_economics --days 1`), not what this
loop spent. On a busy day it stops before the first block («budget — spent
~$1.19 ≥ cap $1.00» with nothing run). The frame-gate test now lifts the cap
(print-only spends nothing); the guard itself is unchanged and still counts
other work against the loop — a separate fix.

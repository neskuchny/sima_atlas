
## 2026-05-09T11:06:56.506Z · cascade break detected

### What failed and why
- Parent block `b.core-sync` was edited at 2026-05-09T11:06:56.
- Acceptance on this block (`b.acceptance-verifier-loop`) failed when re-verified.
- Likely cause: b.core-sync's public contract (provides) changed in a way that violates this block's expectations (depends_on).

### Recommended action
1. Open b.core-sync → check what changed in its files
2. Either:
   - Adapt this block's code to match the new b.core-sync contract, OR
   - Revert the breaking change in b.core-sync (operator decision)
3. Re-run `verify_block_acceptance b.acceptance-verifier-loop` to clear the desync status

## 2026-06-09T18:06:29.833Z · semantic verify · fail

### Contract-as-Arbiter judgment
- The b.acceptance-verifier-loop implementation largely delivers on its core mission of automated post-verification, blocking transitions, and providing actionable feedback. However, it fails to fully meet its own acceptance criteria and described methodology due to the absence of the specified pre-commit hook for privacy and safety, which is crucial for contract adherence.

### To genuinely satisfy the contract
- Implement the pre-commit hook as described in acceptance criterion A8 to prevent the verifier from writing to 'acceptance.md', thereby fulfilling the privacy/safety methodology.

## 2026-06-09T19:36:06.640Z · cascade break detected

### What failed and why
- Parent block `b.core-sync` was edited at 2026-06-09T19:36:06.
- Acceptance on this block (`b.acceptance-verifier-loop`) failed when re-verified.
- Likely cause: b.core-sync's public contract (provides) changed in a way that violates this block's expectations (depends_on).

### Recommended action
1. Open b.core-sync → check what changed in its files
2. Either:
   - Adapt this block's code to match the new b.core-sync contract, OR
   - Revert the breaking change in b.core-sync (operator decision)
3. Re-run `verify_block_acceptance b.acceptance-verifier-loop` to clear the desync status

## 2026-06-09T19:50:57.102Z · cascade break detected

### What failed and why
- Parent block `b.core-sync` was edited at 2026-06-09T19:50:57.
- Acceptance on this block (`b.acceptance-verifier-loop`) failed when re-verified.
- Likely cause: b.core-sync's public contract (provides) changed in a way that violates this block's expectations (depends_on).

### Recommended action
1. Open b.core-sync → check what changed in its files
2. Either:
   - Adapt this block's code to match the new b.core-sync contract, OR
   - Revert the breaking change in b.core-sync (operator decision)
3. Re-run `verify_block_acceptance b.acceptance-verifier-loop` to clear the desync status

## 2026-06-20T08:04:50.537Z · cascade break detected

### What failed and why
- Parent block `b.db` was edited at 2026-06-20T08:04:50.
- Acceptance on this block (`b.acceptance-verifier-loop`) failed when re-verified.
- Likely cause: b.db's public contract (provides) changed in a way that violates this block's expectations (depends_on).

### Recommended action
1. Open b.db → check what changed in its files
2. Either:
   - Adapt this block's code to match the new b.db contract, OR
   - Revert the breaking change in b.db (operator decision)
3. Re-run `verify_block_acceptance b.acceptance-verifier-loop` to clear the desync status

## 2026-06-20T08:06:27.162Z · cascade break detected

### What failed and why
- Parent block `b.db` was edited at 2026-06-20T08:06:27.
- Acceptance on this block (`b.acceptance-verifier-loop`) failed when re-verified.
- Likely cause: b.db's public contract (provides) changed in a way that violates this block's expectations (depends_on).

### Recommended action
1. Open b.db → check what changed in its files
2. Either:
   - Adapt this block's code to match the new b.db contract, OR
   - Revert the breaking change in b.db (operator decision)
3. Re-run `verify_block_acceptance b.acceptance-verifier-loop` to clear the desync status

## 2026-06-20T08:29:39.423Z · cascade break detected

### What failed and why
- Parent block `b.core-sync` was edited at 2026-06-20T08:29:39.
- Acceptance on this block (`b.acceptance-verifier-loop`) failed when re-verified.
- Likely cause: b.core-sync's public contract (provides) changed in a way that violates this block's expectations (depends_on).

### Recommended action
1. Open b.core-sync → check what changed in its files
2. Either:
   - Adapt this block's code to match the new b.core-sync contract, OR
   - Revert the breaking change in b.core-sync (operator decision)
3. Re-run `verify_block_acceptance b.acceptance-verifier-loop` to clear the desync status

## 2026-06-20T08:31:02.542Z · cascade break detected

### What failed and why
- Parent block `b.core-sync` was edited at 2026-06-20T08:31:02.
- Acceptance on this block (`b.acceptance-verifier-loop`) failed when re-verified.
- Likely cause: b.core-sync's public contract (provides) changed in a way that violates this block's expectations (depends_on).

### Recommended action
1. Open b.core-sync → check what changed in its files
2. Either:
   - Adapt this block's code to match the new b.core-sync contract, OR
   - Revert the breaking change in b.core-sync (operator decision)
3. Re-run `verify_block_acceptance b.acceptance-verifier-loop` to clear the desync status

## 2026-09-22 — R-8.10: desync restore goes through the gate; the legacy mark is cleared

`restoreFromDesyncIfGreen` (verify_block_acceptance.mjs) wrote graph.json,
transitions.log and checks.log by hand — a second status writer next to the
lifecycle gate — and could move desync → review, which the gate's own
TRANSITIONS table forbade. It now calls `applyTransition` with
actor=verifier: the gate re-checks that the green run is newer than the mark
and that the target is what the block held before. Targets the gate does not
restore to (idea, broken) and legacy marks without `status_before_desync`
are left to the operator with the exact command, as before.
`tests/desync_restore.selftest.mjs` runs the real verifier on a synthetic
atlas: review → review and done → done as gated transitions, idea and legacy
stay desync, nothing else reaches the ledger.

This block itself sat in a legacy `desync` since the 2026-06-20 cascade
mark. transitions.log shows it was `done` before (last transition
desync → done on 2026-06-09), and the run of 2026-09-22 is green 7/0 and
newer than the mark, so it was restored through the gate:
`desync → done gate=pass(desync-cleared 7/8)`, actor=operator-R8.10.

Same day, later: the nightly's kpi validator refused that `done` — «done
block requires kpi pass — no kpi line in checks.log». Right: this block had
been `done` before without any KPI ever being checked (while it sat in
desync, the validator never looked at it). Measured now: KPI-1 ✓ (the gate
refuses → done without pass), KPI-3 ✓ (1.1 s for 8 assertions), KPI-2 ✗
(68.9% deterministic evidence, target 70% — two assertions short), KPI-6 ✗
(no verifier cache exists at all); KPI-4/5/7 are not measurable on the mock.
Recorded as a `kpi fail` line and in kpi.md, and the block went
`done → wip` through the gate. Acceptance green, KPI not met — the same case
as b.user-docs-generator in R-8.07. Two ways back to done, operator's call:
build the cache (KPI-6) and move two llm_judge assertions to deterministic
evidence (KPI-2), or rescope those KPIs.

## 2026-09-22 — R-8.11: the verifier cache (KPI-6) and KPI-2

**The cache.** A cache that returns «pass» after a real change is the silent
green this system exists to prevent, so the key was chosen by measuring what
a verification pass touches (a snapshot of all 1594 repo files before and
after): the verifier's own outputs, derived artifacts regenerated with fresh
timestamps by the commands being verified, and the smoke sandbox. Those stay
out of the key; code (git), contracts, a verdict summary without timestamps,
the block's explicit evidence targets and the LLM mode are in. Only `pass` —
and `inconclusive` under the forced mock, where it is deterministic — is
cached; `fail` never, so a transient timeout cannot stick.

First measurement: 21% hits. The nightly itself rewrote two keyed files every
run — `frontend/atlas_bootstrap.js` (generated, outside atlas/) and
`operator_profile/profile.json` (the aggregator's updated_at and trace
counters). The first is now excluded as derived; the second is hashed with
numbers and timestamps blanked, because its text is what the privacy scan
reads. Second measurement over two nightlies with nothing in between: 88.9%
hits, hit p95 32.5 ms — KPI-6 met. The selftest changes each key part on its
own and expects a named miss; with the targets part removed it fails.

**KPI-2.** 68.9% → 73.0%: five assertions moved off the LLM judge onto real
tests, and two of them found real problems the judge had passed —
`rebuild_atlas_roadmap.mjs` dumped every block downstream of a dependency
cycle into one level in arbitrary order (b.ui-control before
b.agent-orchestrator), and `atlas/rules.md` lacked the privacy rule
b.operator-profile-learner A7 claimed. A8 of this block stays on the judge:
its text promises a pre-commit hook that does not exist.

**Found on the way.** b.llm-gateway A5 had been failing since R-8.10: it
expected «overall avg=», which the honest mock-mode eval no longer prints.
The nightly stayed green because a verify_all fail does not fail it and the
block is not done. Rewritten to what is checked in each mode. And the
acceptance YAML reader does not unescape `\\` — my first grep assertion
passed vacuously because of it; validate_acceptance_assertions now rejects a
doubled backslash in any evidence block.

## 2026-09-22 — R-8.12: the judge's gaps become tasks (Spec Kit converge)

`semantic_verify.mjs` already wrote its «to genuinely satisfy the contract»
list into narrative.md as prose, and into semantic_review.json (overwritten
every run). Now a live verdict's list is also appended to tasks.md under
«## Convergence (semantic judge, append-only)» as C1, C2 … with the date and
the judge: on the Tasks tab with a done state, and picked up by the next
agent run like any unchecked task. Append-only: a todo already listed —
ticked or not, other case or spacing — is not added again; nothing is ever
removed. On the mock the judge asks for nothing and nothing is written.

# b.clarify — understanding

_Declared by the executing agent before writing code for R-8.08. If a contract
file of this block changes after this file, the declaration may be stale._

_Re-read after the contract edits of the same run (the trajectory section and
«Вторая сторона» were added to mission.md after the first version): the frame
still holds; the ownership choice below was made during the work and was not
declared the first time. Overwritten per the protocol, not appended._

## Treating this as

Two additions to the contract the coding agent receives, plus a small reader
library — not a new arbiter. The closest known analogue is a pull-request
description written BEFORE the diff: «here is what I think this is and what I
am about to do», which a reviewer can reject in one line before any code
exists. The trajectory is the other half: the reviewer's note on where the
code is going, so that among several correct diffs the one that can grow is
chosen.

## In scope

- Read a trajectory section from `mission.md` (Russian and English headings),
  render it in the implementation prompt with an instruction on how to use it,
  and remove it from the Mission section so it is not sent twice.
- An explicit instruction for the case where no trajectory is declared, so the
  agent's choice is recorded as an assumption instead of made silently.
- A «Step 0» prompt section: write `understanding.md` with fixed headings
  before any code.
- Parser for `understanding.md` and a staleness check against the contract.
- `clarify_block` reports the clarifier's own operative frame — this covers
  print-only mode, where no executor runs and no `understanding.md` appears.
- A report validator in nightly.

## Out of scope

- Writing trajectories for existing blocks. Where a block is heading is the
  operator's knowledge; inventing it would be exactly the silent guess this
  work exists to prevent. Only b.clarify gets one, because its own narrative
  and KPI-5 already state it.
- A hard gate on `understanding.md`. There is no evidence yet that a missing
  or stale declaration precedes real rework; a gate without a problem-basis is
  a ritual. The promotion condition is recorded in the validator header.
- Canvas rendering (b.clarify PR3).
- Exemplars / the «closer to this than to that» axis. `always_use.json` has
  existed for months with zero entries; exemplars would likely share its fate.

## Variant chosen

- Trajectory is a SECTION of `mission.md`, not a new file. Meaning already
  lives in the mission; no new required file, no template churn, nothing for
  `validate_no_template_placeholders` to flag on blocks that have none.
- `understanding.md` is written by the executing agent — the one whose frame
  actually drives the code — not produced by a separate LLM call ahead of it.
- Report, not gate (see Out of scope).
- `block_meaning.mjs` is owned by b.clarify, not b.agent-orchestrator: it is
  about meaning transfer, and the clarifier's own report reads it too. The cost
  is a new edge b.agent-orchestrator → b.clarify, declared in both
  `depends_on.md` and `graph.json` (the R-8.06 lesson) and checked for cycles.

Against b.clarify's own trajectory (the Q→A log becomes a per-operator
calibration corpus): `understanding.md` keeps a fixed heading set so that
declared frames stay machine-comparable across runs. A «Treating this as» that
the operator had to correct is the same kind of calibration data as a line in
`clarifications.md`.

## Assumed without asking

- Headings in `understanding.md` are English because the prompt is English;
  the content under them may be in any language.
- «Stale» means a contract file (`mission.md`, `acceptance.md`, `kpi.md`,
  `user_story.md`) was modified after `understanding.md`. This is mtime-based,
  and a fresh git checkout resets mtimes, so staleness is advisory only.
- `understanding.md` is overwritten on each run, not appended to: it states
  the current understanding, and history is in git.

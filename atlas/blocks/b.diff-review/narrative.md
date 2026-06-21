# b.diff-review — narrative

## 2026-06-20T20:00:00Z · block scoped — imported diff-review from loop-engineer-template (R-8.01)

### What I tried
The operator pointed at github.com/neskuchny/loop-engineer-template and asked
«what's useful for us». Most of it (Ralph loop, worktree isolation, file
memory, verify-gating, CLAUDE.md template) we already have, often deeper. One
thing we genuinely lacked: a **diff-level code review** arbiter. Their
ship-change.js has a Review stage that runs an independent second opinion on
the git diff looking for BLOCKING problems (correctness bugs, security holes,
regressions, pathological regex, type errors). We capture the diff but never
review it for that.

### What worked
Scoped it as a fourth arbiter, distinct from the three we have:
- deterministic verifier → «did acceptance pass?»
- cascade + green-guard → «did we break neighbours?»
- semantic judge → «does the implementation match the mission's meaning?»
- diff-review (NEW) → «is there a bug/hole/regression in this CHANGE itself?»

The semantic judge reads whole alive files and judges meaning; diff-review
reads only the diff and judges the change. Different layer. This would have
caught «code landed in the wrong block's territory» at the diff stage during
last night's V-1 run, before the semantic judge had to.

### What failed and why
Nothing yet — implementation follows. One thing I deliberately did NOT import:
loop-engineer's «Simplify» stage (refactor working code for clarity post-
implementation). It's in tension with our Principle II — agents already
over-simplify; we don't want a pipeline step that encourages it.

### Decisions made
- Layer: `ai` (it's an LLM-judge, like b.acceptance-verifier-loop's semantic
  layer; not data, not logic).
- depends_on: b.llm-gateway (the judge call), b.agent-orchestrator (it's a
  V-1 pipeline gate).
- Tri-state with inconclusive-first enum so mock/no-key degrades safely.
- Lives as its own block so the «fourth arbiter» is a first-class contract,
  not buried inside the daemon.

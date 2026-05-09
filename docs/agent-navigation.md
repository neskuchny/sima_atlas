# Agent Navigation — how to traverse Sima Atlas without burning tokens

This document tells AI agents (Claude Code, Cursor, Codex, Aider, custom agents)
**how to read and write the Sima Atlas codebase economically**. It's the
strategic counterpart to the MCP tool list — tools tell you *what's available*,
this tells you *what to call when*.

Read order: glance through once, then refer back per task. The goal is to keep
the per-task read budget under ~10 file reads instead of `cat`-ing the whole
`atlas/` tree.

---

## TL;DR

1. **Block = directory of contracts, not code**. Each block is `atlas/blocks/<id>/`
   or `atlas/clients/<client>/blocks/<id>/` containing `mission.md` / `kpi.md` /
   `acceptance.md` / `depends_on.md` / `provides.md` / `tasks.md` / `files.md` /
   `code_summary.md` / `checks.log`.
2. **Read the contract before reading the code**. Mission tells you the *intent*;
   code tells you only the *current attempt*.
3. **MCP tools beat raw `Read`**. `read_block(id)` returns a clean digest;
   `Read atlas/blocks/<id>/mission.md` works but loses neighbor context.
4. **Skip-list**: never read `atlas/llm_traces/`, `atlas/run_logs/`,
   `atlas/acceptance_runs/<old>/`, `atlas/process_runs/`, `archive/`. They're
   logs, not source of truth.
5. **Edges are typed**: walk `depends_on` to find what feeds your block;
   walk `provides` to find who consumes it. Don't grep the whole graph.
6. **Write only inside `atlas/blocks/<your-block>/`**. Touching graph.json or
   another block's directory is a contract violation that will fail nightly
   validators.

---

## Standard read order for "implement block X"

This is the deterministic minimum-context path. Follow it top-to-bottom; stop
at the first level that fully answers your question.

```
1. atlas/project.md                       ← what's this whole product
2. atlas/clients/<client>/project.md      ← if multi-tenant; overrides 1
3. atlas/rules.md                         ← global coding rules (must-not-do)
4. atlas/tech_stack.md                    ← lock on stack choices
5. atlas/blocks/<X>/mission.md            ← intent of THIS block
6. atlas/blocks/<X>/acceptance.md         ← how "done" is verified
7. atlas/blocks/<X>/depends_on.md         ← who feeds X
8. for each dep <D> in depends_on:
     atlas/blocks/<D>/provides.md         ← what D promises
     atlas/blocks/<D>/mission.md          ← only if provides.md is sparse
9. atlas/blocks/<X>/tasks.md              ← decomposed work items
10. atlas/blocks/<X>/narrative.md         ← human-readable run history (R-7.80)
11. atlas/blocks/<X>/decisions.log        ← past architectural choices (don't reverse)
12. atlas/blocks/<X>/checks.log           ← run verdicts (last 30 lines)
13. atlas/operator_profile/dont_use.json  ← NEVER-do rules (filter to this block_id)
14. atlas/operator_profile/always_use.json ← ALWAYS-do rules (filter to this block_id)
```

After step 6 you usually have enough to write code. Steps 7-9 are for
cross-cutting changes. Step 10 is for "why did the previous attempt fail."

**Don't read** `kpi.md` for implementation context — KPIs are for verifier,
not for coding decisions. Read it only when proposing a new acceptance criterion.

**Don't pre-read** sibling blocks unless `depends_on.md` lists them.

---

## MCP tools — which to call when

The Sima MCP server (registered via `.mcp.json` for Claude Code, or via
`docs/integrations.md` configs for other agents) exposes ~64 tools. The 12 you
will actually use:

| Tool | When |
|---|---|
| `read_block(block_id)` | Standard "show me the contract" — returns mission + kpi + acceptance + depends/provides in one digest |
| `list_dependencies(block_id)` | Walk the graph one hop — returns id + provided capability for each dependency |
| `build_context_pack(block_id, profile?)` | Generate the deterministic context pack the verifier will use; **includes checks.log tail, decisions.log, narrative.md, code_summary.md, architecture_decisions.md, and operator memory (lessons / dont_use / always_use) filtered to this block** (R-7.76+). **R-7.86 (S-4) profiles** — `design` (default, full ~5-15K tokens, for new-block scoping & major refactors), `backend-fix` (~2-4K, mission+acceptance+decisions+narrative+deps' provides only), `ui-fix` (~1.5-3K, frontend-focused, no deps), `acceptance-only` (~0.5-1.5K, for verifier or "is this ready to ship" runs). `architecture_decisions` is ALWAYS included regardless of profile. |
| `update_block(block_id, file, content)` | Write back to mission/kpi/acceptance/tasks. Safer than raw file write — validates path. |
| `verify_block_acceptance(block_id)` | Run all acceptance assertions and return tri-state (pass/fail/inconclusive) per assertion |
| `sync_check(block_id?)` | Drift report — depends_on capabilities not provided by anyone, provides not consumed, etc |
| `read_block_history(block_id)` | Show the last N runs for this block — useful when re-attempting |
| `accept_proposal(id)` / `reject_proposal(id)` | Process pending UI-generated block proposals from `✦ Sima fill from chat` |
| `nightly_consolidation()` | Run all 68 validators across the whole graph; expensive — for end-of-session |
| `generate_full_bundle()` | Regenerate WIKI / auto_tz / roadmap from current graph state |
| `add_lesson` / `set_dont_use` / `set_always_use` | **Operator-locked memory** (R-7.76+). Use `set_dont_use {block_id, rule, reason, severity}` to lock an architectural rule the agent must never violate (severity:hard fails the run; severity:soft warns). These are read by `build_context_pack`, injected into every subsequent agent prompt, AND scanned post-run against modified files via `scan_run_for_drift.mjs` |
| `cascade_verify {block_id}` | **R-7.84 (S-8) — break-detection on edit.** After editing block X, re-runs acceptance verifier on every block whose `depends_on` references X. Anything that broke gets auto-flagged `status: desync` in graph.json with reason «cascade: parent X edit», + entry in their `checks.log` and `narrative.md`. Operator sees the break inline on the canvas, not at next morning's nightly sweep. `run_block_implementation.mjs` calls this automatically after a successful run; you can also invoke directly to re-check after manual edits. Pass `dry_run: true` to preview without patching. |
| `add_architecture_decision {decision, rationale, affects?, reversible?}` | **R-7.85 (S-6) — project-level architectural lock-in, append-only.** Use when the operator says «use LLM not math», «Postgres not MongoDB», «JWT 15min refresh 30day». Each entry is auto-injected into EVERY future agent prompt across ALL blocks under the «## ⚖ Architecture decisions» section. Agents physically cannot silently reverse a past entry — surface change requests in `narrative.md` instead. Append-only by design (no edit/delete API). Returns the appended markdown. |
| `list_architecture_decisions` | List the current entries from `atlas/architecture_decisions.md`. Use BEFORE proposing an architecture change to check what's already locked in. |

**Rule of thumb**: if the question is about *one block*, use `read_block`. If
it's about *the connection between two blocks*, use `list_dependencies`. If
it's about *correctness of the whole graph*, use `sync_check`.

If the MCP server isn't connected (rare — but possible in headless mode),
fall back to direct file reads following the order above.

---

## Memory layer — read & write rules (R-7.76+)

Sima's memory is **typed and small** — not a single dumping CLAUDE.md.
When you work on a block, you AUTOMATICALLY get its memory in your
prompt (via `run_block_implementation.mjs`); your job is to update it
correctly so the next agent (which may be you in 3 weeks) doesn't
repeat your mistakes.

### What you READ (already in your prompt — don't re-fetch)

These are pre-loaded into your prompt under `## ⚠ Block memory`:

- **`narrative.md`** — human-readable run history. Sections per past
  run with `### What I tried`, `### What worked`, `### What failed
  and why`, `### Decisions made`. Plain English, not jargon-only —
  read this FIRST before re-discovering wheels.
- **`decisions.log`** — append-only architectural-choice log.
  Format: `<ISO-ts> | <decision> | <rationale>`. **Never reverse a
  past decision** without explicit operator override.
- **`checks.log`** — last 50 lines of run verdicts. Read for
  "what kind of failures keep happening on this block".
- **`code_summary.md`** — auto-generated post-run summary of the
  block's current code state. Use to orient quickly.
- **`operator_memory.dont_use`** — operator-locked NEVER-do rules
  scoped to this block or global. Severity:hard means run will FAIL
  if you violate. Severity:soft means it gets logged.
- **`operator_memory.always_use`** — operator-locked ALWAYS-do
  rules. Same scoping.
- **`operator_memory.lessons`** — distilled lessons from past
  runs (cross-block when global, per-block when scoped).

### What you WRITE (after every run — required)

At the end of your run, append to two files:

1. **`atlas/blocks/<id>/narrative.md`** — append a section:
   ```
   ## <ISO-timestamp> · <one-line summary>

   ### What I tried
   - ...

   ### What worked
   - ...

   ### What failed and why
   - ...

   ### Decisions made
   - ...
   ```
   Write in **plain language** (operator's preferred language —
   Russian if they're Russian-speaking, English otherwise). Future
   agents read this in 2 weeks and need to reconstruct context fast.

2. **`atlas/blocks/<id>/decisions.log`** — append one line per
   architectural choice you made:
   ```
   <ISO-ts> | <decision> | <rationale>
   ```
   Append-only — never rewrite past entries.

### Anti-hallucination guard (R-7.82 / S-3)

After your run, `scan_run_for_drift.mjs` automatically scans every
file you touched and matches against `dont_use.json` + `always_use.json`
rules. If you violated a hard rule, the run is marked **Failed**
regardless of whether acceptance passed. If you violated a soft rule,
it's logged to `checks.log` + `narrative.md` so future agents see it.

This means: **you cannot silently ignore an operator-locked rule**.
If the operator said "use LLM for sentiment, never math" — adding
`Math.sqrt` to a sentiment function will fail your run automatically.

If you genuinely believe a rule should be lifted, write your reasoning
into `narrative.md` under `### Decisions made` and ask the operator —
don't bypass it.

### Lessons (cross-block)

If during your run you discovered something useful for OTHER blocks
("Postgres `LISTEN/NOTIFY` worked great for the queue pattern, no need
for redis"), add a lesson via MCP:

```
add_lesson { lesson: "...", block_id: null, reason: "..." }
```

`block_id: null` makes it global — visible to every future block.
`block_id: "b.X"` scopes it to that block.

---

## Skip-list — files to NEVER auto-read

These directories are logs, snapshots, or historical state. Reading them
silently consumes thousands of tokens and rarely helps.

```
atlas/llm_traces/        — every LLM call ever made; for debugging only
atlas/run_logs/          — agent stdout/stderr; read only the specific run_id you care about
atlas/run_state/         — FSM snapshots; never relevant for coding decisions
atlas/acceptance_runs/   — historical verifier results; current state is in checks.log
atlas/process_runs/      — process-level lifecycle traces
atlas/eval_history/      — evaluation history
atlas/operator_profile/  — per-operator preferences (privacy-sensitive)
atlas/proposals/         — pending UI proposals (use accept_proposal MCP tool instead)
atlas/context_packs/     — pre-built context packs (use build_context_pack MCP tool)
atlas/ingestion_scratch/ — scratch space for chat-distillation
node_modules/            — dependencies (obvious, but worth stating)
archive/                 — moved-aside content; never relevant
test-results/            — Playwright artifacts
```

If you find yourself wanting to grep across one of these, stop and ask whether
an MCP tool answers the question more directly.

---

## Write protocol

1. **Owner-only writes**. A run for `block_id=X` may only write inside
   `atlas/blocks/X/` (or `atlas/clients/<client>/blocks/X/`). Cross-block
   writes require an explicit `decisions.log` entry justifying the change.

2. **Never edit `atlas/graph.json` by hand**. Use MCP `update_block` /
   `add_edge` / `remove_edge` — they validate invariants and update derived
   files (depends_on.md / provides.md) atomically. Manual edits drift.

3. **Always append to `checks.log` at end of session**. Format:
   ```
   <ISO-8601 timestamp>\t<step>\t<verdict>\t<note>
   ```
   `<verdict>` ∈ `pass | fail | inconclusive`. The verifier reads this to
   decide if the run succeeded.

4. **`patterns.md` and `decisions.log` are append-only**. Patterns capture
   "what worked / what didn't"; decisions capture "why we chose X over Y."
   Future runs read them for context — they're how the block accumulates memory.

5. **Don't touch other clients' atlases**. `atlas/clients/<other>/` is
   another tenant's product. Multi-tenant isolation is enforced at API
   level but easy to violate via direct filesystem write.

---

## Edge traversal — walking the graph

`depends_on.md` lists upstream blocks: format `<block_id>: <capability>`. To
implement X correctly:

1. Read X's `depends_on.md`. For each line, **read only the corresponding
   `provides.md`** of the dependency — that file states the contract X relies on.
2. Read the dependency's `mission.md` only if `provides.md` is too terse to
   implement against (rare).
3. Don't recurse — dependencies of dependencies are not your concern unless
   you're refactoring across the boundary, in which case use
   `sync_check(block_id=X)` to get the full transitive impact.

Reverse direction: who consumes my block? `grep` for `<your-id>:` across
`atlas/blocks/*/depends_on.md` (one shell command, ~50 ms). Or
`list_dependencies` with reverse=true if your MCP server supports it.

---

## Stop-signals — when to stop and ask

Save tokens by recognizing these patterns and **breaking the loop** instead
of trying again:

1. **Acceptance fails twice in a row with similar verdict** → the mission is
   ambiguous or the acceptance is wrong. Re-read `mission.md` + `acceptance.md`
   carefully; if still unclear, propose a mission edit before another run.

2. **Tests pass but `verify_block_acceptance` returns `inconclusive`** →
   evidence collector can't determine outcome. Look at the specific assertion;
   it probably needs `evidence_kind` change (e.g., `log_grep` → `selftest_run`)
   rather than more code.

3. **Sync-check shows orphan provides** → your block claims to provide
   capability X but nobody depends on it. Either remove the claim or ask the
   operator if that capability should be wired into a downstream block.

4. **Multiple `dont_use.json` entries reference the same library** → there's
   a hard rule against using it in this codebase. Don't try to bypass; use
   the alternative listed in `always_use.json`.

5. **`tech_stack.md` lock is incompatible with what mission asks** →
   architectural drift. Don't silently bridge — flag it as a `concern` and
   stop. The operator needs to resolve via `🏛 Architecture review` in UI
   or update `tech_stack.md` first.

---

## Common task templates

### "Add a new feature X"
1. Check `atlas/graph.json` (or run `read_block` on root) for an existing block
   that owns this concern. If found, you're patching it — go to template 2.
2. If not, propose a new block: write a draft `mission.md` to scratch, ask
   operator for confirmation. Don't auto-create — the canvas creates blocks via
   UI to keep IDs and edges consistent.

### "Fix bug in block X"
1. `read_block(X)` — get current contract.
2. Read last 30 lines of `atlas/blocks/X/checks.log` — likely the failure
   you're being asked to fix is already logged.
3. Make code change scoped to files listed in `atlas/blocks/X/files.md`.
4. Run `verify_block_acceptance(X)` to confirm fix.
5. Append to `checks.log` with verdict.

### "Refactor crossing block X and Y"
1. `sync_check(X)` and `sync_check(Y)` — get drift report between them.
2. Update `depends_on.md` / `provides.md` to reflect new contract.
3. Add `decisions.log` entry in BOTH blocks justifying the change.
4. Run `verify_block_acceptance` on both; both must pass.

### "Understand the whole product"
1. Read `atlas/project.md` (root or per-client).
2. `read_block` on each block listed in `atlas/graph.json:blocks[]` —
   first iteration only their `mission.md` headers + status, not full contracts.
3. Use `🏛 Architecture` review (UI) or `nightly_consolidation` (MCP) for
   cross-cutting concerns.

---

## Token-economy checklist

Before starting any task, ask yourself:
- [ ] Did I read the block's `mission.md` first?
- [ ] Did I check `acceptance.md` to know what "done" looks like?
- [ ] Did I limit dependency reads to `provides.md` files (not full missions)?
- [ ] Did I avoid the skip-list directories?
- [ ] Will I write only inside `atlas/blocks/<owner>/`?
- [ ] Will I append to `checks.log` at end?

If any answer is "no", re-plan before reading further.

---

## Where this document lives

- **Canonical**: `docs/agent-navigation.md` (this file)
- **Claude Code skill**: `.claude/skills/sima-atlas-navigator/SKILL.md`
- **Cursor rule**: `.cursor/rules/sima-atlas-navigator.mdc`
- **Top-level `AGENTS.md`**: thin pointer to this doc

When you change the strategy, update this file. The adapters re-export it.

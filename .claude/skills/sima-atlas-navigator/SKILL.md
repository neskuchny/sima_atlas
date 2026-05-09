---
name: sima-atlas-navigator
description: |
  Use this skill whenever working in a Sima Atlas codebase (any repo containing
  an `atlas/` directory with `graph.json` and `blocks/<id>/` subdirectories).
  It tells you the standard read order, MCP tool selection, skip-list, write
  protocol, and stop-signals so you don't burn tokens on irrelevant files.
  Activate before reading any contract file.
---

# Sima Atlas Navigator

You are working in a Sima Atlas codebase — a contract-first AI development tool
where each product feature lives as a directory of contracts (`mission.md` /
`kpi.md` / `acceptance.md` / `depends_on.md` / `provides.md` / etc.) instead
of free-form code.

**Before reading anything else, follow this navigation strategy:**

## 1. Standard read order — minimum context, maximum signal

For "implement / fix block X":

1. `atlas/project.md` (root) or `atlas/clients/<client>/project.md` (multi-tenant)
2. `atlas/rules.md` — global must-not-do
3. `atlas/tech_stack.md` — locked stack choices
4. `atlas/blocks/<X>/mission.md` — intent
5. `atlas/blocks/<X>/acceptance.md` — how «done» is verified
6. `atlas/blocks/<X>/depends_on.md` — upstream blocks
7. For each dep `<D>`: only `atlas/blocks/<D>/provides.md`
8. `atlas/blocks/<X>/tasks.md` — decomposed work
9. **`atlas/blocks/<X>/narrative.md` — human-readable run history** (R-7.80)
10. **`atlas/blocks/<X>/decisions.log` — past architectural choices** (don't reverse)
11. Last 30 lines of `atlas/blocks/<X>/checks.log` — verdict log
12. **`atlas/operator_profile/dont_use.json` — NEVER-do rules** (filter to this block)
13. **`atlas/operator_profile/always_use.json` — ALWAYS-do rules** (filter to this block)

Stop at the first level that fully answers the question. **Don't
pre-read** sibling blocks unless `depends_on.md` lists them.

**Note**: when invoked through `run_block_implementation.mjs`, items
9-13 are already pre-injected into your prompt under "## ⚠ Block memory"
— don't re-fetch them.

## 2. Prefer MCP tools over raw file reads

Sima exposes ~64 MCP tools (prefix `mcp__sima-atlas__*` when registered via
`.mcp.json`). The 5 you'll actually need:

- `read_block(block_id)` — full contract digest in one call (replaces 5+ Reads)
- `list_dependencies(block_id)` — single-hop graph walk
- `update_block(block_id, file, content)` — validated write back
- `verify_block_acceptance(block_id)` — run all assertions, returns
  pass/fail/inconclusive per assertion
- `sync_check(block_id?)` — drift report (dangling deps, orphan provides)

If MCP isn't connected, fall back to direct file reads following the order above.

## 3. Skip-list — NEVER auto-read these directories

Reading these silently consumes thousands of tokens with no decision-relevant
content:

```
atlas/llm_traces/        — historical LLM calls
atlas/run_logs/          — agent stdout/stderr archives
atlas/run_state/         — FSM snapshots
atlas/acceptance_runs/   — historical verifier results
atlas/process_runs/      — process traces
atlas/eval_history/      — eval logs
atlas/operator_profile/  — operator preferences (privacy)
atlas/proposals/         — use accept_proposal MCP tool instead
atlas/context_packs/     — use build_context_pack MCP tool instead
node_modules/            — deps
archive/                 — moved-aside content
test-results/            — Playwright artifacts
```

If you want to grep across one of these, stop and ask whether an MCP tool
answers the question more directly.

## 4. Write protocol

- **Owner-only writes**: a run for `block_id=X` may only write inside
  `atlas/blocks/X/` (or `atlas/clients/<client>/blocks/X/`)
- **Never edit `atlas/graph.json` by hand** — use MCP `update_block` /
  `add_edge` / `remove_edge`; manual edits drift
- **Append to `checks.log` at end** with format
  `<ISO-timestamp>\t<step>\t<verdict>\t<note>`, verdict ∈ `pass|fail|inconclusive`
- **Append to `narrative.md`** at end of run — REQUIRED. New section
  `## <ts> · <one-line summary>` with sub-sections `### What I tried`,
  `### What worked`, `### What failed and why`, `### Decisions made`.
  Plain language (operator's preferred — Russian if Russian-speaking).
  Future agents read this in 2 weeks.
- **Append to `decisions.log`** for each architectural choice:
  `<ISO-ts> | <decision> | <rationale>` — append-only, never rewrite.
- **`patterns.md`** is append-only too (auto-distilled by
  `reflect_after_run.mjs`)

### After-run drift scan (R-7.82)

`scan_run_for_drift.mjs` runs automatically after your run. It scans
files you touched against `dont_use.json` + `always_use.json` rules.
**Hard violations FAIL the run** even if acceptance passed. **Soft
violations are logged** to `checks.log` + `narrative.md`. You cannot
silently ignore an operator-locked rule — write your reasoning into
narrative if you genuinely think a rule should be lifted.

## 5. Stop-signals — break the loop

- **Acceptance fails twice with similar verdict** → mission/acceptance is
  ambiguous; re-read both, propose mission edit before another run
- **Tests pass but acceptance is `inconclusive`** → wrong `evidence_kind`,
  not wrong code
- **Sync-check shows orphan provides** → unused capability; ask operator
- **`tech_stack.md` lock incompatible with mission** → architectural drift,
  flag and stop, don't silently bridge

## 6. Common task templates

**Fix bug in X**: `read_block(X)` → check last 30 lines of `checks.log` →
edit files in `files.md` → `verify_block_acceptance(X)` → append to checks.log

**Refactor X↔Y**: `sync_check(X)` and `sync_check(Y)` → update
`depends_on.md`/`provides.md` in both → `decisions.log` in BOTH → verify both

**Add feature X**: check `graph.json` for existing block first; if new, draft
`mission.md` and ask operator before auto-creating (canvas keeps IDs consistent)

## Reference

Full canonical version with rationale: `docs/agent-navigation.md` in the repo.

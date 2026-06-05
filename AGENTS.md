# Agents working in this repo

If you're an AI coding agent (Claude Code / Cursor / Codex / Aider / custom)
operating in a Sima Atlas codebase, **read [`docs/agent-navigation.md`](docs/agent-navigation.md) first**.
That document is the canonical strategy for how to traverse this repo
economically — read order, MCP tool selection, skip-list, write protocol,
stop-signals.

## Quick contract (full version in agent-navigation.md)

1. **Block = directory of contracts**, not code. Each block is
   `atlas/blocks/<id>/` containing `mission.md`, `kpi.md`, `acceptance.md`,
   `depends_on.md`, `provides.md`, `tasks.md`, `files.md`, `code_summary.md`,
   `checks.log`. Multi-tenant: `atlas/clients/<client>/blocks/<id>/`.

2. **Read mission before code.** Standard order: `/atlas/project.md` →
   `/atlas/rules.md` → tech_stack → mission → acceptance → depends_on →
   (deps' provides) → tasks →
   **narrative.md → decisions.log → checks.log → operator_profile/dont_use+always_use**.
   Stop at the first level that answers the question. The last four
   are the **memory layer** (R-7.76+) — they tell you what was tried,
   rejected, and locked-in by the operator. Never reverse past
   decisions without explicit operator override.

   When invoked through `run_block_implementation.mjs`, all of the
   above is pre-injected into your prompt under «## ⚠ Block memory» —
   don't re-fetch.

3. **Use MCP tools, not `Read`**, when available. Sima registers ~64 tools via
   `.mcp.json` (Claude Code auto-detects; for Cursor/others see
   [`docs/integrations.md`](docs/integrations.md)). The five you'll need:
   `read_block`, `list_dependencies`, `update_block`, `verify_block_acceptance`,
   `sync_check`.

4. **Skip-list** — never auto-read these:
   `atlas/llm_traces/`, `atlas/run_logs/`, `atlas/run_state/`,
   `atlas/acceptance_runs/`, `atlas/process_runs/`, `atlas/eval_history/`,
   `atlas/operator_profile/`, `atlas/proposals/` (use `accept_proposal` MCP
   tool), `atlas/context_packs/` (use `build_context_pack` MCP tool),
   `node_modules/`, `archive/`, `test-results/`.

5. **Owner-only writes.** A run for block `X` writes only inside
   `atlas/blocks/X/`. Never edit `atlas/graph.json` by hand — use MCP tools.
   At end of run, REQUIRED writes:
   - `checks.log` — verdict line (`pass | fail | inconclusive`)
   - **`narrative.md`** — section `## <ts> · <summary>` with sub-sections
     `### What I tried`, `### What worked`, `### What failed and why`,
     `### Decisions made`. Plain language so the next agent (you in 3
     weeks) reconstructs context fast.
   - **`decisions.log`** — for each architectural choice: append
     `<ISO-ts> | <decision> | <rationale>`. Append-only.

   After your run, `scan_run_for_drift.mjs` (R-7.82) automatically
   scans your file changes against `operator_profile/dont_use.json`
   + `always_use.json`. Hard violations FAIL the run; soft are logged
   to checks.log + narrative.md. You CANNOT silently ignore a locked
   rule — write reasoning into narrative if you think a rule should
   be lifted.

6. **Stop-signals** — break the loop:
   - Acceptance fails twice similarly → mission/acceptance is ambiguous; edit
     mission before another run
   - Tests pass but acceptance is `inconclusive` → wrong `evidence_kind`, not
     wrong code
   - `tech_stack.md` lock incompatible with mission → architectural drift,
     flag and stop

For the rationale, common task templates (fix bug / refactor / add feature),
and the token-economy checklist, see [`docs/agent-navigation.md`](docs/agent-navigation.md).

## Adapter mapping

The same navigation strategy is auto-loaded from three places depending on
which agent you are:

| Agent | Where it loads from |
|---|---|
| Claude Code | `.claude/skills/sima-atlas-navigator/SKILL.md` (auto-activates on repo open) |
| Cursor | `.cursor/rules/sima-atlas-navigator.mdc` (`alwaysApply: true`) |
| Codex / Aider / others | This `AGENTS.md` + `docs/agent-navigation.md` (via system prompt include) |

If you're integrating a new agent, mirror the same strategy in whatever
config file your agent reads at startup. The canonical version is always
[`docs/agent-navigation.md`](docs/agent-navigation.md) — keep adapters thin
so the strategy stays in one place.

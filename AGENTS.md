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

2. **Read mission before code.** Standard order: project → rules → tech_stack
   → mission → acceptance → depends_on → (deps' provides) → tasks → checks.log.
   Stop at the first level that answers the question.

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
   Append to `checks.log` at end of session with verdict
   (`pass | fail | inconclusive`).

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

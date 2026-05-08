# Claude Code in this repo

Claude Code auto-loads two things when opening this repo:

1. **`.mcp.json`** — registers the Sima MCP server (~64 tools). On first
   session in this directory, Claude Code may ask permission to run
   `node scripts/mcp_atlas_server.mjs`. Approve it. Tools become available
   under the `mcp__sima-atlas__*` prefix.

2. **`.claude/skills/sima-atlas-navigator/SKILL.md`** — the navigation
   strategy (read order, MCP tool selection, skip-list, write protocol,
   stop-signals). Auto-activates whenever you work in a Sima Atlas codebase.

For the canonical version of the navigation strategy, see
[`docs/agent-navigation.md`](docs/agent-navigation.md). Both `AGENTS.md`
and `.claude/skills/sima-atlas-navigator/SKILL.md` are adapters of that one
document — keep edits in sync.

## If MCP didn't auto-register

```bash
claude mcp add sima-atlas node scripts/mcp_atlas_server.mjs
```

## Most-useful MCP entry points

- `read_block` / `update_block` / `verify_block_acceptance` — per-block contract operations
- `list_dependencies` — single-hop graph walk
- `sync_check` — drift report (orphan provides, dangling deps)
- `sima_fill_from_chat` — turn a conversation into block proposals
- `sima_watch_chats` — scanner for `~/.claude/projects/`, picks up fresh transcripts
- `accept_proposal` / `reject_proposal` — process pending UI proposals
- `nightly_consolidation` — run all 68 validators
- `generate_full_bundle` — regenerate WIKI / auto_tz / roadmap
- `build_context_pack` — deterministic per-block context for the verifier

Full tool list: see `scripts/mcp_atlas_server.mjs`.

## Running the UI alongside Claude Code

`npm run dev` brings up the API on `:8787` and the canvas on
`http://localhost:8000`. The UI and your Claude Code session share the same
`atlas/` filesystem state — edits in either propagate via 5-second polling.

## Integrations with other agents

Cursor / Codex / Continue / Zed / Windsurf / Antigravity / CLI fallback —
see [`docs/integrations.md`](docs/integrations.md) for ready-made config
blocks. The navigation strategy is the same across all of them, exposed
through the appropriate adapter file.

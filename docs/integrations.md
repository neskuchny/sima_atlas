# Connecting Sima Atlas to AI development tools

> Russian original preserved at [`./integrations.ru.md`](./integrations.ru.md).

Sima Atlas is built around **MCP (Model Context Protocol)** — Anthropic's standard, which most modern AI agents already support. The same MCP server `scripts/mcp_atlas_server.mjs` plugs into any of them; only the config format and path differ.

In the repository root there's an **`.mcp.json`** — the format that Claude Code and compatible tools pick up automatically. For everything else, copy the relevant block below.

> **Important.** Commands and config paths drift over time. If something here is stale, check the current docs of your tool and send a PR. Document version: 2026-05-06.

---

## TL;DR — copy-paste

The short version is the same block (with minor formatting variations) everywhere:

```json
{
  "mcpServers": {
    "sima-atlas": {
      "command": "node",
      "args": ["scripts/mcp_atlas_server.mjs"],
      "cwd": "/absolute/path/to/sima_atlas"
    }
  }
}
```

If the server is launched from the `sima_atlas` directory (as Claude Code does out of the box), `cwd` can be omitted. For most tools the `cwd` field is mandatory, because they typically start from the user's project directory rather than from Sima.

---

## LLM provider: Ollama (local models)

R-7.60 added a local-model provider so you can run Sima entirely offline
against Llama / Qwen / DeepSeek / Mistral / etc. via [Ollama](https://ollama.com).

**Setup:**

```bash
# 1. Install Ollama (https://ollama.com/download)
# 2. Pull a model — qwen2.5-coder:7b is a strong default for code tasks
ollama pull qwen2.5-coder:7b

# 3. Start the daemon (runs on :11434 by default)
ollama serve
```

**Wire it into Sima:**

Set `LLM_PREFER_OLLAMA=1` in your environment (or in a `.env` file Sima
auto-loads). The cascade then becomes
`ollama → claude_cli → anthropic → google → mock` and Ollama wins as long
as the daemon is reachable.

```bash
# .env
LLM_PREFER_OLLAMA=1
LLM_OLLAMA_MODEL=qwen2.5-coder:7b   # whatever you pulled; default: llama3.2
OLLAMA_BASE_URL=http://localhost:11434  # default; override for remote box
```

Or use `LLM_DEFAULT_PROVIDER=ollama` to force it explicitly (no fallback —
fails loudly if Ollama isn't reachable).

**Schema mode.** Ollama's native `format: 'json'` doesn't enforce a
specific schema (unlike Anthropic's tool-use). Sima pastes the schema
into the prompt as a hint and parses the response; if the model returns
markdown-fenced JSON, the fences are stripped automatically. If parsing
fails entirely, the raw text is wrapped into the schema's first string
property — same fallback pattern we use for `claude_cli`.

**Why it's opt-in (not first in cascade by default).** The detection
probe takes ~2 seconds when the daemon isn't running, and most users
have neither installed. Setting `LLM_PREFER_OLLAMA=1` opts in and skips
the cost.

**Cost.** Zero from Sima's POV — it's your hardware. Token counts come
from Ollama's `prompt_eval_count` / `eval_count`.

For vLLM / LM Studio / llama.cpp HTTP adapters — copy the `callOllama`
function in `scripts/llm_gateway.mjs:450-525` and adjust the endpoint /
response shape. ~80 lines per adapter.

---

## Navigation skill — same strategy across all agents

MCP gives an agent the **tools** (`read_block`, `update_block`, etc.); the
navigation skill tells it **when to call which tool** and which directories to
*never* read so tokens aren't wasted on logs and snapshots.

The canonical strategy lives in [`docs/agent-navigation.md`](agent-navigation.md).
It's mirrored into per-agent adapter files that load automatically:

| Agent | File loaded automatically | Format |
|---|---|---|
| Claude Code | `.claude/skills/sima-atlas-navigator/SKILL.md` | Anthropic Skills (frontmatter `name` + `description`) |
| Cursor | `.cursor/rules/sima-atlas-navigator.mdc` | Cursor Rules (frontmatter `description` + `globs` + `alwaysApply`) |
| Codex / Aider / Continue / others | `AGENTS.md` (top-level) + `docs/agent-navigation.md` | plain markdown, include via system prompt |

When you change the strategy, edit `docs/agent-navigation.md` only. The
adapters reference it. To add support for a new agent: create an adapter file
in whatever format the agent reads on startup, with a one-line pointer to the
canonical doc.

**Why this matters:** without the skill, agents reading through `atlas/`
typically read 30+ files per task (logs, traces, history). With the skill,
the standard read order caps at ~10 reads — most of them MCP `read_block`
calls that return one digest each. On a 50-block product this saves
thousands of tokens per session.

---

## Claude Code

**The simplest path.** The repo root already contains `.mcp.json`:

```json
{
  "mcpServers": {
    "sima-atlas": {
      "command": "node",
      "args": ["scripts/mcp_atlas_server.mjs"]
    }
  }
}
```

Open Claude Code in the `sima_atlas` directory — it picks up the config and asks permission to launch the MCP server. Accept it, and 65 tools with the prefix `mcp__sima-atlas__*` appear in your session.

**Alternative (outside the Sima Atlas directory):**

```bash
claude mcp add sima-atlas node /absolute/path/to/sima_atlas/scripts/mcp_atlas_server.mjs
```

**Verification:** in Claude Code, type `/mcp` — you should see `sima-atlas: connected (65 tools)`. Or try: "Sima, check the chats" — `sima_watch_chats` should fire.

---

## Cursor

Cursor has supported MCP since late 2024. The config is `.cursor/mcp.json` (project-local) or `~/.cursor/mcp.json` (user-global).

**Project-local** (recommended if Sima is part of your workflow for a specific project):

Create `.cursor/mcp.json` in your project directory:

```json
{
  "mcpServers": {
    "sima-atlas": {
      "command": "node",
      "args": ["scripts/mcp_atlas_server.mjs"],
      "cwd": "/absolute/path/to/sima_atlas"
    }
  }
}
```

**User-global:** the same file at `~/.cursor/mcp.json`.

**Verification:** Cursor → Settings → MCP → sima-atlas should be `green`. Or in chat, ask "list available MCP tools" — you should see `mcp__sima-atlas__*`.

---

## Codex CLI (OpenAI)

Codex CLI supports MCP via `~/.codex/config.toml`:

```toml
[mcp.servers.sima-atlas]
command = "node"
args = ["scripts/mcp_atlas_server.mjs"]
cwd = "/absolute/path/to/sima_atlas"
```

**Verification:** `codex mcp list` should show `sima-atlas`. In a session — ask Codex to use a Sima tool.

> The exact Codex config syntax can shift between versions. If this format doesn't work — check `codex mcp --help` and `codex --version`, and send a PR with the current shape.

---

## Continue.dev (VS Code / JetBrains)

Continue (an open-source assistant) supports MCP. The config is `~/.continue/config.json`, the `experimental.modelContextProtocolServers` section:

```json
{
  "experimental": {
    "modelContextProtocolServers": [
      {
        "transport": {
          "type": "stdio",
          "command": "node",
          "args": ["scripts/mcp_atlas_server.mjs"],
          "cwd": "/absolute/path/to/sima_atlas"
        }
      }
    ]
  }
}
```

**Verification:** restart Continue — the Sima tools should be visible in the chat's `@`-menu.

---

## Zed

Zed (a fast editor with built-in AI) supports MCP via `settings.json`:

```json
{
  "context_servers": {
    "sima-atlas": {
      "command": {
        "path": "node",
        "args": ["scripts/mcp_atlas_server.mjs"]
      },
      "settings": {
        "cwd": "/absolute/path/to/sima_atlas"
      }
    }
  }
}
```

Open `cmd-,` (Settings) → the `context_servers` block.

**Verification:** the Sima tools should appear in Zed's AI panel.

---

## Windsurf (Codeium Cascade)

Windsurf uses a Cursor-like config. The file is `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "sima-atlas": {
      "command": "node",
      "args": ["scripts/mcp_atlas_server.mjs"],
      "cwd": "/absolute/path/to/sima_atlas"
    }
  }
}
```

**Verification:** Cascade panel → MCP servers list.

---

## Aider

Aider doesn't have native MCP support at the time of writing, but Sima works with it via the **CLI fallback** — see the section below.

If Aider adds MCP — the format is likely to be the same. Watch `aider --help`.

---

## Antigravity (Google)

Antigravity is a relatively young AI-development platform from Google. The state of MCP support **changes quickly**; there's no specific stable config format yet (as of May 2026).

Possible paths today:
1. If Antigravity has gained MCP support via `~/.antigravity/mcp.json` or similar — use the standard block above.
2. If not — use the CLI fallback (see below): Sima commands are invoked via bash directly from the agent workflow.

**If you use Antigravity and know a working format — send a PR updating this section.**

---

## CLI fallback — for tools without MCP

If your agent doesn't support MCP, you can still use Sima via plain shell commands. Every MCP tool has a CLI equivalent:

| MCP tool | CLI equivalent |
|---|---|
| `sima_fill_from_chat` | `node scripts/sima_fill_from_chat.mjs --stdin --json` |
| `sima_watch_chats` | `node scripts/sima_watch_chats.mjs --once --json` |
| `read_block` | `cat atlas/blocks/<id>/*.md` |
| `verify_block_acceptance` | `node scripts/acceptance_verifier.mjs <id>` |
| `accept_proposal` | `node scripts/accept_proposal.mjs <id> [--client <c>]` |
| `nightly_consolidation` | `node scripts/nightly_consolidation.mjs` |
| `generate_full_bundle` | `node scripts/generate_wiki.mjs && node scripts/generate_tz_from_atlas.mjs && node scripts/rebuild_atlas_roadmap.mjs` |

Feed the agent an instruction like this in the system prompt: "to work with the schema, use these commands via Bash: ...".

---

## HTTP API — another path

Sima also runs an HTTP server on port 8787 (`npm run dev` or `node scripts/atlas_api_server.mjs`). Any HTTP-capable client can talk to it through that.

Main endpoints:
- `GET /atlas/design-payload?client=X` — current schema
- `POST /atlas/sima/fill-from-chat` — body `{transcript, client_id?}`
- `POST /atlas/sima/watch-chats` — body `{mode?, min_new_chars?}`
- `POST /atlas/blocks/{create,patch,delete}` — structural operations
- `GET /atlas/proposals/list?client=X` — `POST /proposals/{accept,reject}`
- `POST /atlas/acceptance/verify` — body `{block_id}`

This is useful if your tool has HTTP tooling but no MCP. For example, you can build a GPT-Action / Claude API tool that calls these endpoints.

---

## Verification after connecting

After registering the MCP server in any tool:

1. **Check that the tools are visible.** In Claude Code: `/mcp`. In Cursor: Settings → MCP. In Codex: `codex mcp list`.
2. **Simplest call:** ask the agent "how many blocks are in the current atlas" — `read_block` against the root graph should fire.
3. **Full smoke:** "Sima, fill in the schema from this dialog: <paste any chunk>". A `chat_fill` plan should appear in `atlas/proposals/`.

If something doesn't work — check the MCP server logs: launch it manually with `node scripts/mcp_atlas_server.mjs` and look at stderr. Most errors are (a) wrong `cwd`, (b) Node.js not on PATH, (c) an unread `package.json` (no `npm install`).

---

## What we need from the community

- Updated configs for **Antigravity** and other tools that move quickly.
- Native plugins for **VS Code** and **JetBrains**, so the canvas can live in a side panel next to the code.
- Adapters for agent frameworks (LangGraph, AutoGen, CrewAI) that can use MCP / HTTP API.

Send PRs to this file with any updates — it's a living document.

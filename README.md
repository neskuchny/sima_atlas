# Sima Atlas

> **Visual contract-first development for AI coding agents.**
> A graph of contracts between you and Claude Code / Cursor / Codex — so the AI builds what you actually meant.

[![verify](https://github.com/neskuchny/sima_atlas/actions/workflows/verify.yml/badge.svg)](https://github.com/neskuchny/sima_atlas/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**What it is.** A visual canvas where every feature of your product lives as a directory of contracts (`mission.md` / `kpi.md` / `acceptance.md` / `depends_on.md` / `provides.md`). The agent reads the contract via MCP, writes code, reports facts to `checks.log`. Sima verifies each run against the acceptance assertions — `pass` / `fail` / `inconclusive`, never silent false-pass.

**What it isn't.** Not a code editor, not an agent framework, not a replacement for Cursor / Claude Code / Codex — it's a **layer above** them. Your editing UI stays exactly the same; Sima adds the canvas, contracts, verifier, and 65 MCP tools your agent calls into.

**Who it's for.** Developers building products with > 10 features who hit the ceiling where AI agents start hallucinating, drifting, and re-doing things every iteration.


<img width="1913" height="960" alt="image" src="https://github.com/user-attachments/assets/15114bfe-1593-443c-ac18-3894bb49ee4f" />

---

## Quickstart (60 seconds)

```bash
git clone https://github.com/neskuchny/sima_atlas
cd sima_atlas
npm install
npm run dev
# → API on :8787 · UI on http://localhost:8000 · opens demo client
```

The browser opens at `?client=example` — a populated 5-block habit-tracker so you see the canvas alive. Switch to your own product via `?client=<your-id>`; Sima creates `atlas/clients/<your-id>/` automatically.

Click any block → DetailPanel slides in → edit `mission.md`, set acceptance, hit **Claude Code** to spawn the agent. Or click **✦ Sima → fill from this chat**, paste any conversation about your product, accept the proposed blocks.

To plug Sima into your AI tool (Claude Code, Cursor, Codex, Continue, Zed, Windsurf, Antigravity), see [`docs/integrations.md`](docs/integrations.md). Claude Code picks up the bundled `.mcp.json` automatically; the rest take a 5-line config.

## Why contracts

AI coding agents work great on five files and fall apart on fifty. Not because the models are weak — because we feed them dumps of context, lose connections between modules, and forget yesterday's lessons by tomorrow.

A widely-cited audit of 430 hours in Claude Code reported that **~73 % of tokens leaked** into nine "invisible" patterns: bloated `CLAUDE.md`, stale hooks, cache misses, irrelevant skills loaded, redundant tool schemas, deep reasoning on trivial tasks. The number is a symptom; the disease is structural — agents have no contract for what each piece is supposed to do, and no graph of how the pieces connect.

Sima fixes that with five rules:

1. **Contract is primary** — every block is a directory of MD-files an agent can read, not code an agent has to reverse-engineer.
2. **Graph knows connections** — `depends_on` ↔ `provides` capability matching with drift detection.
3. **Acceptance loop is built-in** — five evidence collectors (`exit_code` / `fs_glob` / `file_diff` / `log_grep` / `selftest_run` + `llm_judge` as last resort) verify each run.
4. **Memory is typed and small** — `lessons.json` / `dont_use.json` / `always_use.json` instead of one bloating `CLAUDE.md`.
5. **Context-pack per task** — neither "everything" nor artificially small; reports its own size; optimized for relevance.

Full methodology: [English article](docs/article.en.md) · [Русский](docs/article.ru.md) (11 parts + 2 appendices, including a self-audit).

## What's in the box

- **65 MCP tools** for AI agents (`read_block`, `update_block`, `verify_block_acceptance`, `sima_fill_from_chat`, `sima_watch_chats`, ...) — see [`docs/architecture.md`](docs/architecture.md)
- **5-provider LLM cascade** (`claude_cli` → `anthropic` → `google` → `ollama` → `mock`) — `claude_cli` uses your Claude.ai Pro/Max subscription, `ollama` runs against your local Llama / Qwen / DeepSeek (opt-in via `LLM_PREFER_OLLAMA=1`), `mock` for offline/CI
- **68 nightly validators** — `npm run test:nightly`
- **Auto-generated** WIKI / TZ / Roadmap / per-block user tutorials
- **Multi-tenant** — many products in `atlas/clients/<id>/`, hybrid isolation
- **Soft lifecycle gates** with visible "what's missing" hints — preserves draft-stage iteration
- **Honest self-audit** — every methodology claim has a verdict against code (✅ / 🟡 / ❌). See Article Appendix A.

## State

✅ **Stable** — 10 own blocks all green in CI; multi-tenant routing; soft lifecycle gates; phases R-1 through R-7 shipped (claude_cli provider, sima_fill_from_chat orchestrator, chat watcher, multi-tenant fixes, layer-aware blocks, real submodule hierarchy, depth-control canvas).

⬜ **Roadmap** (full list in article Part 10):
- **U-1** local models — Ollama landed in R-7.60 (`LLM_PREFER_OLLAMA=1`); vLLM / LM Studio adapters welcome as PRs
- **VS Code sidebar** — 0.1 scaffold landed in R-7.61 (see [`extensions/vscode/`](extensions/vscode/)); status badges, inline contract editing, run-block buttons are open issues
- **S-1** block templates marketplace (auth / payments / search / ingestion / billing)
- **S-7** transactional change-sets for cross-cutting changes
- **V-1** agent-loop daemon — autonomous coding in steady-state
- **VS Code sidebar** — canvas next to code

❌ **Won't fix** — hard lifecycle gates by default (would break draft-stage iteration); kept soft with explicit hints. See Article Appendix B.2.

## Comparison

| Layer | Examples | Sima Atlas |
|---|---|---|
| Code editor | VS Code, JetBrains, Zed | not us — we live above |
| AI coding agent | Cursor, Claude Code, Codex CLI, Aider, Continue | not us — we plug into them via MCP |
| Agent framework | LangChain, LangGraph, AutoGen, CrewAI, DSPy | different layer — we provide *the product graph the agent navigates*, not the agent itself |
| Code generation | GPT-Engineer, Plandex, MetaGPT | partly overlap, but we focus on long-lived contracts + acceptance, not single-shot generation |
| Architecture diagrams | Structurizr, C4, Excalidraw | partly overlap, but ours is *live* (synced via acceptance loop), not static |
| Acceptance / testing | pytest, jest, Cypress, Playwright | we use them as evidence collectors; we add the assertion → evidence-kind mapping |

If you draw a stack, Sima sits between *agent* and *project documents*, providing a single graph of contracts both consult.

## FAQ

**Do I need an API key?** No. Sima detects the local `claude` CLI and uses your Pro/Max subscription. API keys (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) are optional — they win the cascade when present. There's also a `mock` provider for offline / deterministic CI (`ATLAS_FORCE_MOCK_LLM=1`).

**Where does my data go?** Locally. Everything in `atlas/` is on your disk. Only external calls are to whichever LLM provider you configured. `atlas/llm_traces/` is gitignored.

**Production-ready?** Honest answer: **early but live**. We use it daily for Sima's own development. 10 own blocks all green in CI. Self-audit in [Article Appendix A](docs/article.en.md): 9 ✅ fully-implemented, 11 🟡 partial-with-caveats, 0 ❌. Not yet for mission-critical commercial deployments — early adopters welcome.

**Windows / macOS / Linux?** Tested on Linux + Windows; macOS works but isn't yet in CI matrix. Phase R-4 fixed Windows-specific `claude_cli` detection (PATHEXT + `.cmd`).

**Token-savings benchmarks?** No public numbers yet. Theoretical win is fewer reworks (the agent gets the contract upfront, doesn't drift, doesn't rebuild things in 3 iterations). Single-block tasks see minor savings; 50-block products see substantial. Community benchmarks welcome — see [Article Part 6.1](docs/article.en.md).

**Headless usage?** Yes — MCP server (`scripts/mcp_atlas_server.mjs`) and CLI scripts (`scripts/sima_*.mjs`) work without the canvas. See [`docs/integrations.md`](docs/integrations.md).

## Contributing

We're actively looking for help with:

1. **Local-model providers** in `scripts/llm_gateway.mjs` — Ollama is in (R-7.60); vLLM / LM Studio / llama.cpp adapters welcome (~80 lines each, mirror the Ollama pattern)
2. **Block templates** — auth / payments / search / ingestion / billing — each with mission + KPI + acceptance
3. **VS Code sidebar extension** — 0.1 scaffold in [`extensions/vscode/`](extensions/vscode/); status badges + inline editing + run-block buttons welcome
4. **Evidence collectors** beyond the built-in five (`http_status`, `json_shape_match`, `snapshot_diff`, `lighthouse_score`)
5. **MCP clients** for tools we don't natively support (Aider, Antigravity stable config)
6. **UI translations** — currently RU + partial EN

Open an issue, start a discussion, or just send a PR. We try to respond within 48 hours.

## Documentation map

| File | What it is |
|---|---|
| [`docs/getting-started.md`](docs/getting-started.md) | Onboarding — clone to first agent run, 15 minutes |
| [`docs/architecture.md`](docs/architecture.md) | System diagram, HTTP API, MCP tool surface, run FSM |
| [`docs/integrations.md`](docs/integrations.md) | Plug Sima into Claude Code / Cursor / Codex / Continue / Zed / Windsurf / Antigravity |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Real failure modes from R-7.X debugging — LLM auth, agent CLIs, multi-tenant, Windows |
| [`docs/article.en.md`](docs/article.en.md) | Full methodology, principles, roadmap, self-audit (the big read) |
| [`CLAUDE.md`](CLAUDE.md) | Agent contract for AI working in this repo |
| `atlas/blocks/<id>/` | Per-block contracts (mission / kpi / acceptance / depends_on / provides / decisions / patterns) |

---

Released under [MIT](LICENSE) by **Synlabs**. Maintained by Anton Kalabukhov + contributors. Originally extracted from our internal product **Tessent** so the *concept* of contract-first AI development reaches the market — independently of any specific implementation.

Russian version: [README.ru.md](README.ru.md).

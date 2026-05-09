# Sima Atlas

> **Visual contract-first development for AI coding agents.**
> A graph of contracts between you and Claude Code / Cursor / Codex — so the AI builds what you actually meant, you see what's happening, drift gets caught, and lessons compound across projects.

[![verify](https://github.com/neskuchny/sima_atlas/actions/workflows/verify.yml/badge.svg)](https://github.com/neskuchny/sima_atlas/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

**The 30-second pitch.** AI coding agents work great on five files and fall apart on fifty — they hallucinate, drift, redo things, and burn tokens because they have no contract for what each piece is supposed to do, and no graph of how the pieces connect. Sima Atlas is the **visual control plane** that gives them both: every feature is a directory of MD-contracts, the canvas shows their connections, agents read context-packs scoped to one block at a time, and an acceptance loop verifies each run with deterministic evidence — `pass` / `fail` / `inconclusive`, never silent false-pass.

<img width="1913" height="960" alt="Sima Atlas canvas — visual contract-first development for AI agents" src="https://github.com/user-attachments/assets/15114bfe-1593-443c-ac18-3894bb49ee4f" />

## The vision

**Where we are now (v0.1):** you draft contracts in the canvas, hit `Claude Code`, the agent reads context, writes code, the verifier runs, you see the verdict.

**Where we're going (v1.x → v2):**

- 🔄 **Bidirectional Sima ↔ Agent sync** — the canvas is built *from* Claude Code conversations and *back into* them. You chat with Claude in your IDE about the product; Sima auto-extracts blocks, fills missions, proposes acceptance criteria. You approve them on the canvas; Claude reads the next task already understanding the contract.
- 🤖 **Autonomous coding loop** — once contracts are filled, Sima walks the graph, dispatches agents to `todo` blocks overnight, runs acceptance, marks pass/rollback. You wake up, scan the canvas, see what was built and what stalled.
- 🔍 **Live drift detection** — every agent run is checked: did it stay within the block's scope? Did it conflict with sibling blocks? Did it violate `tech_stack.md` or `dont_use.json`? Drift gets a colored marker on the canvas before you commit.
- 💰 **Token economics in your face** — per-session, per-block, per-project token counters; cost vs. acceptance-rate dashboards; a clear ROI for "did adding the contract save more than it cost to write."
- 🧠 **Cross-project memory** — frameworks, code references, architectural decisions, LLM choices, do-not-use bans accumulate as `lessons.json`. Next project's blocks auto-suggest "you used Postgres + Prisma + zod last 3 times — keep going?" — no cold-start.
- 🎨 **Visual coding even for vibe-coders** — you can still vibe-code, but you *see the build* live: which blocks are touched, what edges activate, where drift accumulates. Visibility doesn't slow you down, it lets you delegate confidently.

This is not where we are today. This is the trajectory of the next 12 months. The full audit of what's claimed vs. what's coded today is in [Article Appendix A](docs/article.en.md).

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

A widely-cited audit of 430 hours in Claude Code reported that **~73 % of tokens leaked** into nine "invisible" patterns: bloated `CLAUDE.md`, stale hooks, cache misses, irrelevant skills loaded, redundant tool schemas, deep reasoning on trivial tasks. The number is a symptom; the disease is structural — agents have no contract for what each piece is supposed to do, and no graph of how the pieces connect.

Sima fixes that with five rules:

1. **Contract is primary** — every block is a directory of MD-files an agent can read, not code an agent has to reverse-engineer.
2. **Graph knows connections** — `depends_on` ↔ `provides` capability matching with drift detection.
3. **Acceptance loop is built-in** — five evidence collectors (`exit_code` / `fs_glob` / `file_diff` / `log_grep` / `selftest_run` + `llm_judge` as last resort) verify each run; tri-state `pass / fail / inconclusive`, never silent false-pass.
4. **Memory is typed and small** — `lessons.json` / `dont_use.json` / `always_use.json` / `decisions.log` instead of one bloating `CLAUDE.md`.
5. **Context-pack per task** — neither "everything" nor artificially small; reports its own size; optimized for relevance.

Full methodology with rationale, principles, and self-audit: [English article](docs/article.en.md) · [Russian](docs/article.ru.md).

## What we ran into building this — and how we solved it

These are the concrete failure modes we hit while shipping our own product (Tessent) with AI agents. Each one drove a phase in this repo. They are the reason Sima exists.

| The pain | The fix that landed |
|---|---|
| **«I told the agent to use LLM for sentiment analysis. It wrote a regex. Next session it forgot the instruction entirely.»** Architectural intent evaporates between conversations because there is no place to lock it. | **Three-layer defense** (R-7.76 → R-7.85). Project-level `architecture_decisions.md` (append-only, auto-injected into every prompt). Block-level `dont_use.json` / `always_use.json` with `severity:hard`. Post-run `scan_run_for_drift.mjs` that scans actually-modified files and **fails the run** when a hard rule was violated. Three layers because one was not enough. |
| **«Agent re-implemented the same parser three times in three sessions because it didn't know it already exists.»** No memory of past runs, no narrative of what worked / what failed. | **Per-block memory layer** (R-7.76 → R-7.80). Every run appends to `narrative.md` (human-readable: *what I tried / what worked / what failed and why / decisions made*) and `decisions.log` (structured tab-separated). Both are loaded into the next prompt under «## ⚠ Block memory» so the agent reads them before touching code. |
| **«Edit block A. Eight hours later the nightly sweep tells me block B is broken because it depended on A.»** Damage propagates silently for hours. | **Cascade verify on edit** (R-7.84, S-8). After a successful run on block X, walk the reverse-dependency graph and re-run the acceptance verifier on every block whose `depends_on` references X. Anything that broke gets `status: desync` on the canvas immediately, with a stack-trace-style entry in its `narrative.md`. Operator sees the chain inline, not at 06:00. |
| **«The context-pack is 12K tokens for a one-line UI fix.»** One-size-fits-all packs waste budget and blur signal-to-noise. | **Profiles per task type** (R-7.86, S-4). `design` (~5–15K, full pack) · `backend-fix` (~2–4K) · `ui-fix` (~1.5–3K, no deps) · `acceptance-only` (~0.5–1.5K, verifier-only). Architecture decisions are always included regardless of profile. Verified on `b.docs`: 5809 → 3701 → 2763 → 1846 tokens. |
| **«I run agents for hours and have no idea where the tokens go.»** No visibility on which `op` burns most, no «shadow bill» when running on a Claude.ai subscription. | **Token economics roll-up** (R-7.87, S-9). `atlas/llm_traces/*.json` aggregated per block / op / provider / day. Two cost columns: `cost_usd_actual` (what was charged — 0 on `claude_cli`/`ollama`/`mock`) and `cost_usd_equivalent` (Anthropic Haiku 4.5 list price — stable shadow bill across providers). Visible as a Token Spend widget in every block's Overview tab + a CLI roll-up. |
| **«Did I actually fill in this block, or just the mission? I have to click through five tabs to find out.»** No at-a-glance fill-state per block. | **Implementation Status panel** (R-7.86). Overview tab opens with an 8-row dashboard: Mission · KPIs · Acceptance · Tasks · Files alive · Decisions logged · Run history · Block status. Each row carries a ✓ / ~ / ✗ / · marker so contract-vs-reality progress is visible without clicking. |
| **«Agent silently fell back to mock provider and reported success.»** Inconclusive runs were treated as passes. | **Tri-state acceptance** (`pass` / `fail` / `inconclusive`) with five evidence collectors (`exit_code`, `fs_glob`, `file_diff`, `log_grep`, `selftest_run`) + `llm_judge` as last resort. Inconclusive on missing API key → never silent green. |
| **«New contributor cloned, ran `npm run dev`, got blank UI because operator-profile JSON files didn't exist.»** Bootstrap depended on manual steps. | **Auto-seed at startup** (R-7.81). `dev_server.mjs` idempotently creates `operator_profile/{lessons,dont_use,always_use}.json` and `architecture_decisions.md` on first launch. New users hit zero manual setup. |

The pattern: **each fix solves a problem that came up while building**, not an imagined one. If you hit one of these and don't see a fix that works, [open an issue](https://github.com/neskuchny/sima_atlas/issues) — that's how the next phase gets prioritised.

## What's in the box (today)

**Foundations**

- **~70 MCP tools** for AI agents (`read_block`, `update_block`, `verify_block_acceptance`, `sima_fill_from_chat`, `sima_watch_chats`, `accept_proposal`, `cascade_verify`, `add_architecture_decision`, `token_economics`, ...) — full catalogue in [`docs/architecture.md`](docs/architecture.md)
- **5-provider LLM cascade** (`claude_cli` → `anthropic` → `google` → `ollama` → `mock`) — `claude_cli` uses your Claude.ai Pro/Max subscription, `ollama` runs locally against Llama / Qwen / DeepSeek (opt-in via `LLM_PREFER_OLLAMA=1`), `mock` for offline / CI determinism
- **Visual canvas with live contract loading** — Overview tab loads `mission.md` / `kpi.md` / `acceptance.md` / `depends_on.md` / `provides.md` and shows real-time fill state
- **Multi-tenant** — many products in `atlas/clients/<id>/`, hybrid isolation. Auto-seeds `operator_profile` + `architecture_decisions.md` at first launch (R-7.81)
- **EN-first UI with RU toggle** — 644 i18n keys, 🌐 EN/RU pill in toolbar, persists to localStorage
- **VS Code extension** — 0.1 scaffold at [`extensions/vscode/`](extensions/vscode/) — sidebar with embedded canvas + blocks tree

**Memory & lock-in (R-7.76 → R-7.85)**

- **Per-block memory layer** — every run appends to `narrative.md` (human-readable: *what I tried / what worked / what failed / decisions made*) and `decisions.log` (structured). Both auto-injected into the next prompt under «## ⚠ Block memory» so agents read them before touching code.
- **Operator-locked rules** — `dont_use.json` / `always_use.json` per block (or global) with `severity:hard|soft`. Read by `build_context_pack`, injected into every prompt, AND scanned post-run against modified files via `scan_run_for_drift.mjs` — hard violations **fail the run** (R-7.82, S-3).
- **Project-level architecture lock-in** — `atlas/architecture_decisions.md` is append-only. Every entry is auto-injected into EVERY future prompt across ALL blocks. Agents physically cannot silently reverse a past entry (R-7.85, S-6).
- **Cascade break detection on edit** — after a successful run on block X, walk reverse-deps and re-run acceptance on each. Anything that broke gets `status: desync` immediately, with `narrative.md` entry. Operator sees the chain inline, not at next nightly sweep (R-7.84, S-8).

**Verification & visibility**

- **Acceptance loop** — runs on every agent finish; tri-state verdict (`pass` / `fail` / `inconclusive`); five evidence collectors (`exit_code` / `fs_glob` / `file_diff` / `log_grep` / `selftest_run`) + `llm_judge` as last resort; ↻ Fix-and-rerun packages failed assertions into a new prompt
- **Architecture review** — whole-graph LLM analysis (stack consistency, scale, multi-tenant fit, data flow, redundancy)
- **Sync-check** — 9 deterministic validators detect drift between contracts, code, and capability bindings
- **Implementation Status panel** — Overview tab opens with an 8-row dashboard (Mission · KPIs · Acceptance · Tasks · Files alive · Decisions logged · Run history · Block status), each row marked ✓ / ~ / ✗ / · for at-a-glance contract-vs-reality progress (R-7.86)
- **Token economics widget** — per-block (or project-wide) Token Spend panel: actual cost + Anthropic Haiku 4.5 «shadow bill» equivalent + top-burning ops + by-provider breakdown, with 7/30/90-day window selector (R-7.87, S-9)

**Context economy**

- **Context-pack profiles** — `design` (~5–15K, default) / `backend-fix` (~2–4K) / `ui-fix` (~1.5–3K) / `acceptance-only` (~0.5–1.5K). Architecture decisions always included regardless. Selectable via CLI flag, env var, or MCP arg (R-7.86, S-4)
- **Agent-navigation skill** — canonical strategy doc auto-loaded as Claude Code Skill, Cursor Rule, AGENTS.md — agents read in the right order, skip the right directories, save thousands of tokens per session

**Outputs**

- **Auto-generated** WIKI / TZ / Roadmap / per-block user tutorials
- **Honest self-audit** — every methodology claim has a verdict against code (✅ / 🟡 / ❌). See [Article Appendix A](docs/article.en.md).

## Roadmap

This roadmap maps the [vision](#the-vision) onto specific phases. Phases are sized to fit `~1 week of focused work` each. Markers: ✅ done, 🟡 partial, ⬜ planned.

### Now — foundation (v0.1, shipped)
- ✅ **R-1..R-7** — visual canvas, contract loading, MCP tools, 5-provider LLM cascade, sima-fill-from-chat orchestrator, chat watcher, layer-aware blocks, real submodule hierarchy, depth-control canvas, agent-navigation skill, EN-first i18n
- ✅ **R-7.50..R-7.69** — opensource-readiness pass: README cut, English getting-started, architecture diagram, hero image, macOS in CI matrix, classic-view legacy removal (-9.4K lines), live-contract Overview, auto-arrange-by-layer
- ✅ **R-7.76..R-7.81** — per-block memory layer end-to-end (`narrative.md` + `decisions.log` + operator-locked `dont_use`/`always_use`/`lessons.json`, auto-injected into every prompt, auto-seed at startup)
- ✅ **R-7.82 (S-3)** — runtime content drift scanner: scans modified files post-run against `dont_use` rules; hard violations fail the run
- ✅ **R-7.83** — agent-navigation skill / Cursor rule / AGENTS.md updated to teach the new memory layer
- ✅ **R-7.84 (S-8)** — cross-block break detection on edit: `cascade_verify` walks reverse-deps after a successful run, auto-marks broken dependents `status: desync` with stack-trace-style narrative entries
- ✅ **R-7.85 (S-6)** — `architecture_decisions.md` append-only project lock-in, auto-injected into every prompt across all blocks
- ✅ **R-7.86 (S-4)** — context-pack profiles (`design` / `backend-fix` / `ui-fix` / `acceptance-only`) + Implementation Status dashboard panel in Overview tab
- ✅ **R-7.87 (S-9)** — token economics aggregator: actual cost + Anthropic Haiku 4.5 «shadow bill» equivalent + per-op / per-provider / daily breakdown, exposed as MCP tool + Token Spend widget

### Next — closing the loop (v0.5 → v0.9, Q4 2026)
- ⬜ **S-1** — block templates marketplace (auth / payments / search / ingestion / billing) — drop-in starters with mission + KPI + acceptance
- ⬜ **S-7** — transactional change-sets for cross-cutting changes (REST→GraphQL, capability rename, DB migration); UI shows "5 blocks touched by transaction T" with per-block acceptance state
- ⬜ **S-9.1** — global Token Economics tab (separate from per-block widget): sparklines, cost-per-pass vs cost-per-fail ROI, model A/B comparison
- ⬜ **S-10** — UI surface for context-pack profile selection at run-start (currently CLI flag + env var only)
- ⬜ **S-11** — cross-block roll-up in Implementation Status: «what % of contracts in this subsystem are filled?»

### Mid — collaboration + local models (v0.6 → v0.9, Q4 2026)
- ⬜ **T-1** — multi-operator collaboration with CRDT-merging contract files; full client isolation
- 🟡 **U-1** — local models as first-class providers (Ollama landed in R-7.60; vLLM / LM Studio adapters welcome as PRs)
- ⬜ **U-2** — `Sima Shell` lightweight MCP client optimized for local models (cheap-moves on small models, complex-moves on large)
- ⬜ **U-3** — Continue / Aider / Zed-AI MCP integration parity

### Vision — autonomous coding loop + compounding memory (v1.x → v2, 2027+)
- ⬜ **V-1** — **agent-loop daemon**: overnight autonomous mode. Sima picks `todo` blocks, dispatches an agent, runs acceptance, marks pass/rollback. Watched by `verify_done_blocks_still_green` so it can't break what was previously green.
- ⬜ **V-2** — one-click deploy: block → docker → cloud with the same acceptance running in production
- ⬜ **V-3** — **production-monitor**: an observer block that catches unknown-unknowns (production bugs, metric anomalies) and lifts them back into the graph as new acceptance assertions on the affected blocks. Closes autonomy's blind spot.
- ⬜ **W-1** — **cross-project pattern transfer**: lessons from one project (via `lessons.json`) enrich the next; opt-in "community experience"
- ⬜ **W-2** — batch mode: agency-style operator manages 10 projects in parallel under one dashboard
- ⬜ **W-3** — community archetypes: shared operator profiles (vibe-coding novice / mid-stage startup / enterprise) as a cold-start template

### Won't fix
- ❌ **Hard lifecycle gates by default** — would break draft-stage iteration. Kept soft with explicit visible hints. See Article Appendix B.2.

## Comparison

| Layer | Examples | Sima Atlas |
|---|---|---|
| Code editor | VS Code, JetBrains, Zed | not us — we live above |
| AI coding agent | Cursor, Claude Code, Codex CLI, Aider, Continue | not us — we plug into them via MCP |
| Agent framework | LangChain, LangGraph, AutoGen, CrewAI, DSPy | different layer — we provide *the product graph the agent navigates*, not the agent itself |
| Code generation | GPT-Engineer, Plandex, MetaGPT | partly overlap, but we focus on long-lived contracts + acceptance + cross-project memory, not single-shot generation |
| Architecture diagrams | Structurizr, C4, Excalidraw | partly overlap, but ours is *live* (synced via acceptance loop), not static |
| Acceptance / testing | pytest, jest, Cypress, Playwright | we use them as evidence collectors; we add the assertion → evidence-kind mapping |

If you draw the stack, Sima sits between *agent* and *project documents*, providing a single graph of contracts both consult — and the loop that closes when the agent finishes.

## Who this is for

A sharper test than «is it for me» is **«have I hit one of these walls?»**:

- **Solo developers building products with > 10 features.** You hit the wall where the agent forgets what it built last week, re-implements existing functions, and burns sessions debugging its own drift. → Memory layer + cascade verify + Implementation Status tell you and the agent what already exists.
- **Vibe-coders who want to *see* what the AI is building.** You like delegating but you want a canvas, not a console flood. → Visual canvas + Overview tab + Token Spend widget without a process burden.
- **AI-coding teams (2+ humans + agents).** You ship faster than you can keep contracts in your head; your teammates can't tell what the agent's allowed to touch in their area. → Shared `architecture_decisions.md` + per-block `dont_use` + sync-check stop the cross-team trip-overs.
- **Multi-product operators / agencies.** You run several products in parallel; you want one mental model for «is each project healthy» without opening 5 IDEs. → Multi-tenant `atlas/clients/<id>/` + auto-generated WIKI/Roadmap per client.
- **Researchers measuring AI-coding effectiveness.** You need comparable runs across providers and models with deterministic evidence of pass/fail. → Token traces + tri-state acceptance + `cost_usd_equivalent` shadow-bill make A/B comparable across `claude_cli` / `anthropic` / `google` / `ollama`.

**Who this is NOT for (yet):**

- Single-file scripts — the contract overhead doesn't pay off below ~5 blocks.
- Mission-critical commercial deployments — early but live; we use it daily for our own products, not yet recommended for what-must-not-fail systems.
- Teams that want hard lifecycle gates by default — Sima keeps gates *soft* with explicit visible hints to preserve draft-stage iteration speed (see Article Appendix B.2).

## FAQ

**Do I need an API key?** No. Sima detects the local `claude` CLI and uses your Pro/Max subscription. API keys (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`) are optional. Local Ollama (`LLM_PREFER_OLLAMA=1`) needs neither. There's also a `mock` provider for offline / deterministic CI (`ATLAS_FORCE_MOCK_LLM=1`).

**Where does my data go?** Locally. Everything in `atlas/` is on your disk. Only external calls are to whichever LLM provider you configured (Anthropic / Google / your local CLI / your local Ollama). `atlas/llm_traces/` is gitignored.

**Production-ready?** Honest answer: **early but live**. We use it daily for Sima's own development. 10 own blocks all green in CI on Linux + Windows + macOS. Self-audit in [Article Appendix A](docs/article.en.md): 9 ✅ fully-implemented, 11 🟡 partial-with-caveats, 0 ❌. Not yet for mission-critical commercial deployments — early adopters welcome.

**Token-savings benchmarks?** No public numbers yet. The S-9 token-economics dashboard (next phase) will produce them. Theoretical win is fewer reworks (the agent gets the contract upfront, doesn't drift, doesn't rebuild things in 3 iterations). Single-block tasks see minor savings; 50-block products see substantial. Community benchmarks welcome — see [Article Part 6.1](docs/article.en.md).

**Headless usage?** Yes — MCP server (`scripts/mcp_atlas_server.mjs`) and CLI scripts (`scripts/sima_*.mjs`) work without the canvas. See [`docs/integrations.md`](docs/integrations.md).

**Will my agents stop hallucinating?** They'll stop hallucinating about *what to build* — the contract is explicit. Hallucinations *inside* the contract (wrong API name, wrong import path) still happen but the acceptance loop catches them before you commit. Drift detection (S-3 + S-8 next) will catch them at execution time, not after.

## Contributing

The 6 highest-leverage things you can help with right now:

1. **Local-model adapters** — vLLM / LM Studio / llama.cpp (~80 lines each, mirror the [`callOllama`](scripts/llm_gateway.mjs) pattern)
2. **Block templates** — auth / payments / search / ingestion / billing — each with mission + KPI + acceptance
3. **VS Code extension features** — status badges in the tree, inline contract editing, run-block buttons (the 0.1 scaffold is in [`extensions/vscode/`](extensions/vscode/))
4. **Token-economics dashboard (S-9)** — instrument `llm_gateway.mjs` to write per-call cost, aggregate by block / session / project, render a panel in the canvas
5. **Evidence collectors** beyond the built-in five (`http_status`, `json_shape_match`, `snapshot_diff`, `lighthouse_score`, `type_coverage`)
6. **Native MCP clients** for tools we don't natively support (Aider, Antigravity stable config, future agents)

Open an issue, start a discussion, or just send a PR. We try to respond within 48 hours. [`CONTRIBUTING.md`](CONTRIBUTING.md) for full details.

## Documentation map

| File | What it is |
|---|---|
| [`docs/getting-started.md`](docs/getting-started.md) | Onboarding — clone to first agent run, 15 minutes |
| [`docs/architecture.md`](docs/architecture.md) | System diagram, HTTP API, MCP tool surface, run FSM, lifecycle FSM |
| [`docs/agent-navigation.md`](docs/agent-navigation.md) | How AI agents should traverse this repo (canonical for Claude Code Skills + Cursor Rules + AGENTS.md) |
| [`docs/integrations.md`](docs/integrations.md) | Plug Sima into Claude Code / Cursor / Codex / Continue / Zed / Windsurf / Antigravity / Ollama |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Real failure modes from R-7.X debugging — LLM auth, agent CLIs, multi-tenant, Windows |
| [`docs/article.en.md`](docs/article.en.md) | Full methodology, principles, roadmap, self-audit (the big read, ~10K words) |
| [`CHANGELOG.md`](CHANGELOG.md) | Per-phase change log |
| [`CLAUDE.md`](CLAUDE.md) | Agent contract for AI working in this repo |
| `atlas/blocks/<id>/` | Per-block contracts (mission / kpi / acceptance / depends_on / provides / decisions / patterns) |

---

Released under [MIT](LICENSE) by **Synlabs**. Maintained by Anton Kalabukhov + contributors. Originally extracted from our internal product **Tessent** so the *concept* of contract-first AI development reaches the market — independently of any specific implementation. Take the principles, build something better — that's a win.

Russian version: [README.ru.md](README.ru.md).

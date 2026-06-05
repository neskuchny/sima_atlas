# Getting Started — Sima Atlas in 15 minutes

This guide walks you from an empty folder to **"the agent ships your first block on its own"**.

---

## 0. What Sima Atlas actually is

A contract-first control plane between a developer and an AI agent. The core idea:

> **A block is a contract, not code.** Every piece of the product lives as a directory with `mission.md`, `kpi.md`, `acceptance.md`, and links to its neighbors. The agent (Claude / Cursor / Codex) reads the contract through MCP, writes code, and reports facts back into `checks.log`. Sima validates each run against acceptance.

This turns "AI writes code" from a lottery into a managed process.

---

## 1. Install (5 minutes)

### Dependencies
- Node.js 18+ (`node -v`)
- That's it — no Python needed. The UI dev server is pure Node (`npm run dev` serves it). On headless / server / Docker boxes the browser won't auto-open; just open the printed `http://localhost:8000/...` URL by hand (or use `npm run dev:nobrowser`).
- Claude Code CLI: `npm install -g @anthropic-ai/claude-code`, then `claude` → `/login` (Pro/Max plan or API key required)
- Optional: Cursor CLI / Codex CLI — without them the launch buttons fall back to print-only mode

### Start
```bash
git clone https://github.com/neskuchny/sima_atlas.git
cd sima_atlas
npm install
npm run dev
# UI:  http://localhost:8000/atlas_design/index.html
# API: http://localhost:8787
```

There's an `.mcp.json` at the repo root — Claude Code will pick up the MCP server automatically when you first start a session in this directory.

---

## 2. Create your first project (1 minute)

Open in the browser: `http://localhost:8000/atlas_design/index.html?client=my-project`.

You'll see a banner: "Project `my-project` doesn't exist yet". Click `+ New module` (toolbar, or right-click on the canvas) — Sima will create:

- `atlas/clients/my-project/graph.json` — the block graph
- `atlas/clients/my-project/blocks/` — the blocks folder
- `atlas/clients/my-project/project.md` — project mission (a stub for you to fill in)
- `atlas/clients/my-project/rules.md` — coding rules (what's off-limits)
- `atlas/clients/my-project/tech_stack.md` — the stack

The banner disappears and the first block shows up on the canvas.

**Important:** fill in `project.md` via `📖 Docs` in the toolbar or the ContextRail on the left. LLM generation works much better when it knows the project mission.

---

## 3. The block contract (3 minutes)

Click a block node — the DetailPanel opens on the right. Four main tabs:

### Overview
Short description plus status.

### Contract ✱ the main one
Five contract files: `mission.md`, `user_story.md`, `kpi.md`, `acceptance.md`, `depends_on.md`, `provides.md`.

Three buttons next to each one:
- **`✎ Manual`** — opens a text field, you write it yourself.
- **`✨ Fill`** (for empty files) — Sima drafts a version through an LLM, with `project.md`, `rules.md`, and the neighboring blocks in scope.
- **`✏ Rewrite`** (for filled files) — Sima cleans up errors and style without introducing new facts.
- **`✨ Expand`** (for filled files) — Sima adds actors, edge cases, and links to neighbors. Use it when the draft is thin.

Every edit lands on disk at `atlas/clients/<id>/blocks/<block_id>/<file>.md`.

### Tasks
A checkbox list backed by `tasks.md`.

### Runs
Agent runs (see step 6).

### Acceptance
The acceptance-verifier output: pass/fail/inconclusive per assertion.

---

## 4. Connecting blocks (1 minute)

Hover over a node — four black anchor points appear on its edges (▲ ▶ ▼ ◀). Press an anchor, drag to another node, release. The link is created.

Alternative: `Shift + drag` from anywhere on the node.

To rename a link, click the line — a text field opens. `Esc` cancels.

To delete a link, click the line.

---

## 5. Submodules (2 minutes)

Complex blocks (a UI page, a backend service) often contain several internal modules across different layers (frontend / backend / logic). Sima supports this through **drill-down**.

1. **Double-click** a node, or right-click → `🔍 Drill into`
2. The canvas goes empty — this is the empty subsystem inside the block
3. Expand `▸ Canvas` in the top-left corner
4. The `B / L / F / T` buttons create a submodule with a specific layer:
   - **B** = backend (API, persistence)
   - **L** = logic (rules, computations)
   - **F** = frontend (UI components, screens)
   - **T** = tests (unit, e2e)
5. A submodule is a real block with its own folder `atlas/clients/<id>/blocks/<parent>.s1/`. It has the full contract. The DetailPanel shows a `↑ parent: b.X` chip — click it to jump back to the parent.

Links between submodules use the same anchor points. They live in the shared `graph.edges` and are filtered down to the drill view.

To get back out of a drill, use the breadcrumbs above the canvas (`↑ top level`).

---

## 6. Running an agent (3 minutes)

Open a block with a filled-in contract → the `Runs` tab → three buttons:
- **`Claude Code`** — spawns `claude --print --add-dir <blockdir> --add-dir <atlas>` with your mission + tasks + acceptance as the prompt.
- **`Cursor`** — same thing through `cursor-agent`.
- **`Codex`** — same thing through `codex`.

Click one and a "live" card appears with the FSM phases (`PreparingWorkspace → LaunchingAgent → Running → Verifying → Succeeded`).

If the agent's CLI isn't installed (e.g. no `cursor-agent` on PATH), Sima automatically falls back to **print-only mode**: it saves the prompt to `atlas/clients/<id>/agent_invocations/<UTC>__<block>.txt`. Copy and paste it into Cursor IDE or another LLM by hand.

When the run finishes:
- The block's `checks.log` gets `agent_invocation pass agent=claude summary=...`
- The card in `Runs` picks up badges: "acceptance pass", "↑ N files", "$0.0123" (cost)
- If the acceptance-verifier passes, the block is eligible to move to `done`

### External runs
If you launched Cursor IDE yourself (without using the UI button) and it reported into `checks.log`, Sima still surfaces it in the `Runs` tab with an `extern` badge. You won't get the full log, but you'll see that the run happened.

---

## 7. Sima fills in blocks from your chat history

In the toolbar: `+ Artifact` → the `Text` tab. Paste a chat transcript with a developer or PM (anywhere product blocks were discussed). Click `✦ Sima — fill it in`.

Sima will:
1. Pull goals / KPIs / tasks / risks / glossary from the text
2. Propose a set of blocks with `mission.md` / `acceptance.md` / `depends_on` already drafted
3. Show "✦ Proposals" in the toolbar with a pending plan
4. Let you accept or reject each block before anything is written to disk

This is the "Sima builds the schema from requirements on its own" promise — the headline feature of the system.

---

## 8. What you should know about the architecture

### Layers
Every block has a `layer`:
- `backend` — server logic, APIs, databases
- `frontend` — UI, components, screens
- `logic` — business rules, pure functions
- `tests` — checks

A node's color on the canvas reflects its layer.

### Multi-tenant
A single server hosts many projects. The `?client=<id>` URL parameter switches context:
- `?client=main` — the root `atlas/blocks/` (Sima itself)
- `?client=my-product` — `atlas/clients/my-product/blocks/`
- `?client=other-product` — `atlas/clients/other-product/blocks/`

The toolbar has a project picker (the current client) — switch between projects or create new ones.

### Block memory
On top of the contract files, every block carries a memory layer (R-7.76+):
- `narrative.md` — append-only run history. Each successful run adds a section: *what I tried / what worked / what failed and why / decisions made*. **Auto-injected into the next agent prompt** under «## ⚠ Block memory».
- `decisions.log` — structured TSV (timestamp · author · decision). `cascade_verify` writes here when it detects breakage caused by a parent edit.
- `patterns.md` — distilled lessons of "what worked / what didn't"
- `code_summary.md` — LLM-generated map of the block's code (regenerated after each run)
- `history/` — file snapshots for every patch

Plus operator-locked memory at the project level (in `atlas/operator_profile/`):
- `dont_use.json` / `always_use.json` — per-block (or global) rules with `severity:hard|soft`. Hard rules **fail the run** when violated (post-run drift scanner, R-7.82).
- `lessons.json` — accumulated lessons-learned with evidence

All of the above flow into the next run's context pack — the agent reads them before touching code, and physically cannot silently reverse a past architectural decision.

### Project-level architecture lock-in (R-7.85, S-6)
`atlas/architecture_decisions.md` (or `atlas/clients/<id>/architecture_decisions.md`) is **append-only** by design. Every entry is auto-injected into EVERY prompt across ALL blocks under «## ⚖ Architecture decisions (project-level — DO NOT silently reverse)».

Add via:
- MCP tool: `add_architecture_decision {decision, rationale, affects?, reversible?}`
- HTTP: `POST /atlas/architecture-decisions/add`
- CLI: `node scripts/architecture_decisions_api.mjs add ...`

There is **no edit/delete API** — surface change requests through `narrative.md` instead.

### Implementation Status panel (R-7.86)
Each block's **Overview tab** now opens with an 8-row dashboard at the top: Mission · KPIs · Acceptance · Tasks · Files alive · Decisions logged · Run history · Block status. Each row carries a ✓/~/✗/· marker so contract-vs-reality progress is visible without clicking through tabs.

### Token Spend widget (R-7.87, S-9)
Below the Implementation Status panel, the same Overview tab carries a **Token Spend** widget showing actual cost + Anthropic Haiku 4.5 «shadow bill» equivalent + top-burning ops + by-provider breakdown. Day-window selector (7/30/90). Per-block view falls back to project-wide when this block has no recorded `run_state` yet.

### Context-pack profiles (R-7.86, S-4)
When you start a run, you can pick a context-pack profile to control prompt size:
- `design` (default) ~5–15K — full pack, for new-block scoping & major refactors
- `backend-fix` ~2–4K — mission + acceptance + decisions + narrative + deps' provides only
- `ui-fix` ~1.5–3K — frontend-focused, deps skipped entirely
- `acceptance-only` ~0.5–1.5K — verifier or "is this ready to ship" runs

Selection: `--profile` CLI flag, `ATLAS_PACK_PROFILE` env var, or MCP arg `{profile}`. UI selector at run-start is in the roadmap (S-10).

`architecture_decisions.md` is **always** included regardless of profile.

### Cascade verify on edit (R-7.84, S-8)
After every successful run on block X, `cascade_verify` walks `graph.json` reverse-deps and re-runs the acceptance verifier on every block whose `depends_on` references X. Anything that broke gets `status: desync` on the canvas immediately, with a stack-trace-style entry in its `narrative.md`. You see the chain inline, not at the next nightly sweep.

---

## 9. Where to look when something breaks

`docs/troubleshooting.md` collects real errors and fixes from the R-7.X debug sessions:
- LLM Invalid API key / 401
- Cursor/Codex run ENOENT
- block dir not found
- Multi-tenant banner stuck
- UI clicks not working
- CLI-entry bug on Windows

For any failure, `npm run dev` prints an API log line with the concrete reason.

---

## 10. Next steps

- **Acceptance.md** — write testable criteria (`evidence_kind: shell|grep|ast|run|llm`). Sima runs the verifier automatically after every run.
- **Architecture review** — `Architecture` in the toolbar → Sima walks the entire graph plus `project.md`, surfaces contradictions, drift against `tech_stack`, and missing dependencies.
- **Subagents** — `Subagents` in the toolbar → specialized roles (verifier / wiki-builder / schema-syncer) for routine checks.
- **Templates** — canonical block skeletons (auth-service, dashboard-page, etc.). Apply one and you get a set of blocks with a ready-made contract.

---

## TL;DR

```
clone → npm install → npm run dev
?client=my-project → + New module → fill in mission/acceptance
shift+drag creates links · double-click drills into a block
Runs → Claude Code → wait for pass
git commit
```

And, above all — **read `docs/troubleshooting.md` when something looks weird**. It has the real fixes from real debug sessions.

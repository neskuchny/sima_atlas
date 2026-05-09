# Implementation: what's done / what's not

Updated: 2026-05-09 (post R-7.87)

This file is the operational snapshot. Per-phase detail lives in
[`CHANGELOG.md`](../CHANGELOG.md); contract-level detail lives in
[`atlas/blocks/<id>/`](blocks/).

## Done (R-1 → R-7.87)

### Foundation (R-1 → R-7)
- [x] Visual canvas with depth-controlled rendering (`1 / 2 / ∞`), drill-down, anchor-point edge creation
- [x] Block contract loading — Overview tab reads `mission.md` / `kpi.md` / `acceptance.md` / `depends_on.md` / `provides.md` live
- [x] 5-provider LLM cascade (`claude_cli` → `anthropic` → `google` → `ollama` → `mock`)
- [x] `sima_fill_from_chat` orchestrator + chat-session watcher (R-3)
- [x] Layer-aware blocks (B/L/F/T) with one-click `patchBlock({layer})`
- [x] Multi-tenant `atlas/clients/<id>/` with per-client graphs, proposals, memory
- [x] EN-first i18n (644 keys, 🌐 EN/RU pill, persisted)
- [x] VS Code extension 0.1 scaffold

### Verification & evidence (PR-1 → PR-4 of `b.acceptance-verifier-loop`)
- [x] Tri-state acceptance (`pass` / `fail` / `inconclusive`)
- [x] Five evidence collectors (`exit_code` / `fs_glob` / `file_diff` / `log_grep` / `selftest_run`) + `llm_judge` fallback
- [x] `verify_block_acceptance` MCP tool
- [x] ↻ Fix-and-rerun packages failed assertions back into a new prompt

### Memory layer end-to-end (R-7.76 → R-7.81)
- [x] `atlas/blocks/<id>/narrative.md` — append-only run history (what I tried / what worked / what failed / decisions made)
- [x] `atlas/blocks/<id>/decisions.log` — structured TSV (timestamp · author · decision)
- [x] `atlas/operator_profile/{lessons,dont_use,always_use}.json` — operator-locked memory with `severity:hard|soft`
- [x] All of the above auto-injected into agent prompt under «## ⚠ Block memory» by `run_block_implementation.mjs`
- [x] `build_context_pack.mjs` includes memory in every pack
- [x] Auto-seed `operator_profile` + `architecture_decisions.md` at `dev_server.mjs` startup (idempotent)

### Drift & cascade verification (R-7.82 / R-7.84)
- [x] **S-3 — runtime content drift scanner** (`scripts/scan_run_for_drift.mjs`): scans modified files post-run against `dont_use` rules. Hard violations exit 1 → run marked Failed.
- [x] **S-8 — cross-block break detection on edit** (`scripts/cascade_verify.mjs`): walks reverse-deps after every successful run. Broken dependents get `status: desync` in `graph.json` + structured entry in their `narrative.md`.

### Project-level architecture lock-in (R-7.85)
- [x] **S-6 — `architecture_decisions.md`** (`scripts/architecture_decisions_api.mjs`): append-only project decisions. Auto-injected into EVERY future agent prompt across ALL blocks. **No edit/delete API by design** — surface change requests through `narrative.md`.
- [x] `add_architecture_decision` + `list_architecture_decisions` MCP tools
- [x] `POST /atlas/architecture-decisions/add` HTTP endpoint
- [x] `architecture_decisions.md` always included in every context-pack profile

### Context economy & status visibility (R-7.86)
- [x] **S-4 — context-pack profiles** (`design` / `backend-fix` / `ui-fix` / `acceptance-only`). Verified token economy on `b.docs`: 5809 → 3701 → 2763 → 1846 tokens.
- [x] CLI flag `--profile`, env var `ATLAS_PACK_PROFILE`, MCP `build_context_pack({profile})`
- [x] **Implementation Status panel** in Overview tab — 8-row dashboard (Mission · KPIs · Acceptance · Tasks · Files alive · Decisions logged · Run history · Block status) with ✓/~/✗/· markers

### Token economics (R-7.87)
- [x] **S-9 — token economics aggregator** (`scripts/token_economics.mjs`): rolls up `atlas/llm_traces` per block / op / provider / day with two cost dimensions (`cost_usd_actual` and `cost_usd_equivalent` — Anthropic Haiku 4.5 shadow bill)
- [x] `GET /atlas/token-economics?days&block` HTTP endpoint
- [x] `token_economics` MCP tool
- [x] Token Spend widget in Overview tab (per-block view falls back to project-wide when no `run_state` for that block)

### Skill files & navigation (R-7.83)
- [x] `docs/agent-navigation.md` extended to 14-step read order with memory layer + drift + cascade + architecture decisions
- [x] `.claude/skills/sima-atlas-navigator/SKILL.md`, `.cursor/rules/sima-atlas-navigator.mdc`, `AGENTS.md` — all kept in sync with canonical doc

## Not done — next phases

### Closing the loop (v0.5 → v0.9, Q4 2026)
- [ ] **S-1** — block templates marketplace (auth / payments / search / ingestion / billing) with mission + KPI + acceptance
- [ ] **S-7** — transactional change-sets for cross-cutting changes (REST→GraphQL, capability rename, DB migration); UI shows «5 blocks touched by transaction T» with per-block acceptance state
- [ ] **S-9.1** — global Token Economics tab (separate from per-block widget): sparklines, cost-per-pass vs cost-per-fail ROI, model A/B comparison
- [ ] **S-10** — UI surface for context-pack profile selection at run-start (currently CLI flag + env var only)
- [ ] **S-11** — cross-block roll-up in Implementation Status: «what % of contracts in this subsystem are filled?»

### Collaboration + local models (v0.6 → v0.9, Q4 2026)
- [ ] **T-1** — multi-operator collaboration with CRDT-merging contract files; full client isolation
- [ ] **U-1** — local models as first-class providers (Ollama landed in R-7.60; vLLM / LM Studio adapters welcome as PRs)
- [ ] **U-2** — `Sima Shell` lightweight MCP client optimised for local models
- [ ] **U-3** — Continue / Aider / Zed-AI MCP integration parity

### Vision (v1.x → v2, 2027+)
- [ ] **V-1** — agent-loop daemon (overnight autonomous mode)
- [ ] **V-2** — one-click deploy: block → docker → cloud with the same acceptance running in production
- [ ] **V-3** — production-monitor: catches unknown-unknowns, lifts them back into the graph as new acceptance assertions
- [ ] **W-1** — cross-project pattern transfer (`lessons.json` between projects)
- [ ] **W-2** — batch mode: 10 projects in parallel under one dashboard
- [ ] **W-3** — community archetypes (vibe-coding novice / mid-stage startup / enterprise) as cold-start templates

### Won't fix
- ❌ **Hard lifecycle gates by default** — would break draft-stage iteration. Kept soft with explicit visible hints (Article Appendix B.2).

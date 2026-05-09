# Sima Atlas — current status

Updated: 2026-05-09 (post R-7.87 / PR #36)

This report is the **current operational snapshot**. For per-phase
history see [`CHANGELOG.md`](../CHANGELOG.md). For per-block contract
detail see [`atlas/blocks/<id>/`](blocks/).

> Earlier versions of this file (PR1 → PR4 honest-reset, dated 2026-05-02)
> are preserved in git history. The state below supersedes them.

## Where we are

Sima Atlas is at **v0.1 + R-7.87**. Foundation phases (R-1 → R-7) and
the operator-experience phases (R-7.50 → R-7.87) are all in `main`.
Used daily for Sima's own development; not yet recommended for
mission-critical commercial deployments.

## What's live (R-1 → R-7.87 — all merged)

### Foundation (R-1 → R-7)
- Visual canvas with depth control (`1 / 2 / ∞`), drill-down, anchor edges, layer-aware blocks
- Block contract loading (Overview tab live-reads `mission/kpi/acceptance/depends_on/provides`)
- 5-provider LLM cascade (`claude_cli` → `anthropic` → `google` → `ollama` → `mock`)
- `sima_fill_from_chat` orchestrator + chat-session watcher (R-3)
- Multi-tenant `atlas/clients/<id>/`
- EN-first i18n (644 keys, 🌐 EN/RU pill)
- VS Code extension 0.1 scaffold

### Verification & evidence
- Tri-state acceptance (`pass` / `fail` / `inconclusive`)
- Five evidence collectors (`exit_code` / `fs_glob` / `file_diff` / `log_grep` / `selftest_run`) + `llm_judge` fallback
- ↻ Fix-and-rerun packages failed assertions into a new prompt

### Memory & lock-in (R-7.76 → R-7.85)
- **Per-block memory layer**: `narrative.md` + `decisions.log` auto-injected into every prompt
- **Operator-locked rules**: `dont_use.json` / `always_use.json` per block (or global) with `severity:hard|soft`
- **Project-level architecture lock-in (S-6)**: `architecture_decisions.md` append-only, auto-injected across ALL blocks
- **Auto-seed at startup (R-7.81)**: `dev_server.mjs` creates `operator_profile/*` + `architecture_decisions.md` idempotently
- **Runtime drift scanner (S-3)**: `scan_run_for_drift.mjs` checks modified files post-run; hard violations fail the run
- **Cascade verify on edit (S-8)**: `cascade_verify.mjs` walks reverse-deps after every successful run; broken dependents marked `status: desync` inline

### Context economy & visibility (R-7.86 / R-7.87)
- **Context-pack profiles (S-4)**: `design` (~5–15K) / `backend-fix` (~2–4K) / `ui-fix` (~1.5–3K) / `acceptance-only` (~0.5–1.5K)
- **Implementation Status panel**: 8-row dashboard in Overview (Mission · KPIs · Acceptance · Tasks · Files alive · Decisions logged · Run history · Block status)
- **Token economics (S-9)**: `cost_usd_actual` + `cost_usd_equivalent` (Anthropic Haiku 4.5 shadow bill) per block / op / provider / day. Token Spend widget in Overview.

## Current real state per block

| Block | Status | Working | Caveats |
|---|---|---|---|
| `b.ui-control` | wip | React canvas, layer switcher, lifecycle, drill-down, multi-tab DetailPanel, Implementation Status + Token Spend widgets | Heavy single-file `panels.jsx` (~119K) — splitting planned in S-10 |
| `b.core-sync` | done | `syncCheck` validates capability bindings and file presence; cascade_verify added (S-8) | File presence ≠ semantic match — KPI text drift not flagged |
| `b.db` | idea | Markdown + localStorage; multi-tenant atlas/clients/<id>/ | No real DB layer; per-tenant artifact migration not automated |
| `b.agent-orchestrator` | review | MCP server with ~70 tools; cascade_verify, scan_run_for_drift, token_economics, architecture_decisions all wired | No agent-loop daemon yet (V-1 in roadmap) |
| `b.llm-gateway` | review | 5-provider cascade with structured output, trace + cost cap, schema validation, golden eval | No automatic provider A/B; per-call cost only via token_economics roll-up |
| `b.docs` | wip | Generates wiki / TZ / roadmap with topo-sort + mermaid; per-block user-docs | Templates still leak when block is sparse |
| `b.acceptance-verifier-loop` | done | Tri-state verdict, 5 collectors + LLM judge, ↻ Fix-and-rerun | LLM judge inconclusive on missing API key (by design — never silent green) |
| `b.operator-profile-learner` | wip | Memory layer end-to-end (R-7.76→R-7.85); auto-seed at startup; drift scanner; architecture decisions | No cross-project transfer yet (W-1 in roadmap) |
| `b.user-docs-generator` | idea | Per-block user tutorials in `atlas/docs/end-user/` | Auto-regen on JSX changes not wired |
| `b.smoke-sandbox` | idea | Reserved write target for e2e/smoke scripts | — |

## What's not done — next phases

### Closing the loop (v0.5 → v0.9)
- **S-1** — block templates marketplace (auth / payments / search / ingestion / billing)
- **S-7** — transactional change-sets for cross-cutting changes
- **S-9.1** — global Token Economics tab (sparklines, ROI, A/B model comparison)
- **S-10** — UI surface for context-pack profile selection at run-start
- **S-11** — cross-block roll-up in Implementation Status

### Collaboration + local models
- **T-1** — multi-operator collaboration (CRDT-merging contract files)
- **U-1..U-3** — local-model adapters parity (vLLM / LM Studio); `Sima Shell`; Continue / Aider / Zed-AI

### Vision (2027+)
- **V-1** — agent-loop daemon (overnight autonomous mode)
- **V-2** — one-click deploy with same acceptance running in production
- **V-3** — production-monitor → new acceptance assertions
- **W-1..W-3** — cross-project memory; agency batch mode; community archetypes

### Won't fix
- **Hard lifecycle gates by default** — would break draft-stage iteration

## Verification commands

```bash
# Whole-graph validators
node scripts/nightly_consolidation.mjs

# Token economics roll-up (last 30 days)
node scripts/token_economics.mjs --days 30

# Per-block context-pack profile sanity
for p in design backend-fix ui-fix acceptance-only; do
  node scripts/build_context_pack.mjs b.docs --profile $p
done

# Cascade verify (dry-run preview)
node scripts/cascade_verify.mjs b.core-sync --dry-run

# Architecture decisions list
node scripts/architecture_decisions_api.mjs list
```

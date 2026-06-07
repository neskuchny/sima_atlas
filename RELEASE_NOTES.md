# Sima Atlas v0.3.0 — *the loop actually closes*

> Third public-release tag.
> v0.1.0 gave you the contract graph + a 5-provider LLM cascade + the
> acceptance loop. v0.2.0 added memory, lock-in, context economy and
> at-a-glance status. **v0.3.0 makes the loop close on its own**: Sima now
> walks its own graph, and judges whether the code matches the *meaning* —
> not just whether files exist.

![Canvas overview](tests/playwright/screenshots/sima_design_live.png)

---

## The one-line story

v0.2.0 fixed the operator's daily pain — agents forgetting decisions,
breaking sibling features silently, burning tokens on bloated prompts, no
at-a-glance «what's actually done». But there was still one question left:
*«is this block actually done, or just green on a technicality?»* — and
no hands-off way to keep building overnight. **v0.3.0 closes those last two
loops**: a **semantic verifier** that judges the *meaning*, and the **V-1
autonomous daemon** that walks the graph for you.

---

## 🧠 Memory & lock-in — agents stop forgetting

- **Per-block memory layer** — `narrative.md` + `decisions.log` auto-injected
  into every agent prompt under «## ⚠ Block memory». The agent reads its own
  past notes before touching code.
- **Append-only `architecture_decisions.md`** injected into EVERY prompt across
  ALL blocks — an agent physically cannot silently reverse a past
  architectural choice.
- **Operator-locked rules** with `severity:hard|soft`. Hard rules **fail the
  run** when violated (post-run drift scanner).
- **Cross-block break detection** — after a successful run on block X, walk
  reverse-deps and re-verify each. Broken dependents go `status: desync`
  inline on the canvas.

## 🎯 Contract as Arbiter — the semantic verifier *(the headline ask)*

Deterministic checks tell you the file exists. They don't tell you it does
what the contract *meant*. The new semantic verifier does.

- `scripts/semantic_verify.mjs` reads the **whole** contract (mission ·
  user_story · kpi · acceptance · provides · depends_on) + methodology
  (architecture_decisions · tech_stack · rules · dont_use · always_use) +
  the **real code** + neighbour contracts, and returns a **tri-state verdict
  on five dimensions**:
  1. matches the mission (meaning)
  2. meets KPIs + acceptance
  3. follows the methodology
  4. will work as described
  5. block connections are consistent

  …plus a `todo_to_pass` punch-list. Persisted to
  `blocks/<id>/semantic_review.json`, surfaced as a **Semantic Review** panel.
- **Honest degradation**: no API key / mock → `inconclusive`, **never** a
  false pass. With a live key it runs on a **non-thinking** model
  (gemini-2.5-flash).
- **user_story is now a first-class TOP layer** — flows into the context-packs,
  the implementation prompt, and the semantic bundle, sitting above mission
  everywhere.

## 🤖 V-1 — the autonomous loop daemon

The promise from the README vision, shipped: *«once contracts are filled, Sima
walks the graph, dispatches agents to todo blocks, runs acceptance, marks
pass/rollback — you wake up, scan the canvas, see what was built and what
stalled.»*

- `scripts/agent_loop_daemon.mjs` — a **Ralph-loop-shaped** one-shot
  (cron-friendly, not a resident process): pick next runnable block → fresh
  agent → tri-state verifier → CI-stays-green guard → semantic gate → record
  to disk → repeat. Iteration / budget / circuit-breaker caps included.
- **Print-only by default** — the first run shows what it *would* do;
  `--agent claude` arms it. Safety first.
- **Auto-rollback** — a run that regresses a previously-green `done` block is
  reverted from an owned-files snapshot, leaving the tree no worse.
- **Revisits semantic-red `done` blocks** — a block the judge marked `fail` is
  picked back up and fed the previous run's `todo_to_pass`, so *«the system
  walks every block and rewrites what's wrong»* is real, not aspirational.

```bash
node scripts/agent_loop_daemon.mjs --dry-run            # plan only, nothing runs
node scripts/agent_loop_daemon.mjs                      # print-only agent (safe)
node scripts/agent_loop_daemon.mjs --agent claude --max-iterations 8 --max-cost-usd 2.00
```

## 💸 Context economy & cost as a first-class signal

- **Context-pack profiles** — `design` ~5–15K · `backend-fix` ~2–4K · `ui-fix`
  ~1.5–3K · `acceptance-only` ~0.5–1.5K. Pack size is a derivative; precision
  is the goal. Architecture decisions always included regardless of profile.
- **Token economics** with two cost dimensions: `cost_usd_actual` (what was
  charged) + `cost_usd_equivalent` (stable shadow bill across providers).
  Global **Token Economics** tab with sparkline + cost-per-pass ROI.

## 🔌 Multi-source chat ingestion (R-7.97, closes Gap #15)

`sima_watch_chats` now harvests from **three** agent transcripts, not just one:

- **`claude`** — `~/.claude/projects/*.jsonl` (original)
- **`codex`** — `~/.codex/sessions/*.jsonl` (OpenAI Codex CLI), incl. older
  streaming `input_text` / `output_text` shape, auto-merged into clean turns
- **`cursor`** — `state.vscdb` (Cursor / VS Code fork), read via
  `sqlite3 -readonly`; covers both new composer chats (`cursorDiskKV`) and
  the legacy `ItemTable` schema. Skipped gracefully if `sqlite3` CLI isn't
  installed — Cursor support is opt-in by environment.

`--source claude,codex` selects a subset. The old single-source cursor file
auto-migrates; nothing breaks for existing installs. Latent UTF-8 bug fixed
along the way: per-file offsets now advance in byte-space, not UTF-16
code-units, so Cyrillic / emoji no longer cause duplicate harvests.

Nightly: 70 → **72/72 PASS** (two new source selftests).

## 🔁 Transactional change-sets + dead-code hygiene

- **Change-sets** (`scripts/change_set.mjs`) — group cross-cutting edits;
  commit is refused unless every member block is green. Rollback writes to
  narrative for operator review, never silently reverts code.
- **Import-graph dead-code** — finds files unreachable from any entrypoint's
  import graph (vs orphan-code, which only catches files unmentioned in
  contracts). Surfaced in the **Cleanup** tab; never auto-deletes
  (move-with-breadcrumb only).

## 🧰 Production-Ready Starter + dogfood

- **S-1** block templates · **S-10** context-pack profile-UI · **S-11**
  subsystem roll-up in Implementation Status.
- **«Sima fixes Sima»** — the graph brought in sync with reality; nightly
  honestly green **70/70** (corrected from a stale 68/68 that was really 60/70).

---

## New canvas tabs

| Tab | What it shows |
|---|---|
| 🤖 **Autonomous** | What the overnight V-1 run built / stalled, with rollbacks |
| 🔁 **Change-sets** | Cross-cutting transactions and their member-block status |
| 🧹 **Cleanup** | Orphan-code + import-graph dead-code, move-with-breadcrumb |
| 🎯 **Semantic Review** | Five tri-state dimensions + `todo_to_pass`, per block |

---

## Quickstart (60 seconds)

```bash
git clone https://github.com/neskuchny/sima_atlas
cd sima_atlas
npm install
npm run dev
# → API on :8787 · UI on http://localhost:8000 · opens demo client
```

To plug Sima into your AI tool (Claude Code, Cursor, Codex, Continue, Zed,
Windsurf, Antigravity), see [`docs/integrations.md`](docs/integrations.md).

---

## Verification

```bash
node scripts/nightly_consolidation.mjs                 # 70/70 validators green
node scripts/agent_loop_daemon.mjs --dry-run           # V-1 plans, runs nothing
node scripts/semantic_verify.mjs b.docs --json         # inconclusive without a key
node scripts/token_economics.mjs --days 30
```

---

## Honest self-audit

[`docs/article.en.md` Appendix A](docs/article.en.md): **15 ✅ fully-implemented**,
**5 🟡 partial-with-caveats**, **0 ❌**. Used in production by Synlabs for Sima
Atlas's own development (we eat our own dog food).

Not yet recommended for mission-critical commercial deployments — early
adopters welcome.

---

## What's next (post-0.3.0)

- 🎯 Run the semantic verifier across every `done` block for a full red-state map.
- 🔬 Token-savings benchmark on a 50-block product (vs. raw Claude Code).
- 🛠️ vLLM / LM Studio adapters in `llm_gateway.mjs`.

---

Released under [MIT](LICENSE) by **[Synlabs](https://github.com/neskuchny)**.
Maintained by Anton Kalabukhov + contributors. Per-phase detail (R-7.91 →
R-7.96) lives in the [CHANGELOG](CHANGELOG.md).

🤖 v0.3.0 generated with [Claude Code](https://claude.ai/code)

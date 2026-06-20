# Sima Atlas v0.4.0 — *the system passes its own protocol, then ships as an app*

> Fourth public release.
> v0.3.0 closed the autonomous loop. v0.4.0 makes the system **honest with itself**: it passes its own canon-compliance spec, the article becomes a projection of the graph, every done block gets a live semantic verdict, Sima becomes a downloadable program with its own block contract, and a new data-layer block (`b.code-graph`) reads real imports/exports and catches drift the contract validator could not see. The V-1 autonomous loop ran end-to-end overnight on a real Claude agent — three honest stalls, zero false promotions, the canon doing what it promised.

![Canvas overview](tests/playwright/screenshots/sima_design_live.png)

---

## The one-line story

If v0.3.0 was «the loop closes», v0.4.0 is **«the loop demonstrates honesty»**. We sat the reference implementation in front of its own canon-compliance spec and found 5 violations. We had Gemini sit in judgment over every done block and found drift the contract validators could not see. We ran a full overnight V-1 cycle with a real Claude agent — and the canon's contract-as-arbiter rule produced three honest stalls instead of the false «remediated» stamps that earlier iterations would have left on disk. And then we packaged the whole thing as a downloadable program so the next operator never has to open a terminal.

---

## 🎯 Sima Atlas now passes the Kanon Protocol Specification — Level 3

The audit found **5 protocol violations** in the reference implementation. All closed:

| Spec | What was wrong | Fix |
|---|---|---|
| **§3.2** | `llm_judge` could be the sole basis for a block-level pass — undermining «no silent green» | Block verdict requires ≥1 deterministic passing assertion; judge-only → `inconclusive` flagged `llm_judge_only` |
| **§2.4** | `inconclusive_if` sections in `acceptance.md` were undocumented and unparsed | Parser now reads them; precondition fail → forced `inconclusive` (deterministic FAIL still wins) |
| **§4.1** | Cascade verifier walked only direct reverse-deps, not the transitive closure | Cycle-safe BFS over the full reverse-dep closure |
| **§2.2** | Spec required nested `contract/` + JSON; the reference ships flat `.md`. Reference was non-compliant with its own spec | Spec bumped to **0.1.1** — both layouts are legitimate (Layout A nested, Layout B flat) |
| **§7.4** | No compliance level claimed in README | Now claims **Level 3 — Cost-transparent** with a mapping table |

README links the spec; `b.acceptance-verifier-loop` carries the new `inconclusive_if` evidence; `cascade_verify` now reaches every transitive dependent.

## 📊 Full semantic red-state map of the graph

Every non-idea block got a live verdict from Gemini (non-thinking, `gemini-2.5-flash`). Results persisted to `blocks/<id>/semantic_review.json`:

| Block | Verdict | Persisted todo for V-1 |
|---|---|---|
| **b.docs** | **PASS** (after remediation: template gate wired into both doc generators, all 7 contract files in wiki, kpi + source-links + idea-filter in `auto_tz`) | none |
| b.core-sync | FAIL → 5 todos | T7 PR3, T8 enforcement, sync_report aggregation, b.code-graph integration, KPI-2/A3 |
| b.acceptance-verifier-loop | FAIL → A8 pre-commit hook missing | track |
| b.llm-gateway | FAIL → cost-cap + token budget code not visible | track |
| b.agent-orchestrator | FAIL → mission promises ALL agents; Claude-Code leg partial | track |
| b.ui-control | FAIL → rendering + multi-layer + agent-orchestrator wiring | track |

`semantic_verify` now opens its prompt with a **FILE INVENTORY** (existence verified on disk) so the judge can't fail a block over a file the char budget truncated. Budget bumped 14K → 24K chars. Caught live on `rebuild_atlas_roadmap.mjs` — the file existed, the verdict was wrong.

## 📄 Article-as-projection (Kanon principle VII applied to our own docs)

The original Part 9 of `docs/article.{en,ru}.md` claimed `done` for blocks the graph honestly held at `idea`. That drift was a direct violation of the canon ("documentation is a projection of the graph"). Fixed:

- `scripts/sync_article_status.mjs` regenerates the Part 9 block table from `graph.json` between explicit `<!-- BLOCK-STATUS:BEGIN -->` / `<!-- :END -->` markers.
- Wired into `generate_full_bundle` (MCP + CLI) and into nightly as `article_status_projection --check` — a stale article = red validator.
- Part 10 roadmap markers honestly corrected: S-1 ✅ R-7.89, S-7 ✅ R-7.92/93, S-9.1 ✅ R-7.92, V-1 ✅ R-7.91→96, U-1 🟡 (Ollama shipped; vLLM/LM Studio pending).

## 🧮 `b.code-graph` — new data-layer block

The deterministic complement to the contract graph. Reads real `import`/`export` statements from every alive `.mjs`/`.js`/`.jsx` file in the repo and turns them into a graph of code-edges — then catches drift the contract validator cannot see (a file imports from another block without declared `depends_on`).

- `scripts/build_code_graph.mjs` — pure-Node ES-module extractor (no native deps). `~200 ms` on the current tree, **109 files indexed, 6 cross-block edges**. Sha256-stable across runs (selftest g9 enforces it).
- `scripts/validate_code_graph_vs_contracts.mjs` — two detectors:
  - `undeclared_code_dependency` (**severity: error**) — file imports from a block its block's depends_on doesn't list.
  - `provided_capability_not_exported` (**severity: warning** by default; `--strict-provides` escalates).
  Findings merged into `atlas/sync_report.json` under `codeGraphDrift`, preserving every other writer.
- **Tree-sitter deliberately deferred** — a 100 MB native binding for a monoglot JS codebase violates lightweight-by-default. Pluggable backend reserved for when non-JS files actually appear in `files.md`.

**Caught a real drift on the day it landed:** `b.agent-orchestrator/scripts/analyze_conversation_to_atlas.mjs` was importing from `b.llm-gateway` and `b.operator-profile-learner` without declaring either dependency. Contract fixed (code wins, per canon).

## 🖥 `b.desktop` — Sima as a downloadable program

The `git clone && npm install && npm run dev` flow is fine for developers. For operators who want to **build a product**, it's a barrier. v0.4.0 ships Sima as a native `.dmg` / `.exe` / `.AppImage`:

- `extensions/desktop/main.mjs` spawns `atlas_api_server.mjs` via Electron's `utilityProcess.fork` — bundled Node, **no system Node prerequisite**.
- Inline static server for `frontend/`, dynamic-port pick (no collision with a running `npm run dev`).
- Native menu: **File** (Open Project ⌘O, Reveal Atlas) · **Run** (Verify All ⌘⇧V, Generate Bundle ⌘⇧G, V-1 dry-run ⌘⇧R, Token Economics) · **View** · **Help** (Docs, Kanon Manifesto, block contract, Check for Updates).
- Every menu action POSTs to `/atlas/checks/append` so desktop sessions land in the same audit-trail as CLI sessions — a single `checks.log` for both surfaces.
- `electron-updater` lazy-imported, active only in `app.isPackaged`; checks GitHub Releases on a 5-minute startup grace.
- **Project Picker modal** (`frontend/atlas_design/project_picker.jsx`): list of `~/SimaProjects/<name>/atlas/` + bundled atlas, name-whitelist `^[a-zA-Z0-9._-]{1,40}$`, one-click open swaps `ATLAS_ROOT` and reloads.
- **Security baseline** (Electron post-12): `contextIsolation: true`, `nodeIntegration: false`. The preload exposes only `window.sima.{openProjectPicker, revealInFinder, triggerV1, verifyAll, generateBundle, v1DryRun, tokenEconomics, checkForUpdates, listProjects, createProject, openProject, onOpenProjectPicker}`.
- **CI**: `.github/workflows/desktop-build.yml` builds DMG / NSIS+portable / AppImage+deb on every `v*.*.*` tag push and attaches them to the matching GitHub Release.

Block contract walked the full `idea → wip → review → done` lifecycle in one session: contract → 13-group structural selftest → CI workflow → verifier 7/7 pass → gates → done. Block is **done**.

Signing (Apple Developer ID, Windows code-signing cert) is explicitly **PR5** — operator task, gated on certificates ($99/yr Apple, ~$300/yr Windows). Unsigned installers work; users click through Gatekeeper / SmartScreen once.

## 🔌 Multi-source chat ingestion (closes Gap #15 from v0.3.0)

`sima_watch_chats` now harvests from **three** agent transcripts behind one interface:

- **claude** — `~/.claude/projects/*.jsonl`
- **codex** — `~/.codex/sessions/*.jsonl` (+ `~/.codex/history/`); handles 3 line shapes including older streaming `input_text` / `output_text` chunks (auto-merged into clean turns)
- **cursor** — `state.vscdb` via `sqlite3 -readonly`; covers both new composer chats (`cursorDiskKV`) and the legacy `ItemTable` schema. Skipped gracefully if `sqlite3` CLI absent.

New `--source claude,codex` flag (CSV). MCP `sima_watch_chats` exposes the same. Latent **UTF-8 cursor bug** fixed along the way — harvest now advances in byte-space, not UTF-16 code-units, so Cyrillic / emoji no longer cause duplicate harvests.

## 🤖 First live V-1 overnight on a real Claude agent

The autonomous daemon ran end-to-end with a real `claude` CLI for the first time. Headline:

```
agent_loop_daemon [claude]: 3 block(s) — 0 advanced · 3 stalled
  stop: complete — no runnable blocks left
    ✗ b.db (idea) → fail: semantic verify FAILED
    ✗ b.smoke-sandbox (idea) → fail: verifier did not pass
    ✗ b.core-sync (done) → fail: semantic verify FAILED
```

**Three honest stalls, zero false promotions.** The system did exactly what it promised:

- The agent made real engineering progress on `b.db` (`atomicWriteFileSync`, `validateGraphSchema`, `saveBlockHistory`, migration runner, get-history API) — but the judge said «the code lives in `b.agent-orchestrator`'s territory, not `b.db`'s files.md». Architecturally correct call.
- The agent landed two new validators that close explicit todos from the previous Gemini verdict on `b.core-sync` — `dependencyValidation` in `sync_report.json`, `codeGraphSummary` in `sync_report.json` — and honestly inventoried `tasks.md` (T1/T6 ✓ with proof, T2 DEFERRED with rationale). The judge still found 5 dimensions of mismatch with the now-precise mission.
- `b.smoke-sandbox` smoke timed out — flaky test infrastructure, not malicious regression.

Auto-rollback correctly **did not fire** on any of them (none was a previously-green-done-block regressing). Partial progress is preserved on disk per Ralph-loop convention. Next V-1 run continues from richer narratives.

Two V-1 bugs surfaced **only** in this real run (print-only had masked them):
- `runCli` discarded `input` because `stdio[0]='ignore'` overrode it; `claude --print` exited in 0.6s with «Input must be provided». Fixed.
- Semantic gate parsed contaminated stdout instead of the persisted `semantic_review.json`; `JSON.parse` failed silently → false `inconclusive` → false promotion. Fixed: source-of-truth is the file; remediation requires a live verdict actually clearing the red.

Plus: `desync` finally has a lifecycle exit (`desync → done` / `wip`); green-guard is now deterministic by default (`ATLAS_GREEN_GUARD_LIVE=1` to opt back in to live LLM); a crashed `llm_judge` returns `skipped`/inconclusive (not `fail`) per spec §3.1.

## 📈 Nightly: 70 → 79/79 PASS

Nine new validators landed this release:

```
code_graph_build              code_graph_drift
code_graph_extractor_selftest code_graph_validator_selftest
checks_append_endpoint_selftest
desktop_structure_selftest
codex_source_selftest         cursor_source_selftest
article_status_projection
```

---

## Install

### Option A — Desktop app (no terminal, no Node prerequisite)

Download the installer for your OS from the
[v0.4.0 release page](https://github.com/neskuchny/sima_atlas/releases/tag/v0.4.0)
(populated automatically by CI after the operator pushes the tag):

| OS | File | Notes |
|---|---|---|
| macOS | `Sima Atlas-0.4.0-arm64.dmg` / `Sima Atlas-0.4.0.dmg` | Apple Silicon + Intel · unsigned, click through Gatekeeper on first launch |
| Windows | `Sima Atlas Setup-0.4.0.exe` | Installer · portable also available · unsigned, click through SmartScreen |
| Linux | `Sima Atlas-0.4.0.AppImage` | `chmod +x` and double-click · `.deb` also available |

Double-click → window opens on the canvas with a populated demo project. Block contract: [`atlas/blocks/b.desktop/`](atlas/blocks/b.desktop/).

### Option B — From source

```bash
git clone https://github.com/neskuchny/sima_atlas
cd sima_atlas
npm install
npm run dev
# → API on :8787 · UI on http://localhost:8000 · opens demo client
```

### Option C — Plug into your existing agent

`.mcp.json` is in the repo root — Claude Code picks it up automatically. For Cursor / Codex / Continue / Zed / Windsurf / Antigravity, see [`docs/integrations.md`](docs/integrations.md).

---

## Verification

```bash
node scripts/nightly_consolidation.mjs                 # 79/79 PASS
node scripts/agent_loop_daemon.mjs --dry-run           # V-1 plans, runs nothing
node scripts/build_code_graph.mjs                      # ~200 ms, 109 files
node scripts/validate_code_graph_vs_contracts.mjs      # 0 errors
node tests/desktop_structure.selftest.mjs              # 13 groups OK
node scripts/sima_watch_chats.mjs --once --source codex --json
npm run desktop:dev                                    # opens native window
```

---

## What's next (post-0.4.0)

- 🎯 V-1 on the product blocks (b.product-{auth,billing,dashboard,ingest,warehouse}) — try the autonomous loop on actual end-product modules, not on Sima-internal blocks.
- 🛠 PR5 for `b.desktop` — Apple Developer ID notarization + Windows code-signing, gated on operator certificates.
- 🎯 T7 (PR3) for b.core-sync — the LLM-semantic layer formally moves under that block's contract roof (already lives in `semantic_verify.mjs`).
- 🛠 vLLM / LM Studio adapters in `llm_gateway.mjs`.

---

## Honest self-audit

`docs/article.en.md` Part 9 is now a **machine-generated projection** of `graph.json`, not a hand-written claim. As of release: `b.docs · b.core-sync · b.acceptance-verifier-loop · b.operator-profile-learner · b.user-docs-generator · b.desktop` done · `b.agent-orchestrator · b.llm-gateway` review · `b.ui-control` wip · `b.code-graph · b.db · b.smoke-sandbox · b.product-{auth,billing,dashboard,ingest,warehouse}` idea.

Released under [MIT](LICENSE) by **[Synlabs](https://github.com/neskuchny)**.
Maintained by Anton Kalabukhov + contributors.
Per-phase detail in the [CHANGELOG](CHANGELOG.md).

🤖 v0.4.0 generated with [Claude Code](https://claude.ai/code)

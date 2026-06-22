# Changelog

Все заметные изменения проекта документируются здесь. Формат — [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), версионирование — [SemVer](https://semver.org/spec/v2.0.0.html).

Sima Atlas сейчас в early-stage (`0.x`), API может меняться без полного депрекейшна. Crucial breaking changes мы выделяем явно.

---

## [0.4.1] — 2026-06-22 — *desktop installer build fix*

Patch release. v0.4.0 tagged successfully on the CI side but produced zero downloadable artifacts because of two separate failures observed in workflow run 27946470849:

**Failure A — Linux .deb metadata (all three runners failed, ubuntu hit it first):**
- `electron-builder` `FpmTarget` validation required `homepage`, `author.email`, and `linux.maintainer`. None were set in `extensions/desktop/package.json`.

**Failure B — electron-builder tried to auto-publish (visible on macOS/Windows, would have hit linux too once A was fixed):**
- The `publish: { provider: github, ... }` block triggers electron-builder's GitHub publisher when `GITHUB_REF` is a tag. Without `GH_TOKEN` it dies with «GitHub Personal Access Token is not set». The Windows job actually produced `Sima Atlas Setup 0.4.0.exe` and the portable `.exe` before this error killed the cleanup step — so the artifacts existed but were thrown away.
- The workflow has its own publish step (`softprops/action-gh-release@v2`), so electron-builder's publisher is redundant and harmful.

**Fix:**
- Add `homepage`, `author { name, email }` to `extensions/desktop/package.json` (using the public GitHub no-reply email — no personal contact in shipped binaries).
- Add `linux.maintainer` so `.deb` passes FpmTarget metadata validation.
- Append `--publish=never` to all four `pack` scripts so electron-builder builds locally and lets the workflow handle the GitHub Release upload.
- Bump only the desktop package version (0.4.0 → 0.4.1). Root project version unchanged — this is build-config only, no source behavior changes.

Net effect: `v0.4.1` tag triggers a green build matrix and produces a downloadable installer per platform on the Release page.

---

## [0.4.0] — 2026-06-20 — *the system passes its own protocol, then ships as an app*

> v0.3.0 closed the autonomous loop. v0.4.0 makes the system **honest with
> itself**: it passes its own canon-compliance spec, the article becomes a
> projection of the graph, every done block gets a live semantic verdict,
> Sima becomes a downloadable program with its own block contract, and a
> new data-layer block (b.code-graph) reads real imports/exports and
> catches drift the contract validator could not see. The V-1 autonomous
> loop ran end-to-end overnight on a real Claude agent — three honest
> stalls, zero false promotions, the canon doing what it promised.

**Kanon spec compliance — Level 3 claimed (R-7.98)**
- §3.2: `llm_judge` can no longer be the sole basis for a block-level pass —
  ≥1 deterministic passing assertion required, judge-only → `inconclusive`
  flagged `llm_judge_only`.
- §2.4: `inconclusive_if` sections in acceptance.md — precondition checks
  whose failure forces `inconclusive` (deterministic FAIL still wins).
- §4.1: `cascade_verify` walks the transitive reverse-dependency closure
  (cycle-safe BFS), not just direct dependents.
- §2.2: spec 0.1.1 legitimizes the flat block layout (Layout B) the
  reference implementation actually ships.
- §7.4: README declares **Level 3 — Cost-transparent** with a mapping table.

**Article is a projection of the graph (Kanon VII)**
- `scripts/sync_article_status.mjs` regenerates the Part 9 block table in
  both articles from `graph.json`; wired into full-bundle and nightly
  (`--check`: stale table = red validator). Part 10 roadmap markers
  corrected (S-1/S-7/S-9.1/V-1 ✅, U-1 🟡).

**Semantic red-state map — full graph coverage**
- All six non-idea blocks judged by live Gemini: b.docs **PASS** (after
  remediation: template gate wired into both doc generators, all 7 contract
  files in wiki, kpi + source-links + idea-filter in auto_tz),
  b.core-sync / b.acceptance-verifier-loop / b.llm-gateway /
  b.agent-orchestrator / b.ui-control **FAIL** with persisted
  `todo_to_pass` — now the V-1 work queue.
- semantic_verify: code bundle opens with a FILE INVENTORY (existence
  verified on disk) so the judge can't fail a block over a file the char
  budget truncated; budget 14K → 24K.

**Honest lifecycle + tests that outgrew the repo**
- b.user-docs-generator and b.operator-profile-learner had stale «broken»
  status_reasons with green verifiers — walked through the gates to done.
  The A6 profile-compliance badge was genuinely rebuilt (API
  `/atlas/operator-profile/hints` + ProposalsPanel badges + i18n EN/RU).
- Two selftests asserted «the real operator profile is warming_up» — the
  real profile honestly flipped to `live`; both hermetic now.

**V-1 operator controls + live-run bugfixes (R-7.99)**
- `--only b.x,b.y` — targeted runs («доделай вот этот блок сейчас»).
- `ATLAS_AGENT_TIMEOUT_MS` — the 240s agent timeout is env-tunable.
- Caught by the first real-agent run (print-only had masked them):
  `runCli` was passing prompt via `input` while `stdio[0]='ignore'`, so
  the prompt was silently discarded and `claude --print` exited in 0.6s
  with «Input must be provided»; the semantic gate parsed stdout (which
  the gateway pollutes with a provider banner), `JSON.parse` threw, the
  catch yielded `inconclusive`, and a block fail-on-all-five-dimensions
  got promoted to «done (remediated)». Both fixed: stdio honours `input`;
  source of truth is the persisted `semantic_review.json`, never stdout;
  remediation requires a live verdict actually clearing the red.
- `desync` finally has a lifecycle exit (`desync → done` when re-verify
  is green, `desync → wip` when genuinely broken). Cascade could put
  blocks INTO desync but nothing could take them out.
- Green-guard now deterministic by default (mock collectors); opt back in
  with `ATLAS_GREEN_GUARD_LIVE=1`. Selftests with internal live-LLM calls
  were randomly timing out and flagging 8/0-green blocks as 5/3 red.
- A crashed llm-judge now returns `skipped`/inconclusive (not `fail`) per
  spec §3.1 — minted-from-thin-air regressions are gone.

**b.code-graph — new data-layer block (R-7.99)**
- `scripts/build_code_graph.mjs` — pure-Node ES-module extractor (no
  native deps). Per-file imports + exports, grouped by owning block,
  cross-block edges, written deterministically to `atlas/code_graph.json`
  (sorted keys, POSIX paths, sha256-stable across runs). ~200 ms on the
  current tree (109 files, 6 cross-block edges).
- `scripts/validate_code_graph_vs_contracts.mjs` — two detectors:
  `undeclared_code_dependency` (severity: error, a file imports from a
  block its block's `depends_on` doesn't list) and
  `provided_capability_not_exported` (severity: warning by default,
  `--strict-provides` escalates).
- Tree-sitter explicitly deferred: a 100 MB native binding for a
  monoglot JS codebase violates lightweight-by-default; pluggable backend
  reserved for when non-JS files actually appear in `files.md`.
- Already caught a real drift on landing:
  `b.agent-orchestrator/scripts/analyze_conversation_to_atlas.mjs`
  imports from `b.llm-gateway` and `b.operator-profile-learner` without
  declaring those deps; contract fixed (code wins per Kanon I).
- Two selftests (15 groups total), wired into nightly. The validator
  found the strict-match bug in `validate_dependency_contracts` and
  `mcp_atlas_server.runSync` — both fixed (capability = first
  identifier-shaped token; parenthetical annotation is operator commentary).

**b.desktop — installable program (R-7.99, layer: ext)**
- Sima Atlas as a downloadable `.dmg` / `.exe` / `.AppImage` instead of a
  terminal session. Block walked full lifecycle in one session: contract
  by Kanon spec → implementation → 13-group selftest → CI → `idea→done`
  through the gates.
- `extensions/desktop/main.mjs`: spawns `atlas_api_server.mjs` via
  Electron's `utilityProcess.fork` (bundled Node — no system-Node
  prerequisite, KPI-2); inline static server for `frontend/`; native menu
  with hotkeys for Verify All (⌘⇧V), Generate Bundle (⌘⇧G), V-1 dry-run
  (⌘⇧R), Token Economics; every menu action POSTs to `/atlas/checks/append`
  so desktop sessions land in the same audit-trail as CLI sessions.
  `electron-updater` lazy-imported, active only in `app.isPackaged`,
  5-minute startup grace before checking GitHub Releases.
- `extensions/desktop/preload.mjs`: `contextBridge.exposeInMainWorld`
  exposes only `window.sima.{openProjectPicker, revealInFinder, triggerV1,
  verifyAll, generateBundle, v1DryRun, tokenEconomics, checkForUpdates,
  listProjects, createProject, openProject, onOpenProjectPicker}`.
  `contextIsolation: true`, `nodeIntegration: false` — Electron post-12
  security baseline.
- `frontend/atlas_design/project_picker.jsx`: Project Picker modal —
  list of `~/SimaProjects/<name>/atlas/` entries plus the bundled atlas,
  create-new form with name whitelist `^[a-zA-Z0-9._-]{1,40}$`,
  one-click open swaps `ATLAS_ROOT` and reloads the renderer.
- `.github/workflows/desktop-build.yml`: builds `dmg`, `exe+portable`,
  `AppImage+deb` on `v*.*.*` tag push; attaches unsigned artefacts to the
  matching GitHub Release. Signing (Apple Developer ID + Windows
  code-signing cert) explicitly an operator task, not blocked on code.

**R-7.97 — multi-source chat ingestion (Cursor + Codex auto-watch)**
- `sima_watch_chats` now harvests three sources behind one interface:
  `claude` (`~/.claude/projects/*.jsonl`), `codex` (`~/.codex/sessions/*.jsonl`
  + history; handles 3 line shapes incl. older streaming `input_text`/
  `output_text` chunks auto-merged), `cursor` (`state.vscdb` via
  `sqlite3 -readonly`, covers both new composer chats and the legacy
  `ItemTable` schema; skipped gracefully if `sqlite3` CLI absent).
- New `--source claude,codex` CLI flag (CSV-friendly). MCP `sima_watch_chats`
  exposes the same.
- Latent UTF-8 cursor bug fixed: harvest now advances in byte-space, not
  UTF-16 code-units, so Cyrillic / emoji no longer caused duplicate
  harvests. Affects `claude.mjs` + `codex.mjs`.
- Two new selftests; nightly went 70 → 72/72 PASS just from this.

**First live V-1 overnight run (R-7.99, real Claude agent)**
- `node scripts/agent_loop_daemon.mjs --agent claude --max-iterations 4
  --max-cost-usd 5` produced 3 honest stalls and zero false promotions —
  exactly what the canon promises.
- Real engineering work preserved on disk: `atomicWriteFileSync`,
  `validateGraphSchema`, `saveBlockHistory` and migration runner added
  to `mcp_atlas_server.mjs` (b.db mission T1+T2+T3 closed in
  implementation); new validators `get_block_history.mjs`,
  `migrate_v1_v2.mjs`, `validate_code_graph_sync.mjs`;
  `validate_dependency_contracts` now writes findings into
  `atlas/sync_report.json` under `dependencyValidation`;
  b.core-sync tasks.md honestly inventoried (T1/T6 [x] with proof,
  T2 DEFERRED with rationale).
- The semantic judge rejected all three iterations with detailed reasons:
  b.db code lives in `b.agent-orchestrator`'s territory; b.smoke-sandbox
  smoke timed out; b.core-sync still has 5 of 5 dimensions failing — the
  judge reads the now-precise mission and finds more specific mismatches.
- This is the canon's «contract is arbiter» rule in action: tighter
  contract → finer-grained complaints; partial progress survives;
  next V-1 run continues from richer narratives.

**Nightly: 79/79 PASS** (was 70 at start of session, +9 new validators:
`code_graph_build`, `code_graph_drift`, `code_graph_extractor_selftest`,
`code_graph_validator_selftest`, `checks_append_endpoint_selftest`,
`desktop_structure_selftest`, `codex_source_selftest`,
`cursor_source_selftest`, `article_status_projection`).

### Verification

```bash
node scripts/nightly_consolidation.mjs                 # 79/79 PASS
node scripts/agent_loop_daemon.mjs --dry-run           # V-1 plans, runs nothing
node scripts/build_code_graph.mjs                      # ~200 ms, 109 files
node scripts/validate_code_graph_vs_contracts.mjs      # 0 errors, N warnings
node tests/desktop_structure.selftest.mjs              # 13 groups OK
node scripts/sima_watch_chats.mjs --once --source codex --json
npm run desktop:dev                                    # opens native window
```

### How to install the desktop app (operator step)

1. Bump version + commit: `npm version 0.4.0`.
2. Tag + push: `git tag v0.4.0 && git push origin v0.4.0`.
3. CI builds installers for macOS / Windows / Linux and attaches them to
   the release. (Unsigned — users click through Gatekeeper / SmartScreen
   once.) Signing in PR5 is gated on operator certificates.

---

## [0.3.0] — 2026-06-06 — *the loop actually closes*

> Roll-up of the arc that finished «closing the loop» (Phases I–IV +
> R-7.91 → R-7.96). v0.2.0 shipped the memory layer, lock-in, context
> economy and the at-a-glance status. v0.3.0 adds the two pieces that make
> the loop autonomous and honest: **the V-1 autonomous loop daemon** and
> **the semantic verifier (Contract as Arbiter)** — Sima now walks its own
> graph and judges whether the code matches the *meaning*, not just whether
> files exist.

### What landed

**Autonomy — V-1 autonomous loop daemon (Phase IV, R-7.91 → R-7.96)**
- `scripts/agent_loop_daemon.mjs` — Ralph-loop-shaped one-shot (cron-friendly,
  not a resident process): pick next runnable block → fresh agent →
  tri-state verifier → CI-stays-green guard → semantic gate → record to disk
  → repeat, with iteration / budget / circuit-breaker caps. Print-only by
  default (the first run shows what it *would* do; `--agent claude` arms it).
- **Auto-rollback** via owned-files snapshot: a run that regresses a
  previously-green `done` block is reverted, leaving the tree no worse.
- **Autonomous** + **Change-sets** + **Cleanup** canvas tabs; nightly cron
  recipe documented (R-7.93).
- V-1 **revisits semantic-red `done` blocks**: a block the semantic judge
  marked `fail` is picked back up and fed the previous run's `todo_to_pass`,
  so «the system walks every block and rewrites what's wrong» is real
  (R-7.95). Remediation skips the deps gate — a done block's deps were
  already satisfied at promotion (R-7.96).

**Contract as Arbiter — the semantic verifier (R-7.94 → R-7.95)**
- `scripts/semantic_verify.mjs` — an LLM-judge that reads the WHOLE contract
  (mission · user_story · kpi · acceptance · provides · depends_on) +
  methodology (architecture_decisions · tech_stack · rules · dont_use ·
  always_use) + the REAL code + neighbour contracts, and returns a tri-state
  verdict on five dimensions: *matches mission (meaning) · meets KPIs +
  acceptance · follows methodology · will work as described · connections
  consistent* — plus a `todo_to_pass` punch-list. Persisted to
  `blocks/<id>/semantic_review.json`, surfaced as a Semantic Review panel.
- **Honest degradation**: no API key / mock → `inconclusive`, never a false
  pass. With a live key it runs on a **non-thinking** model (gemini-2.5-flash);
  Gemini-Flash schema quirks worked around (flat 13-field schema, fence/prose
  stripping, budget bump).
- Wired into V-1 as a promotion gate: deterministic checks passing is no
  longer enough — a hard mission/methodology `fail` blocks promotion.

**user_story as a first-class TOP layer (R-7.95)**
- `blocks/<id>/user_story.md` now flows into the design + backend-fix
  context-packs, the implementation prompt, and the semantic bundle — so
  «what the user actually wants» sits above mission everywhere.

**Transactional change-sets (S-7) + global economics (S-9.1)**
- `scripts/change_set.mjs` — group cross-cutting edits; commit is refused
  unless every member block is green. Rollback writes to narrative for
  operator review (never silently reverts code).
- Global **Token Economics** tab with sparkline + cost-per-pass ROI.

**Import-graph dead-code (S-12)**
- Detects files unreachable from any entrypoint's import graph (vs orphan-code
  which only catches files unmentioned in contracts) — 0 false positives on a
  clean tree. Surfaced in the Cleanup tab; never auto-deletes (move-with-
  breadcrumb only).

**Production-Ready Starter (Phase III) + dogfood (Phases I–II)**
- S-1 block templates, S-10 profile-UI, S-11 subsystem roll-up.
- «Sima fixes Sima»: graph brought in sync with reality; nightly honestly
  green 72/72 (corrected from a stale 68/68 that was really 60/70; +2 from
  the R-7.97 source selftests).

**Multi-source chat ingestion (R-7.97, Gap #15)**
- `scripts/chat_sources/{claude,cursor,codex}.mjs` — three adapters behind
  one interface, picked up by `sima_watch_chats` via per-source key in the
  unified cursor file. Old single-source cursor auto-migrates.
- `cursor` adapter reads `state.vscdb` via `sqlite3 -readonly` (graceful
  skip if `sqlite3` CLI absent), parses both `cursorDiskKV` composer chats /
  bubble rows and the legacy `ItemTable` chat-data schema. Tracks
  seen-bubble-keys for dedup.
- `codex` adapter reads `~/.codex/sessions/*.jsonl`, handles 3 line shapes
  including the older streaming `input_text` / `output_text` chunks
  (auto-merged into clean turns).
- New `--source claude|cursor|codex` CLI flag (CSV-friendly), MCP
  `sima_watch_chats` exposes the same.
- Latent UTF-8 cursor bug fixed: harvest now advances in byte-space, not
  UTF-16 code-units, so Cyrillic / emoji content no longer causes duplicate
  harvests on the next tick.

### What's still on the roadmap (next, post-0.3.0)
- Run the semantic verifier across the remaining `done` blocks for a full
  red-state map.

### Verification
```bash
node scripts/nightly_consolidation.mjs                 # 70/70 PASS
node scripts/agent_loop_daemon.mjs --dry-run           # V-1 plans, runs nothing
node scripts/semantic_verify.mjs b.docs --json         # inconclusive without a key
node scripts/token_economics.mjs --days 30
```

### PRs merged in this release
- [#47](https://github.com/neskuchny/sima_atlas/pull/47) — Phase III «Production-Ready Starter»: S-1 templates + S-10 profile UI + S-11 roll-up
- [#48](https://github.com/neskuchny/sima_atlas/pull/48) — Phase IV (V-1 MVP): autonomous loop daemon, Ralph-loop shaped
- [#49](https://github.com/neskuchny/sima_atlas/pull/49) — S-7 transactional change-sets + S-9.1 global economics tab
- [#50](https://github.com/neskuchny/sima_atlas/pull/50) — V-1 auto-rollback + Autonomous/Change-sets/Cleanup tabs + S-12 import-graph dead-code
- [#51](https://github.com/neskuchny/sima_atlas/pull/51) — holistic semantic verifier (Contract as Arbiter)
- [#52](https://github.com/neskuchny/sima_atlas/pull/52) — user_story everywhere + V-1 re-enters semantic-red done blocks

---

## [0.2.0] — 2026-05-09 — *closing the loop*

> Roll-up of phases R-7.76 → R-7.87 + full doc-sync. Per-phase detail in
> the sections below. This is the umbrella entry for the v0.2.0 release.

After v0.1.1 the foundation was solid (canvas + 5-provider LLM cascade +
multi-tenant + acceptance loop) but the operator's day-to-day pain was
still there: AI agents kept forgetting decisions, breaking sibling
features silently, burning tokens on bloated prompts, and there was no
at-a-glance answer to «what's actually filled in this block». v0.2.0
closes those four loops.

### What landed

**Memory & lock-in (R-7.76 → R-7.85)**
- Per-block memory layer: `narrative.md` + `decisions.log` auto-injected
  into every agent prompt under «## ⚠ Block memory». Agent reads its own
  past notes before touching code.
- Operator-locked rules with `severity:hard|soft`. Hard rules **fail the
  run** when violated (post-run drift scanner — R-7.82, S-3).
- Project-level architecture decisions, append-only, auto-injected into
  EVERY prompt across ALL blocks. Agent physically cannot silently
  reverse a past architectural choice (R-7.85, S-6).
- Cross-block break detection: after every successful run on block X,
  walk reverse-deps and re-verify each. Broken dependents marked
  `status: desync` inline on the canvas (R-7.84, S-8).
- Auto-seed `operator_profile/*` + `architecture_decisions.md` at
  `dev_server.mjs` startup so new contributors hit zero manual setup
  (R-7.81).

**Context economy & visibility (R-7.86 → R-7.87)**
- Context-pack profiles: `design` ~5–15K (default) · `backend-fix` ~2–4K
  · `ui-fix` ~1.5–3K · `acceptance-only` ~0.5–1.5K. Architecture
  decisions always included regardless of profile (R-7.86, S-4).
- Implementation Status panel — 8-row dashboard in Overview (Mission ·
  KPIs · Acceptance · Tasks · Files · Decisions · Runs · Status) with
  ✓/~/✗/· markers for at-a-glance contract-vs-reality progress.
- Token economics aggregator with two cost dimensions: `cost_usd_actual`
  (what was charged) + `cost_usd_equivalent` (Anthropic Haiku 4.5 list
  price — stable shadow bill across providers). Surfaced as a Token
  Spend widget in every block's Overview tab (R-7.87, S-9).

**Self-audit refresh**
- Article Appendix A: was «9 ✅ / 11 🟡 / 0 ❌», now **«15 ✅ / 5 🟡 /
  0 ❌»**. Six 🟡 rows flipped to ✅ as their phases shipped (S-3 / S-4 /
  S-6 / S-8 / typed memory / cursor-hook drift-guard); six new ✅ rows
  added for capabilities that didn't exist when the audit was first
  written.

**Documentation**
- README + README.ru: «What we ran into building this — and how we
  solved it» section with 8 concrete pain → fix rows (PR #37).
- Full user-facing doc-sync across 13 files: CHANGELOG, architecture,
  getting-started, troubleshooting, integrations, article, plus the
  atlas reports (PR #38).

### What's still on the «Closing the loop» roadmap (next)
- **S-1** — block templates marketplace
- **S-7** — transactional change-sets for cross-cutting changes
- **S-9.1** — global Token Economics tab (sparklines, cost-per-pass ROI)
- **S-10** — UI surface for context-pack profile selection at run-start
- **S-11** — cross-block roll-up in Implementation Status

### Verification
```bash
node scripts/nightly_consolidation.mjs
node scripts/token_economics.mjs --days 30
for p in design backend-fix ui-fix acceptance-only; do
  node scripts/build_context_pack.mjs b.docs --profile $p
done
```

### PRs merged in this release
- [#30](https://github.com/neskuchny/sima_atlas/pull/30) — per-block memory layer reaches agent prompt
- [#31](https://github.com/neskuchny/sima_atlas/pull/31) — auto-seed at startup + S-3 runtime drift scanner
- [#32](https://github.com/neskuchny/sima_atlas/pull/32) — teach memory layer to agents (skills update)
- [#33](https://github.com/neskuchny/sima_atlas/pull/33) — cross-block break detection on edit (S-8)
- [#34](https://github.com/neskuchny/sima_atlas/pull/34) — append-only architecture_decisions.md (S-6)
- [#35](https://github.com/neskuchny/sima_atlas/pull/35) — context-pack profiles + Implementation Status panel (S-4)
- [#36](https://github.com/neskuchny/sima_atlas/pull/36) — token economics aggregator + Token Spend widget (S-9)
- [#37](https://github.com/neskuchny/sima_atlas/pull/37) — README answers «why we built this, problems faced, what's implemented, for whom»
- [#38](https://github.com/neskuchny/sima_atlas/pull/38) — full user-facing documentation sync for R-7.76 → R-7.87

---

## [0.1.0-r87] — 2026-05-09 — *Phase R-7.87 (S-9): token economics aggregator + Token Spend widget*

PR [#36](https://github.com/neskuchny/sima_atlas/pull/36). Operator: «я гоняю агентов часами и не вижу куда уходят токены».

### Added
- `scripts/token_economics.mjs` — pure read aggregator over `atlas/llm_traces/*.json`. Exports `aggregateTokenEconomics({days, blockFilter, root})` + CLI. Two cost dimensions:
  - `cost_usd_actual` — what was actually charged (0 for `claude_cli`/`ollama`/`mock`)
  - `cost_usd_equivalent` — Anthropic Haiku 4.5 list price ($1/Mtok in, $5/Mtok out). Stable across providers — the «shadow bill» that's visible even on subscription.
- Per-block attribution via `run_state` time-window match — best-effort; widget falls back to project-wide when block has no runs yet.
- `GET /atlas/token-economics?days=&block=` API endpoint (`scripts/atlas_api_server.mjs`).
- `token_economics` MCP tool (`scripts/mcp_atlas_server.mjs`).
- `meta.tokenEconomics({days, block})` API client method (`frontend/atlas_design/data_loader.js`).
- `TokenSpendWidget` in Overview tab (`frontend/atlas_design/panels.jsx`) — totals + top-3 ops + by_provider mini-table, with day-window selector (7/30/90).
- `.token-spend-grid` / `-tot` / `-list` / `-row` styles (`frontend/atlas_design/styles.css`).

### Real numbers (from this repo's traces, 30-day window)
- 12006 traces · 5.54M input · 172.8K output tokens
- Actual: $0.0000 (running on `claude_cli` + `mock`)
- Equivalent: $6.4005 (what it would cost on Anthropic Haiku 4.5)
- Top ops: `judge_assertion` $2.62 / `extract_block_schema` $1.77 / `generate_user_docs` $0.99

---

## [0.1.0-r86] — 2026-05-09 — *Phase R-7.86 (S-4): context-pack profiles + Implementation Status panel*

PR [#35](https://github.com/neskuchny/sima_atlas/pull/35).

### Added — context-pack profiles (S-4)
`scripts/build_context_pack.mjs` rewritten with `--profile` selector:

| profile | tokens (b.docs) | what's in |
|---|---|---|
| `design` *(default)* | ~5–15K | full pack — for new-block scoping & major refactors |
| `backend-fix` | ~2–4K | mission+acceptance+decisions+narrative+deps' provides only (no patterns, no kpi) |
| `ui-fix` | ~1.5–3K | frontend-focused — deps skipped entirely |
| `acceptance-only` | ~0.5–1.5K | verifier or "is this ready to ship" runs |

`architecture_decisions.md` is **always** included regardless of profile (S-6 project lock-in must reach every prompt). Verified on `b.docs`: 5809 → 3701 → 2763 → 1846 tokens.

- `scripts/mcp_atlas_server.mjs` — `build_context_pack` MCP tool now accepts `profile`.
- `scripts/run_block_implementation.mjs` — `--profile` flag / `ATLAS_PACK_PROFILE` env var.
- `docs/agent-navigation.md` — full profile table with token budgets.

### Added — Implementation Status dashboard
Operator: «можно ли в модуле/блоке увидеть что реализовал?». Yes — Overview tab now opens with an 8-row status panel: Mission · KPIs · Acceptance · Tasks · Files alive · Decisions logged · Run history · Block status. Each row carries a ✓ / ~ / ✗ / · marker.

- `frontend/atlas_design/panels.jsx` — Overview now also loads `narrative.md` + `decisions.log` + `tasks.md`, then renders `impl-status-grid`.
- `frontend/atlas_design/styles.css` — `.impl-status-grid` / `-row` / `-mark` / `-label` / `-value` / `.impl-state-empty`.
- `scripts/atlas_api_server.mjs` — `narrative.md` added to `BLOCK_FILE_WHITELIST` (Memory tab loaded it via the same endpoint, but the whitelist hadn't caught up).

---

## [0.1.0-r85] — 2026-05-09 — *Phase R-7.85 (S-6): append-only architecture_decisions.md*

PR [#34](https://github.com/neskuchny/sima_atlas/pull/34). Operator: «решения которые я принял про архитектуру должны попадать в каждый prompt по любому блоку — иначе агент через сессию забудет что мы используем LLM а не математику».

### Added
- `scripts/architecture_decisions_api.mjs` — append-only API. `ensureArchitectureDecisionsFile`, `addArchitectureDecision({decision, rationale, affects, reversible, ts, clientId})`, `listArchitectureDecisions`. Atomic tmp+rename writes; **NO edit/delete API by design** — surface change requests through `narrative.md` instead.
- `atlas/architecture_decisions.md` (multi-tenant: also `atlas/clients/<id>/architecture_decisions.md`) auto-injected into every agent prompt under «## ⚖ Architecture decisions (project-level, append-only — DO NOT silently reverse)» section.
- `scripts/mcp_atlas_server.mjs` — `add_architecture_decision` + `list_architecture_decisions` MCP tools.
- `scripts/atlas_api_server.mjs` — `architecture_decisions.md` in `META_WHITELIST` + `POST /atlas/architecture-decisions/add` endpoint.
- `scripts/dev_server.mjs` auto-ensures the file at startup.
- `scripts/build_context_pack.mjs` includes the file in every profile.

---

## [0.1.0-r84] — 2026-05-09 — *Phase R-7.84 (S-8): cross-block break detection on edit*

PR [#33](https://github.com/neskuchny/sima_atlas/pull/33). Operator: «когда правишь блок А, через 8 часов ночью система говорит "кстати, блок B сломан". Слишком поздно».

### Added
- `scripts/cascade_verify.mjs` — walks `graph.json` reverse-deps, runs `verify_block_acceptance` on each dependent block. On fail: marks `status: desync` in `graph.json` with `status_reason: "cascade: parent X edit"`, appends entry to dependent's `checks.log` + structured `narrative.md` entry («### What failed and why» / «### Recommended action»).
- Auto-discovers atlas root (main + multi-tenant `atlas/clients/<id>/`).
- `--dry-run` for preview without patching; `--client` for per-tenant runs.
- `scripts/run_block_implementation.mjs` calls `cascade_verify` automatically after every successful run.
- `scripts/mcp_atlas_server.mjs` — `cascade_verify` MCP tool.

---

## [0.1.0-r83] — 2026-05-09 — *Phase R-7.83: skill files updated for memory layer*

PR [#32](https://github.com/neskuchny/sima_atlas/pull/32). Operator: «ты добавил memory но не поменял скилы — агенты не знают что её надо использовать».

### Changed
- `docs/agent-navigation.md` — extended standard read order from 8 → 14 steps (now includes `narrative.md`, `decisions.log`, `dont_use.json`, `always_use.json`). New section «Memory layer — read & write rules».
- `.claude/skills/sima-atlas-navigator/SKILL.md` — Anthropic Skills format adapter, mirrored.
- `.cursor/rules/sima-atlas-navigator.mdc` — Cursor Rules adapter, mirrored.
- `AGENTS.md` — generic adapter, mirrored.

---

## [0.1.0-r82] — 2026-05-09 — *Phase R-7.82 (S-3): runtime content drift scanner*

PR [#31](https://github.com/neskuchny/sima_atlas/pull/31).

### Added
- `scripts/scan_run_for_drift.mjs` — reads `dont_use.json` + `always_use.json` filtered by `block_id`, scans files modified after run start. Hard violations (`severity:hard`) exit 1 (run failed); soft violations log to `checks.log` + `narrative.md`.
- `scripts/run_block_implementation.mjs` invokes the scanner post-run; hard drift overrides verifier verdict → run marked Failed.

---

## [0.1.0-r81] — 2026-05-09 — *Phase R-7.81: auto-seed at startup*

Operator: «А мне это всегда надо будет запускать и новым пользователям тоже?». Fixed.

### Changed
- `scripts/dev_server.mjs` auto-seeds `operator_profile/{lessons,dont_use,always_use}.json` and ensures `architecture_decisions.md` at startup. Idempotent — only logs when newly created.
- `scripts/seed_operator_profile.mjs` (created earlier in R-7.78) is now a no-op for existing installs.

---

## [0.1.0-r76 → r80] — 2026-05-09 — *Phases R-7.76 → R-7.80: per-block memory layer end-to-end*

PR [#30](https://github.com/neskuchny/sima_atlas/pull/30). Operator: «я говорю агенту что-то один раз. Через сессию забывает.».

### Added
- `atlas/blocks/<id>/narrative.md` — append-only human-readable run history. Sections per run: «### What I tried», «### What worked», «### What failed and why», «### Decisions made».
- `atlas/blocks/<id>/decisions.log` — structured TSV (timestamp · author · decision).
- `atlas/operator_profile/{lessons,dont_use,always_use}.json` — operator-locked memory. `dont_use` / `always_use` accept `severity:hard|soft` per entry.
- `scripts/run_block_implementation.mjs` injects all of the above into the agent prompt under «## ⚠ Block memory» (NEVER do / ALWAYS do / Past decisions / Lessons / Run history / Code summary / Recent run log) + «How to update memory» instructions.
- `scripts/build_context_pack.mjs` includes the memory in every context-pack.
- `scripts/atlas_blocks_api.mjs` — `createBlock` seeds `narrative.md` + `decisions.log` templates.
- `frontend/atlas_design/panels.jsx` — Memory tab renders `narrative.md` as primary (markdown), `code_summary.md` + `checks.log` tail as secondary.

---

## [0.1.0] — 2026-05-08

First public-release tag. The whole `claude/visual-component-system-N2W07`
branch (R-7.30 → R-7.61, 32 phases) shipped together — everything from
the launch-readiness audit BLOCKERs + TIER-1 + selected TIER-2 items.

### Added — UI / canvas (R-7.30 → R-7.49)
- Anchor-point edge creation (no Shift modifier needed)
- Drill-down via double-click; auto-creates empty subsystem if none
- Real submodule hierarchy via `parent_block_id` field; B/L/F/T layer
  picker creates children with the right layer; `↑ parent: <id>` pill
  in DetailPanel
- Layer picker pills in Overview (`Backend / Logic / Frontend / Tests`)
  with one-click `patchBlock({layer})`; canvas color updates instantly
- Depth-controlled canvas: `1 / 2 / ∞` toggle filters how many levels
  of children render
- Architecture review modal rewritten with structured concern cards
  (severity left-border, what's-wrong / how-to-fix / affects-blocks
  sections)
- Agent monograms in Runs cards (C/C/⌘) replacing colored dots
- ✨ Develop button next to ✏ Rewrite for richer LLM expansion
- External agent runs surfaced in Runs tab (parsed from checks.log)

### Added — LLM cascade (R-7.39 / R-7.42 / R-7.60)
- Context-aware fillField / rewriteField — LLM sees project + neighbors
  + parent
- expandField mode (richer "develop" of existing draft)
- **Ollama provider** for local models (`LLM_PREFER_OLLAMA=1`,
  `LLM_OLLAMA_MODEL=qwen2.5-coder:7b`); cascade is now 5-provider:
  ollama → claude_cli → anthropic → google → mock

### Added — opensource readiness (R-7.50 → R-7.51)
- README cut from 209 → 124 lines; methodology in `docs/article.en.md`;
  Russian variant at `README.ru.md`
- `docs/getting-started.md` (English); `docs/getting-started.ru.md`
  preserves Russian original
- `docs/architecture.md` (265 lines) — system diagram + HTTP API table
  + MCP tool surface + run FSM + lifecycle FSM + multi-tenant model
- `docs/troubleshooting.md` — real R-7.X failure modes
- Hero image captured (`scripts/capture_hero_screenshot.mjs` —
  `npm run hero:capture`)
- `package.json` flipped `private: false`, added description / license /
  homepage / repository / bugs / keywords for npm metadata
- Replaced `python3 http.server` dep with pure-Node static server
- Agent CLI auto-detect at startup with one-line install hints
- macOS added to CI matrix (was Linux-only)
- Removed `Sima (Remix)/` → `frontend/`; `ТЗ/` → `archive/ru-specs/`;
  legacy backup directories deleted

### Added — agent navigation skill (R-7.53)
- `docs/agent-navigation.md` — canonical strategy: standard read order,
  MCP tool selection, skip-list, write protocol, stop-signals, common
  task templates
- `.claude/skills/sima-atlas-navigator/SKILL.md` — Anthropic Skills
  format (auto-activates in Claude Code)
- `.cursor/rules/sima-atlas-navigator.mdc` — Cursor Rules
  (`alwaysApply: true`)
- `AGENTS.md` + `CLAUDE.md` rewritten as thin pointers to canonical

### Added — i18n (R-7.52 → R-7.59)
- `frontend/atlas_design/i18n.js` — hand-rolled minimal i18n
  (no deps, no build step), `window.__SIMA_T(key, fallback)`
- 588 EN / 588 RU keys, fully balanced
- Default locale = English; toggle via 🌐 EN/RU pill in toolbar
  (persists to localStorage)
- Coverage: top toolbar, all DetailPanel tabs, all 9 modals,
  ContextRail, status filters, drill messages, demo activity log,
  onboarding 5-step K1 tour
- example client (Habit Tracker) translated EN-first; Russian
  originals preserved at `*.ru.md`

### Added — VS Code extension (R-7.61)
- 0.1 scaffold at `extensions/vscode/` — Activity Bar item, embedded
  canvas webview, blocks tree view (reads `atlas/clients/<client>/
  graph.json`, expands submodules via `parent_block_id`), commands
  (Open Canvas / Start Dev Server / Refresh Blocks / Open Block
  Contract), settings (apiUrl / uiUrl / client / atlasRoot)

### Fixed
- Layer-picker bug — `LAYER_MAP` in `build_sima_design_payload.mjs`
  lacked identity mappings (R-7.40+ atlas-native layer names);
  `LayerPicker` save → reload → fallback to `logic`. Added
  identity entries (R-7.56)
- Rules-of-hooks crash on locale toggle — `__SIMA_USE_LOCALE` had
  conditional early-return (`if (!React) return ...`) which violated
  hook count constancy. Removed wrapper; App() subscribes directly
  via raw `useState` + `useEffect` on `sima-locale-change` event
  (R-7.55)
- `index.html` `lang="ru"` → `lang="en"`; title also translated

### Migration
- `scripts/migrate_subsystems_to_blocks.mjs` — moves legacy
  `atlas/{,clients/<id>/}subsystems/<parent>.json` entries into
  real blocks with `parent_block_id`. Idempotent. Dry-run via
  `--dry-run`.

### Honest gaps (vs. Article Appendix A)

For full transparency, **what's NOT done from the article's claims**
(originally audited 2026-05-08, refreshed 2026-05-09 after R-7.76 → R-7.87):

- 🟡 **12-file block contract** — only 5 enforced (`mission/kpi/
  acceptance/tasks/checks.log`); the other 7 are template-seeded but
  not validated. R-7.76+ added `narrative.md` and `decisions.log`
  as auto-seeded files but they are still not gated.
- ✅ **Drift auto-mark on canvas** — `cascade_verify` walks
  reverse-deps after every successful run and marks broken
  dependents `status: desync` inline (R-7.84, S-8 — **shipped**).
- ✅ **Operator typed memory as top-level files** — `lessons.json` /
  `dont_use.json` / `always_use.json` now live in
  `atlas/operator_profile/`, auto-seeded at startup
  (R-7.76 → R-7.81 — **shipped**).
- ✅ **Compact context-pack** — profiles now provide budget control:
  ~5–15K (design) / ~2–4K (backend-fix) / ~1.5–3K (ui-fix) /
  ~0.5–1.5K (acceptance-only) (R-7.86, S-4 — **shipped**).
- 🟡 **Multi-tenant full isolation** — graphs/proposals/memory are
  per-tenant; nightly + some validators are still global. **T-1** in
  roadmap.
- 🟡 **Hard lifecycle gates** — soft-enforced (R-5): nightly
  validator reports violations, doesn't block. Hard-blocking is
  **S-2** but is now formally cancelled (Appendix B.2 — would
  break draft-stage iteration).
- ✅ **Cursor hook runtime drift-guard** — `scan_run_for_drift.mjs`
  scans modified files post-run against `dont_use` rules; hard
  violations fail the run (R-7.82, S-3 — **shipped**, post-hoc
  rather than pre-execution but the same outcome).
- 🟡 **`verify_all` ≈150 seconds** — observed, not guaranteed.

From the v1.x → v2 vision in README:
- ⬜ **Bidirectional Sima ↔ Agent sync** — chat watcher (R-3) gives
  one-way feedback; full sync where agent's reasoning auto-updates
  the canvas in-place is roadmap.
- ⬜ **Autonomous coding loop (V-1)** — agent picks `todo` blocks
  overnight and works through them. Long-term (2027+).
- ✅ **Live drift detection on canvas** — covered by R-7.82 (S-3) +
  R-7.84 (S-8) — **both shipped**.
- ✅ **Token economics dashboard** — `token_economics` MCP tool +
  `/atlas/token-economics` API + Token Spend widget in Overview tab
  (R-7.87, S-9 — **shipped first cut**; global tab planned as S-9.1).
- ⬜ **Cross-project memory transfer** — `lessons.json` exists
  per-project; transfer between projects → **W-1**.
- ⬜ **Production-monitor → new acceptance assertions** — **V-3**.

Total after R-7.87: **15 ✅ fully**, **5 🟡 partial-with-caveats**,
**0 ❌ abandoned-but-claimed-as-done**. The full audit lives at
[`docs/article.en.md` Appendix A](docs/article.en.md).

---

## [Unreleased]

### Added (opensource-prep, 2026-05-06 → 2026-05-07)
- `README.md` — bilingual (EN + RU) opensource-readme с hero-screenshot, quickstart, what's-in-the-box, state-of-project, contribution invitations, license.
- `LICENSE` — MIT, copyright Anton Kalabukhov & Synlabs.
- `docs/integrations.md` — гайды подключения для Claude Code / Cursor / Codex CLI / Continue / Zed / Windsurf / Antigravity / Aider, плюс CLI fallback и HTTP API.
- `.mcp.json` в корне репо — Claude Code автоматически подхватывает Sima MCP-сервер при открытии сессии.
- `CONTRIBUTING.md` — entry-point для контрибьюторов: dev-setup, структура репо, workflow, code style, commit conventions.
- `SECURITY.md` — приватный канал репортов (GitHub Security Advisory) + threat model.
- `CODE_OF_CONDUCT.md` — adopt-by-reference на Contributor Covenant 2.1.
- `.github/ISSUE_TEMPLATE/{bug_report,feature_request,question,config}.yml` — issue forms в YAML-формате с labels.
- `.github/pull_request_template.md` — структурированный PR-шаблон.

### Changed
- `ТЗ/статья.md` v4 — расширена до ~4000 слов: новая Часть 1.3 (research grounding: Lost-in-the-Middle / Hallucination is Inevitable), Часть 2.5 «Почему именно эти принципы», Часть 6 «Три эффекта» (cost / hallucinations / autonomy), Часть 7 (локальные модели + Sima Shell + Sima Core position), Приложения А (self-audit) + Б (design boundaries).

---

## [0.1.0-r5] — 2026-05-06 — *Phase R-5: soft lifecycle gates + UI crash safety*

`9941410` Phase R-5 — фикс UI-крэша на пустом клиенте + soft lifecycle gates + статья v3.

### Added
- `scripts/validate_lifecycle_gates.mjs` — soft-валидатор четырёх гейтов жизненного цикла блока: `idea → todo`, `todo → progress`, `progress → review`, `review → done`. В nightly. Сейчас репортит, не блокирует — это канон (см. Приложение B.2 статьи).
- `tests/validate_lifecycle_gates.selftest.mjs` — 4 сценария (idea-warns / todo-broken-fails / progress-healthy-passes / done-no-evidence-fails).
- `_meta.size_bytes` + `_meta.estimated_tokens` в каждом context-pack (`scripts/build_context_pack.mjs`). Warning при > 8K токенов.
- DetailPanel показывает явную строку: «чтобы продвинуть статус — заполни: mission · kpi (3/5)» — soft-gate с visible подсказкой.

### Fixed
- `build_sima_design_payload.mjs` больше не валит API в 500 при отсутствии или коррупции `graph.json` клиента. Возвращает пустой payload вместо exception. Закрывает «белый экран» из live-репорта оператора.
- Payload всегда содержит `submodules: {}` (поле было пропущено, что роняло `graph.jsx:303` и `panels.jsx:89` на любом клиенте после создания первого блока).
- `data_loader.js` empty-client fallback тоже включает `submodules: {}`.
- `graph.jsx` и `panels.jsx` переведены на defensive accessors (`data.submodules?.[id] || []`).

### Changed
- `nightly_consolidation.mjs` — добавлены 2 проверки (`validate_lifecycle_gates`, `chat_fill_accept_selftest`). Total: 68 entries.

---

## [0.1.0-r4] — 2026-05-06 — *Phase R-4: multi-tenant fixes + chat_fill accept + Windows claude_cli*

`c912c9e` Phase R-4 — fix multi-tenant proposals + chat_fill accept + Windows claude_cli + create-module crash.

### Fixed
- **Multi-tenant proposals routing.** «160 одинаковых proposals в новом проекте» — root-pile протекал во все клиентские tabs. Теперь:
  - `list_proposals.mjs` / `accept_proposal.mjs` / `reject_proposal.mjs` поддерживают `--client <id>`.
  - HTTP-роуты `/atlas/proposals/list`, `/proposals/accept`, `/proposals/reject` пробрасывают `?client=X` / `body._client`.
  - `data_loader.js` `proposalsList` шлёт `?client`, accept/reject — через `withClient(...)`, accept авто-обновляет canvas.
- **chat_fill plans видимы и принимаются.** Раньше план `sima_fill_from_chat` тихо отбрасывался в `list_proposals` (нет `verdict: 'pending'`). Теперь:
  - `sima_fill_from_chat.mjs` пишет план с `verdict: 'pending'` + `kind: 'chat_fill'`.
  - `accept_proposal.mjs` распознаёт `kind: 'chat_fill'` и итерирует `new_block_proposals` → создаёт каждый блок с контракт-файлами.
- **Windows `claude_cli` detection.** `execFileSync('claude', ...)` не делает PATHEXT-резолюцию; Pro/Max-подписка пользователя на Windows была невидима. Теперь пробует `claude.cmd` и кэширует binary.
- **«Создать новый модуль» blank-screen.** `onAddModule` (index.html) и `Composer.accept` (views.jsx) обёрнуты в try/catch + нормализуют `presetArg` (раньше SyntheticEvent от toolbar воспринимался как `{x, y}` экранных координат).

### Added
- `tests/chat_fill_accept.selftest.mjs` — изолированный клиент, план с 2 новыми блоками, accept проверяет создание + контракт-файлы + verdict-flip + refused re-accept.

---

## [0.1.0-r3] — 2026-05-06 — *Phase R-3: chat-session watcher*

`7d98d98` Phase R-3 — chat-session watcher.

### Added
- `scripts/sima_watch_chats.mjs` — daemon/oneshot-сканер `~/.claude/projects/*/`-jsonl-файлов. Tracks per-file byte-cursor в `atlas/run_state/chat_watch_cursor.json`; на rotation/truncation сбрасывает.
  - Mode `propose` (default) — dryRun плана через `sima_fill_from_chat` (не патчит блоки).
  - Mode `auto` — патчит сразу.
  - Триггеры: `--once` для cron / agent / one-shot, `--daemon --interval-sec=N` для long-running sweeps.
- Status surface: `atlas/run_state/chat_watch_status.json` с last-run-данными для UI.
- MCP-инструмент `sima_watch_chats` — агент может вызывать «Sima, проверь свежие чаты».
- HTTP-роуты `POST /atlas/sima/watch-chats` (триггер) + `GET /atlas/sima/watch-chats/status` (для UI polling).
- Шумофильтр (Sima own LLM-prompts, Stop-hook feedback, pure-JSON tool blobs, assistant tool_use frames) — иначе ватчер тратит токены на feed-обратно собственных промптов.
- `tests/sima_watch_chats.selftest.mjs` — synthetic project dir с mixed real/noise turns. В nightly.

### Security / privacy
- `atlas/run_state/chat_watch_cursor.json` и `chat_watch_status.json` gitignored (содержат session UUID и home path; не для публичного репо).

---

## [0.1.0-r2] — 2026-05-05 — *Phase R-2: sima_fill_from_chat orchestrator*

Часть commit'а `1525439` (R-1 + R-2 в одном).

### Added
- `scripts/sima_fill_from_chat.mjs` — orchestrator «возьми переписку, заполни схему»: `extractInsights` → `fillField` per-блок-per-field → `synthesizeBlock` для новых → persist plan в `atlas/proposals/<ts>__chat_fill.json`.
- MCP-инструмент `sima_fill_from_chat` (transcript через stdin pipe).
- HTTP-роут `POST /atlas/sima/fill-from-chat`.
- UI-кнопка «✦ Sima — заполни всё по этой переписке» в композере.
- `ATLAS_FORCE_MOCK_LLM=1` flag для CI-детерминизма.

---

## [0.1.0-r1] — 2026-05-05 — *Phase R-1: claude_cli provider*

Часть commit'а `1525439`.

### Added
- `claude_cli` LLM-провайдер в `scripts/llm_gateway.mjs` — детектится через `claude --version`, использует подписку Claude.ai Pro/Max. **Без отдельного API-ключа.**
- Cascade: `['anthropic', 'google', 'claude_cli', 'mock']`.
- `callClaudeCli({system, prompt, schema, ...})` — shells `claude --print --output-format json`, defensive JSON parsing (raw → fenced → first balanced object).

---

## Phase Q — Q1+Q2+Q3+Q4 — *2026-05-04*

`f9d3308` — закрытие архитектурных gap'ов после re-чтения принципов.

### Added
- Drift detection improvements
- Parity matrix validation
- Cleanup block memory selftest

---

## Phase P-3 — *2026-05-03* — Per-block Playwright screenshots

`8e806da` — Playwright e2e-тесты по каждому блоку, скриншоты в `tests/playwright/screenshots/`.

---

## Phase P-2.1 + P-2.2 — *2026-04-30*

`22244ab` — demo-client + product-review pill.

---

## Phase P-1.1 + P-1.2 + P-1.5 — *2026-04-28*

`685b59a` — counters on cards + history snapshots + tech_stack chips.

---

## Phase J/L — *2026-04-25*

`11ee9d1` — multi-tenant artifacts + project picker + persistent activity log.

---

## Phase B–I — *2026-04-15 → 2026-04-22*

Foundation: design UI ↔ agent runs + acceptance + run-log + diff + AI assist + subsystem editor + schema templates + meeting/document intake + per-run enrichment.

---

*Полная git-история — `git log --oneline --reverse`.*

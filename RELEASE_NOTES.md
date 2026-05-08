# Sima Atlas v0.1.0

> First public-release tag.
> Visual contract-first development for AI coding agents — the graph of contracts between you and Claude Code / Cursor / Codex / your favorite agent.

![Canvas overview](tests/playwright/screenshots/sima_design_live.png)

---

## What this release includes

The whole `claude/visual-component-system-N2W07` arc — **33 development phases (R-7.30 → R-7.62)** shipped as one coherent v0.1.0 cut. Below grouped by area; the [CHANGELOG](CHANGELOG.md) has the per-phase detail.

### 🎨 UI / canvas

- **Anchor-point edge creation** — drag from the dots on a node's edge to another node, no `Shift` modifier
- **Drill-down via double-click** — auto-creates an empty subsystem if none yet
- **Real submodule hierarchy** via `parent_block_id` field; `↑ parent: <id>` pill in DetailPanel; B/L/F/T quick-buttons create children with the right layer
- **Layer picker pills** in the Overview tab (`Backend / Logic / Frontend / Tests`); canvas color updates instantly
- **Depth control** — `1 / 2 / ∞` toggle filters how many levels of children render on canvas
- **Architecture review modal** rewritten with structured concern cards (severity left-border, what's-wrong / how-to-fix / affects-blocks sections)
- **Agent monograms** in Runs cards (`C / C / ⌘ / S`) replacing colored dots
- **`✨ Develop` button** next to `✏ Rewrite` for richer LLM-driven contract expansion
- **External agent runs** surfaced in Runs tab (parsed from `checks.log`)

### 🤖 LLM cascade

Now **5 providers** with deterministic fallback order:

```
ollama → claude_cli → anthropic → google → mock
```

- **Context-aware** `fillField` / `rewriteField` — LLM sees project + neighbors + parent block contracts
- **`expandField` mode** — richer "develop" of an existing draft (vs. conservative `rewriteField`)
- **🆕 Ollama provider** for **local models** — `LLM_PREFER_OLLAMA=1`, `LLM_OLLAMA_MODEL=qwen2.5-coder:7b`. Run Sima entirely offline against Llama / Qwen / DeepSeek / Mistral. No API key needed.

### 📦 Opensource readiness

- README cut from 209 → 124 lines; methodology moved to [`docs/article.en.md`](docs/article.en.md); Russian variant at [`README.ru.md`](README.ru.md)
- New onboarding doc: [`docs/getting-started.md`](docs/getting-started.md) (English) + [`docs/getting-started.ru.md`](docs/getting-started.ru.md)
- New architecture doc: [`docs/architecture.md`](docs/architecture.md) — system diagram, HTTP API table, MCP tool surface, run FSM, lifecycle FSM, multi-tenant model
- New troubleshooting doc: [`docs/troubleshooting.md`](docs/troubleshooting.md) — real failure modes from R-7.X debugging
- Hero image regenerated via `npm run hero:capture` (Playwright-driven)
- `package.json`: `private: false`, full npm metadata
- Replaced `python3 http.server` dep with **pure-Node static server** — no Python prereq for `npm run dev`
- Agent CLI auto-detect at startup with one-line install hints
- **macOS added to CI matrix** (was Linux-only) — now runs on `ubuntu-latest`, `macos-latest`, `windows-latest`
- `Sima (Remix)/` → `frontend/`; legacy backups removed; clean top-level

### 🧭 Agent navigation skill

New canonical strategy doc + adapters that auto-load per agent — saves thousands of tokens per session by directing agents to a deterministic minimum-context read order instead of `cat`-ing through the whole `atlas/` tree.

| Agent | File auto-loaded |
|---|---|
| Claude Code | `.claude/skills/sima-atlas-navigator/SKILL.md` |
| Cursor | `.cursor/rules/sima-atlas-navigator.mdc` |
| Codex / Aider / others | `AGENTS.md` + [`docs/agent-navigation.md`](docs/agent-navigation.md) |

### 🌍 i18n — EN-first UI with RU toggle

- Hand-rolled minimal i18n — **no deps, no build step** — at [`frontend/atlas_design/i18n.js`](frontend/atlas_design/i18n.js)
- **588 EN / 588 RU keys**, fully balanced
- **Default = English**; toggle to Russian via `🌐 EN/RU` pill in the toolbar (persists to `localStorage`)
- **Coverage:** top toolbar, all DetailPanel tabs, all 9 modals (`SyncReport / ArchReview / Composer / Gallery / Library / SystemDocs / Templates / Subagents / Proposals`), `ContextRail`, status filters, drill messages, demo activity log, onboarding 5-step `K1` tour
- Example client (Habit Tracker) translated EN-first; Russian originals preserved at `*.ru.md`

### 🆕 VS Code extension

[`extensions/vscode/`](extensions/vscode/) — 0.1 scaffold. Activity Bar item with graph icon, embedded canvas webview, blocks tree view (reads `atlas/clients/<client>/graph.json`, expands submodules via `parent_block_id`, layer-aware icons), commands (Open Canvas / Start Dev Server / Refresh / Open Block Contract), settings.

```bash
cd extensions/vscode
npx @vscode/vsce package
code --install-extension sima-atlas-0.1.0.vsix
```

### 🐛 Fixed

- **Layer picker bug** — `LAYER_MAP` in `build_sima_design_payload.mjs` lacked identity mappings for atlas-native layer names (R-7.40+). LayerPicker save → reload → fallback to `logic`. Identity entries added (R-7.56).
- **Rules-of-hooks crash on locale toggle** — `__SIMA_USE_LOCALE` had a conditional early-return violating hook-count constancy. Replaced with direct `useState`+`useEffect` subscription on `App()` root (R-7.55).
- `index.html` `lang="ru"` → `lang="en"`; title also translated.

### 🔄 Migration

[`scripts/migrate_subsystems_to_blocks.mjs`](scripts/migrate_subsystems_to_blocks.mjs) — moves legacy `atlas/{,clients/<id>/}subsystems/<parent>.json` entries into real blocks with `parent_block_id`. Idempotent. Dry-run via `--dry-run`.

---

## Highlights

| Surface | What you can do today |
|---|---|
| 🎨 **Visual canvas** | Browse / edit / drill into block graphs; layer-coded; live polling |
| 📋 **Per-block contracts** | `mission.md` / `kpi.md` / `acceptance.md` / `depends_on.md` / `provides.md` / `tasks.md` / `files.md` / `code_summary.md` / `checks.log` |
| 🔌 **64 MCP tools** | `read_block` / `update_block` / `verify_block_acceptance` / `sima_fill_from_chat` / `accept_proposal` / `generate_full_bundle` / `nightly_consolidation` / `build_context_pack` / ... |
| 🤖 **Agent runs** | Spawn `claude` / `cursor-agent` / `codex` from any block; live FSM; auto-acceptance; ↻ Fix and rerun |
| ✓ **Acceptance loop** | 5 deterministic evidence collectors (`exit_code` / `fs_glob` / `file_diff` / `log_grep` / `selftest_run`) + `llm_judge` last resort; tri-state `pass / fail / inconclusive` — never silent false-pass |
| 🏛 **Architecture review** | Whole-graph LLM analysis: stack consistency, scale, multi-tenant fit, data flow, redundancy |
| 🔄 **Sync-check** | 9 drift validators; structured ok/drift/broken report |
| 📚 **Auto-generated docs** | WIKI / TZ / Roadmap / per-block user tutorials |
| 🏢 **Multi-tenant** | Many products in `atlas/clients/<id>/`, hybrid isolation |

---

## Quickstart (60 seconds)

```bash
git clone https://github.com/neskuchny/sima_atlas
cd sima_atlas
npm install
npm run dev
# → API on :8787 · UI on http://localhost:8000 · opens demo client
```

The browser opens at `?client=example` — a populated 5-block habit-tracker so you see the canvas alive.

To plug Sima into your AI tool (Claude Code, Cursor, Codex, Continue, Zed, Windsurf, Antigravity), see [`docs/integrations.md`](docs/integrations.md). Claude Code picks up the bundled `.mcp.json` automatically; the rest take a 5-line config.

---

## Provider matrix

| Provider | Cost | Auth | When |
|---|---|---|---|
| `claude_cli` | **0** (your subscription) | local `claude --version` | Default if `claude` CLI is installed |
| `anthropic` | $1 / $5 per Mtok | `ANTHROPIC_API_KEY` | Direct API |
| `google` | $0.10 / $0.40 per Mtok | `GOOGLE_API_KEY` | Gemini fallback |
| `ollama` | **0** (your hardware) | none (local daemon) | `LLM_PREFER_OLLAMA=1` opts in |
| `mock` | 0 | none | `ATLAS_FORCE_MOCK_LLM=1` for offline / CI determinism |

---

## What's next (roadmap U-X / V-X / S-X — see [Article Part 10](docs/article.en.md))

- 🔬 Token-savings benchmark on a 50-block product (vs. raw Claude Code)
- 🧱 Block templates marketplace (auth / payments / search / ingestion / billing)
- 🤖 V-1 agent-loop daemon — autonomous coding in steady-state
- 📊 V-3 production-monitor — feeds unknown-unknowns back as new acceptance assertions
- 🛠️ vLLM / LM Studio adapters in `llm_gateway.mjs` (~80 lines each, mirror Ollama)
- 💎 VS Code extension features — status badges in tree, inline contract editing, run-block buttons
- 📦 X-Core companion repo — runtime memory & principles layer for AI agents

---

## Honest self-audit

[`docs/article.en.md` Appendix A](docs/article.en.md): **9 ✅ fully-implemented**, **11 🟡 partial-with-caveats**, **0 ❌**. Used in production by Synlabs for Sima Atlas's own development (we eat our own dog food).

Not yet recommended for mission-critical commercial deployments — early adopters welcome.

---

## Contributing

Top wishlist:

1. **Local-model adapters** — vLLM / LM Studio / llama.cpp (~80 lines each, mirror the [`callOllama`](scripts/llm_gateway.mjs) pattern)
2. **Block templates** — auth / payments / search / ingestion / billing — each with mission + KPI + acceptance
3. **VS Code extension features** — status badges, inline editing, run-block buttons
4. **Evidence collectors** beyond the built-in five (`http_status`, `json_shape_match`, `snapshot_diff`, `lighthouse_score`)
5. **Native MCP clients** for tools we don't natively support
6. **UI translations** — currently EN + RU

[`CONTRIBUTING.md`](CONTRIBUTING.md) for full details.

---

Released under [MIT](LICENSE) by **[Synlabs](https://github.com/neskuchny)**. Maintained by Anton Kalabukhov + contributors.

Originally extracted from internal product **Tessent** so the *concept* of contract-first AI development reaches the market — independently of any specific implementation. Take the principles, build something better — that's a win.

🤖 v0.1.0 generated with [Claude Code](https://claude.ai/code)

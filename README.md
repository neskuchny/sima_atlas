# Sima Atlas

> **Visual contract-first development for AI coding agents.**
> The graph of contracts between you and Claude Code / Cursor / Codex / your favorite agent — so the AI builds what you actually meant.

Built by **Synlabs** as a subproject of **Tessent**. Maintained by Anton Kalabukhov and contributors.
License: **MIT**. Status: **early but live**.

📖 Full methodology (Russian, ~3000 words): [ТЗ/статья.md](ТЗ/статья.md)
🔌 Plug into your AI tool: [docs/integrations.md](docs/integrations.md)
🤖 Agent rules in this repo: [CLAUDE.md](CLAUDE.md)

![Canvas overview](tests/playwright/screenshots/sima_design_live.png)

---

## English

### What's the problem?

AI coding agents work great on five files and fall apart on fifty. Not because the models are weak — because we feed them dumps of context, lose connections between modules, and forget yesterday's lessons by tomorrow.

A widely-discussed audit of one developer's 430 hours in Claude Code found that **~73 % of tokens leaked** into nine "invisible" patterns: bloated `CLAUDE.md`, re-reading chat history, hooks adding stale context, cache misses, irrelevant skills loaded, "just in case" tool schemas, deep reasoning on trivial tasks, plain wrong outputs, plugin auto-updates.

That number is the **symptom**. The disease is structural: agents have no contract for what each piece of your product is supposed to do, and no graph of how the pieces connect. So they hallucinate, drift, redo things, and burn tokens on rework that wouldn't exist with good upfront contracts.

### What's the answer?

Sima Atlas turns AI-assisted development into a **visual graph of contracts**:

- Each block of your product lives as a directory with `mission.md` / `kpi.md` / `acceptance.md` / `depends_on.md` / `provides.md` / etc.
- The graph knows what depends on what — capability matching with drift detection (`session-token` provided by `b.auth`, consumed by `b.notifications`).
- Acceptance loop verifies each assertion via deterministic evidence collectors: `exit_code`, `fs_glob`, `file_diff`, `log_grep`, `selftest_run`, plus `llm_judge` as a last resort. Verdicts are tri-state — `pass` / `fail` / `inconclusive` — so the system never silently false-passes.
- Memory is typed and small: `lessons.json` / `dont_use.json` / `always_use.json` / `archetype` instead of one bloating `CLAUDE.md`.
- The agent gets a **precise context-pack** for each task — neither "everything", nor artificially small. Pack reports its own size; we optimize for relevance, not bytes.
- Documentation, wiki, technical-spec docs, and user tutorials are auto-generated from the same graph (and a marketing-narrative skill is in roadmap).

### 60-second Quickstart

```bash
git clone https://github.com/neskuchny/sima_atlas
cd sima_atlas
npm install
npm run dev          # API on :8787, UI on http://localhost:8000/atlas_design/
```

Open the UI, see the canvas. Click a block, edit its mission. Click **✦ Sima → fill from this chat**, paste any conversation about your product — Sima drafts blocks for you. Accept the ones you want; they appear on the canvas immediately.

To plug Sima into your AI agent (Claude Code, Cursor, Codex, Continue, Zed, Windsurf, Antigravity), see **[docs/integrations.md](docs/integrations.md)**. Short version: Claude Code picks up the bundled `.mcp.json` automatically; the rest take a 5-line config.

### What's in the box

- **65 MCP tools** for AI agents (`read_block`, `update_block`, `verify_block_acceptance`, `sima_fill_from_chat`, `sima_watch_chats`, `accept_proposal`, ...)
- **4-provider LLM cascade** with `claude_cli` zero-cost mode — uses your Claude.ai Pro/Max subscription via the local CLI, no API key needed
- **68 nightly validators** (`npm run test:nightly`)
- **Auto-generated** WIKI / TZ / Roadmap / per-block user tutorials
- **Multi-tenant**: many projects in `atlas/clients/<id>/`, hybrid isolation (per-tenant data, per-operator profile)
- **React canvas** with composer, proposals panel, detail panel, soft lifecycle-gate hints
- **Per-block Playwright screenshots** for documentation
- **Honest self-audit**: each claim in the methodology article has a verdict against the code (✅ / 🟡 / ❌). See Appendix A in the article.

### State of the project

✅ **Stable today**:
- 10 own blocks all green (acceptance verifier confirms in CI)
- Multi-tenant proposals routing (per-client lists, accept/reject)
- Soft lifecycle gates with visible "what's missing" hints in the canvas + DetailPanel
- Hybrid client isolation: graphs/blocks/proposals per-tenant; operator_profile per-operator
- Phases R-1 through R-5 shipped (claude_cli provider, sima_fill_from_chat orchestrator, chat watcher daemon, multi-tenant routing fixes, soft lifecycle gates + crash-resistant UI)

⬜ **Roadmap highlights** (full list in article Part 10):
- **S-1**: block templates marketplace (auth, payments, search, ingestion, ...)
- **S-4**: context-pack profiles with selective neighbor traversal
- **S-5**: marketing-narrative skill (structural docs → lending copy)
- **S-6**: project-level `architecture_decisions.md`
- **S-7**: transactional change-sets for cross-cutting changes (REST → GraphQL, capability rename)
- **U-1**: local models as first-class providers (Ollama / vLLM / LM Studio)
- **U-2**: `Sima Shell` — lightweight MCP client optimized for local models
- **V-1**: agent-loop daemon (autonomous coding in steady-state)
- **V-3**: production-monitor (catches unknown-unknowns and feeds them back as new acceptance assertions)
- **X-Core**: companion repo — runtime memory & principles layer for AI agents themselves (separate project, in progress)

❌ **Won't fix**:
- Hard lifecycle gates by default — would break draft-stage iteration. Kept soft with explicit visible hints. See article Appendix B.2.

### Documentation map

| File | What it is |
|------|-----------|
| [`ТЗ/статья.md`](ТЗ/статья.md) | Full methodology, architecture, principles, roadmap, self-audit. The big read. |
| [`docs/integrations.md`](docs/integrations.md) | Plug Sima into Claude Code / Cursor / Codex / Continue / Zed / Windsurf / Antigravity / CLI fallback / HTTP API |
| [`CLAUDE.md`](CLAUDE.md) | Agent contract for AI agents working in this repo |
| `atlas/blocks/<id>/` | Per-block contracts (mission / kpi / acceptance / depends_on / provides / decisions.log / patterns.md) |
| [`atlas/WIKI.md`](atlas/WIKI.md) | Auto-generated wiki across all blocks |
| [`atlas/roadmap.md`](atlas/roadmap.md) | Auto-generated roadmap from block statuses |

### Contributing

Open-source, MIT. We're actively looking for help with:

1. **MCP clients** for tools we don't natively support (Aider, Antigravity stable config, future agents)
2. **Local-model providers** in `scripts/llm_gateway.mjs` — Ollama / vLLM / LM Studio adapter (~150 lines)
3. **Block templates** (auth / payments / search / ingestion / billing / notifications / analytics — each with its own mission, KPI, acceptance)
4. **Evidence collectors** beyond the five built-in (`http_status`, `json_shape_match`, `snapshot_diff`, `lighthouse_score`, `type_coverage`)
5. **IDE adapters** — VS Code extension, JetBrains plugin, so the canvas lives in a side panel next to your code
6. **UI translations** — currently Russian + partial English; happy for any language
7. **`Sima Shell`** MVP — see U-2 in roadmap; lightweight chat shell for local models
8. **`architecture_decisions.md` skeleton** — see S-6 in roadmap

Open an issue, start a discussion, or just send a PR. We try to respond within 48 hours.

### License

MIT. See [LICENSE](LICENSE).

---

## Русский

**Sima Atlas** — open-source инструмент для разработки с AI-агентом в формате визуального графа контрактов. Каждый блок продукта живёт как набор MD-файлов с миссией, KPI, критериями приёмки и связями. Агент (Claude Code / Cursor / Codex) ходит в граф через MCP, получает точный context-pack под текущую задачу и отдаёт обратно факт-чекаемый патч. Acceptance loop проверяет каждое утверждение детерминистически.

Разработка ведётся в **Synlabs** как часть проекта **Tessent**. Maintainer — Anton Kalabukhov + контрибьюторы.

**Это первый из двух инструментов, которые мы открываем рынку.** Второй — `Sima Core` — про runtime-память и принципы для самих агентов; тоже разрабатывается в Synlabs / Tessent, отдельно (в работе).

📖 **Полная методология** (~3000 слов, 11 частей + 2 приложения с self-audit): [ТЗ/статья.md](ТЗ/статья.md)
🔌 **Подключить к своему IDE** (Claude Code / Cursor / Codex / Continue / Zed / Windsurf / Antigravity): [docs/integrations.md](docs/integrations.md)

### Quickstart

```bash
git clone https://github.com/neskuchny/sima_atlas
cd sima_atlas
npm install
npm run dev          # API на :8787, canvas на http://localhost:8000/atlas_design/
```

Открой UI, увидишь canvas. Нажми на блок, отредактируй миссию. Нажми **✦ Sima → заполни всё по этой переписке** и вставь любой кусок диалога о продукте — Sima нарисует блоки. Прими нужные — они появятся на canvas.

### Что меняется на практике

- **Меньше переделок.** Агент видит контракт каждого блока, идёт сразу куда надо. Переделки — не «бесплатные» + 30 % к расходу токенов; они стоят 2–4× первого запроса. Контракт-ориентированный подход экономит именно их.
- **Меньше галлюцинаций.** Когда модель знает, что блок должен делать, пространство «правдоподобных, но неверных» ответов резко уменьшается. Acceptance loop ловит то, что просочилось.
- **Путь к автономной разработке.** Граф + контракты + acceptance + lessons — фундамент, на котором можно построить любой уровень автоматизации, от консервативного «спрашивай человека на гейте» до агрессивного «работай ночью сам». См. Часть 6.3 + Приложение Б.6.
- **Документация — побочный продукт.** WIKI / ТЗ / туториалы / маркетинговые сторилайны (в roadmap S-5) генерируются из того же графа автоматически.

### Что мы ждём от сообщества

Подробный список — в статье Часть 11. В двух словах: натив-MCP-клиенты для других IDE, локальные модели в LLM gateway, шаблоны блоков, доп. evidence collectors, переводы UI, IDE-плагины (VS Code, JetBrains).

Open issue, начинай discussion, шли PR. Обычно отвечаем в течение 48 часов.

### Лицензия

MIT — см. [LICENSE](LICENSE).

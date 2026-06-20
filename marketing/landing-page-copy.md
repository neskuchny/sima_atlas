# Landing page copy

Для `sima.dev`, GitHub Pages, или просто слегка переделанного README.
Все цифры и пути проверяемы — каждое утверждение тегается с конкретным
файлом в репо.

---

## Hero (above the fold)

### H1
**Sima Atlas**

### H2 (одна строка)
**Контракт-первый канвас для AI-агентов. Канон-арбитр. Tri-state верификация. Никаких ложных «done».**

### Подзаголовок (две строки, не больше)
Каждый блок твоего продукта — это директория с миссией, KPI и acceptance.
Агент (Claude Code / Cursor / Codex) ходит в граф через MCP. Семантический
LLM-судья проверяет, реализует ли код миссию на самом деле. v0.4.0 ·
MIT · 79/79 nightly.

### CTA pair
```
[Download for Mac / Win / Linux]    [Star on GitHub]
```

(Кнопка Download ведёт на `releases/latest`, GitHub — на главную репо.)

### Sub-CTA, ниже мелким
```
Or: git clone github.com/neskuchny/sima_atlas && npm install && npm run dev
```

---

## Section 1: The Problem (1 экран скролла)

### H2
**Why AI coding tools break past 10 files**

### Текст (3 коротких абзаца)

The failure mode isn't «wrong code» — it's «AI claims it's done, you trust
it, three months later production catches what's missing».

It looks like this. You ask the agent for «refresh tokens». It writes
something that compiles, tests pass (it wrote them), and you merge. Three
months later, customers report random 2-hour logouts and you discover the
refresh logic only renews access tokens, not refresh tokens.

The agent had no way to know that's what «refresh tokens» means in your
product, because you never wrote it down anywhere it could read. Multiply
this by 50 modules.

### Visual прямо тут
Скриншот семантического вердикта (см. `wow-moments-checklist.md` →
`02-semantic-review-verdict.png`).

---

## Section 2: The Solution (1 экран скролла)

### H2
**Three layers that work together**

### Three-column grid

| **Контракт** | **Деттерминистический верификатор** | **LLM-судья (Contract-as-Arbiter)** |
|---|---|---|
| Каждый блок — директория с `mission.md`, `kpi.md`, `acceptance.md`, `depends_on.md`, `provides.md`. Агент читает контракт через MCP **до** прикосновения к коду. | 5 evidence-видов: `exit_code`, `fs_glob`, `log_grep`, `selftest_run`, `file_diff`. Каждый assertion в `acceptance.md` несёт спецификацию. Pass / fail / **inconclusive** — никогда silent green. | Второй LLM (gemini-2.5-flash non-thinking по умолчанию, можно anthropic) читает контракт + код + соседей и судит, реализует ли код миссию **по смыслу**. LLM-judge **в одиночку** не может промoutить блок — Kanon §3.2. |

### Под grid'ом

> **The protocol behind it is published as a stand-alone manifesto:**
> [`kanon-protocol-manifesto-v2.1-ru.md`](kanon-protocol-manifesto-v2.1-ru.md)
> +
> [`kanon-protocol-spec-v0.1.md`](kanon-protocol-spec-v0.1.md)
>
> RFC-2119 compliance, Level 1/2/3. Fork it. Write a better implementation.
> The reference (this repo) recently passed its own Level 3 audit.

---

## Section 3: The Proof (1 экран скролла)

### H2
**Last night: 75 minutes autonomous, 3 honest stalls, 0 false promotions**

### Текст (2 абзаца)

Real Claude agent. 4 iterations planned, $5 cap. The agent shipped real
engineering work — atomic file writes, schema validation, block history
snapshots, a new code-vs-contract drift detector. Then the semantic
judge read everything and said «not enough yet» on three of them.

The autonomous loop honored that. No silent green. The work is preserved
on disk; the status didn't advance. The next V-1 iteration will read the
persisted verdict and continue from there.

### Quote box (the actual log)
```
agent_loop_daemon [claude]: 3 block(s) — 0 advanced · 3 stalled
  stop: complete — no runnable blocks left
    ✗ b.db (idea) → fail: semantic verify FAILED
    ✗ b.smoke-sandbox (idea) → fail: verifier did not pass
    ✗ b.core-sync (done) → fail: semantic verify FAILED
```

### Link
**Read the full overnight log →** `atlas/autonomous_runs/v1-overnight-20260620T075444.log`

---

## Section 4: What's in v0.4.0 (1 экран скролла)

### H2
**Inside the box**

### Bulleted list (короткие, каждый с верифицируемой ссылкой)

- **~70 MCP tools** — Claude Code is reference; Cursor / Codex / Continue / Zed / Windsurf docs included. → `docs/integrations.md`
- **6-provider LLM cascade** — `claude_cli` (free with your Pro/Max subscription), `anthropic`, `google`, `openai` (gpt-4o-mini), `ollama` (local Llama/Qwen/DeepSeek), `mock` (CI). → `scripts/llm_gateway.mjs`
- **Multi-source chat ingestion** — `~/.claude/projects/`, `~/.codex/sessions/`, Cursor's `state.vscdb`. Turn any transcript into block proposals. → `scripts/sima_watch_chats.mjs`
- **Token economics** — actual cost + stable shadow-bill against Haiku 4.5 list price. Compare a subscription run against an API run on the same axis. → `scripts/token_economics.mjs`
- **Cascade verify on every edit** — transitive reverse-dep closure, broken dependents marked `status: desync` inline. → `scripts/cascade_verify.mjs`
- **Article-as-projection** — `docs/article.{en,ru}.md` Part 9 regenerated from `graph.json` as a nightly validator. The docs cannot drift from reality. → `scripts/sync_article_status.mjs`
- **Downloadable desktop installer** — `.dmg` / `.exe` / `.AppImage`. Electron, no system Node prerequisite. CI builds on every tag push. → `.github/workflows/desktop-build.yml`

---

## Section 5: Install (1 экран скролла)

### H2
**Pick your path**

### Three-card grid

**📦 Desktop installer**
> Download for Mac (Apple Silicon + Intel) / Windows (NSIS + portable) / Linux (AppImage + deb). One double-click. Canvas opens with a demo project.
>
> [Download v0.4.0 →]

**🔧 From source**
```bash
git clone https://github.com/neskuchny/sima_atlas
cd sima_atlas
npm install
npm run dev
# API on :8787 · UI on http://localhost:8000
```

**🤖 Plug into your agent**
> `.mcp.json` is in the repo root — Claude Code picks it up automatically.
> Cursor / Codex / Continue / Zed configs in `docs/integrations.md`.

---

## Section 6: FAQ (короткий, 5-6 вопросов max)

**Is this just RAG with extra steps?**
No. RAG is «retrieve relevant chunks of source code to feed the LLM». Sima
is «walk the contract graph and feed only the relevant block's
neighbours». RAG has no notion of contract or acceptance. Sima requires
both before it'll mark a block done.

**Why is the LLM judge separate from the agent?**
Because tests written by the agent itself pass by the agent's definition
of «works». An independent reader is the only way to catch semantic drift.
Spec §3.2 prevents the judge from solo-promoting a block — at least one
deterministic check must also pass.

**What stops the judge from being wrong?**
Nothing. That's why it's the **last** line of defence, not the first.
Deterministic evidence collectors gate first; a judge fail without a
deterministic fail is `inconclusive`, not `fail`. Operator reviews.

**Doesn't this slow down coding?**
By maybe 30%. So does code review. The point isn't speed-of-typing; it's
number-of-redos. Below 10 blocks you don't need this. Past 30 blocks you
can't ship without it.

**Why publish the protocol separately from the code?**
Because principles outlive implementations. REST didn't belong to Roy
Fielding. We'd rather see a Kanon-compliant implementation in Rust / Go /
Python that's better than this one than have this repo be the
only thing on offer.

**Is it really free?**
MIT for the code. The protocol is CC-BY 4.0 for the text. The only money
you'd ever spend is on a Claude / Anthropic / Google API key — and the
cascade lets you use `claude_cli` (your Claude Pro/Max subscription, $0
marginal) or `ollama` (your local hardware) for the agent loop. The
semantic judge is on Gemini Flash by default at ~$0.02 per verdict.

---

## Section 7: Footer

### Links
- GitHub: github.com/neskuchny/sima_atlas
- Manifesto: kanon-protocol-manifesto-v2.1-ru.md
- Spec: kanon-protocol-spec-v0.1.md
- CHANGELOG: CHANGELOG.md

### Credits
> Released under MIT by Synlabs. Maintained by Anton Kalabukhov + contributors.
> Originally extracted from internal product Tessent so the concept of
> contract-first AI development reaches the market — independently of any
> specific implementation. Take the principles, build something better.

---

## Visual / typography notes

- **Hero font**: serif italic для логотипа Sima (Newsreader, как в `index.html`) + sans-serif для текста.
- **Цвета**: warm cream `#f6f5f1` background, ink `#1f2024`, accent `#d6cdb8`. Никаких неоновых градиентов «AI».
- **Без stock images**. Если нужны иллюстрации — скриншоты канваса.
- **Не «AI-generated hero»**. Узнаваемо за полсекунды.
- **Один CTA выше fold**, не три. Download или Star — выбери.
- **Mobile**: грид сворачивается в столбец. Текст ≥ 16px. Hero CTA остаётся видимым.

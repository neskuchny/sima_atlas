# Long-form blog post — dev.to / hashnode / собственный блог

**Когда:** через 2-3 дня после Twitter-thread'а. К этому моменту thread остаётся searchable, а лонгрид даёт что-то, что туда не уместилось.
**Длина:** ~2000-2500 слов. Слишком короткое — поверхностно, слишком длинное — никто не дочитает.

---

# What happens when an AI agent's autonomous overnight loop says «no, I'm not done yet»

_The story of a 75-minute autonomous V-1 run, a second AI sitting in judgment, three honest stalls, and zero false promotions._

---

## TL;DR

I built an open-source canvas for AI-coding agents — github.com/neskuchny/sima_atlas — where every module of the product lives as a directory with a mission, KPIs, acceptance criteria, and explicit dependencies. The agent navigates the graph via MCP, ships code, and a **second AI sits in judgment** and reads the contract + the implementation + the neighbours and asks the hard question: «does the code actually fulfill the mission's meaning?»

Last night I let it run for 75 minutes against its own codebase with a real Claude agent. **Three honest stalls. Zero false promotions.** The system stopped itself. Here's what happened, why it matters, and what I learned about the failure mode of «AI codes 50 files».

---

## The thing that wasn't supposed to happen

I told the autonomous loop: «4 iterations, $5 cap, real Claude agent, 30-minute timeout each». And then I left.

When I came back 75 minutes later, the daemon had exited cleanly. The summary was:

```
agent_loop_daemon [claude]: 3 block(s) — 0 advanced · 3 stalled
  stop: complete — no runnable blocks left
    ✗ b.db (idea) → fail: semantic verify FAILED
    ✗ b.smoke-sandbox (idea) → fail: verifier did not pass
    ✗ b.core-sync (done) → fail: semantic verify FAILED
```

Zero advances. Three stalls. Circuit breaker hit on 3 consecutive fails (configurable, that's the default I'd set).

A year ago, I would have read this and thought «my tool is broken». Today I read it and think «my tool worked correctly».

Here's the difference.

---

## The failure mode nobody talks about

When you watch AI-coding demos, the failure mode that gets shown is **wrong code**. The agent generates a function, you read it, it has a bug, you point at it, the agent fixes it. End of demo. Standing ovation.

The failure mode that actually hurts you in production is **AI claims it's done, you trust it, three months later production catches what's missing**.

It looks like this:
- You ask the agent to «implement the auth module with refresh tokens».
- Agent writes some code. Tests pass (it wrote them).
- You read the code. It looks right.
- You merge.
- Three months later, a customer reports «my session randomly logs me out at exactly 2 hours» and you realize the refresh logic only renews the access token, not the refresh token, so after the refresh-token TTL hits everyone bounces.
- The agent had no way to know that's what «refresh tokens» meant in your product, because you never wrote it down anywhere it could read.

Multiply this by 50 modules. That's the «agents fail past 10 files» ceiling. It's not about the AI being dumb. It's about the AI being too eager to please without a contract to be checked against.

---

## What a contract looks like

In Sima, every module («block») is a directory:

```
atlas/blocks/b.auth/
├── mission.md      — why this block exists, what's NOT in scope
├── user_story.md   — who uses it, when, why
├── kpi.md          — measurable goals (session length, refresh latency, ...)
├── acceptance.md   — what «done» means, with deterministic evidence specs
├── depends_on.md   — what other blocks this needs
├── provides.md     — what other blocks can rely on this for
├── tasks.md        — implementation breakdown
├── narrative.md    — past attempts, decisions, lessons
├── decisions.log   — structured: ts | decision | rationale
└── checks.log      — every verification result, append-only
```

The agent doesn't blow $40 of tokens loading the whole codebase. It builds a **context pack** that has:
- this block's full contract
- the relevant neighbour contracts (one hop out via depends_on)
- project-level architectural decisions (auto-injected, append-only)
- the operator's `dont_use` / `always_use` locks (auto-injected)
- this block's own `narrative.md` (so it remembers what failed last time)

Then it works. Then it reports.

---

## Tri-state acceptance — the no-silent-green rule

Every verification returns one of three verdicts:
- **pass** — at least one deterministic check satisfied; none failed.
- **fail** — at least one deterministic check failed.
- **inconclusive** — no deterministic evidence either way.

**An LLM judge ALONE cannot promote a block.** This is the Kanon Protocol spec §3.2 rule I keep harping on. If your only «pass» came from an LLM reading the code and saying «looks good», the block's verdict is `inconclusive` — flagged `llm_judge_only` in the report. You don't get to silent-green.

The deterministic evidence types are:
- `exit_code` — a command exits 0
- `fs_glob` — a file or pattern exists
- `log_grep` — a regex matches in a log file
- `selftest_run` — a self-test passes
- `file_diff` — a code change matches expected
- `llm_judge` — last resort, never sole basis

This is the first line of defence. It catches the dumb stuff.

---

## The Contract-as-Arbiter — the second AI

But deterministic checks have a ceiling. The block's `acceptance.md` says «when X happens, Y must happen». The agent wrote code where Y appears to happen. Tests pass. Deterministic checks green. But does the code **actually** do Y? Or is it a regex pretending to be semantic analysis? A `mock_token()` instead of real JWT?

That's where the second AI comes in.

`scripts/semantic_verify.mjs` is an LLM-judge (currently Gemini 2.5 Flash, non-thinking — explicitly not the heavy thinking model). It reads:
- the entire contract (mission + user_story + kpi + acceptance + provides + depends_on)
- the methodology (architecture_decisions + tech_stack + rules + dont_use + always_use)
- the actual code (alive files from `files.md`, capped at 24K chars but always with a file inventory so the judge can't fail a block over a file the budget truncated)
- the neighbours' contracts (so it can judge inter-block consistency)

And it returns a tri-state verdict on **five dimensions**:
1. `mission_fulfilled` — does the implementation match the mission's **meaning**?
2. `conditions_met` — does it satisfy KPIs + acceptance intent?
3. `methodology_followed` — does it honor `architecture_decisions` / `dont_use` / `tech_stack`?
4. `works_as_described` — will it actually work in production?
5. `connections_consistent` — are the inter-block contracts honored?

Plus a `todo_to_pass` punch-list of specific changes needed to clear the red.

When the judge says fail, the V-1 autonomous loop:
- does NOT advance the block's status
- preserves the agent's partial work on disk (Ralph-loop convention — «progress lives on disk, not in conversation»)
- records the verdict for the **next** V-1 iteration so the next agent can read «here's what the last attempt failed on» and continue from there

---

## What happened on the overnight run

Iteration 1: agent picked `b.db` (the data storage block). It was in `idea` status — contract written, no code yet. Mission promised atomic writes, schema validation, block versioning, migration runner. The agent:
- added `atomicWriteFileSync` (write-tmp-then-rename pattern)
- added `validateGraphSchema` reading from `atlas/db_schema.json`
- added `saveBlockHistory` writing timestamped snapshots
- added a `migrate_v1_v2.mjs` runner

Real engineering work. Deterministic verifier said pass. Cascade check on dependents said pass. The previously-green done blocks stayed green. Three of four gates green.

Then Gemini sat down. Read the contract. Read the code. Verdict:

```
mission_fulfilled: FAIL
The code lives in scripts/mcp_atlas_server.mjs which b.db's files.md
doesn't list. The work is real but architecturally landed in
b.agent-orchestrator's territory.
```

Pause on that for a second.

The judge wasn't being pedantic. The complaint is that the agent's atomic-write code is now embedded in another block's owned scripts. If next week someone reads b.db's contract and looks at its files.md, they'll see no implementation. The promise b.db's mission makes is not visible at b.db's address. That's contract drift — exactly what Sima is supposed to prevent.

The autonomous loop honored the verdict. `b.db` stays `idea`. The work is preserved (in the wrong block, but preserved). The next V-1 iteration will see the persisted verdict and can decide: move the code to b.db's territory, or update b.db's files.md to reflect reality, or revise the mission.

Iteration 2 (`b.smoke-sandbox`) stalled on a flaky timing failure. Iteration 3 (`b.core-sync` semantic-red remediation) shipped two new validators that closed concrete todos from the previous Gemini verdict — but the judge re-read the freshly-tightened mission and found new finer-grained mismatches.

Three honest stalls. Zero false promotions.

---

## Why this matters past «AI tools demo»

Most «AI coding» tools optimize for the demo: how fast can the agent write a working snake game? Sima optimizes for the post-demo: how confidently can you ship 50 modules with an agent and trust that what's marked done is actually done?

The economics aren't even close. Demo-mode AI saves you maybe 30% on typing. Production-mode AI without a contract loses you 200-400% on rework, because the AI confidently claimed things it didn't deliver and you discovered the gap weeks later. The math overwhelmingly favors slow-and-checked.

Compare to a human team: a senior architect spends 90% of their time NOT typing code. They spend it specifying what the modules should do, reviewing whether they do it, and catching gaps. That role doesn't disappear when you delegate to AI — it gets absorbed by the contract graph + the acceptance verifier + the LLM judge. The agent does the typing; the architecture lives in the graph; the QA lives in the verifier.

This is what makes 50-block AI-built products possible. Without it, you cap at ~10 blocks and the rest gets quietly buggy.

---

## What's there today (v0.4.0)

The full picture:
- **~70 MCP tools** for any agent that speaks MCP. Claude Code is the reference; Cursor / Codex / Continue / Zed / Windsurf / Antigravity configs are documented in `docs/integrations.md`.
- **6-provider LLM cascade**: `claude_cli` ($0 marginal — uses your Claude.ai subscription via the bundled CLI), `anthropic`, `google`, `ollama` (local Llama/Qwen/DeepSeek), `mock` (offline CI).
- **Multi-source chat ingestion**: `sima_watch_chats` reads `~/.claude/projects/`, `~/.codex/sessions/`, and Cursor's `state.vscdb` (via `sqlite3 -readonly`). Turn any transcript into block proposals.
- **Token economics aggregator** with both `cost_usd_actual` (what was charged) and `cost_usd_equivalent` (stable shadow-bill against Haiku 4.5 list price) — so you can compare a Claude subscription run against an Anthropic API run on the same axis.
- **Cascade verify** on every edit — transitively re-verifies the reverse-dep closure; broken dependents auto-marked `status: desync` inline on the canvas.
- **Article-as-projection**: `docs/article.{en,ru}.md` Part 9 (the block status table) is regenerated from `graph.json` as a nightly validator. The article literally cannot drift from reality.
- **Downloadable desktop installer** (`.dmg` / `.exe` / `.AppImage`) — Electron-based, no system Node prerequisite. CI builds installers on every `v*.*.*` tag push.

The protocol behind it is published as a stand-alone manifesto with RFC-2119 compliance levels (`kanon-protocol-manifesto-v2.1-ru.md` + `kanon-protocol-spec-v0.1.md`). We propose it as REST-for-AI-coding: principles outlive implementations.

---

## Honest limits (because not having them is worse than the limits themselves)

- **The judge isn't infallible.** Last night it told me the agent's code was in «another block's territory» — architecturally correct, stylistically blunt. Verdicts are persisted; the operator reviews.
- **Tri-state inconclusive isn't free.** It means «we don't know». In autonomous mode, inconclusive on a remediation iteration is treated as «not cleared» — V-1 won't auto-promote. That's the point, but it means you'll get more stalls than promotions in early iterations.
- **The protocol is at v0.1.1.** The implementation flips behaviour as we discover failure modes. v0.4.0 closed five protocol violations the audit caught. v0.5.0 will close more.
- **Desktop installers are unsigned in v0.4.0.** First launch needs one Gatekeeper / SmartScreen click-through. Apple Developer ID and Windows EV signing are tracked as PR5, blocked on certificate purchase, not code.
- **5 of 12 blocks in the reference implementation's own graph are still `idea`.** Including the product-* templates. The reference implementation isn't a complete product — it's a proof of concept for the protocol.

---

## How to try it

Three paths.

**1. Click and run** — download the installer for your OS from the releases page (`v0.4.0` once the operator cuts the tag), double-click, the canvas opens with a demo project. No terminal involved.

**2. Clone and dev** — `git clone github.com/neskuchny/sima_atlas && cd sima_atlas && npm install && npm run dev`. API on 8787, UI on 8000, opens browser to demo client.

**3. Read the protocol** — `kanon-protocol-manifesto-v2.1-ru.md` for the prose, `kanon-protocol-spec-v0.1.md` for the RFC-2119-style spec. If you want to write a better implementation in another stack, this is where to start.

---

## Reply / engage

Happy to answer questions. The verifiable artifacts (overnight log, persisted verdicts, the protocol itself) are all in the repo so any claim above can be checked against `git blame`.

The thing I'd actually love: a Kanon-compliant implementation written in another stack. Rust, Go, Python, doesn't matter. The protocol is at v0.1.1 — early enough that an alternative implementation finding spec ambiguities is the single most valuable thing that could happen to it.

---

_Sima Atlas v0.4.0 · MIT · github.com/neskuchny/sima_atlas_

# Sima Atlas

### Contract-First AI Coding: a visual schema that verifies itself

> *Sima Atlas is the open-source incarnation of an idea — "Sima" — that grew inside our main product **Tessent** (Synlabs). We're publishing it for the **concept**, not for any specific implementation: what matters are the principles of contract-first AI coding and **why these specifically**, not alternatives. The implementation can be better, can be worse, we'll keep iterating — but the directional vectors are fixed. More on the Sima / Tessent / Sima Core relationship in Part 7.3.*

> **TL;DR.**
> AI coding works great over five files and falls apart over fifty. Not because the models are weak — on the contrary, they're too eager to please: feed them a context dump and they'll start hallucinating functions that don't exist, rewriting working code, forgetting yesterday's lessons. The viral "73% of tokens leaked" post is a *symptom*, not a *diagnosis*; the tokens themselves are merely a side-effect of the system having no **contract** for each piece of the product.
>
> Sima Atlas is an open-source tool that turns AI-agent development into a **visual graph of contracts**. Every block of your product lives as a set of MD files describing mission, KPIs, acceptance criteria, dependencies, and decision history. The agent (Claude Code / Cursor / Codex) navigates this graph through MCP, receives a **precise** (not "small" — precisely the right amount of context for the task at hand) context-pack per block, and returns a fact-checkable patch. An acceptance loop verifies each assertion via deterministic evidence collectors; the LLM judge is the last line of defence, not the first. Documentation, wiki, tutorials, and technical specifications auto-generate from the same graph.
>
> **What this delivers, measurably.** Fewer reworks — which means fewer tokens and less time, because the agent lands on target the first time (relevant context, contract, lessons learned). Fewer hallucinations (the contract is known — the model has nothing to "invent into"). More parallelism (multiple agents work on different blocks; the graph prevents collisions). And, most importantly, **the ability to ship a product to production without a classical professional team** — because the architect's and QA's roles are absorbed by the graph plus the acceptance verifier.
>
> We propose the market accept this: vibe-coding was a fine starting point, but we now need a tool that turns spontaneous development into verifiable engineering practice — without losing speed. Visual interfaces and contract-graphs are our bet on the next generation of development.

---

## Part 1. What broke in AI coding

### 1.1 The symptom everyone noticed: 73% of tokens leak

In May 2026, an analysis was published: a developer audited their **430 hours** in Claude Code, **6 million** input tokens, **$1340** in API costs. Of those, **roughly two-thirds went somewhere they shouldn't have** — into nine "invisible" patterns:

| # | Pattern | Share of waste |
|---|---------|---------------:|
| 1 | `CLAUDE.md` bloated (4800 → 900 tokens) | 14 % |
| 2 | Re-reading conversation history (the 30th message ~30× more expensive than the 1st) | 13 % |
| 3 | Hooks injecting stale context | 11 % |
| 4 | Cache misses on `--resume` (TTL 5 min) | 10 % |
| 5 | Skills loading for irrelevant tasks | 7 % |
| 6 | Tool schemas "just in case" (12 MCP × 600 tokens) | 6 % |
| 7 | Deep reasoning on trivial tasks | 5 % |
| 8 | Plain bad output | 4 % |
| 9 | Plugin auto-updates | 3 % |

The post hit 745 thousand views in 24 hours. Rightly so — the problem is real.

### 1.2 But 73% is the symptom, not the diagnosis

If it were only about tokens, you could solve it with cheap optimisations: shrink `CLAUDE.md`, disable extra MCPs, shorten hooks. That's exactly what the second half of the original post recommends.

But tokens are a side-effect of a structural disease. Beneath the visible tip of the iceberg lie **nine structural problems**, and together they make AI coding unsuitable for any product larger than five-to-ten modules:

```
                                                              visible
   ───────────────── 73% tokens leaked ──────────────────  ──────────
                                                              ↓
   1.  Unbounded context, no contract                          hidden
   2.  Inter-module connections live in the developer's head
   3.  Agent memory = last session
   4.  Memo documents become dumping grounds (CLAUDE.md)
   5.  Agent cuts corners (mock instead of logic)
   6.  Acceptance is missing or unchecked
   7.  Architect-in-the-head doesn't scale
   8.  Documentation lags behind the code
   9.  No sense of progress (how much is done? what's left?)
```

#### 1. The contract is missing

The agent doesn't know what the block **should** do (mission) — only what it **currently** does (code). So when you say "add a refresh token," it adds a refresh token *somewhere*, with no understanding of what the "auth" block in this product even *means*.

A contract for a module is not comments and not a README. It's:

- **mission** — why the block exists
- **user_story** — who calls it and when
- **kpi** — measurable goals
- **acceptance** — what "done" means
- **depends_on / provides** — external interfaces
- **decisions / patterns / dont_use** — traces of past experience

Without a contract like this, any LLM will generate "plausible code" instead of "correct code."

#### 2. Connections live in the developer's head

"If you change A, you'll break B" — a sentence the AI will never utter, because it has neither A nor B as connected entities. Just two files near each other. A team of ten engineers handles this through code review and Slack threads; a solo developer doesn't handle it at all. The connection graph needs to come out of the subconscious and onto the screen.

#### 3. Agent memory = last session

The same bug gets fixed five times. Sure, you can write "don't use `eval`" into `CLAUDE.md`. But within a week there are forty such notes, half of them stale, and the model carefully ignores all of them.

Memory should be **structured** (a separate list of bans, a separate list of lessons, a separate operator archetype), **dated** (this lesson is three months old, it might be obsolete), and **load-on-demand** — not "everything at once in every prompt."

#### 4. CLAUDE.md becomes a dumping ground

The very file from item 1 of the viral post. It grows like a weed because everything gets dumped there: rules, examples, temporary notes, TODOs, product lore. It loads in full on every turn — so 4800 tokens of unnecessary prefix × 30 turns = pointless money.

The solution isn't "shrink `CLAUDE.md`," it's "move memory into typed files and load only relevant slices."

#### 5. The agent cuts corners

This is the most expensive item, because it's invisible to token meters and to linters. You asked for "semantic evaluation logic via LLM" — the agent decides it's easier to return `if (text.includes("ok")) return true`. Tests pass (the agent wrote them). Acceptance passes, because the agent wrote the acceptance criteria too. But the product doesn't do what it's supposed to.

Without an independent check that asks **"does the implementation actually fulfill the stated mission?"**, the agent will always simplify, for purely economic reasons.

#### 6. Acceptance is missing

"Done" = "compiles" = "tests I wrote myself pass." That's weaker than what we need. Done means **provably satisfying every stated acceptance criterion**, and the proof is not "I read the code" but a **piece of evidence**: a test's exit code, the existence of a file, a grep over a log, a diff of a specific fragment, or — last resort — an LLM judge's verdict.

#### 7. The architect-in-the-head doesn't scale

Professional teams solve this through dedicated architects, ADRs, RFCs, regular syncs. It works — slow and expensive, but it works. Vibe-coders solve this by not solving it — hence "everything works except the parts that don't."

Architecture should **live on a canvas**, not in `architecture.md` from 2024.

#### 8. Documentation lags

Code: fifty files. Documentation: five files, all about old features. No wiki, no tutorial, no spec — because writing them by hand is a separate unpleasant task no one gets to.

The solution: **documentation is a derivative of the contract**. If the graph knows what each block does, what the user clicks on, and which URL gets hit — wikis, specs, and tutorials are generated by a script, not written by hand.

#### 9. No sense of progress

"How many blocks are done? Which acceptance criteria passed? What's blocking release?" — a typical solo developer doesn't answer these because **there's no one to ask**. Without visible progress, there's no joy in the work and no deadlines.

### 1.3 What the research says

All nine symptoms share a common cause: **growing context degrades LLM output quality non-linearly**. A few works we lean on:

- **"Lost in the Middle"** (Liu et al., Stanford, 2023) — models systematically lose information from the middle of a long context. A relevant fact at position 30/60 is found with about 30% of the probability of position 1/60.
- **"How Long Can Open-Source LLMs Truly Promise on Context Length?"** (Li et al., 2023) — even models advertising 128K windows show reasoning degradation past 8–16K. The advertised limit and the working limit are different numbers.
- **"Hallucination Is Inevitable: An Innate Limitation of LLMs"** (Xu et al., 2024) — for tasks without a clear contract (what the result *should* be), hallucination is not a bug but a mathematical property of next-token sampling. A contract shrinks the space of "plausible but wrong" answers.
- **Internal Anthropic / OpenAI data** (see their model cards) — request cost and latency grow quadratically with context length when the prefix isn't cached.

The conclusion: a cheap, fast, accurate AI agent **cannot operate on a bloating CLAUDE.md and chat history**. It needs a layer that picks relevant, verified, small context for the task at hand. That layer is what we're building.

### 1.4 The "speed / quality / cost" triangle

Historically you could pick **two out of three**:

| Approach | Speed | Quality | Cost |
|----------|------:|--------:|-----:|
| Professional team | slow | high | expensive |
| Vibe coding (solo + AI) | fast | low | cheap |
| Outsourcing | medium | medium | medium |

Sima Atlas doesn't deny the triangle, it redraws it: **if the AI agent has a contract, it works fast, clean, and cheap simultaneously, because it doesn't do anything unnecessary**.

---

## Part 2. Hypothesis

> **The contract is primary. Code is a derivative of the contract. The graph of contracts is what should be on the screen, not a folder of files.**

Six principles the system rests on:

### Principle 1. Block = contract, not code

Each block is a directory `atlas/blocks/<id>/`. The minimum required contract (what `validate_block_contracts.mjs` enforces) is five files:

```
atlas/blocks/b.auth/
├── mission.md          # why it exists                   [required]
├── kpi.md              # measurable goals                [required]
├── acceptance.md       # "done" criteria with evidence   [required]
├── tasks.md            # what's left                     [required]
└── checks.log          # check history (append-only)     [required]
```

On top of this minimum, the `createBlock` template seeds seven more files "as needed" — they don't block validation, but most live blocks have most of them:

```
├── user_story.md       # who calls it and when
├── depends_on.md       # what it relies on (capabilities)
├── provides.md         # what it offers others (capabilities)
├── code_summary.md     # 30-line implementation overview
├── decisions.log       # decision history (append-only)
├── patterns.md         # recurring patterns / anti-patterns
└── dont_use.md         # what's banned in this block
```

`graph.json` stores the topology: list of blocks, layers (`user / front / logic / ai / data / ext / content / testing`), canvas positions, edges. Files plus graph together are the single source of truth; UI and agents only observe and edit this source.

### Principle 2. The graph knows the connections (via capability matching)

`depends_on` and `provides` are **named capabilities**, not file paths. `b.notifications` `depends_on: [user-store, session-token]`. `b.auth` `provides: [session-token]`. This gives the system:

- **Drift detection.** If `b.auth` stops `provides session-token` while someone still depends on the capability, `validate_dependency_contracts.mjs` fails the nightly run with an explicit list of broken bindings. Auto-marking dependent blocks with `status: desync` is on the roadmap (S-8).
- **Order of operations.** Block B's acceptance doesn't run until A (which it depends on) is green.
- **Impact-aware change.** When the operator wants to change `b.auth`'s mission, the UI shows: "this affects 3 downstream blocks — review their contracts."

### Principle 3. The acceptance loop is built into the block lifecycle

Every assertion in `acceptance.md` carries an **evidence_kind** — a way to prove the condition is met:

```markdown
- [ ] **A1.** POST /auth/login with a valid password returns a JWT with exp ≥ 15 min
  ```yaml
  evidence_kind: log_grep
  evidence_spec:
    file: tests/api.log
    pattern: 'auth/login.*200.*exp'
    min_count: 1
  ```
```

Evidence collectors come in five flavours: `exit_code`, `fs_glob`, `file_diff`, `log_grep`, `selftest_run`. All deterministic, all cheap, all work offline. If none fits — `evidence_kind: llm_judge`, and the model returns a verdict, but this is **the last line, not the first**.

Verdict: `pass` / `fail` / `inconclusive`. *Inconclusive* is its own category, meaning "evidence is insufficient — ask the operator to clarify"; this beats a silent false-pass.

### Principle 4. Memory — structured and small. Context — precise, not short

These are two distinct principles often conflated.

**Memory** — what accumulates between sessions (lessons, bans, patterns, operator profile). It must be **typed and small**, otherwise it turns into a bloating `CLAUDE.md`. On disk:

```
atlas/operator_profile/
├── profile.json        # archetype, preferences, aggregates
├── history/            # profile snapshots over time
├── patterns/           # dev environments, typical builds, flows
└── templates/          # operator prompt templates
```

Plus three more typed stores accessible via MCP tools `list_lessons` / `set_dont_use` / `set_always_use`: lessons (with evidence ≥ 2), personal technology bans (`eval`, `MD5`, `cdn.tailwindcss.com`) with reasons, canonical defaults (`language=typescript`, `runtime=node`). The pre-commit drift-guard reads `dont_use` and flags conflicting proposals.

**Context** — what gets assembled per request. That's the `context-pack`. And here the paradigm is fundamentally different, and we openly disagree with part of the industry:

> **The goal isn't a "small" context-pack, it's the "right-sized" one.** Trimming noise — required. Cutting meaning (a block's mission, an important link, a neighbour's logic) — a critical mistake that triggers rework, and rework eats more tokens than the "extra" context in the first request.

When the agent picks up `b.auth`, it gets a **context-pack** — a JSON of roughly this shape:

```json
{
  "block_id": "b.auth",
  "mission": "...",
  "acceptance": [...],
  "depends_on": ["user-store", "session-token"],
  "neighbors": {
    "b.user-store": { "mission": "...", "provides": [...] }
  },
  "dont_use": ["eval()", "MD5"],
  "lessons": ["JWT secret via env, never hardcoded"],
  "patterns": ["bcrypt with cost=12"],
  "_meta": { "size_bytes": 12340, "estimated_tokens": 3085 }
}
```

Pack size in current code is **3–12K tokens**, and that's fine — not "we failed to hit 1–2K." No `CLAUDE.md` of 4800 tokens on every turn, no full chat history — only what's needed **for this block in this task**. The pack reports its own size (`_meta.estimated_tokens`), and the tool warns when the pack is obviously bloated (e.g. `patterns.md` got out of hand).

Further optimisation (S-4 in roadmap) follows not "fit into 2K" but **selective neighbour traversal**: for one task you only need to read the backend neighbour, for another only the UI contract, for a third all five neighbours. The decision of *which* neighbours to load and *how deeply* should be made the way a human would — by task type. That's the right path to a smaller pack, not a naive size cap.

A second consequence of the "context per task" principle is **two phases of work, two context modes**:

- **Design phase** (new blocks, synthesizing from a transcript, restating a mission). Context is wide: product mission, all blocks, overall connections. You can't economise here — otherwise the agent misses an important relation and proposes an inconsistent block.
- **Execution phase** (the agent codes a specific todo block). Context is narrow: the block itself + 1–2 relevant neighbours + lessons. Noise hurts here.

Sima Atlas currently uses one pack for both phases; mode separation is task `S-4 context-pack profiles`.

### Principle 5. One agent — one block at a time

This is the opposite of Auto-Mode. When the operator wants to "add a new feature," the system:

1. Proposes one to three blocks (via the `synthesizeBlock` LLM call).
2. The operator accepts (or writes them by hand).
3. The agent picks **one** block and codes **only its files**; the cursor-hook drift-guard catches violations.
4. That block's acceptance runs separately.
5. Only then — the next block.

Multiple agents can work in parallel **only if their blocks don't intersect via `depends_on`/`provides`** — the graph knows.

### Principle 6. The visual canvas is *the* truth

Not Notion, not Excel, not a separate architecture document. **The graph is the architecture diagram, the kanban, the new-hire onboarding, and the progress view, all at once.** You glance at it: 8 blocks done, 2 progress, 1 todo, this one has acceptance failing on A2.

---

## Part 2.5. Why these principles — and not others <a id="why-these-principles"></a>

The six principles above are not "what we felt like." Each is chosen against a specific alternative that's popular in the industry but **systematically delivers bad results at scale**. If anyone forks or extends the concept, it's important to understand **what cannot be cut**.

### Why the contract is primary, not the code

**Alternative:** the agent works directly with code and comments. This is the default in today's Cursor / Claude Code.

**Why it's bad.** Code describes "how," not "what and why." When you give the agent only code, it reverse-engineers intent — and is often wrong. "This function returns `null` — probably means error" (when it's actually deferred initialisation). A contract (mission + acceptance) doesn't have this ambiguity: "the function returns session-token; null means not-authenticated; acceptance criterion A1 tests for it."

**Why it matters.** Without a contract the acceptance loop is impossible. Without an acceptance loop autonomy is impossible. Without autonomy the rest of the chain (auto-docs, drift detection, lifecycle gates) collapses. This is the **root principle**; the other five rest on it.

### Why the graph holds the connections, not the developer

**Alternative:** connections live in the developer's head and in `README.md`.

**Why it's bad.** Human working memory holds 7±2 items at a time. On a fifty-block product that means **80% of the connections are held by nobody**. You change A, accidentally break a non-obviously-connected B, and find out three weeks later in production.

**Why it matters.** The connection graph delivers three things you can't get otherwise: (1) impact analysis before a change; (2) drift detection when a capability breaks; (3) cross-cutting transactions, in which the agent traverses **only** affected blocks, not "the whole repo just in case." This solves not "convenience" but the very mechanism by which long sessions fall apart: **loss of cohesion**.

### Why the acceptance loop, not "tests passed"

**Alternative:** "done = tests passed," tests written by the same agent.

**Why it's bad.** The agent has a direct economic incentive to write tests that flatter its own implementation. This isn't malice — it's gradient descent in any LLM. Ask the model to "write a test for this code" and you'll get a test that passes on this code. It won't catch the bug.

**Why it matters.** Acceptance with deterministic evidence collectors (exit_code, fs_glob, log_grep, file_diff, selftest_run) is **an independent referee**. They check assertions written **before the code**, and they check them **externally** (a real process's exit, a real file's existence). LLM-judge is the last line, not the first. Tri-state pass/fail/inconclusive eliminates "silent false-pass" (the worst class of bugs). Without this, no autonomy — it's just a faster path to garbage.

### Why typed memory, not one CLAUDE.md

**Alternative:** one `CLAUDE.md` for everything ("don't use eval, always use bcrypt, we're a SaaS, ...").

**Why it's bad.** It bloats nonlinearly. Every read — all 4800 tokens. After a month there are forty contradictory rules, and the LLM carefully ignores them. The "73% tokens leaked" viral post attributes 14% to exactly this — and it's the cheapest piece to fix.

**Why it matters.** Typed memory (`lessons / dont_use / always_use / patterns / archetype`) enables **selective loading**: for the current block the agent sees only relevant lessons, only relevant bans. This is mathematically a different regime: instead of "feed everything in every request" — "pick the right slice." Without this, even a perfect context-pack is wasted, because the prefix keeps bloating.

### Why precise context, not small or large

**Alternative A:** "compress everything into 1-2K, the agent will manage." **Alternative B:** "give it the whole repo, let it figure it out."

**Why both are bad.** "1-2K" is a guaranteed path to rework: the agent didn't see the neighbour's mission, wrote the wrong thing, rework costs 2-4× the first request. "Whole repo" hits Lost-in-the-Middle (Liu 2023): the model loses meaning from the middle of long contexts, plus cost grows quadratically without caching.

**Why it matters.** Precise context is a **dependent variable**, not a target. Size is chosen by task: design phase — wide; narrow fix — narrow. Selective neighbour traversal (S-4): for each task type, decide which neighbours to read fully, which partially, which to skip. This is **algorithmically a different formulation** than "minimise tokens."

### Why the canvas is the only truth, not separate documents

**Alternative:** Notion / Excel / `architecture.md` from 2024.

**Why it's bad.** Architectural documents diverge from the code by week two. Six months in they're lying — and both the agent and the human have forgotten. Notion has no auto-validation, no MCP integration, no connection to acceptance.

**Why it matters.** When canvas, contracts, and code live in one repository + the agent traverses through MCP — divergence **physically can't accumulate**. Every change either passes acceptance or doesn't. Every block is either in the graph or it isn't. A "Architecture v3" Notion page doesn't have this property: it can be stale and still look authoritative.

---

**What unites the six principles.** Each defends the system against a **specific failure mode at scale**: extracting intent from code (1), loss of cohesion (2), confirmation-bias of self-written tests (3), prefix bloat (4), Lost-in-the-Middle vs. trimmed meaning (5), drift between docs and code (6).

When we say "the concept matters more than the implementation" — we mean these principles. The actual code of Sima Atlas can be improved, simplified, rewritten; but if you remove any of the principles and replace it with a more "convenient" alternative, the system will sag exactly along that failure mode. **This is what we're handing to the market — directional vectors, not code.**

---

## Part 3. System architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  OPERATOR (human)                                                    │
│  ↕ visual canvas, composer, proposals panel                          │
└──────────────────────────────────────────────────────────────────────┘
       ↕ HTTP                                       ↕ MCP / CLI
┌────────────────────────┐               ┌─────────────────────────────┐
│  atlas_api_server      │               │  Claude Code / Cursor /     │
│  /atlas/blocks/*       │               │  Codex (external agent)     │
│  /atlas/proposals/*    │←──────────────│                             │
│  /atlas/sima/*         │  read_block,  │  → reads context-pack       │
│  /api/artifacts/*      │  fill-from-   │  → commits changes          │
└────────────────────────┘  chat,        │  → calls MCP tools          │
       ↕                    accept       └─────────────────────────────┘
┌──────────────────────────────────────────────────────────────────────┐
│  atlas/  (source of truth)                                           │
│  ├── graph.json                  (blocks + layers + positions + edges)│
│  ├── blocks/<id>/                (contracts, see Part 2.1)           │
│  ├── proposals/<ts>__*.json      (LLM proposals with verdict)        │
│  ├── operator_profile/           (lessons, dont_use, archetype)      │
│  ├── acceptance_runs/<id>/       (acceptance verdict history)        │
│  ├── context_packs/<id>.json     (deterministic slice for the agent) │
│  ├── llm_traces/                 (audit log of every LLM call)       │
│  ├── run_state/                  (cursor for chat-watcher etc.)      │
│  ├── WIKI.md / wiki.html         (auto-wiki)                         │
│  ├── auto_tz.md                  (auto-spec)                         │
│  └── roadmap.md                  (auto-roadmap)                      │
└──────────────────────────────────────────────────────────────────────┘
       ↑                                                ↑
┌──────┴──────────────┐                ┌────────────────┴────────────┐
│  LLM gateway        │                │  Acceptance verifier loop   │
│  cascade providers: │                │  parser → evidence collector│
│  anthropic →        │                │       → llm-judge fallback  │
│  google →           │                │  outputs: pass/fail/         │
│  claude_cli →       │                │           inconclusive       │
│  mock               │                │                              │
└─────────────────────┘                └─────────────────────────────┘
```

### Layer 1 — `atlas/` as the source of truth

Everything the system knows about the product lives on disk in plain text. Which means:

- **Git-diffable.** Every change shows up in normal `git diff`.
- **Backup-safe.** No databases, no vendor lock-in.
- **Tool-compatible.** Any Python/Node/Bash script just works.
- **Multi-tenant.** Multiple projects live under `atlas/clients/<id>/`. Graphs and proposals are strictly partitioned; the nightly run and some global validators currently still walk the root atlas — full isolation is on the roadmap (T-1).

### Layer 2 — API server (`scripts/atlas_api_server.mjs`)

REST routes around `atlas/`. Main groups:

- **Graph operations:** `POST /atlas/blocks/{create,patch,delete}`, `POST /atlas/edges/{add,delete}`. All go through `atlas_blocks_api.mjs`, validate contract format, and audit the trace into `checks.log`.
- **Acceptance:** `POST /atlas/acceptance/verify` (one block) / `POST /atlas/acceptance/verify-all`.
- **Sima orchestrators:** `/atlas/sima/fill-from-chat`, `/atlas/sima/watch-chats`. Entry points for "take this transcript and fill the schema."
- **Proposals:** `/atlas/proposals/list?client=X`, `POST /proposals/{accept,reject}`. Multi-tenant aware.
- **Artifacts:** uploading documents / references with auto-splitting into blocks.

All endpoints return `200 + {ok: false, error}` instead of HTTP 4xx — this avoids CORS-mangled errors, simplifies the UI, and gives a uniform error contract.

### Layer 3 — UI (`Sima (Remix)/atlas_design/`)

A React canvas with drag-and-drop blocks, coloured layers, status filters, predictive validation. Under the hood — plain SVG + React hooks, no Redux. Data source: `data_loader.js` polls the API and keeps `window.SIMA_DATA` fresh.

Key invariant: **the UI computes nothing about the graph beyond rendering**. All validation, drift checks, acceptance — server-side. The UI is a "pretty viewer for `atlas/`."

### Layer 4 — LLM gateway (`scripts/llm_gateway.mjs`)

A single point for every LLM call in the system. Supports a cascade of providers:

```
ATLAS_FORCE_MOCK_LLM=1 ────────────┐ (option: nightly / CI / determinism)
                                    ↓
   pickProvider:                  mock
   ┌─────────────┐
   │  anthropic  │ ← API_KEY        ─→ if key is present
   └─────────────┘
   ┌─────────────┐
   │   google    │ ← Vertex AI      ─→ if key is present
   └─────────────┘
   ┌─────────────┐
   │ claude_cli  │ ← claude CLI     ─→ user's Claude.ai (Pro/Max)
   └─────────────┘                       subscription — NO API key!
   ┌─────────────┐
   │    mock     │ ← deterministic  ─→ always available
   └─────────────┘
```

This is critical for open-source distribution: the user **doesn't need to buy an API key**. If they already have a Claude.ai/Cursor subscription, they use it via the CLI; the provider is auto-detected via `claude --version`. That's the "zerocost" mode. Paid keys are for those who need parallelism or speed.

Beyond provider cascading, the gateway also gives:

- **Schema-aware retry.** Requests with a JSON schema retry with "return JSON matching this schema"; the fallback parses ```json fences or the first balanced object.
- **Audit trace.** Every call writes to `atlas/llm_traces/<ts>.json` — for post-hoc analysis, eval datasets, and debugging.
- **Cost tracking.** Per-million-token pricing computed live; usage metrics return alongside the value.

### Layer 5 — Acceptance verifier loop (`b.acceptance-verifier-loop`)

The system's most important "police officer." Algorithm:

```
parse_acceptance(block_id)            # parse acceptance.md → assertions[]
    ↓
for each assertion:
    if assertion.evidence_kind ∈ {exit_code, fs_glob, file_diff,
                                   log_grep, selftest_run}:
        verdict = collect_evidence(...)         # deterministic
    elif assertion.evidence_kind == 'llm_judge':
        verdict = judge_assertion(...)          # LLM judge with reasoning
    else:
        verdict = 'inconclusive'                # better explicit than silent pass

aggregate verdicts → block_verdict ∈ {pass, fail, inconclusive}
write atlas/acceptance_runs/<block_id>/{<ts>.json, _latest.json}
```

If even one assertion is `fail` or `inconclusive` — the block is not considered done.

`Inconclusive` is a unique feature. Most acceptance frameworks emit binary pass/fail, which produces fake passes. Sima Atlas honestly says "I have no evidence." The operator sees this and either adds an `evidence_spec` or wires up `llm_judge`.

### Layer 6 — Operator profile (`b.operator-profile-learner`)

Accumulates the "operator's personality" from their actions:

- **archetype:** "explorer / pragmatist / perfectionist / shipper" — derived from the ratio of `idea→todo→progress→done` transitions.
- **lessons:** "don't use eval," but only if there are ≥ 2 evidence items (links into `checks.log`) — to filter out one-off complaints.
- **dont_use:** hard bans (`eval`, `MD5`, `cdn.tailwindcss.com`) with reasons. The pre-commit validator `validate_dont_use_compliance.mjs` runs in nightly and flags conflicting proposals; an interactive cursor-hook that blocks the command at execution time is in development (S-3 in the roadmap).
- **always_use:** canonical defaults (`language=typescript`, `runtime=node`, `db=postgres`).
- **patterns:** dev environments, typical builds, flows.

This whole structure gets embedded into the block's context-pack — the agent sees "operator always uses TypeScript, dislikes eval, recently learned about a CSRF problem" and doesn't repeat those mistakes.

### Layer 7 — MCP / Agent integration (`scripts/mcp_atlas_server.mjs`)

65 MCP tools cover everything an agent needs to do with `atlas/`:

- `read_block(block_id)` — reads all files of a block.
- `list_dependencies(block_id)` — who refers to what.
- `update_block(block_id, ...)` — atomic contract patch.
- `sync_check()` — runs all validators.
- `verify_block_acceptance(block_id)` — runs the acceptance loop.
- `build_context_pack(block_id)` — assembles a context-pack per Principle 4.
- `sima_fill_from_chat(transcript)` — takes a transcript, extracts insights, fills contracts, proposes new blocks.
- `sima_watch_chats()` — scans Claude Code sessions (`~/.claude/projects/`), pulls in fresh content, drops a plan into `proposals/`.
- `accept_proposal(proposal_id)` / `reject_proposal(proposal_id, reason)` — UI flow for plans.

The agent in Claude Code or Cursor connects to the MCP server and gets these tools as if they were local. You can tell the agent "sima, check the chats" or "sima, fill the schema from this conversation" — it'll figure it out.

### Layer 8 — Auto-artifacts

Generated from the same contract:

- **WIKI.md / wiki.html** — structured documentation across all blocks.
- **auto_tz.md** — a technical specification for an external contractor.
- **roadmap.md** — what's in work, what's left.
- **user_docs** (`b.user-docs-generator`) — end-user tutorials written in "user language" via JSX introspection (which buttons, which inputs).
- **Playwright screenshots** (`b.user-docs-generator + canvas_screenshots.spec.ts`) — actual canvas screenshots for documentation; help the agent "see" the screen without launching a browser.

This isn't manual work: each of these artifacts is regenerated by `nightly_consolidation` and validated by selftests.

---

## Part 4. Block lifecycle

```
   IDEA           TODO            PROGRESS          REVIEW           DONE
    │              │                  │                │              │
    │              │                  │                │              │
    ▼              ▼                  ▼                ▼              ▼
 "appeared      "contract        "agent codes     "acceptance     "operator
  on canvas,    agreed,          its files only,   green,          confirmed;
  mission       acceptance       drift-guard       awaiting        block is
  weak,         defined,         catches strays;   manual          canonical"
  no KPI"       depends/         pack ≤ 2K        review by
                provides         tokens"           operator"
                wired"
```

Between statuses there are **recommended gates** (the UI composer hints at them; in v0.x they're soft — the status transition isn't blocked by a validator, but the composer shows "mission too short, fill it before promoting"):

- `IDEA → TODO` — mission ≥ 80 chars, ≥ 1 KPI, ≥ 1 acceptance assertion.
- `TODO → PROGRESS` — `depends_on`/`provides` wired to real neighbour capabilities.
- `PROGRESS → REVIEW` — the acceptance loop returned `pass` for most assertions.
- `REVIEW → DONE` — operator confirmed.

Every transition appends a line to the block's `checks.log`. The nightly `verify_done_blocks_still_green` makes sure blocks in `done` **stay** green — otherwise they're auto-flipped back to `regression`. A hard-blocking version of gates is on the roadmap (S-2: `enforce_lifecycle_gates`).

---

## Part 5. What changes

### For the solo developer

"You don't have to keep the product in your head" — because the product is **physically on the screen**. Come back to a project after two weeks — one glance at the canvas and you see: 8 blocks done, 1 progress, 1 todo. Click a block — see what it does, what's left, who needs it. Open `decisions.log` — see which architectural choices were already made, and why.

### For the AI agent

Context is **precise, not short**. Each request is:

- **a context-pack** for the current block (typically 3–12K tokens today; selective neighbour traversal is on the roadmap, so a narrow fix gets a smaller pack naturally, while design phase keeps it wide);
- + the operator profile's `dont_use` / lessons / patterns (≤ 1K);
- + the prompt itself.

No `CLAUDE.md` of 4800 tokens on every turn. No "full chat history." No 12 MCP tools "just in case" — the agent sees only the tools relevant to the block.

And most importantly — **rework drops dramatically**. This is what doesn't show up in the 73/27 token-leak ratio, but it's the dominant factor on a serious product (see Part 6.1).

### For the team

Multiple agents / developers can work **in parallel on different blocks**, and the graph stops them from intersecting via `depends_on`/`provides`. The drift-guard catches anyone reaching into someone else's block without justification.

### For the market

Vibe coding becomes an engineering discipline — without losing speed. Open-source code and the MCP protocol mean any tool (Claude Code, Cursor, Codex, your future hypothetical "AI Studio") can plug in and work with the same graph.

### For the end user

Documentation, tutorials, and — over time — marketing collateral become **a side-effect** of development. The mere fact that each block has a mission and a user_story means we know how to explain its existence to a human.

- **Technical docs** (WIKI, spec, function index) — generated directly from the contract, always in sync with code.
- **User-facing tutorials** ("click here to do X") — assembled from `mission` + JSX UI introspection (`b.user-docs-generator`); already working.
- **Marketing materials** (landing, deck) — a second LLM pass over structural docs plus `product/positioning.md`. That's the **S-5 skill** in the roadmap; see Appendix B.5 for limits of the achievable.

The point: documentation stops being "the separate task there's never time for." If a block exists, it has a mission, KPI, and acceptance — that's enough for technical docs and user tutorials today, and enough for a marketing-narrative wrapper in S-5.

---

## Part 6. The three effects this is all aimed at

Sometimes it helps to drop the architecture and ask: aimed at what? We have three measurable goals — and the whole product stands or falls on how well it hits them.

### 6.1 Lower the cost of AI development

Every LLM call is money (an API key) or quota (Pro/Max subscription). On long sessions both run out faster than you can do anything useful.

The main source of waste is **rework**. The viral 73%-leak post barely discusses it, but it's fundamental. When the agent did the wrong thing (because it didn't see an important detail in a neighbour's mission, or got snagged on a stale rule in a bloated `CLAUDE.md`), rework costs **multiples more** than the original task:

```
original task:                   prompt P + answer R
   │
   ↓ result didn't fit
rework:           prompt P′ ⊃ P (old + explanation of what's wrong)
                + re-reading what was done
                + analysing the error
                + answer R′ (often longer because it explains the fix)
```

Roughly: rework eats 2–4× the original budget. If 30% of your requests go to rework — total token spend grows not by 30%, but by 60–120%. So **"saving" 1500 tokens on the first request by trimming a neighbour's mission usually means spending 4–8K on rework plus your time** (salary, opportunity cost — those are also money). A contract-oriented context-pack saves not "input tokens," it saves **rework**.

Counterexample from current practice: a long session with a bloated `CLAUDE.md` × 30 turns = 144K leaked per session, just on the prefix, before counting redos. A contract-oriented pack 5K × 30 turns = 150K, but **they're relevant**: the agent lands on target the first time and rework is rare.

Additionally — the **claude_cli provider** lets you work without an API key at all: a Claude.ai Pro (or Cursor Pro) subscription is auto-detected via `claude --version` or an equivalent CLI. You paid for the subscription — you use Sima as its frontend. Commercial users can keep `ANTHROPIC_API_KEY` alongside for speed — but it's optional, not a requirement.

And finally — local models (Part 7.1) drive operational cost to zero for those with the hardware. That's the endgame of "lower the cost": cloud providers stay for quality, local models for everyday tasks where Llama 3.3 70B or Qwen Coder 32B is enough.

### 6.2 Reduce AI hallucinations

The agent hallucinates when it has no firm anchor to verify against. "Write a notification service" — it'll write anything. "Write a notification service whose mission is X, whose KPIs are Y, whose acceptance is Z, depends_on `[user-store, ext-email]`" — the space of "plausible but wrong" answers shrinks dramatically.

Then the acceptance loop kicks in: every "it works" is backed by **evidence** — a test's exit code, a file's existence, a log grep. If the LLM produced a "plausible but non-working" patch, the evidence collector catches it. Not via review, not via tests-the-LLM-wrote-itself, but via a deterministic collector that doesn't answer to the LLM.

The LLM judge is invoked only when deterministic checks aren't enough (e.g. "does the block's mission actually reflect what the code does"). At that point the agent calls another model as an independent referee — yet another layer of hallucination defence.

### 6.3 Open the path to autonomous development

If you have a graph of contracts and an acceptance loop, you're **no longer obligated** to eyeball every change. The agent can:

1. Open a block in `todo`.
2. Read the context-pack.
3. Write a patch.
4. Run the acceptance verifier.
5. If pass — flip the block to `review` and pick the next block.
6. If fail — try again; after three consecutive failures — flag the block as problematic and leave it for the operator.

This isn't "AGI writes your product for you." It's closer to CI/CD: **routine** is automated (write code from a clear spec, run tests, hit the linter), and the operator stays as **architect and acceptor** — they create blocks, formulate missions, set KPIs, accept or reject results. Put differently, we raise the bar of "what the human must do by hand" from per-commit to per-decision-of-whether-to-do-it-at-all.

Fully autonomous mode is in roadmap (**V-1 agent-loop daemon**) — the foundation is already there: graph + contracts + acceptance + soft gates + `inconclusive` verdict. On it you can build any level of autonomy, from conservative "ask the human at every gate" to aggressive "work overnight on your own."

Where human touchpoints remain even in maximally-autonomous mode (see Appendix B.6 for the detailed breakdown): architectural principles not derivable from acceptance (closed by **S-6** via `architecture_decisions.md`); production bugs of the "didn't think to specify" variety (closed by **V-3** production-monitor); architectural pivots — moving to a new stack / multi-tenant / a different backend — are always human work. Between those points, the machine.

---

## Part 7. Local models, sandboxes, and the second tool

Sima Atlas currently relies on "cloud" LLMs (Claude Sonnet/Opus, Gemini, GPT through an adapter). That gives quality but imposes constraints: network dependency, privacy, cost. Where we want to go:

### 7.1 Local models as first-class providers

Hypothesis: for most Sima tasks — **insight extraction, weak-field filling, drift-judge** — a mid-tier local model in the class of **Llama 3.3 70B**, **Qwen 2.5 Coder 32B**, or **DeepSeek V3 (via Ollama)** is enough. Such models:

- run on a single 24–48 GB GPU or a modern Mac with unified memory;
- return an answer in 1–3 seconds on an M3 Max;
- cost $0 operationally;
- work without a network.

What needs to happen:

- add an `ollama` / `vllm` / `lm-studio` provider to the LLM gateway cascade (~150 lines of code, drop-in after `claude_cli`);
- assemble an eval dataset from `atlas/llm_traces/` over the last month and benchmark local models, so we know the quality floor;
- cache the context-pack prefix (it's stable across turns on one block) — that gives 5–10× speedup for all providers.

Goal: **the "zero-cost / zero-latency" mode**, in which an enthusiast with a working Mac or an RTX 4090 can develop a whole product without a single outbound API call.

### 7.2 A coding shell that runs local models

Claude Code and Cursor are great shells, but they're tied to specific cloud models. We need somewhere to test the local-models hypothesis — hence the roadmap item **U-2: "Sima Shell"** — a lightweight MCP client optimised for local models:

- works with any model via Ollama / OpenAI-compatible API;
- has a built-in chat interface with Sima Atlas tool support;
- knows how to do cheap "idle moves" (formatting, renaming) on a small model and complex ones on a large model;
- treats the context-pack as a first-class object, not stuffed into a free-form system prompt.

This turns Sima from "a tool for working with an agent" into "a full stack for AI development," where even the agent runtime is ours.

### 7.3 Where Sima lives — and why we're open-sourcing Sima Atlas

To not confuse the reader, here's the layout:

- **Synlabs** — our company.
- **Tessent** — our main product at Synlabs (commercial).
- **Sima** — an internal idea born as part of Tessent: a set of principles and tools for keeping AI development from falling apart at scale. Sima may stay inside Tessent, or may at some point become open-source — we're open to either path.
- **Sima Atlas (this repository)** — the open-source incarnation of the "contract-first AI coding" concept. We took a portion of Sima's ideas, built it as a separate standalone product, and **published it for the concept** — so the industry has a working prototype of what AI development should look like, in our opinion.
- **Sima Core** — a runtime layer of memory and principles for the agents themselves. Currently developed **inside Tessent**. May become open-source later (as Sima Atlas did), or may stay part of Tessent — that decision is open.

| | Sima Atlas | Sima Core |
|---|---|---|
| Where it lives | this open-source repo (MIT) | inside Tessent (Synlabs); open-source — possibly, later |
| For whom | the human developer | the programmer agent |
| Artifact | a graph of contracts on the canvas | a stack of principles and episodes in memory |
| Goal | ship a product to production with an AI agent | make the agent itself more responsible and predictable |
| When you need it | when developing any product | when the agent works long and/or autonomously |

They work together: Sima Atlas tells the agent **what** to do (the block contract); Sima Core tells it **how** to think about the work (principles, episodic memory, decision lineage). If we ever open Sima Core, both tools will close two sides of one problem: the external product contract (Atlas) + the agent's internal discipline (Core). For now, you have Atlas, and that's enough to genuinely change how you work with Cursor / Claude Code / Codex.

---

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

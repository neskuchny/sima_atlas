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

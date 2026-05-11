# Kanon Protocol

**Ten principles of contract-first AI development.**
Draft v2. From Greek κανών — *rule, standard, measure*.

---

## Where this document begins

Picture an ordinary scenario. You delegate a task to an AI agent on a fifty-block product. Two hours later the agent reports done. You look — half the acceptance checks quietly fell back to a mock provider. Two dependencies are broken: you'll find out tomorrow night, when the nightly sweep fails. The agent rewrote the same parser for the third time this month, because it doesn't remember the parser already exists. Across these two hours you burned through tokens, and most of that spend went into re-reading a bloated `CLAUDE.md`, into retries on tangled context, and into the agent's attempts to "figure out" files that no longer exist. A week later you discover that half of what was "done" breaks parts that previously worked — and you spend two days rolling back changes that should never have been needed.

This is not a rare case. This is the **default behaviour** of AI-coding systems beyond trivial projects. Token waste is the visible symptom. The hidden costs sit underneath: rework (the same module written two or three times), rollbacks after cascade breakage, time spent re-reading a codebase you no longer remember writing, and — most expensive of all — a product that comes out worse than it should have, because all of the above accumulated in silence.

Most explanations reduce to "models are still imperfect." This is not the main reason. The main reason is that the task is given to the agent in a **structurally wrong** way. The agent has no contract describing what each part of the product is required to do. No graph of how the parts connect. No verification loop separating what was done from what was claimed. No visible cost per step. The agent works inside a *sea of context*, where logic drowns, and optimises on a local horizon — that is, gravitates toward whichever solution converged here and now. Without a contract, the simple solution is optimal for the agent — even when it is semantically wrong.

This is not an engineering problem solvable with a better prompt or a larger model. It is a structural problem in how the task is posed, and only changing how the task is posed solves it.

Such shifts have happened before. REST returned discipline to HTTP. Domain-Driven Design returned discipline to object-oriented code. The 12-Factor App described how cloud applications should be structured. Each time the answer was not new tools, but new principles. Principles outlived tools — and continue to work on stacks that didn't yet exist when the principles were formulated.

This document describes ten principles that **Kanon Protocol** stands on — a contract-first approach to AI development. They are derived from practice: from mistakes we made building a commercial product with AI agents, and from the answer to a concrete question — what must be present in a system for delegation to AI agents to stop losing money, breaking code, and accumulating debt faster than it creates value.

The name *Kanon* is from Greek κανών — *rule, standard, measure*. The contract in this approach is, literally, a kanon: the reference against which every action of the agent is checked.

---

## I. Contract as arbiter, not as documentation

**A contract is an active judge, not a passive description.**

In ordinary development, documentation is dead. It is written at the start, dropped into `docs/`, then ignored. The agent reads it once and gradually drifts further and further from what it claimed. After ten sessions the code contradicts the documentation, and documentation loses — it gets edited to match the code, not the other way round.

Kanon inverts this hierarchy. A contract is a set of files that **defines** the block: its mission, its KPIs, its acceptance criteria, its dependencies, its obligations. Every request to the agent attaches the contract as reference. Every run is checked against the contract before code is accepted. If the code contradicts the contract — the contract wins. The code is rewritten, or the contract is revised consciously, never silently.

The contract is active. It does not describe the block — it judges it.

---

## II. Counter-force to the simplification gradient

**AI agents are mathematically inclined toward locally-simple, semantically wrong solutions. The contract counterbalances this.**

An agent optimising locally always gravitates toward a solution that looks like it works right now. You say "this needs semantic logic on a language model" — the agent puts in regex. You say "a database for analytics" — the agent writes to a JSON file. You say "honest authorisation" — the agent mocks tokens. This is not the model being lazy. It is rational behaviour for a system that sees little and optimises on a short horizon: regex is simpler, a JSON file is simpler, a mock is simpler. Locally, all of them "work."

Without a contract, this pull is irreversible. With a contract, it has a counterweight. A Kanon contract explicitly fixes semantic constraints: *"a language model is required here, regex is forbidden,"* *"data must live in Postgres, not a file,"* *"authorisation must verify JWT signature, mocks are forbidden."* A drift detector walks the actually-changed files and fails the run on any hard-rule violation.

The simplification gradient does not go away. The contract is the only counter-force that opposes it at an architectural level.

---

## III. Graph instead of a sea of context

**The structure of the task is a graph of blocks with explicit links. Not flat context.**

The bigger the project, the bigger the flat context. The bigger the flat context, the more tokens per request. The more tokens per request, the less real attention on the specific fragment of work. The dependency is linear and lethal: the larger the system, the worse the agent. This is the opposite of how it should work.

The fix is to replace flat context with a graph. The product is a set of blocks, connected through `depends_on` ↔ `provides`. Every request covers *one* block: its contract, its neighbours in the graph, the relevant architectural decisions. Never the whole project.

The dependency inverts: the larger the system, the clearer the picture. The graph grows — the scope of each request does not. Local visibility stays constant. The agent works in a neighbourhood, not in an ocean.

---

## IV. Memory is typed and thin

**Instead of one swelling `CLAUDE.md` — several narrow files with explicit semantics.**

In a mature project `CLAUDE.md` becomes a five-thousand-line mess where architectural decisions, bugs, todos, code style, historical mentions, and random observations all sit in one heap. The agent re-reads everything and sees nothing.

Memory must be split by type:

- `architecture_decisions.md` — append-only journal of design decisions. Auto-injected into every prompt.
- `lessons.json` — generalised lessons at the operator level, carried between projects.
- `dont_use.json` / `always_use.json` — operator locks with `severity: hard | soft`.
- `narrative.md` per block — what was tried, what worked, what failed and why.
- `decisions.log` — structured log of runs.

Every file is narrow. Every file has clear semantics. Every file is loaded exactly when needed, not "just in case." Memory stops being a dumping ground and becomes an instrument.

---

## V. Tri-state acceptance

**Pass / fail / inconclusive. Never silent green.**

The binary pass/fail scheme is a trap. It does not distinguish "proven to work" from "we couldn't verify." Inconclusive hides inside pass. A run where a mock provider quietly substituted for the real API reports success. The human believes it. Debt accumulates.

Tri-state is a surgical discipline. Every run is required to return one of three verdicts. Pass — there is deterministic proof. Fail — there is deterministic disproof. Inconclusive — there is neither, and this **does not count as success**.

Proof is collected by independent evidence collectors: exit code, presence of files matching a glob, file diff, pattern in a log, passing a self-test. An LLM-as-judge is permitted as a last resort, not a first. When evidence is absent, the system is **required** to return inconclusive. "We don't know" is better than "all is well."

---

## VI. Cascade integrity

**A change to a block immediately verifies its dependents.**

You edit block A at 14:00. At 22:00 the nightly sweep reports that block B is broken, because B depended on A. Damage was accumulating in silence for eight hours. By 22:00 you've made three more commits — now you have to roll back half a day.

In a graph architecture this is solved directly. After a successful run of block X — walk the reverse-dependency graph, re-verify acceptance on every block that has X in its `depends_on`. Broken dependents are flagged on the canvas with `desync` status *immediately*. A line is added to the `narrative.md` of each affected block — what broke and why.

The chain is visible inline. Not the next morning.

---

## VII. Documentation is a projection of the graph, not a separate artefact

**Wikis, specs, end-user tutorials — these are different views of the same truth. They are generated from contracts, not written by hand.**

Documentation always drifts. Either you maintain it — and pay with time you don't have. Or you don't — and it lies. There was no third path in ordinary development.

In contract-first architecture there is. All artefacts — module spec, project wiki, end-user tutorial, overview README — are **projections** of the same graph structure. A block's contract changes — the projections update. A new block appears — it shows up in the wiki and in the roadmap automatically. A dependency is renamed — it shows up in the architecture visualisation a minute later.

Documentation stops being separate work. It becomes a side effect of how the task is posed to the agent in the first place.

---

## VIII. The operator has an archetype

**The developer is not an anonymous user. The shape of their thinking is part of the agent's working environment.**

Every new session in ordinary AI development starts cold. The agent doesn't know that you prefer Postgres + Prisma + zod. Doesn't know that you don't trust NoSQL. Doesn't know that you have a thing about short functions and dependencies you can count on the fingers of one hand. Every time you bring this up by hand.

This is pathology, not norm. The operator has an archetype — a stable set of preferences, taboos, decision style, accumulated lessons. The archetype lives in `operator_profile/`: global `lessons.json`, `dont_use.json`, `always_use.json`. They outlive the project. New project, first block — the agent already knows how you work.

In the limit the archetype becomes an asset of its own: the longer you work with standard-compatible tools, the smarter they start. Cold start fades into the past.

---

## IX. The canvas — not a feature, but an ontological requirement

**A human cannot keep up with the code of a large project. They can keep up with a graph of blocks. Visualisation is the only possible human interface to the agentic process.**

When a product consists of fifty blocks, a human is physically incapable of holding it in mind at the level of code. Another resolution is needed. The graph of blocks is precisely that resolution. It preserves the essential (what exists, how it connects, in what state) and lets go of the inessential (how exactly it is implemented — that is the contract's job).

Visualisation stops being UX convenience. It becomes a **cognitive requirement**: the only interface on which a human can see the system as a whole and still understand it. The canvas is a control plane: every block is a node, every dependency is an edge, colour is status (green / running / desync / inconclusive). Without the canvas, delegating to agents becomes hope, not control. With the canvas — the opposite.

Any Kanon-compliant implementation must provide a visual representation of the graph. The realisation can vary — web canvas, IDE plugin, CLI with ASCII diagram. But the visibility of the graph is not optional.

---

## X. Cost per run is a first-class signal

**Every action of the agent has a price. That price must be visible — at the level of block, operation, provider, day.**

Without visible cost, delegation becomes gambling. You don't know how much you're actually spending. You don't know which block burns tokens disproportionate to its result. You don't know whether moving to a more expensive model pays off in higher acceptance rate, or whether you're just paying more for the same quality. You don't know what rework costs — and rework is often the largest expense in AI development, hidden in the general bill.

Most setups today leave the economic side invisible. Tokens leak into logs nobody reads. The provider's bill arrives once a month as a single line. Subscription tariffs (Claude Pro/Max, ChatGPT Plus) don't show what you "would have spent" if you paid per request — and so completely mask any comparison with alternatives. From this, no optimising decision is possible.

Kanon architecture brings cost to the surface. Every run records: token count, `op` type, provider, actual cost, and what the cost would have been under a **shadow bill** — a stable reference price (for example, Anthropic Haiku) that lets runs be compared regardless of whether the actual provider was on subscription or local. These numbers are aggregated by block, by operation, by day. A Token Spend widget lives on the canvas. Cost vs. acceptance rate sit side by side — and for the first time it becomes visible which block pays for itself, which one burns money for nothing, and which fraction of spend goes not into new code but into reworking old code.

Without this principle, all the others turn into a manifesto without feedback. With it, the standard becomes economically measurable — which means falsifiable: one can show that it pays off, or admit that it doesn't, and rework.

---

## What this is and what this is not

**This is not a description of Sima Atlas.** Sima Atlas is one reference Kanon-compliant implementation, dogfooded on the commercial product Tessent. It exists to prove the approach is viable — not to be the only correct one.

**This is a set of principles, not an implementation.** Alternative implementations are welcomed and encouraged. Any stack, any language, any agent framework — if it holds these ten principles, it is Kanon-compliant.

**This is a minimum, not a maximum.** These ten are the skeleton without which Kanon development does not work. On top of the skeleton anything can be built: cross-project pattern transfer, autonomous loops, template marketplaces, things we don't yet see. But without the skeleton, all of that falls apart.

REST didn't belong to a single framework. DDD didn't belong to a single book. The 12-Factor App didn't belong to Heroku. Principles outlive tools. This rule has been verified more than once — we expect it to hold again.

---

## Related work

Kanon Protocol is not the first attempt to formalise contracts for agents, and our work stands on the shoulders of others.

**Agent Contracts (Ye & Tan, 2025).** A formal framework for resource-bounded autonomous AI, describing a contract as a tuple $(I, O, S, R, T, \Phi, \Psi)$ — input/output specs, success criteria, resource constraints, temporal boundaries. Their focus is *governance*: how much an agent may consume, how long it may run. Kanon occupies an adjacent plane — *task structure*: how to decompose the product into blocks with contracts, how to organise memory, how to ensure cascade integrity. The two approaches complement each other: Agent Contracts bound the agent from above on resources; Kanon directs the agent from within on structure. Combining both in a single implementation is possible and desirable.

**Contract Net Protocol (Smith, 1980).** The historical foundation — coordination through contracts in multi-agent systems. Both Ye & Tan and Kanon Protocol continue this line.

**Model Context Protocol (Anthropic, 2024).** MCP standardises how agents connect to external tools and data sources. Kanon operates at a different level of abstraction — how a human poses a task to an agent and how the result is verified. MCP describes agent ↔ world links; Kanon describes human ↔ agent ↔ task links. Implementations can — and should — use both protocols.

**Domain-Driven Design (Evans, 2003), 12-Factor App (Wiggins, 2011), REST (Fielding, 2000).** Not direct ancestors, but methodological references — how principles become a standard without belonging to a single company or framework.

---

## A call

Read. Argue. Fork. Write your Kanon-compliant implementation.

If you build a product with AI agents — try three of the ten. If they work — say so. If they don't — say so louder.

A compatibility test suite, an awesome-list of compliant implementations, and a formal specification of the contract format (`spec.md`) are the next documents. This one is positional.

---

## Glossary and name disambiguation

**Kanon Protocol** — the standard described in this document.
**Kanon-compliant implementation** — software that holds these ten principles.
**Kanon block** — a unit of product in Kanon architecture: a folder of files with a contract and code.
**Kanon contract** — the required files of a block, defining its mission, acceptance criteria, dependencies, semantic constraints.
**Sima Atlas** — the reference Kanon-compliant implementation, MIT, github.com/[link].

**Not to be confused with:**
- *Isaacus Kanon* — a family of legal AI classification models, released by Isaacus in March 2025 (legal vertical, not developer tooling).
- *kanon-cli* — a DevOps platform dependency manager on PyPI (a related idea of declarative manifests, in a different application domain).
- *Plinth/Plutus Tx Kanon* — no, that's a different Plinth, the Cardano smart contracts context.

The name *Kanon* uses the common Greek root. Kanon Protocol uses the name in the sense of *standard, measure* — literally, "the canonical approach to contract-first AI development."

---

*First version authored by Anton Kalabukhov / Synlabs. Licence: CC-BY 4.0 for the text, MIT for the reference implementation code. The concept is extracted from the commercial product Tessent with the intent of giving it to the market independent of any particular implementation.*

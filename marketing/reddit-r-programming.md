# Reddit launch — 3 разных подкаста, 3 разных tone'а

**Когда:** разнести на 3 разных дня (не в один). Reddit auto-modов триггерит кросс-постинг.
**Где сабмитить:** r/programming, r/LocalLLaMA, r/AI_Agents (примерно в этом приоритете)

---

## r/programming — primary focus: канон-as-arbiter

### Title

```
I built a verifier that catches when AI tools claim "done" but the implementation doesn't match the contract. Last night it stopped my AI agent 3 times in a row from falsely promoting work.
```

### Body

```
Open source, MIT: github.com/neskuchny/sima_atlas

Background: I've been building products with AI agents (Claude Code,
Cursor) for ~6 months. The failure mode that hurts isn't "wrong code"
— it's "AI claims it's done, you trust it, three months later production
catches what's missing".

So I built a system that makes that failure mode structurally impossible.

The core idea:

Every block (module) of the product is a directory with:
  mission.md      — why this block exists
  user_story.md   — who calls it, when
  kpi.md          — measurable goals
  acceptance.md   — what "done" means + evidence specs
  depends_on.md   — external interfaces consumed
  provides.md     — external interfaces exposed
  narrative.md    — past attempts, lessons, decisions

The agent reads this contract before touching code (via MCP).
Acceptance assertions carry deterministic evidence_kind:
  - exit_code    (a command exits 0)
  - fs_glob      (a file matches a pattern)
  - log_grep     (a log contains a regex)
  - file_diff    (a file change matches expectations)
  - selftest_run (a selftest passes)
  - llm_judge    (an LLM reads code + reasoning)

Critical rule (spec §3.2): llm_judge ALONE cannot mark a block "pass".
At least one deterministic check must also pass. This stops the "AI
graded its own homework" failure.

Last night I let the autonomous loop daemon run for 75 minutes against
the codebase itself. 4 iterations planned. Real Claude agent.

Result: 3 honest stalls, zero false promotions.

The agent shipped real engineering work — atomic file writes, schema
validation, block history snapshots, sync_report aggregation, a new
code-vs-contract drift detector. Then a second LLM (Gemini 2.5 Flash,
non-thinking) read the contract + the code + the neighbour blocks and
asked "does the implementation fulfill the mission's meaning?" — and
said "not on three of these".

The autonomous loop honored that verdict. No silent green. The work
is preserved on disk for the next iteration to pick up; the status
didn't advance.

The full overnight log:
atlas/autonomous_runs/v1-overnight-20260620T075444.log

Each verdict at:
atlas/blocks/<id>/semantic_review.json

The protocol behind it is published as a stand-alone manifesto with
RFC-2119 compliance:
github.com/neskuchny/sima_atlas/blob/main/kanon-protocol-manifesto-v2.1-ru.md

We're proposing it as a thing the industry can fork. Three levels
(Core, Cascade-aware, Cost-transparent). The reference implementation
recently passed its own Level 3 audit.

What's there today (v0.4.0):
- ~70 MCP tools (Claude Code is reference; Cursor/Codex/Continue/Zed
  configs documented)
- 6-provider LLM cascade including claude_cli (free with your Pro/Max
  subscription) and ollama (local Llama/Qwen/DeepSeek)
- Downloadable desktop installer for Mac/Win/Linux (no terminal, no
  npm install)

Honest limits: This is 0.x. The judge isn't infallible — last night
it told me the agent's code lived in "another block's territory",
which was architecturally correct but stylistically blunt. The
protocol is at v0.1.1. I'd love a Kanon-compliant implementation in
another stack to test the spec.

Open to questions and criticism.
```

### Top comment prep (от автора)

> EDIT: To clarify in the comments — yes, I know this looks like over-engineering for a hello-world or a 5-file project. It's not for that. It's for the moment when your product has 50 blocks and the AI starts forgetting what block #12 was supposed to do. The 5-block ceiling for AI-coding is the problem this solves.

---

## r/LocalLLaMA — primary focus: offline + ollama + claude subscription

### Title

```
Open-source AI-coding orchestrator with Ollama support — your local Qwen/Llama/DeepSeek can drive the whole thing, no API spend
```

### Body

```
github.com/neskuchny/sima_atlas (MIT)

I've been building a contract-first canvas for AI agents — every module
of your product lives as a directory with mission.md / kpi.md /
acceptance.md / depends_on.md, the agent navigates via MCP, and a
deterministic verifier checks each acceptance assertion.

Why this might be interesting for this subreddit:

The LLM gateway is a 6-provider cascade. The relevant ones for us:

1. **ollama** — opt-in via `LLM_PREFER_OLLAMA=1` env var. Defaults to
   `qwen2.5-coder:7b`, configurable via `LLM_OLLAMA_MODEL`. The whole
   system runs against your local Ollama daemon. No API cost, no
   network dependency past your own LAN.

2. **claude_cli** — uses your Claude.ai Pro/Max subscription via the
   bundled `claude` CLI, $0 marginal. Detected automatically if `claude`
   is on PATH.

3. **mock** — fully offline / deterministic for CI. ATLAS_FORCE_MOCK_LLM=1.

4. **anthropic** / **google** — for cases where you want the cloud,
   shadow-billed against Anthropic Haiku 4.5 list price so you can
   compare provider efficiency directly.

The agent run pipeline doesn't care which provider you used — same
contract, same verifier, same cascade. You can run a free Llama-driven
nightly and pay only for the semantic LLM-judge verdicts (~$0.02 per
verdict against Gemini 2.5 Flash, non-thinking).

Last night's full run on the codebase used real Claude (the operator's
subscription) for the agent work and Gemini for the judge. ~75 minutes
wall-clock, real engineering work shipped, 3 honest stalls when the
judge said "not enough yet". Log in atlas/autonomous_runs/.

I'd be especially interested if anyone here:
- Tries it against `qwen2.5-coder:32b` or `deepseek-v3:lite` and reports
  acceptance pass-rate.
- Has experience with vLLM or LM Studio — those adapters are pending
  (U-1 in the roadmap), should be ~80 lines each mirroring the ollama
  pattern.

Honest limits: Smaller local models (7B class) will sometimes generate
plausible-looking code that fails the deterministic verifier. The Sima
verifier loop catches it, but iteration count goes up. The system
gracefully degrades — `inconclusive` instead of false `pass`.

Downloadable installer for Mac/Win/Linux (Electron, no system Node
needed) — releases page.
```

---

## r/AI_Agents — primary focus: MCP + multi-agent

### Title

```
Show & Tell: 64-tool MCP server that lets your agent navigate a contract graph instead of a flat codebase
```

### Body

```
github.com/neskuchny/sima_atlas (MIT)

If you've been building with MCP for a while, you know the limit isn't
the number of tools — it's that tools without structured context devolve
to "agent guesses what to do next". The Sima Atlas MCP server fixes
that by giving the agent a CONTRACT GRAPH to walk.

The pattern:

Every module of the product is a directory under atlas/blocks/<id>/
with mission.md, kpi.md, acceptance.md, depends_on.md, provides.md,
narrative.md, decisions.log. The MCP tools include:

  read_block(block_id)
  list_dependencies(block_id)
  build_context_pack(block_id, profile)  — bundles the right
                                            neighbours for the task
  verify_block_acceptance(block_id)
  cascade_verify(block_id)                — re-verifies all reverse-deps
  generate_full_bundle()                   — auto-doc projections
  sima_watch_chats(source)                 — pulls from
                                              ~/.claude/projects, ~/.codex,
                                              Cursor's state.vscdb
  ... ~58 more

The agent doesn't load the whole codebase. It walks the graph: read
b.docs mission → see b.docs depends_on b.db + b.core-sync → load THEIR
contract abstracts → work on b.docs. Context size stays bounded as
projects grow.

A semantic LLM-judge sits on top and asks "does the implementation
actually do what the mission promises?" — last, not first. Tri-state
(pass/fail/inconclusive). LLM judge alone can't promote a block — at
least one deterministic check (exit_code, fs_glob, log_grep,
selftest_run, file_diff) must also pass.

Reference integration for Claude Code is .mcp.json in the repo root
(picked up automatically). Cursor / Codex / Continue / Zed / Windsurf
configs documented in docs/integrations.md.

Real overnight run last night with `--agent claude` produced 3 honest
stalls. Loop honored the judge. Log + verdicts persisted to disk so
the next iteration's agent has memory of what failed before.

Curious if anyone here:
- Has implementations using a similar MCP-as-contract-store pattern
- Has tried multi-agent collaboration on a contract graph (one agent
  per block, parallelism)
- Wants to write a Kanon-compliant implementation in another stack —
  the spec is at kanon-protocol-spec-v0.1.md
```

---

## Hygiene для всех трёх

- **Не cross-post одну и ту же копию**. Reddit auto-mod это видит и оба банит.
- **Postoffer** в title должен матчить subreddit'у. Title для r/programming не подойдёт для r/LocalLLaMA.
- **Не использовать [Show HN] / [Show R] / [OC]** в title без явного требования сабреддита.
- **Сабмитить только когда онлайн** для первых 2 часов — Reddit ranking сильно реагирует на ранние комменты.
- На враждебный комментарий («this is just RAG with extra steps») — спокойный, substantive, технический ответ. Один. Не вступать в дебаты.

# Hacker News — Show HN submission

**Когда:** утро вторника или среды по PT, 8:30-9:30 AM. Утро понедельника — перегружено, пятница и выходные мертвы.
**Не запускать** в день анонсов OpenAI / Anthropic / Apple Keynote — задавит.

## Title

Покороче, фактично. HN ненавидит self-promotion заголовки.

```
Show HN: Sima Atlas – a contract-first canvas for AI coding agents
```

(Альтернатива, если первая не зайдёт через ~30 мин: `Show HN: I built a verifier that catches when AI tools falsely claim "done"` — но **не делай оба сразу**, это бан.)

## URL field

```
https://github.com/neskuchny/sima_atlas
```

## Text field (если HN попросит — большинство Show HN ОБЯЗАТЕЛЬНО с текстом)

```
Sima Atlas turns AI-coding into a visual graph of contracts.

Every block of your product lives as a directory: mission.md, kpi.md,
acceptance.md, depends_on.md, provides.md. The agent (Claude Code, Cursor,
Codex via MCP) reads them before touching code. 5 deterministic evidence
collectors check each acceptance assertion (exit_code, file match, log
grep, selftest, file diff). A semantic LLM judge — last, not first —
checks whether the implementation actually fulfills the mission's meaning.

Tri-state acceptance: pass / fail / inconclusive. The LLM judge cannot,
on its own, declare a block "done" — at least one deterministic check
must also pass (Kanon Protocol spec §3.2).

Last night the autonomous loop daemon ran on the codebase for 75 minutes
with a real Claude agent. 4 iterations planned. Result: 3 honest stalls,
zero false promotions. The agent shipped real engineering work (atomic
file writes, schema validation, block history snapshots, sync_report
aggregation, code-vs-contract drift detector). The semantic judge said
"not enough yet" on three of them and the loop honored that — no
auto-promote, no false done.

The full log is at atlas/autonomous_runs/v1-overnight-20260620T075444.log
in the repo. Each verdict is at atlas/blocks/<id>/semantic_review.json.

What's there today (v0.4.0):
- ~70 MCP tools for any agent that speaks MCP (Claude Code is the
  reference; Cursor + Codex + Continue + Zed + Windsurf integrations
  documented).
- 6-provider LLM cascade: claude_cli (uses your Claude Pro/Max
  subscription, $0 marginal), anthropic, google, openai (gpt-4o-mini at
  $0.15/$0.60 per Mtok, also what powers Codex CLI when configured against
  OpenAI), ollama (local), mock.
- Multi-source chat ingestion: ~/.claude/projects/, ~/.codex/sessions/,
  Cursor's state.vscdb. Turn any transcript into block proposals.
- Token economics aggregator with both actual cost and a stable shadow-
  bill so subscription vs API are comparable.
- Cascade verify on every edit — broken dependents marked status: desync
  inline.
- Article documentation is regenerated from graph.json as a nightly
  validator. The article cannot drift from reality.
- Downloadable desktop installer (.dmg, .exe, .AppImage). Electron, no
  system Node prerequisite. v0.4.0 release artifacts auto-attached by CI.

The protocol behind it is published as a stand-alone manifesto with
RFC-2119 compliance levels:
kanon-protocol-manifesto-v2.1-ru.md + kanon-protocol-spec-v0.1.md in
the repo. We propose it as REST-for-AI-coding: principles outlive
implementations. Fork the protocol, write a better implementation.

MIT, dogfooded. The repo's own nightly is 79/79 passing.

Demo:
- Desktop installer: github.com/neskuchny/sima_atlas/releases/latest
- From source: git clone && npm install && npm run dev

Honest limits:
- Desktop installers are unsigned — first launch needs one Gatekeeper /
  SmartScreen click-through. Apple Developer ID and Windows EV signing
  are tracked as PR5 in atlas/blocks/b.desktop/tasks.md, blocked on
  certificate purchase, not code.
- The semantic judge isn't infallible — it told me last night that the
  agent's code was in the "wrong block's territory", which was
  architecturally correct but stylistically blunt. Verdicts are persisted
  to disk so the next iteration's agent can read them.
- This is early-stage 0.x. The protocol is at v0.1.1. The
  implementation flips behaviour as we discover failure modes — see
  CHANGELOG.

Happy to answer questions.
```

## What to do in the first 60 minutes

- Within 5 minutes: top-level reply with «GitHub stars are great; what I'd actually love is a Kanon-compliant implementation in another stack. Spec's at [path]».
- Within 30 minutes: respond to **every** comment, even hostile ones, **substantively**. HN ranking depends a lot on engagement velocity.
- If frontpage: NO retweets / no Discord raids / no «please upvote» messages anywhere. HN rank-fucks brigading and it's auto-detected.

## Most likely comments and substantive answers

**«Isn't this just over-engineering for solo developers?»**
> The point isn't that solo devs need it. The point is that **50-block products** can't be built by solo devs without it — they top out at ~10 blocks before the agent starts forgetting. Sima makes the 50-block ceiling reachable. Below 10 blocks you don't need it.

**«How does this compare to Cursor / Aider / Continue?»**
> Cursor/Aider/Continue are editors with AI plugins. Sima is what the AI plugin **navigates**. They're orthogonal — you can use Sima inside Cursor (`.cursor/mcp.json` config in docs/integrations.md). The thing Sima adds is the contract graph that prevents the agent from drifting.

**«Why a separate LLM as judge? Why not just write better tests?»**
> Two reasons. (1) Tests written by the agent itself pass by the agent's definition of «works»; an independent reader is the only way to catch semantic drift. (2) Tests can't read mission.md and ask «does this code do what the mission promises?». The judge can, with all its limitations.

**«What stops the judge from being wrong?»**
> Nothing. That's why it's the LAST line of defence, not the first. Deterministic evidence collectors (5 types) gate first; a judge fail without a deterministic fail is `inconclusive`, not `fail`. Inconclusive doesn't block promotion automatically — operator reviews. This is spec §3.

**«Doesn't all this slow down coding?»**
> Yes, by maybe 30%. So does code review. The point isn't speed-of-typing; it's number-of-redos. Last night's run shipped 200 lines of working code in 75 min wall-clock; without the judge it would have been ~120 lines that the human would have caught 3 weeks later. Math favors slow.

**«Is the 'sima writes sima' bit just hype?»**
> Reproducible. Run `node scripts/agent_loop_daemon.mjs --dry-run` after cloning — you'll get the same queue I got. Then `--agent claude --max-iterations 4 --max-cost-usd 5` if you have $0.10 of curiosity. The log file from the run I describe is in `atlas/autonomous_runs/` — read what the agent edited, what the judge said, why it stalled.

## What NOT to do

- Не делать update-comment'ов «hey we're on front page, upvotes appreciated»
- Не упоминать deliberately контроверсиальные имена (никаких «like Cursor but…» в самом посте)
- Не выкладывать русскоязычные ссылки в основной пост — HN английский
- Не реагировать на флэйм. Substantive answer или silence.

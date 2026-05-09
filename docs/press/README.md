# Sima Atlas — press kit

Materials for journalists, bloggers, conference organisers, and anyone
covering Sima Atlas. Everything here is **MIT-licensed** and free to
use without asking. Attribution welcome but not required.

If you need something we don't have here yet — open an issue or email
[the maintainer](https://github.com/neskuchny).

---

## One-line descriptions

Pick the framing that fits your audience.

**For developers:**
> Visual contract-first development for AI coding agents — a graph of
> contracts between you and Claude Code / Cursor / Codex, so the AI
> builds what you actually meant.

**For founders / non-technical:**
> Open-source control plane for AI coding agents. Turns "AI writes code"
> from a lottery into a managed process.

**For technical journalists:**
> Sima Atlas is an open-source layer that sits between human developers
> and AI coding agents. Each product feature lives as a directory of
> contracts (mission, KPI, acceptance criteria); agents read contracts
> through MCP, write code, and the system verifies the result with
> deterministic evidence — pass / fail / inconclusive, never silent
> false-pass.

**One sentence (Twitter/HN):**
> AI agents work great on 5 files and fall apart on 50. Sima gives them
> a contract per feature and a graph of how features connect.

---

## Taglines (for slides, OG cards, posters)

- **Shared brain between you and AI**
- **A map instead of chat. Verification instead of trust.**
- **Contract. Map. Memory. Verification.**
- **AI agents stop building the wrong thing**
- **Where the AI agent and the human meet — on a graph of contracts**

---

## Visual assets

| File | Use case | Format | Size |
|---|---|---|---|
| [`../hero-mockup.svg`](../hero-mockup.svg) | Editable source for the hero diagram (operator + canvas + AI loop) | SVG | 9 KB |
| [`../hero-mockup.png`](../hero-mockup.png) | Pre-rendered hero, drop into articles or social previews | PNG, 1600×900 | 70 KB |

Operator's live UI screenshot is at the top of [README.md](../../README.md).
For high-resolution video / GIF demos — open an issue, we'll record one.

---

## Numbers worth quoting (as of v0.2.0)

- **~70 MCP tools** exposed to AI agents
- **5-provider LLM cascade** (`claude_cli` → `anthropic` → `google` → `ollama` → `mock`)
- **15 ✅ / 1 🟡 / 0 ❌** in the project's own honest self-audit
  (every methodology claim verified against shipped code — see
  [Article Appendix A](../article.en.md))
- **EN-first UI**, 644 i18n keys, RU mirror
- Used daily for Sima's own development; **early but live**

---

## What it replaces (the «Replaces» column from the manifest)

- AI hallucinates / drifts / redoes / lies about success
- Product lives in scattered chats + stale `CLAUDE.md` + my head
- AI forgets within a session and re-implements rejected approaches
- Black-box delegation (no visibility on token spend per feature)
- Docs drift; either you stop documenting or you slow down
- Cold-start each session; same bug tried 3 times
- «Where did the file from six months ago go?»

---

## Origin story (one paragraph)

Sima Atlas was extracted from Synlabs's internal product **Tessent** so
the *concept* of contract-first AI development reaches the market —
independently of any specific implementation. Take the principles,
build something better — that's a win for everyone shipping with AI
agents.

---

## Maintainer & licensing

- Maintainer: **Anton Kalabukhov** (Synlabs) + open-source contributors
- Repository: <https://github.com/neskuchny/sima_atlas>
- License: **MIT** (use freely, attribution welcome)
- Contact: open an issue, or use the email in [`SECURITY.md`](../../SECURITY.md) for security disclosures

# Personal outreach — точечные DM-ы

**Принцип:** один человек = одно сообщение, конкретное, с указанием **их** работы.
Никаких массовых рассылок. Никаких «would love your feedback». Никаких
«hope you can take a look» — это слова безработного, не разработчика.

**Когда отправлять:** через 24-48 часов после Twitter thread'а, когда у тебя
уже есть некий baseline traction (хотя бы 50-100 likes). Это даёт повод:
«видел мой thread? я писал X, хотел спросить вас про Y».

**Где:** Twitter/X DM > GitHub Discussions > Personal email > LinkedIn DM (в
этом приоритете). НИКОГДА не идти в Slack/Discord-комьюнити с DM «hey, I made
this thing» — банятся первыми.

---

## 1. Andrej Karpathy

**Их работа, на которую ссылаемся:** `karpathy.bearblog.dev` или его tweet от 2026
про «I/O mind meld» (HTML / interactive neural artifacts as I/O between
human and LLM). У нас уже есть ссылка на эту работу в kanon-protocol-manifesto.

**Канал:** Twitter DM.

**Сообщение (английский, не больше 4 предложений):**

> Hi Andrej — I'm Anton (Synlabs). I cited your «I/O mind meld» framing in
> a protocol manifesto we just published proposing contract-graphs as the
> structural complement to your visual-artifacts framing: github.com/.../kanon-protocol-manifesto-v2-en.md (section IX).
>
> Your work is about the **format** between human and LLM; ours is about the
> **task structure** the agent navigates. The repo includes a reference
> implementation that ran autonomously last night for 75 min on its own
> codebase with three honest stalls — semantic LLM-judge refusing to promote
> incomplete work.
>
> Would love your take on whether the «judge as last line of defence»
> framing tracks with what you've been seeing on the agent side.

**Не делать:**
- Никаких «would love feedback» / «hope you have time»
- Не просить retweet / amplification
- Не упоминать другие имена в сообщении

---

## 2. Simon Willison

**Их работа:** simonwillison.net блог, особенно его LLM CLI tool и серия
«AI-assisted programming» постов.

**Канал:** Email (simon@simonwillison.net) или Twitter DM.

**Сообщение:**

> Hi Simon — admirer of your LLM CLI and the «AI-assisted programming» series.
>
> I built a contract-first canvas for AI-coding agents and the thing that's
> most relevant to your work is the **6-provider LLM cascade** — `claude_cli`
> (zero marginal cost via Claude Pro subscription), `anthropic`, `google`,
> `ollama`, `mock`. Cascade falls through transparently; selftest at
> `tests/llm_gateway.selftest.mjs` enforces graceful degradation
> (mock → inconclusive, never false pass).
>
> The reference implementation went MIT today (v0.4.0). Repo:
> github.com/neskuchny/sima_atlas. Protocol manifesto:
> kanon-protocol-manifesto-v2-en.md.
>
> Two questions you might have an opinion on: (1) the «llm_judge cannot
> solo-promote a block» rule in spec §3.2 — sound or arbitrary? (2) gemini-2.5-flash
> non-thinking as the default judge model — saner than asking opus to judge?

**Тон:** уважительный, но НЕ заискивающий. Simon отвечает на substantive,
игнорирует pitch.

---

## 3. Geoffrey Huntley

**Их работа:** Ralph Loop (`ghuntley.com/ralph` and Bluesky посты про
«iterate while progress lives on disk»). Концептуальный предок нашего
V-1 daemon.

**Канал:** Twitter DM или Bluesky DM.

**Сообщение:**

> Hi Geoffrey — your Ralph Loop framing is the conceptual ancestor of the V-1
> autonomous daemon I just shipped in github.com/neskuchny/sima_atlas. Direct
> mapping in code comments at scripts/agent_loop_daemon.mjs:
>
>   prd.json (passes/fails)        → graph.json statuses + per-block acceptance
>   "pick next story passes==false"→ pickNextRunnable()
>   "fresh AI instance"            → run_block_implementation.mjs
>   "run quality checks"           → verify_block_acceptance.mjs
>   "commit + update prd"          → advance_block_state.mjs (gated)
>   "progress.txt learnings"       → narrative.md (per-block, auto-written)
>   "CI must stay green"           → cascade_verify + verify_done_blocks_still_green
>
> Last night's first real-agent overnight produced 3 honest stalls, 0 false
> promotions. Log at atlas/autonomous_runs/. Curious what you'd consider
> missing from a Ralph-loop perspective.

**Цель:** не апвоут, а exchange. Geoffrey пишет про Ralph Loop постоянно;
получить его публичное «yes this is a faithful Ralph implementation» ценно.

---

## 4. Thariq Shihipar (Anthropic)

**Их работа:** Twitter thread про HTML > markdown как формат вывода для
LLM-агентов. Уже процитирован в нашей kanon-manifesto IX.

**Канал:** Twitter DM (или, если он Anthropic-internal, через open
Anthropic Discord).

**Сообщение:**

> Hi Thariq — your HTML-as-output framing is one half of the «text-stream-
> as-channel-is-exhausted» problem; I just shipped the other half, framing
> contract-graphs as the **task** structure complementing your **output**
> structure. Both in section IX of kanon-protocol-manifesto-v2-en.md in
> github.com/neskuchny/sima_atlas.
>
> The reference implementation is a downloadable desktop app (v0.4.0 just
> released). It uses MCP under the hood — Claude Code is the reference
> integration via the bundled .mcp.json.
>
> Wanted to flag this in case interesting for either visibility or as a
> point of comparison.

**Тон:** professional, no asks. Если он передаст в Anthropic — bonus. Если
нет — ничего не теряем.

---

## 5. Кому-то из Cursor / Continue / Aider команд

Не лично — публично через GitHub Issue **в их репо**, не Twitter. Тема:

```
[Integration] Sima Atlas MCP server config
```

Тело:

```
We just shipped a contract-first canvas for AI agents (MIT,
github.com/neskuchny/sima_atlas) and documented [Cursor / Continue / Aider]
as a target integration in docs/integrations.md.

We've tested with [tool name] v[X] and the config works. If you'd like a
ready-to-paste section in your tool's docs, happy to send a PR. Or if our
integration doc is missing nuance, would love feedback.

No urgency on either side.
```

**Цель:** появиться в **их** документации. Это даёт дискаверибилити которая
любой Twitter thread не даст.

---

## 6. Тот, чьё имя не назван — конкретно ТЫ, оператор

После того как Twitter thread пройдёт и ты получишь первые 10 ответов:

- Найди 3 пользователя которые **скачали и запустили** инсталлятор. Спроси
  личным DM (не публично): «что было самое странное в первые 10 минут?»
  Их ответы — лучший материал для v0.5.0.
- Найди 1 пользователя который **застрял на установке**. Помоги лично.
  Запиши процесс. Это — основа FAQ.
- Найди 1 разработчика, который **начал писать Kanon-compliant
  implementation** в другом стеке. Запроси PR в `kanon-protocol-spec-v0.1.md`
  с найденными ambiguities. Это самое ценное что может случиться.

---

## Чего НЕ делать в outreach'е

- **Не отправлять одно и то же сообщение нескольким людям** — узнаваемо за
  10 секунд, теряешь доверие сразу
- **Не упоминать «we're trending on HN»** — выглядит как pump
- **Не просить retweet** — никогда
- **Не отправлять до того как у тебя есть baseline traction** — без
  социального доказательства DM от незнакомца игнорится
- **Не отправлять без конкретной их цитаты/работы** — generic outreach
  оскорбительно

---

## Шаблон **отказа** на ответ-«нет интересно»

> Понятно, спасибо что прочитали. Если когда-нибудь возникнут вопросы
> про contract-graph patterns — мой DM открыт.

Один раз ответил, не настаивай. Профессионалы запоминают и тех кто
сдержанно ответил, и тех кто настаивал.

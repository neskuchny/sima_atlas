# Twitter / X launch thread — 9 tweets

**Когда:** утро вторника или среды по PT — лучшая видимость в технической ленте.
**Аккаунт:** твой основной, не свежий. Свежие аккаунты на 0 показов попадают.
**Артефакты обязательны:** скриншот лога V-1 (tweet 1) + скриншот вердикта Gemini (tweet 3) + 60-секундное видео install→canvas (tweet 8).

---

## Tweet 1 — hook

> I asked my AI to write itself. Real Claude agent, real overnight loop, real
> second-AI judge that reads the contract + the code and asks «does this
> actually do what it claims?»
>
> Three honest stalls, zero false promotions. Here's the log.
>
> 🧵
>
> [screenshot of agent_loop_daemon final summary]

**Что в скриншоте:**
```
agent_loop_daemon [claude]: 3 block(s) — 0 advanced · 3 stalled
  stop: complete — no runnable blocks left
    ✗ b.db (idea) → fail: semantic verify FAILED
    ✗ b.smoke-sandbox (idea) → fail: verifier did not pass
    ✗ b.core-sync (done) → fail: semantic verify FAILED
```

Файл: `atlas/autonomous_runs/v1-overnight-20260620T075444.log`.

---

## Tweet 2 — what happened, iteration 1

> 4 iterations planned, $5 cap, real claude CLI.
>
> Iteration 1: agent picked b.db, read the contract (mission, KPI, tasks,
> depends_on), wrote real code — atomic file writes, schema validation,
> block history snapshots. FSM: LaunchingAgent → Running → Finishing →
> Succeeded.
>
> Then the judge sat down.

---

## Tweet 3 — the verdict

> Gemini 2.5 Flash, non-thinking. Read the entire b.db contract + the actual
> code + the neighbour blocks. Verdict:
>
> «mission_fulfilled: FAIL — the code lives in another block's territory.
> b.db's files.md doesn't list the scripts the agent edited. Architecturally
> wrong slot.»
>
> [screenshot of semantic_review.json]

**Что в скриншоте:** persisted `atlas/blocks/b.db/semantic_review.json` —
конкретный JSON-файл с pass/fail/inconclusive по 5 измерениям и `todo_to_pass`
массивом.

---

## Tweet 4 — the stop

> The autonomous loop **stopped**. No false «done». No promotion. No silent
> green.
>
> This is what's missing in every AI coding tool I've used. They optimise
> for speed. Sima optimises for **truthfulness**.
>
> The agent worked. The judge said «not enough yet». The system honored that.

---

## Tweet 5 — why this matters

> The failure mode of «AI codes 50 blocks» isn't «wrong code» — it's «AI
> claims it's done, you trust it, three months later production catches
> what's missing».
>
> Sima makes that failure mode structurally impossible. Tri-state
> acceptance: pass / fail / **inconclusive**. Never silent green.

---

## Tweet 6 — how it works

> Every block has a contract: mission.md / kpi.md / acceptance.md /
> depends_on.md / provides.md. The agent reads them via MCP before
> touching code.
>
> 5 deterministic evidence collectors check acceptance (exit_code, file
> match, log grep, selftest, file diff).
>
> A semantic LLM-judge checks meaning — last, not first.

---

## Tweet 7 — the protocol

> The whole thing is published as a stand-alone protocol:
> github.com/neskuchny/sima_atlas/blob/main/kanon-protocol-manifesto-v2.1-ru.md
>
> 10 principles, RFC-2119 compliance spec, Level 1/2/3 tiers.
>
> Fork it. Write a better implementation. Just hold the principles.
>
> REST didn't belong to Roy Fielding. Kanon doesn't belong to us.

---

## Tweet 8 — the install

> Don't read code, just try it. v0.4.0 ships a downloadable installer for
> Mac / Win / Linux. No terminal, no `npm install`. Click, canvas opens
> on a demo project.
>
> [60-second video: download .exe → SmartScreen «Run anyway» → install → window opens → canvas with blocks → press ⌘⇧V → Verify All]
>
> github.com/neskuchny/sima_atlas/releases/latest

---

## Tweet 9 — close

> Open source, MIT. Dogfooded — Sima built parts of itself in that overnight
> run, and you can read the full log in `atlas/autonomous_runs/` in the repo.
>
> Try it. Fork the protocol. Send PRs.
>
> github.com/neskuchny/sima_atlas

---

## Reply hygiene (после публикации)

- **Reply to your own tweet 1** within 5 minutes with: «Repo: github.com/neskuchny/sima_atlas — MIT» — это triggers a second push к ленте.
- На комментарий «how is this different from Cursor?» отвечать одним предложением: «Cursor is the editor. Sima is the contract graph the editor's agent navigates.» Без упоминания цены/качества.
- На комментарий «doesn't this just slow down coding?» отвечать: «Yes. So does code review. The point isn't speed-of-typing, it's number-of-redos.»

## What NOT to put in the thread

- Не писать «better than X» — приглашаешь враждебное цитирование
- Не упоминать суммы потраченные на Gemini ($0.0857 за semantic verdicts) — это звучит как «дёшево», но люди читают как «непрозрачные расходы»
- Не использовать слово «revolutionary» / «breakthrough» / «game-changer»
- Не делать всё на русском **и** на английском — выбери EN для основного thread'а, RU перевод дай отдельным reply через 3 часа

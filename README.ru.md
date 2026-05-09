# Sima Atlas

> **Визуальная контракт-ориентированная разработка для AI-агентов.**
> Граф контрактов между тобой и Claude Code / Cursor / Codex — чтобы AI собирал именно то, что ты имел в виду; ты видишь что строится; дрейф ловится; уроки накапливаются между проектами.

[![verify](https://github.com/neskuchny/sima_atlas/actions/workflows/verify.yml/badge.svg)](https://github.com/neskuchny/sima_atlas/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

English: [README.md](README.md).

---

## Питч за 30 секунд

AI-агенты прекрасно работают на 5 файлах и разваливаются на 50 — галлюцинируют, дрейфуют, переделывают и жгут токены, потому что **у них нет контракта** на то, что должна делать каждая часть, и **нет графа** того, как части связаны. Sima Atlas — это **визуальный control plane**, который даёт им и то и другое: каждая фича — директория MD-контрактов, на канвасе видны связи, агенты получают context-pack под один блок, acceptance loop проверяет каждый запуск детерминистически — `pass / fail / inconclusive`, без silent false-pass.

<img width="1913" height="960" alt="Sima Atlas — визуальная контракт-ориентированная разработка для AI-агентов" src="https://github.com/user-attachments/assets/15114bfe-1593-443c-ac18-3894bb49ee4f" />

## Vision — куда идём

**Где мы сейчас (v0.1):** ты пишешь контракты на канвасе, жмёшь `Claude Code`, агент читает контекст, пишет код, верификатор прогоняет, ты видишь verdict.

**Куда идём (v1.x → v2):**

- 🔄 **Двусторонняя синхронизация Sima ↔ агент** — канвас собирается *из* переписок Claude Code и обратно *в* них. Болтаешь с Claude в IDE про продукт; Sima вытаскивает блоки, заполняет mission, предлагает acceptance. Принял на канвасе — Claude в следующей задаче уже понимает контракт.
- 🤖 **Автономный кодинг-цикл** — когда контракты заполнены, Sima идёт по графу, спавнит агентов на `todo` блоки ночью, прогоняет acceptance, маркирует pass/rollback. Утром смотришь канвас — видно что собрано и где застряло.
- 🔍 **Live drift detection** — каждый запуск проверяется: остался в scope блока? Конфликтует с соседями? Нарушил `tech_stack.md` или `dont_use.json`? Drift получает цветной маркер на канвасе **до** commit'а.
- 💰 **Экономика токенов** — счётчики на сессию / блок / проект; cost vs. acceptance-rate; явный ROI «оплатил ли контракт сам себя».
- 🧠 **Память между проектами** — фреймворки, ссылки на код, архитектурные решения, выбор LLM, do-not-use баны накапливаются в `lessons.json`. Следующий проект auto-предлагает: «ты использовал Postgres + Prisma + zod последние 3 раза — продолжаем?» — никакого cold-start.
- 🎨 **Визуальный кодинг даже для vibe-кодеров** — можешь vibe-кодить, но *видишь сборку* живьём: какие блоки тронуты, какие edges сработали, где накапливается drift. Видимость не тормозит — она даёт делегировать уверенно.

Это не сейчас. Это траектория ближайших 12 месяцев. Полный аудит «что заявлено vs. что реально в коде» — в [Приложении А статьи](docs/article.ru.md).

## Quickstart (60 секунд)

```bash
git clone https://github.com/neskuchny/sima_atlas
cd sima_atlas
npm install
npm run dev
# → API на :8787 · UI на http://localhost:8000 · открывается demo
```

Откроется на `?client=example` — заполненный 5-блочный habit-tracker, чтобы canvas был живой. Переключайся через `?client=<your-id>`; Sima создаст `atlas/clients/<your-id>/` сама.

Клик по блоку → DetailPanel → редактируй `mission.md`, поставь acceptance, жми **Claude Code** — агент стартует. Или **✦ Sima → заполни всё по этой переписке**, вставь любой кусок диалога, прими предложенные блоки.

Подключение к твоему AI-агенту: см. [`docs/integrations.md`](docs/integrations.md). Claude Code подхватит `.mcp.json` автоматически; остальные — 5 строк конфига.

## С чем мы столкнулись пока строили — и как это решено

Это конкретные failure modes, на которые мы напоролись отгружая собственный продукт (Tessent) с AI-агентами. Каждый запустил отдельную фазу в этом репо. Они и есть причина существования Симы.

| Боль | Решение которое легло в код |
|---|---|
| **«Сказал агенту считать sentiment через LLM. Он написал regex. В следующей сессии вообще забыл указание.»** Архитектурное решение испаряется между диалогами потому что нет места его зафиксировать. | **Защита в три слоя** (R-7.76 → R-7.85). Project-level `architecture_decisions.md` (append-only, авто-инжектится в каждый prompt). Block-level `dont_use.json` / `always_use.json` с `severity:hard`. Post-run `scan_run_for_drift.mjs` сканирует реально изменённые файлы и **проваливает run** если hard-правило нарушено. Три слоя — потому что одного оказалось мало. |
| **«Агент третий раз переписал тот же парсер потому что не знал что он уже есть.»** Нет памяти о прошлых runs, нет нарратива «что пробовали / что сработало». | **Per-block memory layer** (R-7.76 → R-7.80). Каждый run дописывает в `narrative.md` (читаемое: *что пробовал / что сработало / что упало и почему / какие решения принял*) и `decisions.log` (структурный TSV). Оба грузятся в следующий prompt под «## ⚠ Block memory» — агент читает до того как трогать код. |
| **«Правишь блок А. Через 8 часов ночной sweep говорит что блок B сломан потому что от A зависел.»** Поломка распространяется молча часами. | **Cascade verify on edit** (R-7.84, S-8). После успешного run блока X — обход reverse-deps, перезапуск acceptance верификатора на каждом зависимом. Что сломалось получает `status: desync` на канвасе сразу + stack-trace-style запись в `narrative.md`. Оператор видит цепочку inline, не в 06:00. |
| **«Context-pack 12K токенов на однострочный UI-фикс.»** One-size-fits-all packs жгут бюджет и размывают signal-to-noise. | **Профили под тип задачи** (R-7.86, S-4). `design` (~5–15K, full pack) · `backend-fix` (~2–4K) · `ui-fix` (~1.5–3K, без deps) · `acceptance-only` (~0.5–1.5K, только верификатор). Architecture decisions всегда внутри, независимо от профиля. На `b.docs`: 5809 → 3701 → 2763 → 1846 токенов. |
| **«Гоняю агентов часами и не вижу куда уходят токены.»** Нет видимости какой `op` жрёт больше всего, нет «shadow bill» когда работаем на Claude.ai подписке. | **Token economics roll-up** (R-7.87, S-9). `atlas/llm_traces/*.json` агрегируется per block / op / provider / day. Две колонки cost: `cost_usd_actual` (что реально списано — 0 на `claude_cli`/`ollama`/`mock`) и `cost_usd_equivalent` (Anthropic Haiku 4.5 list price — стабильный shadow bill между провайдерами). Виден как Token Spend widget в Overview каждого блока + CLI roll-up. |
| **«Я заполнил блок или только mission? Надо тыкать пять вкладок чтобы понять.»** Нет at-a-glance fill-state по блоку. | **Implementation Status panel** (R-7.86). Overview tab открывается с 8-row dashboard: Mission · KPIs · Acceptance · Tasks · Files alive · Decisions logged · Run history · Block status. Каждая строка с маркером ✓ / ~ / ✗ / · — contract-vs-reality прогресс виден без кликов. |
| **«Агент молча упал в mock и отрапортовал успех.»** Inconclusive runs трактовались как pass. | **Tri-state acceptance** (`pass` / `fail` / `inconclusive`) с пятью evidence collectors (`exit_code`, `fs_glob`, `file_diff`, `log_grep`, `selftest_run`) + `llm_judge` как last resort. Inconclusive при отсутствии API key → никогда не silent green. |
| **«Новый контрибьютор склонировал, запустил `npm run dev`, увидел пустой UI потому что operator-profile JSON-ов не было.»** Bootstrap зависел от ручных шагов. | **Auto-seed at startup** (R-7.81). `dev_server.mjs` идемпотентно создаёт `operator_profile/{lessons,dont_use,always_use}.json` и `architecture_decisions.md` при первом запуске. У новых пользователей ноль ручной настройки. |

Паттерн: **каждый фикс закрывает реально вылезшую проблему**, не воображаемую. Если упёрся в одну из них и не видишь подходящего решения — [открой issue](https://github.com/neskuchny/sima_atlas/issues), так и приоритизируется следующая фаза.

## Что меняется на практике

- **Меньше переделок.** Агент видит контракт, идёт сразу куда надо. Переделки стоят 2–4× первого запроса; контракт-first их режет.
- **Меньше галлюцинаций.** Когда модель знает что должна делать — пространство «правдоподобных, но неверных» ответов резко сужается. Acceptance loop ловит просочившееся.
- **Путь к автономной разработке.** Граф + контракты + acceptance + lessons — фундамент для любого уровня автономии (от «спрашивай человека на гейте» до «работай ночью сам»).
- **Документация — побочный продукт.** WIKI / ТЗ / туториалы / маркетинг-копи генерируются из того же графа.
- **Память между проектами.** Архитектурные решения и lessons из одного проекта — стартовый набор для следующего.

## Roadmap

Маркеры: ✅ done, 🟡 partial, ⬜ planned.

### Сейчас — фундамент (v0.1, отгружено)
- ✅ **R-1..R-7** — visual canvas, contract loading, MCP tools, 5-провайдерный LLM cascade, sima-fill-from-chat orchestrator, chat watcher, layer-aware blocks, real submodule hierarchy, depth-control canvas, agent-navigation skill, EN-first i18n, Overview с live contract data, auto-arrange по слоям
- ✅ **R-7.76..R-7.81** — per-block memory layer end-to-end (`narrative.md` + `decisions.log` + operator-locked `dont_use`/`always_use`/`lessons.json`, авто-инжект в каждый prompt, auto-seed при старте)
- ✅ **R-7.82 (S-3)** — runtime content drift scanner: сканирует изменённые файлы post-run против `dont_use`; hard-нарушения проваливают run
- ✅ **R-7.83** — agent-navigation skill / Cursor rule / AGENTS.md обновлены, обучают новый memory layer
- ✅ **R-7.84 (S-8)** — cross-block break detection on edit: `cascade_verify` обходит reverse-deps после успешного run, авто-помечает сломанные `status: desync` со stack-trace-style записями в narrative
- ✅ **R-7.85 (S-6)** — `architecture_decisions.md` append-only project lock-in, авто-инжектится в каждый prompt по всем блокам
- ✅ **R-7.86 (S-4)** — context-pack профили (`design` / `backend-fix` / `ui-fix` / `acceptance-only`) + Implementation Status dashboard в Overview
- ✅ **R-7.87 (S-9)** — token economics aggregator: actual cost + Anthropic Haiku 4.5 «shadow bill» equivalent + per-op / per-provider / daily breakdown, как MCP tool + Token Spend widget

### Следующее — закрываем цикл (v0.5 → v0.9, Q4 2026)
- ⬜ **S-1** — marketplace шаблонов блоков (auth / payments / search / ingestion / billing)
- ⬜ **S-7** — транзакционные change-set'ы для cross-cutting изменений (REST→GraphQL, переименование capability, миграция БД)
- ⬜ **S-9.1** — global Token Economics tab (отдельно от per-block widget): sparklines, cost-per-pass vs cost-per-fail ROI, A/B сравнение моделей
- ⬜ **S-10** — UI выбор profile при старте run-а (сейчас только CLI flag + env var)
- ⬜ **S-11** — cross-block roll-up в Implementation Status: «какой % контрактов в этом subsystem заполнен?»

### Среднесрок — collaboration + локальные модели (v0.6 → v0.9, Q4 2026)
- ⬜ **T-1** — multi-operator collaboration с CRDT-merge контрактов
- 🟡 **U-1** — локальные модели (Ollama есть с R-7.60; vLLM / LM Studio — open issues)
- ⬜ **U-2** — `Sima Shell` — лёгкий MCP-клиент под локальные модели
- ⬜ **U-3** — Continue / Aider / Zed-AI MCP интеграции

### Vision — автономный цикл + накопительная память (v1.x → v2, 2027+)
- ⬜ **V-1** — **agent-loop daemon**: ночной автономный режим. Sima берёт `todo` блоки, спавнит агента, прогоняет acceptance, маркирует pass/rollback
- ⬜ **V-2** — one-click deploy с тем же acceptance в проде
- ⬜ **V-3** — **production-monitor**: ловит unknown-unknowns в проде и поднимает их обратно в граф как новые acceptance assertions
- ⬜ **W-1** — **cross-project pattern transfer**: lessons из одного проекта обогащают следующий
- ⬜ **W-2** — batch mode: 10 проектов параллельно под одним dashboard
- ⬜ **W-3** — community archetypes: shared operator profiles (vibe-coding novice / mid-stage startup / enterprise)

### Не будем чинить
- ❌ Hard lifecycle gates по умолчанию — сломали бы draft-итерацию. Оставлены soft с явными подсказками.

## Для кого

Лучший тест чем «подходит ли мне» — **«упёрся ли я хоть в одну из этих стен?»**:

- **Solo-разработчики с продуктом из > 10 фич.** Упёрся в потолок где агент забывает что собрал на прошлой неделе, переписывает существующее, прожигает сессии дебаггингом собственного дрейфа. → Memory layer + cascade verify + Implementation Status сообщают тебе и агенту что уже есть.
- **Vibe-кодеры которые хотят *видеть* что AI строит.** Любишь делегировать но хочется канвас, не console flood. → Visual canvas + Overview + Token Spend widget без процессного бремени.
- **AI-coding команды (2+ человека + агенты).** Отгружаете быстрее чем держите контракты в голове; коллегам не понятно что агенту разрешено трогать в их зоне. → Общий `architecture_decisions.md` + per-block `dont_use` + sync-check останавливают cross-team спотыкания.
- **Multi-product операторы / агентства.** Несколько продуктов параллельно; хотите одну ментальную модель «жив ли каждый проект» без открытия 5 IDE. → Multi-tenant `atlas/clients/<id>/` + auto-generated WIKI/Roadmap на клиента.
- **Исследователи AI-coding эффективности.** Нужны сравнимые runs между провайдерами и моделями с детерминистическим evidence pass/fail. → Token traces + tri-state acceptance + `cost_usd_equivalent` shadow-bill делают A/B сравнимым между `claude_cli` / `anthropic` / `google` / `ollama`.

**Кому это пока НЕ подходит:**

- Single-file скрипты — overhead контракта не окупается ниже ~5 блоков.
- Mission-critical коммерческие deployments — early but live; используем ежедневно для своих продуктов, не рекомендуем для систем «которые не должны падать».
- Команды которым нужны hard lifecycle gates по умолчанию — Sima держит gates *soft* с явными visible hints чтобы сохранить скорость draft-итерации (см. Article Appendix B.2).

## Полная методология

[docs/article.ru.md](docs/article.ru.md) — 11 частей + 2 приложения, включая self-audit каждого утверждения против кода.

## Документация

| Файл | Что это |
|---|---|
| [`docs/getting-started.ru.md`](docs/getting-started.ru.md) | Onboarding — от клона до первого агентского run-а за 15 минут |
| [`docs/architecture.md`](docs/architecture.md) | Системная диаграмма, HTTP API, MCP-tools, run FSM |
| [`docs/agent-navigation.md`](docs/agent-navigation.md) | Как агентам ходить по этому репо (Claude Skills + Cursor Rules + AGENTS.md) |
| [`docs/integrations.md`](docs/integrations.md) | Подключение к Claude Code / Cursor / Codex / Continue / Zed / Windsurf / Antigravity / Ollama |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Реальные failure modes из R-7.X дебагов |
| [`CHANGELOG.md`](CHANGELOG.md) | Per-phase change log |
| [`CLAUDE.md`](CLAUDE.md) | Контракт для AI-агентов в этом репо |

## Что мы ждём от сообщества (top-6)

1. **Local-model adapters** — vLLM / LM Studio / llama.cpp (~80 строк, mirror Ollama pattern)
2. **Block templates** — auth / payments / search / ingestion / billing
3. **VS Code extension features** — status badges, inline editing, run-block buttons (0.1 scaffold в [`extensions/vscode/`](extensions/vscode/))
4. **Token-economics dashboard (S-9)** — instrument llm_gateway.mjs + render panel
5. **Evidence collectors** — `http_status`, `json_shape_match`, `snapshot_diff`, `lighthouse_score`
6. **Native MCP клиенты** для IDE которых пока нет

Открывай issue, начинай discussion, шли PR. Обычно отвечаем в течение 48 часов.

---

MIT, [LICENSE](LICENSE). Разработано в **Synlabs**. Maintainer — Anton Kalabukhov + контрибьюторы. Изначально выделено из нашего основного продукта **Tessent**, чтобы *концепция* контракт-first AI-разработки дошла до рынка — независимо от конкретной реализации.

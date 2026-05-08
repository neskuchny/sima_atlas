# Sima Atlas

> **Визуальная контракт-ориентированная разработка для AI-агентов.**
> Граф контрактов между тобой и Claude Code / Cursor / Codex — чтобы AI собирал именно то, что ты имел в виду; ты видишь что строится; дрейф ловится; уроки накапливаются между проектами.

[![verify](https://github.com/neskuchny/sima_atlas/actions/workflows/verify.yml/badge.svg)](https://github.com/neskuchny/sima_atlas/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

English: [README.md](README.md).

---

## Питч за 30 секунд

AI-агенты прекрасно работают на 5 файлах и разваливаются на 50 — галлюцинируют, дрейфуют, переделывают и жгут токены, потому что **у них нет контракта** на то, что должна делать каждая часть, и **нет графа** того, как части связаны. Sima Atlas — это **визуальный control plane**, который даёт им и то и другое: каждая фича — директория MD-контрактов, на канвасе видны связи, агенты получают context-pack под один блок, acceptance loop проверяет каждый запуск детерминистически — `pass / fail / inconclusive`, без silent false-pass.

![Canvas overview](tests/playwright/screenshots/sima_design_live.png)

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

### Следующий — фундамент автономии (v0.2 → v0.5, Q3 2026)
- ⬜ **S-1** — marketplace шаблонов блоков (auth / payments / search / ingestion / billing)
- ⬜ **S-3** — runtime drift-guard в cursor-hook: блокирует команды нарушающие `dont_use` *в момент исполнения*
- ⬜ **S-4** — context-pack профили под тип задачи + selective neighbor traversal
- ⬜ **S-6** — `architecture_decisions.md` — архитектурный голос проекта в каждом context-pack
- ⬜ **S-7** — транзакционные change-set'ы для cross-cutting изменений
- ⬜ **S-8** — auto-mark drift на канвасе
- ⬜ **S-9** — **dashboard экономики токенов**: счётчики на сессию / блок / проект, cost vs. acceptance-rate, ROI

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

- **Solo-разработчики** с продуктом из > 10 фич, упирающиеся в потолок agent-collapse
- **Vibe-кодеры**, которые хотят *видеть* что AI строит, без замедления — visibility без бюрократии
- **AI-coding команды** где двое + Claude параллельно не должны спотыкаться друг о друга
- **Исследователи** AI-coding эффективности — token-tracing + acceptance-verifier дают сравнимые runs между провайдерами и моделями

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

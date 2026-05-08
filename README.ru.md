# Sima Atlas

> **Визуальная контракт-ориентированная разработка для AI-агентов.**
> Граф контрактов между тобой и Claude Code / Cursor / Codex — чтобы AI собирал именно то, что ты имел в виду.

[![verify](https://github.com/neskuchny/sima_atlas/actions/workflows/verify.yml/badge.svg)](https://github.com/neskuchny/sima_atlas/actions/workflows/verify.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Английская версия: [README.md](README.md).

---

## Что это

Визуальный canvas, где каждая фича твоего продукта живёт как директория с контрактами (`mission.md` / `kpi.md` / `acceptance.md` / `depends_on.md` / `provides.md`). Агент читает контракт через MCP, пишет код, отчитывается фактами в `checks.log`. Sima проверяет каждый run по acceptance-утверждениям — `pass` / `fail` / `inconclusive`, без silent false-pass.

**Что НЕ это.** Не редактор кода, не agent framework, не замена Cursor / Claude Code / Codex — это **слой над ними**. Твой UI редактирования остаётся прежним; Sima добавляет canvas, контракты, верификатор, и 65 MCP-tools, которые агент вызывает.

**Для кого.** Для разработчиков с продуктом из > 10 фич, где AI-агенты упираются в потолок и начинают галлюцинировать, дрейфовать, переделывать одно и то же.

## Quickstart (60 секунд)

```bash
git clone https://github.com/neskuchny/sima_atlas
cd sima_atlas
npm install
npm run dev
# → API на :8787 · UI на http://localhost:8000 · открывается demo
```

Браузер откроется на `?client=example` — заполненный 5-блочный habit-tracker. Переключайся на свой продукт через `?client=<your-id>`; Sima создаст `atlas/clients/<your-id>/` сама.

Клик на блок → DetailPanel → редактируешь `mission.md`, ставишь acceptance, жмёшь **Claude Code** → агент стартует. Или **✦ Sima → заполни всё по этой переписке** + вставь любой кусок диалога — Sima нарисует блоки.

Подключение Sima к твоему AI: см. [`docs/integrations.md`](docs/integrations.md). Claude Code подхватывает `.mcp.json` автоматически; остальные — 5 строк конфига.

## Что меняется на практике

- **Меньше переделок.** Агент видит контракт, идёт сразу куда надо. Переделки стоят 2–4× первого запроса; контракт-first их режет.
- **Меньше галлюцинаций.** Когда модель знает, что блок должен делать, пространство «правдоподобных, но неверных» ответов резко сужается. Acceptance loop ловит просочившееся.
- **Путь к автономной разработке.** Граф + контракты + acceptance + lessons — фундамент для любого уровня автономии.
- **Документация — побочный продукт.** WIKI / ТЗ / туториалы / маркетинг-копи генерируются из того же графа.

## Состояние

✅ **Стабильно** — 10 собственных блоков зелёные в CI; multi-tenant; soft lifecycle gates; фазы R-1 → R-7 (claude_cli, sima_fill_from_chat, chat watcher, layer-aware blocks, real submodule hierarchy, depth-control канвас).

⬜ **В roadmap** — локальные модели (U-1, top community-ask), block templates marketplace (S-1), VS Code sidebar, V-1 agent-loop daemon. Полный список — Часть 10 [статьи](docs/article.ru.md).

❌ **Не будем чинить** — hard lifecycle gates (сломают draft-итерацию). Оставлены soft с явными подсказками.

## Полная методология

[docs/article.ru.md](docs/article.ru.md) — 11 частей + 2 приложения, включая self-audit каждого утверждения против кода.

## Документация

| Файл | Что это |
|---|---|
| [`docs/getting-started.ru.md`](docs/getting-started.ru.md) | Onboarding — от клона до первого агентского run-а за 15 минут |
| [`docs/architecture.md`](docs/architecture.md) | Системная диаграмма, HTTP API, MCP-tools, run FSM |
| [`docs/integrations.md`](docs/integrations.md) | Подключение к Claude Code / Cursor / Codex / Continue / Zed / Windsurf / Antigravity |
| [`docs/troubleshooting.md`](docs/troubleshooting.md) | Реальные failure modes из R-7.X дебагов |
| [`CLAUDE.md`](CLAUDE.md) | Контракт для AI-агентов, работающих в этом репо |

## Что мы ждём от сообщества

1. **Local-model провайдер** в `scripts/llm_gateway.mjs` — Ollama / vLLM / LM Studio (~150 строк)
2. **Block templates** — auth / payments / search / ingestion / billing
3. **VS Code sidebar extension** — canvas рядом с кодом
4. **Доп. evidence collectors** — `http_status`, `json_shape_match`, `snapshot_diff`, `lighthouse_score`
5. **Native-MCP клиенты** для IDE, которые мы пока не поддерживаем
6. **UI-переводы** — сейчас RU + partial EN

Открывай issue, начинай discussion, шли PR. Обычно отвечаем в течение 48 часов.

---

MIT, [LICENSE](LICENSE). Разработано в **Synlabs**. Maintainer — Anton Kalabukhov + контрибьюторы. Изначально выделено из нашего основного продукта **Tessent**, чтобы *концепция* контракт-first AI-разработки дошла до рынка — независимо от конкретной реализации.

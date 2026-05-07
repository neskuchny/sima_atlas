# Changelog

Все заметные изменения проекта документируются здесь. Формат — [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), версионирование — [SemVer](https://semver.org/spec/v2.0.0.html).

Sima Atlas сейчас в early-stage (`0.x`), API может меняться без полного депрекейшна. Crucial breaking changes мы выделяем явно.

---

## [Unreleased]

### Added (opensource-prep, 2026-05-06 → 2026-05-07)
- `README.md` — bilingual (EN + RU) opensource-readme с hero-screenshot, quickstart, what's-in-the-box, state-of-project, contribution invitations, license.
- `LICENSE` — MIT, copyright Anton Kalabukhov & Synlabs.
- `docs/integrations.md` — гайды подключения для Claude Code / Cursor / Codex CLI / Continue / Zed / Windsurf / Antigravity / Aider, плюс CLI fallback и HTTP API.
- `.mcp.json` в корне репо — Claude Code автоматически подхватывает Sima MCP-сервер при открытии сессии.
- `CONTRIBUTING.md` — entry-point для контрибьюторов: dev-setup, структура репо, workflow, code style, commit conventions.
- `SECURITY.md` — приватный канал репортов (GitHub Security Advisory) + threat model.
- `CODE_OF_CONDUCT.md` — adopt-by-reference на Contributor Covenant 2.1.
- `.github/ISSUE_TEMPLATE/{bug_report,feature_request,question,config}.yml` — issue forms в YAML-формате с labels.
- `.github/pull_request_template.md` — структурированный PR-шаблон.

### Changed
- `ТЗ/статья.md` v4 — расширена до ~4000 слов: новая Часть 1.3 (research grounding: Lost-in-the-Middle / Hallucination is Inevitable), Часть 2.5 «Почему именно эти принципы», Часть 6 «Три эффекта» (cost / hallucinations / autonomy), Часть 7 (локальные модели + Sima Shell + Sima Core position), Приложения А (self-audit) + Б (design boundaries).

---

## [0.1.0-r5] — 2026-05-06 — *Phase R-5: soft lifecycle gates + UI crash safety*

`9941410` Phase R-5 — фикс UI-крэша на пустом клиенте + soft lifecycle gates + статья v3.

### Added
- `scripts/validate_lifecycle_gates.mjs` — soft-валидатор четырёх гейтов жизненного цикла блока: `idea → todo`, `todo → progress`, `progress → review`, `review → done`. В nightly. Сейчас репортит, не блокирует — это канон (см. Приложение B.2 статьи).
- `tests/validate_lifecycle_gates.selftest.mjs` — 4 сценария (idea-warns / todo-broken-fails / progress-healthy-passes / done-no-evidence-fails).
- `_meta.size_bytes` + `_meta.estimated_tokens` в каждом context-pack (`scripts/build_context_pack.mjs`). Warning при > 8K токенов.
- DetailPanel показывает явную строку: «чтобы продвинуть статус — заполни: mission · kpi (3/5)» — soft-gate с visible подсказкой.

### Fixed
- `build_sima_design_payload.mjs` больше не валит API в 500 при отсутствии или коррупции `graph.json` клиента. Возвращает пустой payload вместо exception. Закрывает «белый экран» из live-репорта оператора.
- Payload всегда содержит `submodules: {}` (поле было пропущено, что роняло `graph.jsx:303` и `panels.jsx:89` на любом клиенте после создания первого блока).
- `data_loader.js` empty-client fallback тоже включает `submodules: {}`.
- `graph.jsx` и `panels.jsx` переведены на defensive accessors (`data.submodules?.[id] || []`).

### Changed
- `nightly_consolidation.mjs` — добавлены 2 проверки (`validate_lifecycle_gates`, `chat_fill_accept_selftest`). Total: 68 entries.

---

## [0.1.0-r4] — 2026-05-06 — *Phase R-4: multi-tenant fixes + chat_fill accept + Windows claude_cli*

`c912c9e` Phase R-4 — fix multi-tenant proposals + chat_fill accept + Windows claude_cli + create-module crash.

### Fixed
- **Multi-tenant proposals routing.** «160 одинаковых proposals в новом проекте» — root-pile протекал во все клиентские tabs. Теперь:
  - `list_proposals.mjs` / `accept_proposal.mjs` / `reject_proposal.mjs` поддерживают `--client <id>`.
  - HTTP-роуты `/atlas/proposals/list`, `/proposals/accept`, `/proposals/reject` пробрасывают `?client=X` / `body._client`.
  - `data_loader.js` `proposalsList` шлёт `?client`, accept/reject — через `withClient(...)`, accept авто-обновляет canvas.
- **chat_fill plans видимы и принимаются.** Раньше план `sima_fill_from_chat` тихо отбрасывался в `list_proposals` (нет `verdict: 'pending'`). Теперь:
  - `sima_fill_from_chat.mjs` пишет план с `verdict: 'pending'` + `kind: 'chat_fill'`.
  - `accept_proposal.mjs` распознаёт `kind: 'chat_fill'` и итерирует `new_block_proposals` → создаёт каждый блок с контракт-файлами.
- **Windows `claude_cli` detection.** `execFileSync('claude', ...)` не делает PATHEXT-резолюцию; Pro/Max-подписка пользователя на Windows была невидима. Теперь пробует `claude.cmd` и кэширует binary.
- **«Создать новый модуль» blank-screen.** `onAddModule` (index.html) и `Composer.accept` (views.jsx) обёрнуты в try/catch + нормализуют `presetArg` (раньше SyntheticEvent от toolbar воспринимался как `{x, y}` экранных координат).

### Added
- `tests/chat_fill_accept.selftest.mjs` — изолированный клиент, план с 2 новыми блоками, accept проверяет создание + контракт-файлы + verdict-flip + refused re-accept.

---

## [0.1.0-r3] — 2026-05-06 — *Phase R-3: chat-session watcher*

`7d98d98` Phase R-3 — chat-session watcher.

### Added
- `scripts/sima_watch_chats.mjs` — daemon/oneshot-сканер `~/.claude/projects/*/`-jsonl-файлов. Tracks per-file byte-cursor в `atlas/run_state/chat_watch_cursor.json`; на rotation/truncation сбрасывает.
  - Mode `propose` (default) — dryRun плана через `sima_fill_from_chat` (не патчит блоки).
  - Mode `auto` — патчит сразу.
  - Триггеры: `--once` для cron / agent / one-shot, `--daemon --interval-sec=N` для long-running sweeps.
- Status surface: `atlas/run_state/chat_watch_status.json` с last-run-данными для UI.
- MCP-инструмент `sima_watch_chats` — агент может вызывать «Sima, проверь свежие чаты».
- HTTP-роуты `POST /atlas/sima/watch-chats` (триггер) + `GET /atlas/sima/watch-chats/status` (для UI polling).
- Шумофильтр (Sima own LLM-prompts, Stop-hook feedback, pure-JSON tool blobs, assistant tool_use frames) — иначе ватчер тратит токены на feed-обратно собственных промптов.
- `tests/sima_watch_chats.selftest.mjs` — synthetic project dir с mixed real/noise turns. В nightly.

### Security / privacy
- `atlas/run_state/chat_watch_cursor.json` и `chat_watch_status.json` gitignored (содержат session UUID и home path; не для публичного репо).

---

## [0.1.0-r2] — 2026-05-05 — *Phase R-2: sima_fill_from_chat orchestrator*

Часть commit'а `1525439` (R-1 + R-2 в одном).

### Added
- `scripts/sima_fill_from_chat.mjs` — orchestrator «возьми переписку, заполни схему»: `extractInsights` → `fillField` per-блок-per-field → `synthesizeBlock` для новых → persist plan в `atlas/proposals/<ts>__chat_fill.json`.
- MCP-инструмент `sima_fill_from_chat` (transcript через stdin pipe).
- HTTP-роут `POST /atlas/sima/fill-from-chat`.
- UI-кнопка «✦ Sima — заполни всё по этой переписке» в композере.
- `ATLAS_FORCE_MOCK_LLM=1` flag для CI-детерминизма.

---

## [0.1.0-r1] — 2026-05-05 — *Phase R-1: claude_cli provider*

Часть commit'а `1525439`.

### Added
- `claude_cli` LLM-провайдер в `scripts/llm_gateway.mjs` — детектится через `claude --version`, использует подписку Claude.ai Pro/Max. **Без отдельного API-ключа.**
- Cascade: `['anthropic', 'google', 'claude_cli', 'mock']`.
- `callClaudeCli({system, prompt, schema, ...})` — shells `claude --print --output-format json`, defensive JSON parsing (raw → fenced → first balanced object).

---

## Phase Q — Q1+Q2+Q3+Q4 — *2026-05-04*

`f9d3308` — закрытие архитектурных gap'ов после re-чтения принципов.

### Added
- Drift detection improvements
- Parity matrix validation
- Cleanup block memory selftest

---

## Phase P-3 — *2026-05-03* — Per-block Playwright screenshots

`8e806da` — Playwright e2e-тесты по каждому блоку, скриншоты в `tests/playwright/screenshots/`.

---

## Phase P-2.1 + P-2.2 — *2026-04-30*

`22244ab` — demo-client + product-review pill.

---

## Phase P-1.1 + P-1.2 + P-1.5 — *2026-04-28*

`685b59a` — counters on cards + history snapshots + tech_stack chips.

---

## Phase J/L — *2026-04-25*

`11ee9d1` — multi-tenant artifacts + project picker + persistent activity log.

---

## Phase B–I — *2026-04-15 → 2026-04-22*

Foundation: design UI ↔ agent runs + acceptance + run-log + diff + AI assist + subsystem editor + schema templates + meeting/document intake + per-run enrichment.

---

*Полная git-история — `git log --oneline --reverse`.*

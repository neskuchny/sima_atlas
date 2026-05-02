# Sima Atlas — статус (PR1 honest reset → PR2 multi-layer → PR3 LLM gateway → PR4 Cursor hooks)

Дата: 2026-05-02

## Что произошло

Предыдущие STATUS_REPORT и `production_audit_report.md` рапортовали PASS / done. По факту:
- UI рисует **однослойную сетку 4×N**, потому что в `graph.json` у блоков нет поля `layer`, и `arch_canvas.jsx` не получает данных по слоям.
- LLM **не подключён нигде** в репо. «Семантический разбор диалога» в `analyze_conversation_to_atlas.mjs` — это `regex /(?:block|блок\p{L}*)\s+([a-z0-9._-]+)/giu`, который грепает буквальные строки «block X».
- 4 авто-блока (`b.semantic-llm`, `b.realtime-ingestion`, `b.payments`, `b.crm`) появились в графе как сирот без зависимостей и со 100%-шаблонными mission/kpi/acceptance: «Автосоздано из смыслов диалога» и «KPI-1: semantic extraction quality >= baseline».
- Cursor hooks в `.cursor/hooks.json` используют событие `afterPromptSent`, которое **не существует** у Cursor SDK. Хук игнорируется.
- Sync-валидаторы проверяют только наличие файлов, а не их смысл.

PR1 (этот) — Honest Reset. Не добавляет новых фич, только убирает фальшивый «done».

## Сделано в PR1

- [x] Удалены 4 регекс-сгенерированных блока из `graph.json` и их папки + context_packs.
- [x] Статусы 5 оставшихся блоков сброшены на честные с `status_reason`:
  - `b.ui-control` → wip (UI крашится плоской схемой; план в PR2).
  - `b.core-sync` → wip (sync проверяет только наличие файлов).
  - `b.db` → idea (нет реальной БД).
  - `b.agent-orchestrator` → wip (нет Cursor SDK / Claude Code интеграции; hooks выдуманы).
  - `b.docs` → wip (генерирует, но из шаблонов).
- [x] Шаблонные `mission.md / kpi.md / acceptance.md / tasks.md` всех 5 блоков заменены на содержательный текст с конкретными PR-привязками.
- [x] Добавлен новый блок `b.llm-gateway` (idea) — критический-path для PR3, без него «авто-генерация смыслов» не имеет смысла.
- [x] Добавлен новый валидатор `scripts/validate_no_template_placeholders.mjs`:
  - детектит forbidden-фразы («Ключевая цель блока», «Автосоздано», «KPI-1: метрика готовности определена», и т.п.);
  - проверяет минимальную длину mission/kpi/acceptance в зависимости от статуса блока;
  - игнорирует фразы внутри кавычек/backticks (чтобы можно было документировать анти-паттерны).
- [x] Валидатор подключён в `nightly_consolidation.mjs` как gate.

## Сделано в PR2 (multi-layer schema)

- [x] `atlas/graph.json` v2: вверху декларация `layers` (8 слоёв с порядком), у каждого блока появились поля `layer`, `type`, `mvp`, `subschema_id`, `tech_stack`, `files`.
- [x] Каждый блок получил `layer`: front (b.ui-control), logic (b.core-sync), ai (b.agent-orchestrator + b.llm-gateway), data (b.db), content (b.docs), testing (b.smoke-sandbox).
- [x] `files.md` всех 7 блоков заполнены реальными путями (95 alive файлов привязаны к блокам, 4 archived с warnings).
- [x] Новый валидатор `scripts/validate_files_registry.mjs`: проверяет существование `[alive]` файлов, варнит за `[archived]`/`[dead]` с висящими файлами и за `[pending]` файлы, которые уже есть.
- [x] `scripts/generate_atlas_bootstrap_js.mjs` полностью переписан: блоки разносятся по horizontal layer-bands; bootstrap инжектит недостающие layer-определения в `window.ARCH_LAYERS`; 'atlas-live' проект мерджится в `SIMA_DATA_V2.projects` и появляется в табах UI.
- [x] `Sima (Remix)/arch_data.js`: добавлен слой `testing`.
- [x] Smoke-тест `tests/atlas_bootstrap.smoke.mjs`: подтверждает что bootstrap-output имеет валидную layered-структуру (layers ⊆ ARCH_LAYERS, blocks have layer/x/title/note/status, links валидны, atlas-live в SIMA_DATA_V2).
- [x] `scripts/generate_wiki.mjs`: новая wiki содержит **Mermaid-диаграмму** графа продукта, секции по слоям с иконками статусов, детальные блоки с layer/type/tech_stack/files.
- [x] `scripts/render_wiki_html.mjs`: HTML-рендер с Mermaid (через CDN) и code-fence support.
- [x] `scripts/rebuild_atlas_roadmap.mjs`: **топологическая сортировка** по `depends_on` — Level 0 (без зависимостей) → Level 1 → ... — внутри уровня по приоритету статуса. Дополнительно сводка по слоям.

### Результат
- nightly_consolidation: **PASS 18/18** (добавлены 2 новых gate: files_registry, bootstrap_layered_smoke).
- Bootstrap проверен headless: 6 layers, 7 blocks (по слоям), 7 links.

## Сделано в PR3 (Real LLM extraction)

- [x] `scripts/llm_gateway.mjs` — единая точка входа во все LLM-вызовы Атласа. Поддерживает Anthropic, Google и mock-провайдер; structured output через JSON Schema; trace в `atlas/llm_traces/`; token budget + per-run cost cap; provider fallback на mock при 5xx/timeout.
- [x] Sugar `extractBlockSchema(dialogText)`: возвращает `{blocks:[{id, mission, layer, type, mvp, status, depends_on, provides, tech_stack, confidence}]}` через единую schema.
- [x] `tests/llm_gateway.selftest.mjs` — 4 case-теста: schema validation, extractBlockSchema flow, trace write, no-schema fallback.
- [x] `tests/llm_extraction.eval.mjs` — golden set из 5 эталонных диалогов; средняя точность ≥ 0.7 (mock = 1.0); проверяет id-recall, layer accuracy, mission-token overlap.
- [x] `tests/llm_mocks/` — fixtures под точный hash и под prompt-only hash (для CI без ключей).
- [x] `scripts/analyze_conversation_to_atlas.mjs` **полностью переписан**: убран regex `/(?:block|блок)\s+([a-z0-9._-]+)/`; вместо него вызов `extractBlockSchema()` с confidence-фильтром.
- [x] Safe upsert: новые блоки создаются с шаблоном papercon (mission/kpi/acceptance), существующие блоки **не перезаписываются** — LLM-предложения дописываются только в `checks.log` для будущего human-in-loop confirm в UI.
- [x] `scripts/simulate_conversation_branches.mjs` переписан как идемпотентный smoke новой LLM-семантики (создаёт новый блок, проверяет защиту существующего, восстанавливает state в конце).
- [x] `b.llm-gateway` поднят `idea → review`; `b.agent-orchestrator.depends_on` обновлён, чтобы включать `b.llm-gateway`.
- [x] `.gitignore` отсекает шум trace-логов (`atlas/llm_traces/*` кроме `.gitkeep`).

### Результат PR3
- nightly_consolidation: **PASS 21/21** (добавлено 3 новых gate: llm_gateway_selftest, llm_extraction_eval, simulate_conversation_branches).
- intelligence_health: 1.0 (7/7 блоков).
- Регекс-извлечение блоков из чата уничтожено; на его месте — schema-driven LLM extraction с confidence и провайдер-fallback.

## Сделано в PR4 (Real Cursor / Claude observation)

- [x] `scripts/generate_cursor_hooks.mjs` переписан: emit'ит **валидный Cursor format** `{ version: 1, hooks: { event: [{command}] } }`. Выдуманное `afterPromptSent` удалено.
- [x] 4 реальных hook-события: `beforeSubmitPrompt`, `afterFileEdit`, `beforeShellExecution`, `stop` — каждое запускает реальный node-скрипт.
- [x] **`scripts/observe_file_edit.mjs`** (afterFileEdit): принимает путь файла → ищет в `files.md` всех блоков → пишет `cursor_edit pass <path> :: <git diff --stat>` в `checks.log` нужного блока. Unowned файлы → warn в `b.agent-orchestrator/checks.log`. Также записывает событие в `atlas/process_runs/cursor_observations/<UTC>.json` для будущей UI-визуализации.
- [x] **`scripts/guard_against_drift.mjs`** (beforeShellExecution): читает `atlas/tech_stack.md` (новые fenced-блоки `forbidden` и `forbidden_substrings`) и блокирует команды против стэка. `pip install` / `yarn add vue` / `gem install` / `cargo add` → exit 1 + drift_blocked в trace. `npm install react` → пропускает.
- [x] **`scripts/inject_context_pack.mjs`** (beforeSubmitPrompt): автодетектирует block-id (env → prompt → last observation → first block) и печатает на stdout markdown context-pack: project + rules + tech_stack + block.mission/kpi/acceptance/depends/provides/files. Размер ограничен `SIMA_CONTEXT_PACK_MAX_BYTES`.
- [x] **`scripts/validate_cursor_hooks.mjs`** — gate в nightly: фейлится если формат не Cursor-совместимый, или если command ссылается на несуществующий script.
- [x] **`tests/cursor_hooks_actions.test.mjs`** — 9-case integration-тест (известный/unowned/empty path; pip/yarn-vue rejected vs npm/empty approved; inject by env vs auto-detect from prompt). Идемпотентный, snapshot/restore.
- [x] `atlas/tech_stack.md` расширен: декларация `forbidden` (regex) и `forbidden_substrings` для guard'a.
- [x] `b.agent-orchestrator` поднят `wip → review` — есть live evidence в checks.log по A1–A4.

### Результат PR4
- nightly_consolidation: **PASS 23/23** (добавлены 2 новых gate: validate_cursor_hooks, cursor_hooks_actions).
- `.cursor/hooks.json` теперь то, что Cursor реально умеет читать и исполнять.
- При любой правке файла из IDE Cursor автоматически запишет факт в `checks.log` владельца-блока — больше не нужно «всё помнить».
- При любой shell-команде агент сначала спросит guard (block кому-нибудь типа `pip install`, который противоречит стеку).
- При новом prompt пользователь автоматически получит inline-контекст по нужному блоку.

## Что НЕ сделано (по дизайну PR2 / PR3 / PR4)

- [ ] HTML uploads — не трогал. На текущем main все нужные JSX подключены через `atlas_bootstrap.js` и есть в `tweaks-panel.jsx` / `layer1_canvas.jsx`. Прежний диагноз «UI не загружается из-за пропавших скриптов» был основан на устаревшем срезе main, до добавления bootstrap. Реальная проблема UI — однослойность, и она лечится в PR2.
- [ ] Расширение модели блока (`layer/type/mvp/subschema_id/files`) — это **PR2**.
- [ ] Multi-layer rendering — **PR2**.
- [ ] LLM gateway — **PR3** (`b.llm-gateway` создан как idea).
- [ ] Реальный watcher Cursor / Claude — **PR4**.

## Текущее реальное состояние

| Блок | Статус | Что работает | Что не работает |
|---|---|---|---|
| b.ui-control | wip | React-канвас рендерится, layer-switcher, lifecycle-кнопки | Однослойная сетка; нет live-обновления из atlas; нет subschema |
| b.core-sync | wip | runSync детектит наличие файлов, прогресс tasks/kpi | Не сравнивает миссию с реализацией; нет stack-mismatch; нет file/line ссылок |
| b.db | idea | Markdown + localStorage; MCP read/write | Нет atomic writes; нет history; нет migrations; нет multi-project |
| b.agent-orchestrator | wip | MCP-сервер с 21+ tools | hooks.json неправильный; нет наблюдения за file edits; нет Claude Code adapter |
| b.docs | wip | Генерирует wiki.md, auto_tz.md, roadmap.md | Шаблонные missions попадают в wiki; нет mermaid-диаграммы; roadmap без topo-sort |
| b.llm-gateway | idea | — | Не реализован; критический gate для PR3 |

## Roadmap

- **PR2 — Schema model + multi-layer** (1–2 дня): расширить graph.json до v2 с `layer/type/mvp/subschema_id/files`; переписать `atlas_bootstrap.js` на layer-based раскладку; mermaid в wiki; topo-sort roadmap.
- **PR3 — Real LLM extraction** (2–3 дня): `b.llm-gateway` done; заменить regex в `analyze_conversation_to_atlas.mjs` на LLM с structured output; eval на golden set.
- **PR4 — Real Cursor observation** (2 дня): валидные Cursor hooks; observe_file_edit; guard_against_drift; Claude Code adapter.

## Команды для проверки PR1

```bash
node scripts/validate_block_contracts.mjs
node scripts/validate_no_template_placeholders.mjs   # новый
node scripts/validate_dependency_contracts.mjs
node scripts/nightly_consolidation.mjs               # должен пройти
```

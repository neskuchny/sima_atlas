# Sima Atlas — статус (PR1 honest reset)

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

## Что НЕ сделано (по дизайну PR1)

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

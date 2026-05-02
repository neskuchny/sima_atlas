# Sima Atlas — как проверить, что всё работает

Этот файл — единая точка входа для проверки PR1–PR4 на свежем клоне.

## 0. Подготовка

```bash
git clone https://github.com/neskuchny/sima_atlas.git
cd sima_atlas
git checkout claude/visual-component-system-N2W07
node --version   # должно быть >= 18 (нужен встроенный fetch)
```

Для PR3 live-режима LLM (опционально):

```bash
cat > .env <<EOF
ANTHROPIC_API_KEY=sk-ant-...
# или
GOOGLE_API_KEY=...
LLM_DEFAULT_PROVIDER=anthropic   # или google
LLM_MAX_USD_PER_RUN=0.05
EOF
```

Без `.env` всё работает через mock-провайдер с детерминированными фикстурами в `tests/llm_mocks/`.

---

## 1. Один shot — гонка всего pipeline

```bash
node scripts/nightly_consolidation.mjs
```

Ожидается финальная строка `Summary: PASS (23/23)`. Полный отчёт — в `atlas/nightly_report.md`.

23 проверки: ingestion queue, контракты блоков, нет шаблонов, реестр файлов, контракты зависимостей, ассерты приёмки, atlas selftest, layered bootstrap, llm gateway selftest, llm extraction eval, simulate conversation branches, validate cursor hooks, cursor hooks actions, sync context packs, agent parity, parity matrix, generate wiki/tz/roadmap, mcp smoke e2e, intelligence health.

---

## 2. Проверить визуальную схему (ТЗ: «многослойная карта продукта»)

```bash
# Регенерируем bootstrap из atlas/graph.json
node scripts/generate_atlas_bootstrap_js.mjs
# Затем открываем UI в браузере
open "Sima (Remix)/Сима - универсальный конструктор.html"  # macOS
# или
xdg-open "Sima (Remix)/Сима - универсальный конструктор.html"  # Linux
```

Что должно быть видно:
- В табах сверху — проект **Sima Atlas** (а не только мок-проекты sima/book/idea).
- На layer-2 (Архитектура) канвас рисует **6 горизонтальных полос** (front / logic / ai / data / content / testing).
- В каждой полосе свой блок: b.ui-control (front), b.core-sync (logic), b.agent-orchestrator + b.llm-gateway (ai), b.db (data), b.docs (content), b.smoke-sandbox (testing).
- Inspector справа показывает реальные mission/kpi/acceptance.
- Кнопки lifecycle (Implement / Review / Done / Rollback / Broken / Mark dead) активны.

Headless-проверка (без браузера):

```bash
node tests/atlas_bootstrap.smoke.mjs
# atlas_bootstrap smoke: OK (layers=6, blocks=7, links=7)
```

---

## 3. Проверить wiki + roadmap (ТЗ: «авто-документация продукта»)

```bash
node scripts/generate_wiki.mjs
node scripts/render_wiki_html.mjs
node scripts/rebuild_atlas_roadmap.mjs

# Открываем wiki — должен содержать Mermaid-диаграмму графа
open atlas/wiki.html

cat atlas/roadmap.md  # топосорт по depends_on (Level 0 → Level N)
cat atlas/WIKI.md     # секции по слоям + детальные блоки
```

---

## 4. Проверить sync-валидаторы (ТЗ: «проверка, что синхронизировано»)

```bash
node scripts/validate_block_contracts.mjs           # все блоки имеют mission/kpi/acceptance/tasks/checks
node scripts/validate_no_template_placeholders.mjs  # нет «Ключевая цель блока…», «Автосоздано…» (PR1)
node scripts/validate_files_registry.mjs            # все [alive] файлы в files.md существуют (PR2)
node scripts/validate_dependency_contracts.mjs      # depends_on/provides консистентны
node scripts/validate_acceptance_assertions.mjs     # для review/done есть acceptance trace
node scripts/validate_cursor_hooks.mjs              # PR4: hooks.json — валидный Cursor format
```

Каждая команда должна заканчиваться `OK` и exit 0.

---

## 5. Проверить LLM extraction (ТЗ: «авто-блоки из диалога»)

```bash
# Self-test gateway: схема, fallback, trace-write
node tests/llm_gateway.selftest.mjs
# llm_gateway.selftest: OK (4 cases)

# Golden eval на 5 эталонных диалогах
node tests/llm_extraction.eval.mjs
# llm_extraction.eval: OK — avg 1.00 on 5 cases (target 0.70)

# Smoke на conversation_branches: создаёт новый блок и защищает существующий
node scripts/simulate_conversation_branches.mjs
# 6 PASS-строк + simulate_conversation_branches: OK (state restored)

# Ручной тест: подать произвольный диалог
echo '{"text":"Делаем блок b.search на слое logic — полнотекстовый поиск через Postgres FTS, зависит от b.db"}' > /tmp/dialog.json
node scripts/analyze_conversation_to_atlas.mjs /tmp/dialog.json
# semantic_ingestion: applied 1 blocks (new=1, updated=0, provider=mock)

# Посмотреть trace LLM-вызова
ls atlas/llm_traces/
cat atlas/llm_traces/*.json | head -30
```

Если есть `ANTHROPIC_API_KEY` в `.env` — gateway автоматически уйдёт на Claude и trace покажет `provider: anthropic`.

---

## 6. Проверить Cursor hooks actions (ТЗ: «реальное наблюдение за работой агентов»)

```bash
# 9 case-тестов всех трёх hook-actions (observe / guard / inject)
node tests/cursor_hooks_actions.test.mjs
# cursor_hooks_actions.test: OK (9 cases)
```

Ручные проверки:

```bash
# 6.1. observe_file_edit маппит файл → блок
node scripts/observe_file_edit.mjs "Sima (Remix)/app_v2.jsx"
# observe_file_edit: Sima (Remix)/app_v2.jsx → b.ui-control
tail -1 atlas/blocks/b.ui-control/checks.log
# 2026-... cursor_edit pass Sima (Remix)/app_v2.jsx :: ...

# 6.2. guard блокирует pip install
node scripts/guard_against_drift.mjs "pip install neo4j"
# ✗ guard_against_drift: drift_blocked: ...
echo "exit=$?"   # ожидаем 1

# 6.3. guard пропускает npm install
node scripts/guard_against_drift.mjs "npm install react"
# guard_against_drift: OK — "npm install react"
echo "exit=$?"   # ожидаем 0

# 6.4. guard блокирует yarn add vue (substring rule)
node scripts/guard_against_drift.mjs "yarn add vue"
# ✗ guard_against_drift: drift_blocked: ...
echo "exit=$?"   # 1

# 6.5. inject_context_pack для конкретного блока
SIMA_BLOCK_ID=b.docs node scripts/inject_context_pack.mjs | head -30
# Markdown: project, rules, tech_stack, block.mission, kpi, acceptance, depends_on, provides, files

# 6.6. inject_context_pack автодетект блока из промпта
node scripts/inject_context_pack.mjs "продолжи b.core-sync, добавь stack-mismatch detector" | head -5
# <!-- block: b.core-sync -->
```

---

## 7. Проверить MCP-сервер (ТЗ: «один контекст для всех агентов»)

```bash
# Smoke MCP через stdio
node scripts/mcp_smoke_e2e.mjs
# mcp_smoke_e2e: OK

# Список tools (через JSON-RPC stdin/stdout)
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node scripts/mcp_atlas_server.mjs | head -1 | python3 -m json.tool | head -30
```

В Cursor подключить через `.cursor/mcp.json` — это уже сделано:

```bash
cat .cursor/mcp.json
# { "mcpServers": { "sima-atlas": { "command": "node", "args": ["scripts/mcp_atlas_server.mjs"], "cwd": "." } } }
```

После перезапуска Cursor в нём появятся tools: `read_block`, `list_dependencies`, `update_block`, `sync_check`, `build_context_pack`, `ingest_chat_distillate`, `enqueue_ingestion`, и т.д.

---

## 8. Проверить .cursor/hooks.json (ТЗ: «agents видят продукт одинаково»)

```bash
node scripts/validate_cursor_hooks.mjs
# cursor hooks validation: OK (4 events, 4 commands)

cat .cursor/hooks.json
```

Должен быть формат `{ version: 1, hooks: { event: [{command}] } }` с 4 событиями и 4 валидными node-командами.

---

## 9. Сводка статусов блоков

```bash
node -e "
const g = JSON.parse(require('fs').readFileSync('atlas/graph.json','utf8'));
for (const b of g.blocks) {
  console.log(b.status.padEnd(7), b.layer.padEnd(8), b.id.padEnd(24), '—', b.title);
}
"
```

Ожидается:
```
review  ai       b.agent-orchestrator     — Agent Orchestrator
wip     logic    b.core-sync              — Sync Engine
idea    data     b.db                     — Atlas Database
wip     content  b.docs                   — Docs Builder
review  ai       b.llm-gateway            — LLM Gateway
idea    testing  b.smoke-sandbox          — Smoke Sandbox (test target)
wip     front    b.ui-control             — UI Control Plane
```

(Любой блок в `done` без честного acceptance evidence — это баг, см. `validate_acceptance_assertions.mjs`.)

---

## 10. Тропы дальнейшей работы

| Хочу | Команда |
|---|---|
| Создать новый блок из CLI | `node scripts/manage_block.mjs create b.foo "Foo"` |
| Сменить статус блока | `node scripts/advance_block_state.mjs b.foo wip` |
| Собрать context-pack для блока (для отдачи в Claude/Cursor) | `node scripts/build_context_pack.mjs b.foo` (output → `atlas/context_packs/b.foo.json`) |
| Извлечь блоки из диалога | `node scripts/analyze_conversation_to_atlas.mjs <path/to/dialog.json>` |
| Ночная пересборка всего | `node scripts/nightly_consolidation.mjs` |
| Открыть актуальную wiki | open `atlas/wiki.html` |

---

## 11. Что должно НЕ работать (правильно блокироваться)

```bash
# Шаблонная mission в любом блоке → fail
echo "# b.test — mission

Ключевая цель блока и его значение для устранения рассинхрона." > /tmp/sample.md
# (mock — реально это произошло бы на любой попытке записи через MCP)
node scripts/validate_no_template_placeholders.mjs
# Ловит «Ключевая цель блока» → exit 1

# Удалённый alive-файл в files.md
git mv "Sima (Remix)/app_v2.jsx" "Sima (Remix)/_app_v2.jsx.bak"
node scripts/validate_files_registry.mjs
# Files registry validation FAILED:
#  ✗ b.ui-control: alive file missing → Sima (Remix)/app_v2.jsx
git mv "Sima (Remix)/_app_v2.jsx.bak" "Sima (Remix)/app_v2.jsx"   # восстановить

# Запрещённая команда → блокируется guard'ом
node scripts/guard_against_drift.mjs "pip install neo4j"
# ✗ guard_against_drift: drift_blocked
```

---

## 12. Reset / откат

Если по ходу проверки что-то изменилось (smoke добавил блок и т.п.):

```bash
git status
git checkout -- atlas/ "Sima (Remix)/atlas_bootstrap.js"
git clean -fd atlas/llm_traces/ atlas/process_runs/
```

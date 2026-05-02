# Прогресс по ТЗ (`ТЗ/описание.md` + `ТЗ/снепшоты/*`)

Дата: 2026-05-02 (обновлено после PR1 honest reset)

## 0) Главные требования из ТЗ и их реальный статус

| Требование `ТЗ/описание.md` | Статус | Комментарий |
|---|---|---|
| Извлечение цели/миссии/KPI/условий **из диалога с ИИ** | ✗ | regex по словам «block X»; LLM не подключён |
| Многослойная схема продукта (фронт/бэк/ИИ/данные/контент…) | ✗ | поле `layer` отсутствует в `graph.json` v1; PR2 |
| Подсхемы внутри блоков (рекурсия) | ✗ | `subschema.jsx` есть, но нет `subschema_id` в графе |
| Связи с описанием «что берётся / что отдаётся» | △ | `depends_on/provides` есть как строки; нужен формат `{block_id, capability}` |
| Подсветка рассинхрона с миссией / KPI на схеме | ✗ | sync проверяет только наличие файлов |
| Реальная привязка к коду (`files.md`) | ✗ | пустой у всех блоков |
| Скриншоты модулей в acceptance | ✗ | нет |
| Память удач/неудач (`patterns.md`) | △ | только у b.docs, и там 337 байт шаблона |
| Cross-agent одинаковый context-pack | △ | формат есть, но никто его не подсасывает автоматически |
| Hooks, перехватывающие реальные действия Cursor | ✗ | `afterPromptSent` не существует; формат action невалиден |
| LLM подключён | ✗ | ни одного fetch/SDK-вызова |
| Multi-project | ✗ | только один проект в atlas |
| Артефакты / переиспользование между проектами | ✗ | data_v2.js моки, не связаны с atlas |
| Один-к-одному соответствие со схемой пользовательского продукта | ✗ | atlas описывает сам себя, не пользовательский продукт |

## 1) Что уже работает по факту (после PR1)

- [x] Каркас `/atlas/` как источник правды (graph/schema/blocks/roadmap/rules/tasks).
- [x] React-канвас рендерится (HTML загружает все нужные JSX).
- [x] State transitions и кнопки lifecycle (`Implement / Review / Done / Rollback / Broken`) с гейтом «ready_to_done».
- [x] Базовый sync-check (наличие файлов + контракты `depends/provides` по строкам).
- [x] Context-pack export по выбранному блоку (UI-кнопка + CLI `build_context_pack.mjs`).
- [x] MCP-сервер с 21+ tools (read_block, sync_check, log_check, mark_file_dead, update_block, generate_*, ingest_chat_distillate).
- [x] Nightly consolidation pipeline (15+ валидаторов).
- [x] Wiki-генератор (markdown + минимальный wiki.html).
- [x] PR1 gate `validate_no_template_placeholders` — блокирует шаблонное содержание.

## 2) Чего нет по дизайну (плановые PR)

### PR2 — Schema model + multi-layer rendering
- [ ] graph.json v2: блок имеет поля `layer`, `type`, `mvp`, `subschema_id`, `files: []`, `depends_on: [{block_id, capability}]`, `provides: [{capability, description}]`.
- [ ] Migration runner v1→v2.
- [ ] `atlas_bootstrap.js` раскладывает блоки по layer-полосам (как `arch_data.js → ARCH_LAYERS`).
- [ ] `arch_canvas.jsx` корректно рисует горизонтальные слои.
- [ ] Subschema-рекурсия: двойной клик → новый канвас детей.
- [ ] Подсветка drift/broken на канвасе с tooltip-причиной.
- [ ] Mermaid-диаграмма в `wiki.html`.
- [ ] Roadmap topo-sort по `depends_on`.
- [ ] `auto_tz.md` пропускает блоки idea с пустой mission.

### PR3 — Real LLM extraction
- [ ] `b.llm-gateway` done: `scripts/llm_gateway.mjs` с structured output (Anthropic + Gemini + mock).
- [ ] Token budget guard, cost cap, trace-логирование.
- [ ] Заменить regex в `analyze_conversation_to_atlas.mjs` на `extractBlockSchema(text) → BlockSchema`.
- [ ] Eval на golden set из 5 диалогов (precision >= 0.7).
- [ ] UI: показывать confidence и diff перед записью в Atlas (accept/reject).

### PR4 — Real Cursor / Claude observation
- [ ] Валидные Cursor hooks: `afterFileEdit`, `beforeShellExecution` с настоящим `run_command`.
- [ ] `scripts/observe_file_edit.mjs`: на edit пишет `git diff --stat` в `checks.log` блока (по `files.md`).
- [ ] `scripts/guard_against_drift.mjs`: на shell-команде сверяет с `tech_stack.md`.
- [ ] Claude Code adapter: `claude --print --add-dir atlas/blocks/<id>` через MCP tool.
- [ ] `validate_agent_parity.mjs` с настоящим diff-сравнением context-pack между Cursor и Claude.
- [ ] Distillate генератор через `b.llm-gateway`: чат → distillate → блок.

### PR5+ (вне очереди приоритета)
- [ ] Скриншоты блоков (Playwright) → `blocks/<id>/screenshots/`.
- [ ] Multi-project в `/atlas/projects/<name>/`.
- [ ] Artefact reuse между проектами.
- [ ] Один реальный пример пользовательского продукта (не сама Сима).

## 3) Definition of Done для всего ТЗ

ТЗ считается закрытым, когда:
- [ ] Любой агент (Cursor / Claude Code / Codex / Antigravity) при запросе «реализуй блок X» получает идентичный context-pack из atlas, а не читает чат.
- [ ] Человек на UI за 60 секунд видит: какие блоки сделаны / в работе / сломаны / drift, и кликом получает причину.
- [ ] LLM реально извлекает mission/kpi/depends/provides из диалога с уровнем precision ≥ 0.7.
- [ ] Реальные file-edits Cursor/Claude автоматически пишутся в `checks.log` соответствующего блока.
- [ ] Sync-check возвращает воспроизводимый отчёт с конкретными file/line ссылками для drift.
- [ ] В atlas есть как минимум один пример пользовательского продукта, не саму Симу.

## 4) Стоппоинт
- Текущая остановка после PR1: см. `atlas/STATUS_REPORT.md`.
- Следующий шаг: **PR2 — Schema model + multi-layer**.

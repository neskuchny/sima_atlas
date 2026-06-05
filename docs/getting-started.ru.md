# Getting Started — Sima Atlas за 15 минут

Этот гайд проведёт тебя от пустой папки до **«агент сам реализует первый блок»**.

---

## 0. Что вообще такое Sima Atlas

Контракт-ориентированный control-plane между разработчиком и AI-агентом. Главная идея:

> **Блок = контракт, не код.** Каждый кусок продукта живёт как директория с `mission.md`, `kpi.md`, `acceptance.md` и связями. Агент (Claude / Cursor / Codex) читает контракт через MCP, пишет код, отчитывается фактами в `checks.log`. Sima проверяет каждый run на соответствие acceptance.

Это превращает «AI пишет код» из лотереи в управляемый процесс.

---

## 1. Установка (5 минут)

### Зависимости
- Node.js 18+ (`node -v`)
- Больше ничего — Python не нужен. UI dev-сервер на чистом Node (`npm run dev` его поднимает). На headless / серверных / Docker машинах браузер сам не откроется — открой напечатанный `http://localhost:8000/...` руками (или `npm run dev:nobrowser`).
- Claude Code CLI: `npm install -g @anthropic-ai/claude-code`, затем `claude` → `/login` (нужна Pro/Max или API-ключ)
- Опционально: Cursor CLI / Codex CLI — без них кнопки запуска fallback'ят в print-only mode

### Старт
```bash
git clone https://github.com/neskuchny/sima_atlas.git
cd sima_atlas
npm install
npm run dev
# UI:  http://localhost:8000/atlas_design/index.html
# API: http://localhost:8787
```

В корне есть `.mcp.json` — Claude Code сам подхватит MCP-сервер при первом запуске сессии в директории.

---

## 2. Создаём первый проект (1 минута)

Открой в браузере: `http://localhost:8000/atlas_design/index.html?client=my-project`.

Появится banner «Проект `my-project` ещё не создан». Нажми `+ Новый модуль` (тулбар или правый-клик по канвасу) — Sima автоматически создаст:

- `atlas/clients/my-project/graph.json` — граф блоков
- `atlas/clients/my-project/blocks/` — папка для блоков
- `atlas/clients/my-project/project.md` — миссия проекта (заглушка, заполнишь)
- `atlas/clients/my-project/rules.md` — правила кода (что нельзя делать)
- `atlas/clients/my-project/tech_stack.md` — стек

Banner исчезнет, появится первый блок на канвасе.

**Важно:** заполни `project.md` через `📖 Доки` в тулбаре или ContextRail слева. LLM-генерация будет качественнее, если знает миссию проекта.

---

## 3. Контракт блока (3 минуты)

Кликни на ноду блока → справа откроется DetailPanel. 4 главных таба:

### Обзор
Краткое описание + статус.

### Контракт ✱ главное
5 файлов контракта: `mission.md`, `user_story.md`, `kpi.md`, `acceptance.md`, `depends_on.md`, `provides.md`.

3 кнопки рядом с каждым:
- **`✎ Руками`** — открывает текстовое поле, пишешь сам.
- **`✨ Заполнить`** (для пустых) — Sima сгенерит черновик через LLM, видя `project.md`, `rules.md`, соседние блоки графа.
- **`✏ Переписать`** (для заполненных) — Sima правит ошибки/стиль, не вводя новых фактов.
- **`✨ Развернуть`** (для заполненных) — Sima добавляет акторов, edge cases, ссылки на соседей. Используй когда черновик худой.

Все правки идут на диск в `atlas/clients/<id>/blocks/<block_id>/<file>.md`.

### Задачи
Список задач через checkbox-list в `tasks.md`.

### Запуски
Прогоны агентов (см. шаг 6).

### Приёмка
Acceptance-verifier результат: pass/fail/inconclusive по каждому assertion.

---

## 4. Связи между блоками (1 минута)

Наводишь мышь на ноду — по краям появляются 4 чёрные anchor-точки (▲ ▶ ▼ ◀). Зажми точку, тяни на другую ноду, отпусти. Связь создана.

Альтернатива: `Shift + drag` от любого места ноды.

Чтобы переименовать связь — клик по линии → текстовое поле. `Esc` для отмены.

Чтобы удалить связь — клик по линии.

---

## 5. Подмодули (2 минуты)

У сложных блоков (UI page, бэкенд-сервис) бывает несколько внутренних модулей разных слоёв (frontend / backend / logic). Sima это поддерживает через **drill-down**.

1. **Двойной клик** по ноде ИЛИ правый-клик → `🔍 Провалиться внутрь`
2. Канвас становится пустым — это пустая подсистема внутри блока
3. Разверни `▸ Канвас` в левом верхнем углу
4. Кнопки `B / L / F / T` создают подмодуль с конкретным слоем:
   - **B** = backend (API, persistence)
   - **L** = logic (rules, computations)
   - **F** = frontend (UI components, screens)
   - **T** = tests (unit, e2e)
5. Подмодуль = настоящий блок с папкой `atlas/clients/<id>/blocks/<parent>.s1/`. У него полный контракт. В DetailPanel появится плашка `↑ parent: b.X` — клик возвращает к родителю.

Связи между подмодулями — те же anchor-точки. Они живут в общем `graph.edges`, фильтруются в drill-view.

Назад из drill — крошки сверху канваса (`↑ верхний уровень`).

---

## 6. Запуск агента (3 минуты)

Открой блок с заполненным контрактом → таб `Запуски` → 3 кнопки:
- **`Claude Code`** — спавнит `claude --print --add-dir <blockdir> --add-dir <atlas>` с твоей миссией+тасками+акцептансом как промптом.
- **`Cursor`** — то же через `cursor-agent`.
- **`Codex`** — то же через `codex`.

Нажмёшь — появится «live» карточка с phase'ами FSM (`PreparingWorkspace → LaunchingAgent → Running → Verifying → Succeeded`).

Если CLI агента не установлен (например `cursor-agent` отсутствует), Sima автоматически fallback'ит в **print-only mode**: сохраняет промпт в `atlas/clients/<id>/agent_invocations/<UTC>__<block>.txt`. Скопируй и вставь в Cursor IDE / другой LLM руками.

После завершения run'а:
- В блока `checks.log` появится `agent_invocation pass agent=claude summary=...`
- В `Запусках` карточка получит badges: «приёмка pass», «↑ N файлов», «$0.0123» (стоимость)
- Если acceptance-verifier пройдёт — блок eligible для перевода в `done`

### Внешние запуски
Если ты сам запустил Cursor IDE (без UI кнопки) и он отчитался в `checks.log` — Sima тоже покажет это во вкладке `Запуски` с badge `extern`. Полного лога не будет, но факт run'а виден.

---

## 7. Sima сама заполняет блоки из переписки

В тулбаре `+ Артефакт` → вкладка `Текст`. Вставь содержимое чата с разработчиком/PM (где обсуждались блоки продукта). Жми `✦ Sima — заполни`.

Sima:
1. Извлечёт цели / KPI / задачи / риски / термины из текста
2. Предложит набор блоков с заполненными `mission.md` / `acceptance.md` / `depends_on`
3. Покажет «✦ Предложения» в тулбаре с pending-планом
4. Acceptable / reject по каждому блоку перед записью на диск

Это и есть «Sima сама создаёт схему из требований» — главное обещание системы.

---

## 8. Что важно понимать про архитектуру

### Многослойность
Каждый блок имеет `layer`:
- `backend` — серверная логика, API, БД
- `frontend` — UI, компоненты, экраны
- `logic` — бизнес-правила, чистые функции
- `tests` — проверки

Цвет ноды на канвасе зависит от слоя.

### Multi-tenant
Один сервер обслуживает много проектов. URL `?client=<id>` переключает контекст:
- `?client=main` — корневой `atlas/blocks/` (Sima сама)
- `?client=my-product` — `atlas/clients/my-product/blocks/`
- `?client=other-product` — `atlas/clients/other-product/blocks/`

В тулбаре project-picker (текущий клиент) — переключаться + создавать новые.

### Память блока
Помимо контрактных файлов, у каждого блока есть memory layer (R-7.76+):
- `narrative.md` — append-only run history. Каждый успешный run дописывает секцию: *что пробовал / что сработало / что упало и почему / какие решения принял*. **Авто-инжектится в следующий prompt** под «## ⚠ Block memory».
- `decisions.log` — структурный TSV (timestamp · author · decision). `cascade_verify` пишет сюда когда детектит поломку из-за parent edit.
- `patterns.md` — извлечённые уроки «что сработало / что не работало»
- `code_summary.md` — LLM-сводка кода блока (regenerated после run'а)
- `history/` — снапшоты файлов при каждом patch'е

Плюс operator-locked memory на уровне проекта (в `atlas/operator_profile/`):
- `dont_use.json` / `always_use.json` — per-block (или global) правила с `severity:hard|soft`. Hard-правила **проваливают run** при нарушении (post-run drift scanner, R-7.82).
- `lessons.json` — накопленные уроки с evidence

Всё это попадает в context-pack следующего run'а — агент читает до того как трогать код, и физически не может молча отменить прошлое архитектурное решение.

### Архитектурный lock-in проекта (R-7.85, S-6)
`atlas/architecture_decisions.md` (или `atlas/clients/<id>/architecture_decisions.md`) — **append-only** by design. Каждая запись авто-инжектится в КАЖДЫЙ prompt по ВСЕМ блокам под «## ⚖ Architecture decisions (project-level — DO NOT silently reverse)».

Добавить можно через:
- MCP tool: `add_architecture_decision {decision, rationale, affects?, reversible?}`
- HTTP: `POST /atlas/architecture-decisions/add`
- CLI: `node scripts/architecture_decisions_api.mjs add ...`

**Edit/delete API нет** — change requests идут через `narrative.md`.

### Implementation Status panel (R-7.86)
**Overview tab** каждого блока теперь открывается с 8-row dashboard сверху: Mission · KPIs · Acceptance · Tasks · Files alive · Decisions logged · Run history · Block status. Каждая строка с маркером ✓/~/✗/· — contract-vs-reality прогресс виден без кликов по вкладкам.

### Token Spend widget (R-7.87, S-9)
Под Implementation Status — **Token Spend** widget: actual cost + Anthropic Haiku 4.5 «shadow bill» equivalent + top-burning ops + by-provider breakdown. Селектор окна (7/30/90 дней). Per-block view фолбэчится в project-wide когда у блока ещё нет записанных `run_state`.

### Профили context-pack (R-7.86, S-4)
При старте run-а можно выбрать профиль для контроля размера prompt-а:
- `design` (default) ~5–15K — full pack, для нового блока / крупного рефакторинга
- `backend-fix` ~2–4K — mission + acceptance + decisions + narrative + deps' provides only
- `ui-fix` ~1.5–3K — frontend-focused, deps пропускаются полностью
- `acceptance-only` ~0.5–1.5K — только верификатор / "ready to ship"

Выбор: `--profile` CLI flag, `ATLAS_PACK_PROFILE` env var, или MCP arg `{profile}`. UI селектор в roadmap (S-10).

`architecture_decisions.md` **всегда** включён независимо от профиля.

### Cascade verify on edit (R-7.84, S-8)
После каждого успешного run блока X, `cascade_verify` обходит reverse-deps в `graph.json` и перезапускает acceptance верификатор на каждом блоке у которого `depends_on` ссылается на X. Что сломалось — получает `status: desync` на канвасе сразу + stack-trace-style запись в его `narrative.md`. Видишь цепочку inline, не в ночной sweep.

---

## 9. Куда смотреть когда сломалось

`docs/troubleshooting.md` — реальные ошибки и фиксы из R-7.X дебагов:
- LLM Invalid API key / 401
- Запуски Cursor/Codex ENOENT
- block dir not found
- Multi-tenant baner stuck
- UI клики не работают
- CLI-entry bug на Windows

При любой ошибке `npm run dev` показывает api-лог с конкретным reason.

---

## 10. Дальше

- **Acceptance.md** — пиши тестируемые критерии (`evidence_kind: shell|grep|ast|run|llm`). Sima автоматически прогонит верификатор после каждого run'а.
- **Architecture review** — `Архитектура` в тулбаре → Sima пройдёт по всему графу + project.md, найдёт противоречия, drift с tech_stack, missing dependencies.
- **Подагенты** — `Подагенты` в тулбаре → специализированные роли (verifier / wiki-builder / schema-syncer) для рутинных проверок.
- **Шаблоны** — типовые скелеты блоков (auth-service, dashboard-page, etc.). Применяешь — получаешь набор блоков с готовым контрактом.

---

## TL;DR

```
clone → npm install → npm run dev
?client=my-project → + Новый модуль → заполнить mission/acceptance
shift+drag создаёт связи · 2×клик проваливается внутрь
Запуски → Claude Code → дождаться pass
git commit
```

И главное — **читай `docs/troubleshooting.md` когда что-то странное**. Там собраны реальные фиксы из боевых дебагов.

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
- Python 3 (для UI dev-сервера; статический http.server)
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
- `?client=my-saas` — `atlas/clients/my-saas/blocks/`
- `?client=other-product` — `atlas/clients/other-product/blocks/`

В тулбаре project-picker (текущий клиент) — переключаться + создавать новые.

### Память блока
Кроме контрактных файлов, у блока есть:
- `decisions.log` — принятые решения (LLM экстрагирует из run-логов)
- `patterns.md` — извлечённые уроки «что сработало / что не работало»
- `code_summary.md` — сводка по коду блока (regenerated после run'а)
- `history/` — снапшоты файлов при каждом patch'е

Эти файлы попадают в context-pack следующего run'а — агент учится на ошибках.

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

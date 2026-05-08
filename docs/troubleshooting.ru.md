# Sima Atlas — Troubleshooting

Реальные ошибки, с которыми сталкивались операторы, и проверенные фиксы.
Берись за конкретный симптом; если его здесь нет — пиши в issue.

---

## 1. LLM / Claude CLI

### `Invalid API key · Fix external API key` в ответе LLM

**Симптом.** Кнопки `✏ Переписать` / `✨ Заполнить` / `Совет Клода` отрабатывают, но в модалке появляется текст «Invalid API key» (или подобный), а в `npm run dev` логе:
```
[llm-gateway] claude --print exited 1 with parseable JSON; accepting (likely Windows cmd-wrapper quirk).
[llm-gateway] claude_cli failed (claude_cli error: Invalid API key · Fix external API key); trying next in cascade [...]
```

**Причина.** В системе установлен `ANTHROPIC_API_KEY` env var с битым/устаревшим ключом. Claude CLI приоритезирует env-key над встроенной Pro/Max-сессией.

**Фикс (Windows PowerShell).**
```powershell
# 1. Снести битый env var
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY',$null,'User')
[System.Environment]::SetEnvironmentVariable('ANTHROPIC_API_KEY',$null,'Process')

# 2. Перелогиниться через subscription
claude logout
claude
# в интерактивной сессии: /login
# выходи через /quit или Ctrl+D
```

**Фикс (macOS/Linux).**
```bash
unset ANTHROPIC_API_KEY
# в ~/.zshrc, ~/.bashrc удалить строки export ANTHROPIC_API_KEY=...
claude logout
claude  # /login
```

После — перезапусти `npm run dev`. В api-логе должно быть `using provider=claude_cli (subscription via claude CLI)` без последующего `failed`.

### `Failed to authenticate. API Error: 401 Invalid authentication credentials`

**Причина.** Сессия claude CLI протухла или повреждена, env уже чистый.

**Фикс.** В терминале:
```bash
claude
# /login
# дождись «Login successful»
# /quit
```

### `claude --print exited 1 with parseable JSON; accepting`

Не ошибка — Windows cmd.exe wrapper quirk. Gateway видит, что в stdout валидный JSON envelope (`{result, usage}`), и принимает несмотря на нечёрный exit-код. Это нормально и фикс уже встроен (R-7.13).

### LLM возвращает пустой результат / fallback на mock

**Симптом.** Модалка `✏ Переписать` открылась, в textarea — пусто или короткий текст «I'm ready, what would you like to work on?».

**Причина.** Claude CLI не смог распарсить prompt + schema (бывает редко) ИЛИ ответил беседой вместо JSON. Gateway:
1. R-7.37: при failed schema-parse — оборачивает raw текст как `{content: text}`. Видишь сырой ответ, можешь редактировать руками.
2. R-7.37b: при detection auth-error — fallback на anthropic API → google → mock.

**Что проверить.** В api-логе (`npm run dev` окно) ищи:
- `[llm-gateway] claude_cli schema-parse failed; ... text-head=...` — claude ответил не JSON'ом, R-7.37 завернул raw в content
- `[llm-gateway] claude_cli failed (...); trying next in cascade [...]` — auth/rate-limit, активирован fallback

---

## 2. Запуски агентов (`/runs/start`)

### `spawnSync codex ENOENT` / `spawnSync cursor-agent ENOENT`

**Симптом.** Нажал `Запустить блок → Cursor` (или Codex), запуск идёт в Failed:
```
run_block_implementation: codex failed → spawnSync codex ENOENT
```

**Причина.** У тебя нет `cursor-agent` или `codex` CLI в PATH.

**Фикс.** R-7.32: оркестратор теперь автоматически fallback'ит в **print-only mode** для всех 3 агентов. Промпт сохраняется в `atlas/clients/<client>/agent_invocations/<UTC>__<block>.txt`. Открой его, скопируй содержимое — вставь в IDE Cursor / Codex / любой другой агент руками.

Если хочешь полноценный запуск:
- **Cursor**: `npm install -g @cursor/cursor-agent` (если доступно), либо использовать UI Cursor вручную
- **Codex**: установить Codex CLI согласно их docs

### `block dir not found → atlas/blocks/<id>`

**Симптом.** Run падает мгновенно с этой ошибкой; в `atlas/run_logs/<run_id>.log` только эта строка.

**Причина (до R-7.22).** Оркестратор был multi-tenant blind, смотрел в `ROOT/atlas/blocks/<id>` вместо `atlas/clients/<client>/blocks/<id>`.

**Причина (после R-7.22, до R-7.32).** UI не пробрасывал `client_id` в `/runs/start` из-за race в чтении `window.__SIMA_DATA_CLIENT`. В run_log: `client=(default)`.

**Фикс.** Обновись на R-7.32+. Проверь:
```bash
git log --oneline -5
# должно показать R-7.32 или новее
```

### Вкладка «Запуски» пустая, хотя run был

**Причина.** `run_state/<run_id>.json` не записан, потому что run упал сразу (см. два предыдущих пункта).

**Фикс.** Проверь `atlas/run_logs/<run_id>.log` — там reason. Чаще всего auth или ENOENT.

### Внешний запуск Cursor (вне UI кнопки) не виден в «Запусках»

**Симптом.** Запустил Cursor IDE на блоке руками; контракты заполнились, в `checks.log` появилась строка `cursor_run pass ...`. Но во вкладке «Запуски» в UI пусто.

**Причина.** `/runs/list` читает только `run_state/<run_id>.json` (наш orchestrator). Внешние запуски этот файл не создают.

**Фикс (планируется в R-7.24).** Добавить fallback-источник: парсить `cursor_run|claude_run|codex_run` строки из `checks.log`. Пока — внешние запуски видны только в самом checks.log.

---

## 3. Multi-tenant / клиенты

### Banner «Проект `<name>` не существует»

**Симптом.** Ввёл `?client=my-saas` в URL, banner предлагает создать проект.

**Фикс.** R-6.1: при первой mutation (создание блока, edit field) клиентская папка создаётся автоматически. Просто нажми `+ Новый модуль` — после успеха banner исчезнет.

### Block create зацикливается с «already exists»

**Симптом.** Нажимаешь `+ Новый модуль`, в логе несколько раз «уже существует, пробую b.block-N+1», в итоге fail.

**Причина (R-7.3, R-7.11).** В graph.json остались стейл-ссылки на удалённые блоки.

**Фикс.** В тулбаре кнопка `⟲ Сбросить клиента` (R-7.4) → подтверди → graph.json + blocks/ + proposals/ + acceptance_runs/ снесутся, project.md/rules.md/tech_stack.md останутся.

---

## 4. UI

### Клик правой кнопкой по ноде → меню появилось, но кнопки не работают

**Причина (до R-7.26).** Канвас onMouseDown ловил mousedown на ctx-menu-кнопке РАНЬШЕ click, сбрасывал `ctxMenu=null`, кнопка анмаунтилась до того как onClick срабатывал.

**Фикс.** R-7.26: добавил `.ctx-menu` в early-return whitelist канваса. После пула — все кнопки в правом-клике работают.

### Связи между блоками не создаются

**До R-7.28.** Не было реализации.
**R-7.28.** Shift+drag по ноде → создаёт связь.
**R-7.33.** Hover ноды → 4 anchor-точки по краям. Drag от точки на другую ноду — связь без Shift.

Если всё ещё не работает — проверь, что после Shift'а ИЛИ зажимания anchor-точки появляется пунктирная линия за курсором. Если её нет — handler не вызвался, пришли DevTools Console + Network.

### Контракт-tab не работает у подмодуля

**Симптом.** Провалился в блок (drill-down), создал подмодуль `b.X.s1`, кликнул — DetailPanel открылся, но Контракт пустой.

**Причина.** Подмодули хранятся как JSON-записи внутри `subsystem.json` родителя, у них **нет** собственной папки `atlas/clients/<id>/blocks/<sub_id>/`. Поэтому mission.md / kpi.md / acceptance.md загружать неоткуда.

**Что работает у подмодуля.** Title, layer, status, координаты, связи внутри подсистемы.

**Что НЕ работает.** Контракт-файлы, запуски агентов, acceptance.

**Фикс (планируется в R-7.36).** Кнопка «promote to block» — конвертирует подмодуль в полноценный блок с папкой и контрактами.

### DetailPanel: «Блок ещё не подгружен»

**Причина.** UI выбрал блок, которого нет ни в outer modules, ни в активной подсистеме. Бывает после удаления / переименования.

**Фикс.** Нажми Sync в тулбаре или Ctrl+R.

### Закрыл DetailPanel ✕ → правая часть осталась пустой большой колонкой

**Причина (до R-7.30).** `app.no-detail` CSS-класс применялся только при `!selectedId`, но не при `!detailOpen`.

**Фикс.** R-7.30: `app.no-detail` теперь применяется при любом из двух условий. Канвас разворачивается на всю ширину.

### Кнопка `📖 Доки` / `✨ Совет Клода` обрезана за правым краем

**Причина.** Топбар переполнен, кнопки уезжают в overflow без visible scroll.

**Фикс.** Открой DevTools на полный экран; в узких окнах используй командную палитру `⌘K` (или `Ctrl+K`) → она знает все основные действия включая «Системные доки», «Совет Клода».

### Поле в Контекст-Rail не редактируется одним кликом

**Фикс (R-7.31).** Single-click активирует edit. На hover — пунктирное подчёркивание (visual affordance). Если по-прежнему не работает — проверь, что pull сделан на R-7.31+.

---

## 5. Build / dev environment

### `node scripts/build_sima_design_payload.mjs` молча выходит, ничего не печатает

**Причина (до R-7.18).** Windows CLI-entry check был `import.meta.url === \`file://${process.argv[1]}\``, который **никогда не матчится на Windows** из-за разных слешей.

**Фикс.** R-7.18: переписан на `fileURLToPath(import.meta.url) === process.argv[1]` — работает на обоих ОС. 27 скриптов получили этот fix одновременно.

### Cache не обновляется, изменения не видны в браузере

**Фикс.** Hard refresh: Ctrl+F5 (Windows) / Cmd+Shift+R (macOS). Каждый коммит UI-фиксов бампает `?v=r7-XX` cache-buster, но иногда браузер кэширует HTML тоже.

### `git status` показывает массу CRLF warning'ов на Windows

**Причина.** Файлы были созданы на macOS/Linux с LF line-endings, git автонормализует к CRLF на Windows.

**Что делать.** Игнорируй — Git нормализует обратно при коммите. Если раздражает:
```bash
git config --global core.autocrlf false  # сохранять как есть
# или
git config --global core.autocrlf input  # LF в repo, конвертить только при checkout
```

---

## 6. Скрипты на Windows (общая нота)

Если какой-то скрипт `node scripts/<X>.mjs` на Windows ведёт себя странно (молчит, не делает ничего, exit 0 без эффекта) — проверь, что это не та же CLI-entry bug R-7.18. Все наши 27 скриптов фиксились в одном коммите `63edbed`. Если ты копируешь скрипт со старого fork'а — поменяй:
```diff
-if (import.meta.url === `file://${process.argv[1]}`) {
+if (fileURLToPath(import.meta.url) === process.argv[1]) {
```
И убедись, что есть `import { fileURLToPath } from 'node:url';`.

---

## Куда писать

Если симптом сюда не подходит — заведи issue в `https://github.com/neskuchny/sima_atlas/issues` с:
- что нажимал в UI / какая команда в CLI
- что появилось в `npm run dev` (api лог)
- что в DevTools Console + Network (если UI)
- какой фазы (R-7.X) текущий HEAD: `git log --oneline -1`

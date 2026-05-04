# Как проверить, что всё работает

> **Windows / PowerShell?** Примеры в этом документе даны для bash/zsh.
> Главные отличия PowerShell:
>
> | bash | PowerShell | cmd |
> |---|---|---|
> | `KEY=value command` | `$env:KEY = "value"; command` | `set KEY=value && command` |
> | `which claude` | `Get-Command claude` | `where claude` |
> | `cmd1 && cmd2` | `cmd1; if ($LASTEXITCODE -eq 0) { cmd2 }` (PS 7+ понимает `&&`) | `cmd1 && cmd2` |
> | `open URL` | `Start-Process URL` | `start URL` |
> | `node app.mjs &` (фон) | `Start-Job { node app.mjs }` | — |
>
> **Главная команда — `npm run dev`** (см. ниже): один процесс
> запускает API + статику + открывает браузер. Не нужно крутить два
> терминала вручную.

Этот документ — единственный source of truth для ответа на вопрос
«как мне проверить, что Sima Atlas действительно работает в моей среде, в
том числе с Claude Code и Cursor IDE?». Каждая секция самодостаточна — если
упала только одна, остальные всё ещё ценны.

## TL;DR — две команды

```sh
npm run verify     # все автотесты (nightly + acceptance + Playwright + MCP)
npm run dev        # запустить локальный UI и открыть в браузере
```

`npm run dev` — кросс-платформенный launcher (`scripts/dev_server.mjs`):
1. поднимает `atlas_api_server` на :8787
2. поднимает `python http.server` на :8000 (отдаёт `Sima (Remix)/`)
3. открывает `http://localhost:8000/atlas_design/index.html` в браузере
4. на Ctrl-C аккуратно гасит обе подпроцесса

Флаги: `--no-browser` (не открывать), `--ui-port 8001`, `--api-port 8788`,
`--url http://localhost:8000/index.html` (открыть классический UI вместо
дизайн-canvas).

## TL;DR — `npm run verify`

```sh
npm run verify
```

Эта команда (она же `node scripts/verify_all.mjs`) последовательно прогоняет
**5 фаз**:

| Фаза | Что проверяет | Время |
|---|---|---|
| `nightly` | 56+ скриптов: все валидаторы, selftest'ы, smoke-тесты, gen wiki/tz/roadmap, verify_all_acceptance | ~60s |
| `acceptance` | Cross-block acceptance summary (10 блоков, 60+ assertions) | ~10s |
| `cursor` | Headless Cursor hooks: drift guard, file-edit observer, context-pack inject | ~1s |
| `screenshots` | Boots React UI в Chromium через Playwright, делает скриншоты канвы и proposals panel | ~45s |
| `mcp` | Round-trip через MCP JSON-RPC (initialize → tools/list → finalize) | ~1s |

**Ожидаемый итог**: `5 pass / 0 fail / 0 skipped` + `acceptance: blocks_pass=10 blocks_fail=0 blocks_inconclusive=0`.

Если что-то фейлится — запусти `npm run verify --json` для подробного вывода каждого шага.

## Что нужно установить один раз

```sh
git clone <repo>
cd sima_atlas
npm install                      # ставит @playwright/test
npx playwright install chromium  # ~110 MiB headless-shell
```

Никаких других зависимостей нет. Node 22.x, Python 3 (для статического сервера UI), git.

---

## Проверка по слоям (если нужно копнуть глубже)

### 1. Контракты блоков

```sh
node scripts/validate_block_contracts.mjs            # 8 файлов на блок
node scripts/validate_dependency_contracts.mjs       # depends_on:capability
node scripts/validate_files_registry.mjs             # alive файлы существуют
node scripts/validate_no_template_placeholders.mjs   # mission/kpi не "TBD"
```

Все четыре должны вернуть `OK`. Если нет — конкретный блок не проходит контракт; посмотри stderr.

### 2. Acceptance verifier (per-block)

Каждый блок имеет `atlas/blocks/<id>/acceptance.md` с `A1..AN`. Verifier проверяет каждый assertion через детерминированные коллекторы (exit_code / fs_glob / file_diff / log_grep / selftest_run) и падает обратно на LLM-judge только когда нет YAML evidence_spec.

```sh
# Один блок:
node scripts/verify_block_acceptance.mjs b.llm-gateway

# Все блоки:
node scripts/verify_all_acceptance.mjs

# Через MCP (см. ниже):
{"method":"tools/call","params":{"name":"verify_block_acceptance","arguments":{"block_id":"b.llm-gateway"}}}
```

Сводка пишется в `atlas/acceptance_runs/_summary.json`.

### 3. Operator profile + lessons

```sh
node scripts/aggregate_operator_profile.mjs   # пишет profile.json + patterns/
node scripts/analyze_lessons_from_history.mjs # LLM-driven уроки
node scripts/manage_dont_use.mjs list         # личные запреты
node scripts/pick_template.mjs backend        # шаблон с adjustments
```

Сегодня репо в `warming_up` (нужно ≥5 done и ≥10 invocations). Это ожидаемо.

### 4. End-user docs generator

```sh
node scripts/regenerate_user_docs_drift.mjs   # nightly drift-check
node scripts/generate_user_docs.mjs b.todo-ui # принудительная генерация
node scripts/check_user_docs_locked.mjs       # pre-commit guard
```

Результаты — в `atlas/docs/end-user/<block>.md` + `_meta/<block>.json`.

### 5. Run lifecycle FSM (Symphony-inspired)

```sh
node scripts/run_state.mjs list               # все прогоны
node scripts/run_state.mjs list --active      # только активные
node scripts/run_state.mjs detect-stalled     # пометить зависшие
node scripts/agent_workspace.mjs list         # песочницы под ~/.atlas_workspaces/
```

---

## Проверка с Claude Code CLI

Pre-requisite: установлен `claude` CLI ([docs](https://docs.claude.com/en/docs/claude-code/quickstart)).

### Smoke

```sh
# bash / zsh / Git Bash
which claude && claude --version
```

```powershell
# PowerShell
Get-Command claude; claude --version
```

### Запустить агента на блоке

```sh
# bash
ATLAS_AGENT=claude node scripts/run_block_implementation.mjs b.smoke-sandbox
```

```powershell
# PowerShell — env-vars выставляются через $env:
$env:ATLAS_AGENT = "claude"
node scripts/run_block_implementation.mjs b.smoke-sandbox
```

```bat
:: Windows cmd.exe
set ATLAS_AGENT=claude && node scripts/run_block_implementation.mjs b.smoke-sandbox
```

Что должно произойти:
1. Создаётся `atlas/run_state/<run_id>.json` со статусом `PreparingWorkspace`
2. FSM движется через `LaunchingAgent → Running → Verifying → Succeeded|Failed`
3. После успеха автоматически спавнится verifier; verdict пишется в FSM-файл
4. В `atlas/blocks/b.smoke-sandbox/checks.log` появляется `agent_invocation pass agent=claude summary=...`

### Запустить с изолированным workspace (Symphony-style)

```sh
# bash
ATLAS_USE_WORKSPACE=1 ATLAS_AGENT=claude \
  node scripts/run_block_implementation.mjs b.smoke-sandbox
```

```powershell
# PowerShell
$env:ATLAS_USE_WORKSPACE = "1"
$env:ATLAS_AGENT = "claude"
node scripts/run_block_implementation.mjs b.smoke-sandbox
```

Что добавится:
1. Создаётся `~/.atlas_workspaces/<run_id>/` — копия репо
2. Claude работает В песочнице, не в основной директории
3. После успеха — `git diff --no-index` пишется как proposal `kind=agent_run_diff`
4. Verifier запускается **внутри workspace** (`ATLAS_ROOT=<ws>/atlas`) — судит изолированную работу
5. Workspace удаляется только если verdict !== fail И нет pending diff proposal

Просмотреть результат:

```sh
node scripts/list_proposals.mjs --json | jq '.[] | select(.kind=="agent_run_diff")'
```

Принять diff (применить изменения в реальный репо):

```sh
node scripts/accept_proposal.mjs <proposal_id>
```

### Через MCP

В `.cursor/mcp.json` (или Claude Desktop config) включи MCP сервер Атласа:

```json
{
  "mcpServers": {
    "sima-atlas": {
      "command": "node",
      "args": ["/абсолютный/путь/к/sima_atlas/scripts/mcp_atlas_server.mjs"]
    }
  }
}
```

Перезапусти агента. В чате попробуй:

```
Используй sima-atlas MCP. Запусти `verify_block_acceptance b.llm-gateway`.
```

Агент должен вернуть структурированный verdict со списком assertions.

Полный список из 50+ MCP tools:

```sh
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node scripts/mcp_atlas_server.mjs | jq '.result.tools[] | .name'
```

---

## Проверка с Cursor IDE

Pre-requisite: Cursor установлен и поддерживает hooks API (`beforeShellExecution / afterFileEdit / beforeSubmitPrompt`).

### Headless smoke (без открытия Cursor)

```sh
node tests/cursor_live.headless.smoke.mjs
```

Это симулирует то, что Cursor делает с теми же env-vars. **5 фаз**:

1. `validate_cursor_hooks` — проверка структуры `.cursor/hooks.json`
2. `guard_against_drift` — `pip install neo4j` отвергается, `npm install react` пропускается
3. `observe_file_edit` — fake edit JSX → запись в `b.ui-control/checks.log`
4. `inject_context_pack` — emits `## Block: b.docs` пакет
5. `cursor_hooks_actions.test.mjs` — детальный 9-кейсовый тест

Если headless smoke зелёный — все хуки и action-скрипты технически рабочие.

### Live smoke (Cursor открыт)

Полный пошаговый mannual: **`atlas/ops/cursor_live_test.md`**.

Кратко:

1. `Cursor → Open Folder → /path/to/sima_atlas`
2. В терминале Cursor: `pip install neo4j` — должно блокироваться (драифт-гард)
3. Отредактируй `Sima (Remix)/app_v2.jsx` — должна появиться строка `cursor_edit pass` в `atlas/blocks/b.ui-control/checks.log`
4. В чате Cursor: «продолжи b.docs» — в выходном промпте должен быть `<!-- ATLAS CONTEXT PACK --> ## Block: b.docs`
5. Через MCP-tool в чате: `run_block_implementation b.smoke-sandbox` — FSM проходит full lifecycle

---

## Визуальная проверка UI

Один процесс — кросс-платформенный:

```sh
npm run dev
```

Это `scripts/dev_server.mjs`: `atlas_api` на :8787 + `python http.server`
на :8000 + автоматическое открытие
`http://localhost:8000/atlas_design/index.html` в системном браузере.
Ctrl-C гасит обе подпроцесса разом.

Доступные URL:

* `http://localhost:8000/atlas_design/index.html` — новый design canvas
  (sima_atlas_design layout, читает live-данные через `/atlas/design-payload`)
* `http://localhost:8000/index.html` — классический Sima Remix UI
  (Canvas + ProposalsPanel + Inspector — см. ниже)
* `?client=<id>` — если есть `atlas/clients/<id>/`, читает оттуда

Если хочешь сам управлять процессами (например, на CI/headless server):

```sh
# bash
node scripts/atlas_api_server.mjs &
node scripts/dev_server.mjs --no-browser
```

```powershell
# PowerShell
Start-Job { node scripts/atlas_api_server.mjs }
node scripts/dev_server.mjs --no-browser
```

Что должно работать:

* **Канвас архитектуры** — несколько слоёв (front/logic/ai/data/...), блоки в правильных слоях, рёбра depends_on. Если канвас не загружается — boot-status overlay сверху объяснит причину (CDN unpkg.com, stale bootstrap, etc.).

* **Inspector справа** (клик по любому блоку):
  * `RunStatusSection` — последний agent run с FSM-цветным бейджем (если есть)
  * `AcceptanceSection` — verdict + per-assertion drill-down + 📋 retry-prompt
  * `ProfileHintsSection` — warming_up счётчик или live хинты
  * `UserDocsLink` — ссылка на `atlas/docs/end-user/<block>.md` если она есть

* **ProposalsPanel слева** — Accept/Reject кнопки на разных типах:
  * `block_update` — апдейт полей блока
  * `acceptance_regression` — done-блок задеградировал
  * `user_docs_locked` — locked-документ дрифтнулся
  * `agent_run_diff` — diff из песочницы для Accept

* **Live polling** — изменения файлов в `atlas/` подтягиваются за ~5s без F5.

Скриншоты на reference: `tests/playwright/screenshots/canvas_full.png` и `proposals_panel.png` (закоммичены, обновляются Playwright nightly).

---

## Если что-то падает

Каждый шаг verify_all независим. Запусти конкретный:

```sh
node scripts/verify_all.mjs --only nightly       # без Playwright
node scripts/verify_all.mjs --skip-screenshots   # на машине без браузера
node scripts/verify_all.mjs --skip-cursor        # без хук-симуляции
```

Если фейлится `acceptance` — открой `atlas/acceptance_runs/<block>/_latest.json` для конкретного блока, найди `verdict: fail`, посмотри `evidence` + `reasoning` per assertion.

Если фейлится `screenshots` — открой `tests/playwright/screenshots/canvas_full.png` — boot-status overlay скажет причину (CDN заблокирован, Babel ещё компилирует, atlas_bootstrap.js устарел).

Если фейлится `cursor` — посмотри какая фаза упала: `validate_cursor_hooks` (структура), `guard_against_drift` (отсутствует drift-pattern в tech_stack.md), `observe_file_edit` (env CURSOR_FILE_PATH не считался), `inject_context_pack` (block не найден), детальный test (один из 9 кейсов).

## Reporting

После прогона запиши результат в `atlas/blocks/b.agent-orchestrator/checks.log`:

```sh
echo "$(date -u +%FT%TZ)\tverify_all\tpass\t5/5 phases green; acceptance 10/10 blocks; node $(node -v)" \
  >> atlas/blocks/b.agent-orchestrator/checks.log
```

Это даёт другим разработчикам аудит-trail.

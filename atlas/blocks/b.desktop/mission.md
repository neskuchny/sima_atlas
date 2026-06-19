# b.desktop — mission

Сегодня запуск Sima Atlas начинается с терминала: `git clone`, `npm install`,
`npm run dev`, разбор сообщений, переход в браузер. Для операторов, которые
строят продукты, а не админят, это барьер. Канваса — главного когнитивного
интерфейса по канону IX — они никогда не увидят, потому что застрянут на
шаге установки.

`b.desktop` — **установимое десктоп-приложение** Sima Atlas. Двойной клик
по `.dmg` / `.exe` / `.AppImage` открывает то же самое: канвас, контракты,
V-1, экономика — но **без терминала и без Node-преquisites на стороне
пользователя**. Под капотом — тонкая Electron-обёртка вокруг существующего
`atlas_api_server.mjs` + статической `frontend/`. UI не переписывается,
бекенд не переписывается; добавляется только запускной слой.

## Layer
ext

## Что делает приложение в done-версии

1. Запускается двойным кликом на любой из трёх ОС (macOS, Windows, Linux),
   без зависимости от системного Node — Electron приносит свой собственный
   Node runtime через `process.execPath` + `ELECTRON_RUN_AS_NODE=1`.
2. При первом старте создаёт `~/SimaProjects/` и предлагает либо открыть
   demo-проект, либо создать новый. Каждый проект — отдельная папка с
   собственным `atlas/`, как multi-tenant uже работает в браузерной версии.
3. Внутри показывает тот же канвас, что и `npm run dev`, через
   BrowserWindow на `http://127.0.0.1:<dynamic-port>` — порт выбирается из
   диапазона при старте, чтобы избежать коллизий с уже работающим dev-сервером.
4. Нативное меню операционной системы повторяет ключевые CLI-команды:
   File → New Project / Open Project / Recent · Run → V-1 Autonomous Loop /
   Verify All / Generate Bundle · Window → Economics / Cleanup / Change-sets.
5. Auto-update через `electron-updater` поверх GitHub Releases: установленная
   v0.3.0 сама замечает v0.4.0, скачивает в фоне, ставит при следующем
   запуске. Пользователь не возвращается за `git pull`.

## Out of scope

- Сам бекенд (это `b.agent-orchestrator` + `b.core-sync` + остальные logic-блоки).
  Десктоп — обёртка, не реимплементация.
- Веб-версия канваса (`b.ui-control`) — она работает дальше параллельно;
  десктоп просто переиспользует её через embedded webview.
- Облачная синхронизация проектов между машинами одного оператора — это
  отдельная задача (T-1 в роадмапе, требует multi-operator слоя).
- Mobile (iOS / Android) — Electron этого не делает, нужно нативное
  приложение или Tauri 2.0 mobile.

## Реализация (что доставлено в MVP — R-7.99)

- `extensions/desktop/main.mjs` — main process Electron'а: спавнит
  `atlas_api_server.mjs` + статический сервер через `utilityProcess` (Node
  внутри Electron'а), затем открывает BrowserWindow на собранную UI.
- `extensions/desktop/preload.mjs` — узкий `contextBridge`: пробрасывает в
  renderer только три IPC-канала (open-project-picker, show-economics-window,
  trigger-v1-loop), всё остальное недоступно по умолчанию.
- `extensions/desktop/package.json` — отдельный package.json (свои deps:
  electron, electron-builder), не засоряет корневой; `electron-builder`
  настроен под три target'а.
- Корневой `package.json` получил два npm-скрипта: `desktop:dev` (запустить
  Electron поверх текущего dev-сервера) и `desktop:pack` (собрать инсталляторы).
- `.github/workflows/desktop-build.yml` — CI собирает unsigned-инсталляторы
  для трёх ОС при push'е git-тега `v*.*.*`; они автоматически прикрепляются
  к GitHub Release.
- Селфтест валидирует структуру каталога и `package.json`-форму (без запуска
  Electron'а — в CI часто нет дисплея для headless-старта).

## Зачем ext, а не front

Кановский слой `front` — фронтенд продукта (frontend/atlas_design/*.jsx).
Эта работа — **внешний интегратор**: Electron + electron-builder — third-party
runtime, который оборачивает наш фронт, не модифицируя его. Это упаковка,
а не функциональность. Поэтому layer = ext, type = module.

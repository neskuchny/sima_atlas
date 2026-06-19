# b.desktop — tasks

## PR1 — Electron-скелет, рабочий локально (R-7.99)

- [ ] T1: `extensions/desktop/main.mjs` — main-процесс: запускает
  `atlas_api_server.mjs` через `utilityProcess.fork`, открывает
  `BrowserWindow` на `http://127.0.0.1:<dynamic-port>` после готовности
  сервера.
- [ ] T2: `extensions/desktop/preload.mjs` — `contextBridge.exposeInMainWorld`
  трёх IPC-каналов (open-project-picker, show-economics, trigger-v1).
  `nodeIntegration: false`, `contextIsolation: true`.
- [ ] T3: `extensions/desktop/package.json` — own deps (electron,
  electron-builder), скрипт `start` = electron .
- [ ] T4: Корневой `package.json` — добавить `desktop:dev` (cd extensions/desktop
  && npm install && npm start) и `desktop:pack` (electron-builder).
- [ ] T5: `extensions/desktop/README.md` — что это, как поставить, как
  собрать инсталлятор локально, ссылка на блок-контракт.

## PR2 — Селфтест + nightly

- [ ] T6: `tests/desktop_structure.selftest.mjs` — структурная проверка
  (без запуска Electron). Валидирует наличие 4 обязательных файлов, форму
  `package.json`, наличие `contextBridge` в preload, отсутствие
  `nodeIntegration: true`.
- [ ] T7: Регистрация селфтеста в `scripts/nightly_consolidation.mjs`.

## PR3 — CI сборка трёх ОС

- [ ] T8: `.github/workflows/desktop-build.yml` — на `push` тега `v*.*.*`
  собирает матрица macos / windows / ubuntu, прикрепляет артефакты к
  GitHub Release. Unsigned (signing — задача оператора).
- [ ] T9: README.md репо — секция «Install as desktop app» со ссылками на
  релизные артефакты.

## PR4 — нативное меню + auto-update (R-7.99, DONE)

- [x] T10: `Menu.setApplicationMenu` с File / Run / View / Help (+ App
  submenu на macOS), хоткеи `⌘+Shift+V/G/R` для Verify All / Generate
  Bundle / V-1 Loop. Каждое menu-действие запускает соответствующий скрипт
  через `utilityProcess.fork` и POST'ит результат в `/atlas/checks/append`
  на `b.desktop` — десктоп-сессии оседают в том же checks.log, что и
  CLI-сессии. (Селфтест g8: 5 ассерций, все зелёные.)
- [x] T11: `electron-updater` поверх GitHub Releases — lazy-import (dev
  tree работает без зависимости), активен только в `app.isPackaged`, на
  старте через 5 минут запрашивает GitHub Releases; при наличии
  обновления — нативный диалог «Version X.Y.Z available, will install on
  next restart». Меню → Help → «Check for Updates…» дёргает руками.
  Управляется через `SIMA_DESKTOP_DISABLE_AUTOUPDATE=1` для CI. (Селфтест
  g9: 4 ассерции, все зелёные. g10: electron-updater в `dependencies`,
  не devDep — runtime-нужен в packaged-tree.)
- [ ] T12: Project picker UI — список папок из `~/SimaProjects/` с
  возможностью создать новую и сразу инициализировать `atlas/`. (Renderer-
  side, отдельный PR с фронтенд-правками в `frontend/atlas_design/`.)

## PR5 (future) — подпись и нотаризация

- [ ] T13: macOS — `electron-builder` notarize step (требует Apple
  Developer ID, $99/год). Без него — пользователи кликают «Open Anyway».
- [ ] T14: Windows — code-signing cert ($200-400/год). Без него — SmartScreen
  предупреждение.
- [ ] T15: Документация по разовой настройке сертификатов для оператора
  репо. Не блокирует MVP-релиз.

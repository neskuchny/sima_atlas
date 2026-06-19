# b.desktop — KPI

- **KPI-1 (time-to-canvas без терминала)**: от двойного клика на скачанный
  инсталлятор до видимого канваса с открытым demo-проектом — **≤ 30 секунд**
  на типичном ноутбуке. Считается только если терминал ни разу не открыт.

- **KPI-2 (никаких системных preрequisites)**: инсталлятор работает на
  чистой ОС без установленного Node / npm / git. Electron приносит
  собственный Node runtime через `process.execPath` + `ELECTRON_RUN_AS_NODE=1`.
  Сторонние бинари (claude / cursor-agent / codex CLI) — опциональны, их
  отсутствие показывается в Help → Diagnostics, не блокирует запуск.

- **KPI-3 (3 ОС, общая кодобаза)**: одна и та же `main.mjs` собирается под
  macOS (`.dmg` + Apple Silicon + Intel), Windows (`.exe` installer +
  portable), Linux (`.AppImage` + `.deb`). Различия — только в иконках и
  notarization-конфиге, не в логике.

- **KPI-4 (нативное меню вместо CLI для 5 операций)**: операции `New Project`,
  `Open Project`, `Verify All`, `Run V-1 Loop`, `Generate Bundle` доступны
  из menu/хоткея и работают без переключения в терминал. Каждая логирует
  свой checks.log той же командой, что и CLI-вариант, чтобы аудит-трэйл
  был единым.

- **KPI-5 (auto-update без user интервенции)**: установленная версия
  замечает новый GitHub Release в течение 5 минут после старта, скачивает
  его в фоне, ставит при следующем перезапуске. Использует `electron-updater`,
  unsigned-build за рамки KPI (для signed нужны сертификаты Apple/Microsoft
  — это операторская задача, не разработческая).

- **KPI-6 (пакет не превышает 200 MB)**: распакованный installer на каждой
  ОС укладывается в 200 MB. Electron-runtime ~80 MB; наш JS-код + frontend
  + scripts < 30 MB; запас на assets и electron-builder overhead. Если
  выходим за 200 — выкидываем то, что не критично для MVP.

- **KPI-7 (graceful degradation)**: если внутренний API-сервер падает
  (порт занят, скрипт упал, etc.) — окно показывает понятный экран ошибки
  с кнопкой Restart, не уходит в белый экран и не крашится.

- **KPI-8 (selftest без display'я)**: CI на ubuntu-latest без X-сервера
  должен пройти `tests/desktop_structure.selftest.mjs` — он валидирует
  структуру каталога и `package.json`, не запуская Electron. Реальный smoke
  с запуском окна — отдельная manual-проверка, не nightly.

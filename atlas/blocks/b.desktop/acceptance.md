# b.desktop — acceptance

Acceptance gate для перехода `idea → wip → review → done`. Все проверки детерминистические — судья-LLM не нужен, структура и форма самодостаточны.

- [x] **A1.** Каталог `extensions/desktop/` содержит четыре обязательных файла: `package.json`, `main.mjs`, `preload.mjs`, `README.md`.
```yaml
evidence_kind: fs_glob
evidence_spec:
  pattern: extensions/desktop/main.mjs
  min_count: 1
```

- [x] **A2.** Селфтест `tests/desktop_structure.selftest.mjs` зелёный: package.json валидный, формы main.mjs / preload.mjs проходят, security baseline соблюдён.
```yaml
evidence_kind: selftest_run
evidence_spec:
  cmd: node tests/desktop_structure.selftest.mjs
  expect_in_stdout: "OK"
```

- [x] **A3.** Корневой `package.json` содержит npm-скрипт `desktop:dev`.
```yaml
evidence_kind: log_grep
evidence_spec:
  file: package.json
  pattern: "desktop:dev"
```

- [x] **A4.** `extensions/desktop/main.mjs` запускает Node-сервер через `utilityProcess` (Electron-runtime, без зависимости от системного Node).
```yaml
evidence_kind: log_grep
evidence_spec:
  file: extensions/desktop/main.mjs
  pattern: "utilityProcess"
```

- [x] **A5.** `extensions/desktop/preload.mjs` использует `contextBridge` — security baseline для всех Electron-приложений после v12.
```yaml
evidence_kind: log_grep
evidence_spec:
  file: extensions/desktop/preload.mjs
  pattern: "contextBridge"
```

- [x] **A6.** CI-workflow `.github/workflows/desktop-build.yml` собирает под три ОС — matrix содержит `macos-latest`.
```yaml
evidence_kind: log_grep
evidence_spec:
  file: .github/workflows/desktop-build.yml
  pattern: "macos-latest"
```

- [x] **A7.** README репозитория упоминает Desktop-установщик (releases-страницу), а не только инструкцию `npm install`.
```yaml
evidence_kind: log_grep
evidence_spec:
  file: README.md
  pattern: "Desktop app"
```

## inconclusive_if

- Electron ещё не установлен (`extensions/desktop/node_modules/electron` отсутствует) — можно валидировать структуру, но real-smoke (запуск окна) невозможен. KPI-8 явно допускает структурную проверку без запуска.

## Не считается acceptance

- Подписанные инсталляторы — отдельная операторская задача (требует Apple Developer ID + Windows code-signing cert), за пределами кода блока.
- Production-уровень auto-update с откатом — KPI-5 описывает MVP без rollback.
- Скриншоты в README — это `b.user-docs-generator`, не наша зона.

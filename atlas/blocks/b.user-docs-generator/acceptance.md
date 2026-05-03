# b.user-docs-generator — acceptance

- [ ] **A1.** PR-1 (block introspection) merged: `scripts/introspect_block_ui.mjs <block_id>` парсит JSX/HTML/route-файлы блока, возвращает `{buttons: [...], inputs: [...], routes: [...], handlers: [...]}`. Selftest на `b.todo-ui` (≥ 5 element types обнаружены).
- [ ] **A2.** PR-2 (LLM tutorial writer) merged: `scripts/generate_user_docs.mjs <block_id>` через `b.llm-gateway.callLLM` со схемой `UserTutorial` пишет `docs/end-user/<block>.md` + `_meta/<block>.json`. Mock-режим возвращает консистентный markdown.
- [ ] **A3.** PR-3 (screenshot integration, опц.) merged: если Playwright настроен и `playwright.config.js` валидный — после генерации текста запускается `playwright test --grep <block_id>` который создаёт `_screenshots/<block>__<flow>.png`; иначе skip без ошибки.
- [ ] **A4.** PR-4 (auto-regen + UI) merged: nightly step `regenerate_user_docs_drift` пересобирает только блоки с изменившимся hash источников; Inspector кнопка «Открыть end-user docs»; pre-commit hook предупреждает при ручной правке без `LOCKED: true`.
- [ ] **A5.** Idempotency smoke `tests/user_docs.idempotent.smoke.mjs`: regen без изменений → diff пустой; изменили mission.md → diff не пустой и hash в meta обновлён.
- [ ] **A6.** No-jargon validator: post-LLM проверяет, что финальный markdown не содержит {`module`, `component`, `endpoint`, `prop`, `state`, `import`, `function`} вне блока «Под капотом»; на violation — retry с явной подсказкой в prompt (max 1).
- [ ] **A7.** Privacy / safety: generator **только** пишет в `atlas/projects/<proj>/docs/end-user/`; pre-commit hook предотвращает запись вне этой директории; никакого кода блока не модифицируется.
- [ ] **A8.** Localization smoke: `ATLAS_USER_DOCS_LANG=en` → все заголовки и шаги по-английски; default = ru.

## Что считается NOT acceptance
- Авто-deploy на gh-pages / vercel (out of scope).
- Видео или интерактивные туториалы (out of scope).
- Регенерация без cache (нарушает KPI-3 cost cap).

## Logic-flow при review
- Каждый сгенерированный markdown начинается с маркера `> Эта страница автогенерирована Атласом. Не редактируй вручную.`.
- `_meta/<block>.json` хранит hash источников; при regen пишется новый hash; old не теряется (history).
- При наличии `LOCKED: true` в meta — generator пропускает блок и пишет proposal `user_docs_locked` (для review оператором).

## Зависимости
- b.user-docs-generator → читает b.db, b.docs (общий wiki-pipeline), b.agent-orchestrator (опц. screenshots), b.llm-gateway (генерация).
- Никто из других блоков не depends_on этот — это аддитивный слой контента.

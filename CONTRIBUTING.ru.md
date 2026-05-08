# Contributing to Sima Atlas

Спасибо за интерес к проекту. Sima Atlas — opensource MIT, мы открыты к любому вкладу: от typo-фикса до новой MCP-интеграции и нового evidence-collector'а.

> Этот документ — **процесс**. Что именно нужно сделать (списки задач, приглашения) — в [README.md](README.md) и [статье, Часть 11](ТЗ/статья.md).

---

## Быстрый старт для контрибьютора

```bash
git clone https://github.com/neskuchny/sima_atlas
cd sima_atlas
npm install
npm run dev          # API + UI поднимаются на http://localhost:8000/atlas_design/
```

Перед первым PR — убедись, что зелёный прогон:

```bash
npm run verify       # запускает verify_all (~150s, без сети)
```

---

## Структура репозитория

| Путь | Что лежит |
|------|-----------|
| `atlas/` | Источник правды: graph + блоки + proposals + run_state. Текстовые файлы, git-diffable. |
| `atlas/blocks/<id>/` | Контракты блоков: `mission.md`, `kpi.md`, `acceptance.md`, `tasks.md`, `checks.log`, ... |
| `scripts/` | Все executables: API сервер, MCP сервер, валидаторы, генераторы, оркестраторы. |
| `tests/` | Селфтесты + Playwright e2e. Каждый новый блок должен иметь свой селфтест в nightly. |
| `frontend/atlas_design/` | UI canvas (React + JSX без билда, in-browser Babel). |
| `docs/` | Интеграции и прочая операционная документация. |
| `ТЗ/` | Методология (статья), ТЗ, аудит. |
| `.github/` | CI workflows, issue / PR templates. |

---

## Что я могу сделать?

См. README раздел **Contributing** — там 8 конкретных приглашений с уровнем сложности. Самые типовые:

- **Новые MCP-клиенты** для других IDE → [`docs/integrations.md`](docs/integrations.md)
- **Локальные провайдеры** в LLM gateway (Ollama / vLLM / LM Studio) → `scripts/llm_gateway.mjs`
- **Шаблоны блоков** (auth, payments, search) → новый файл в `atlas/templates/`
- **Evidence collectors** (HTTP-status, JSON-shape, snapshot-diff) → `scripts/collect_evidence.mjs`
- **Локализации UI** → `frontend/atlas_design/index.html` + `views.jsx`
- **Документация / переводы** — `ТЗ/статья.md` сейчас только на русском, английский перевод приветствуется

Если хочешь начать с чего-то маленького — посмотри issues с ярлыком `good first issue`.

---

## Workflow

### 1. Issue (опционально, но желательно)

Перед большим изменением открой issue или discussion, чтобы согласовать подход. Для очевидных фиксов (typo, явный баг) можно сразу PR.

### 2. Branch

```bash
git checkout -b feat/short-description
# или: fix/, docs/, refactor/, test/, chore/
```

Не пушим в `main` напрямую.

### 3. Code

- Следуй существующему стилю. Конкретные правила по мере появления — пока живём «как сложилось».
- Каждый новый блок (`atlas/blocks/<id>/`) обязан иметь:
  - 5 обязательных контракт-файлов (`mission/kpi/acceptance/tasks/checks.log`)
  - селфтест в `tests/`, прописанный в `scripts/nightly_consolidation.mjs`
- Любая UI-доработка должна **defensively обращаться к payload** (`data.field?.[id]`) — мы один раз больно поймали белый экран от undefined access (см. R-5).
- **Не комментируй очевидное.** Комментарий нужен только когда *почему* не выводится из *что*.

### 4. Тесты

Перед PR обязательно зелёный:

```bash
npm run verify       # все 4 группы: nightly + acceptance + cursor + mcp
```

Если меняешь acceptance / evidence — добавь сценарий в соответствующий selftest.

Если меняешь UI — прогон Playwright должен быть зелёный (`npx playwright test`). Скриншоты в `tests/playwright/screenshots/` коммитятся вместе с изменениями.

### 5. Commit message

Стиль conventional commits в свободной форме:

```
<type>(<scope>) — короткое описание в одну строку

Подробное объяснение «зачем» (не «что» — что видно из diff'а).
Если фиксит конкретный bug — упомянуть симптом, а не только решение.
Если связано с issue — `Fixes #123`.
```

Типы: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`. Скоупы — по своему усмотрению (часто = `block_id` или `имя-скрипта`).

Примеры наших commit'ов лежат в `git log`.

### 6. Pull Request

- PR template подскажет, что описать.
- Привяжи к issue, если она была.
- CI должен быть зелёный.
- Будь готов к code review — отвечаем обычно в течение 48 часов.

---

## Code style

Пока живём «как сложилось»; явных правил ещё нет. Эмпирические тренды в текущем коде:

- ES modules (`import` / `export`), не CommonJS.
- 2-space indent, одинарные кавычки, точки с запятой в JS.
- Пути всегда абсолютные через `path.join(ROOT, ...)`, не relative paths.
- Все скрипты идемпотентны (повторный запуск не должен ломать состояние).
- Все API-роуты возвращают `200 + {ok: false, error}` вместо HTTP-4xx (для устранения CORS-сбоев в UI).

Если хочешь предложить формальный code-style гид (ESLint, Prettier config, .editorconfig) — открой issue, давай согласуем правила, потом введём.

---

## Лицензия и авторство

Sima Atlas под MIT — твой PR попадает под ту же лицензию. CLA не подписываем.

Атрибуция contributor'ов — через `git log`. Список maintainers — в README.

---

## Где спросить

- **Issues** — баги, feature-запросы, конкретные вопросы про код
- **Discussions** — общие вопросы, дискуссии о направлении, идеи
- **PR comments** — обсуждение конкретного предложения

Maintainer — Anton Kalabukhov (Synlabs). Отвечаем в течение 48 часов в большинстве случаев.

Спасибо!

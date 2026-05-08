# SIMA Atlas Design — интеграция визуала с системой

## Кратко

Пользовательский визуальный дизайн (`sima_atlas_design/` в репо) подключён к
живым данным Атласа. Локально UI обновляется при изменении блоков; для
production-multitenancy каждый клиент получает свой data namespace.

## Что где

| Источник | Куда копируется | Что делает |
|---|---|---|
| `sima_atlas_design/SIMA Atlas.html` | `frontend/atlas_design/index.html` | UI page; патчен под live-loader |
| `sima_atlas_design/data.js` | `frontend/atlas_design/data_static.js` | offline fallback (sample data) |
| `sima_atlas_design/{graph,panels,tweaks-panel}.jsx` | `frontend/atlas_design/*.jsx` | без изменений |
| `sima_atlas_design/styles.css` | `frontend/atlas_design/styles.css` | без изменений |
| (новое) | `frontend/atlas_design/data_loader.js` | live-fetch + polling |

`sima_atlas_design/` остаётся source-of-truth дизайна — туда оператор кладёт
обновления; служебная копия в `frontend/atlas_design/` обслуживает живой
UI и поддерживает loader.

## Как открыть

```sh
node scripts/atlas_api_server.mjs &     # порт 8787 — отдаёт payload
npm run ui:serve                        # порт 8000 — статика
open http://localhost:8000/atlas_design/index.html
```

Для конкретного клиента: `?client=acme`.

## Архитектура потока данных

```
atlas/graph.json + projects/* + blocks/<id>/*.md + transitions.log + lessons.json
                                  │
                                  ▼
            scripts/build_sima_design_payload.mjs (адаптер)
                                  │
                                  ▼
                    SIMA_DATA-shaped JSON
                                  │
                          (один из путей)
              ┌───────────────────┴───────────────────┐
              ▼                                       ▼
   GET /atlas/design-payload          (cron)  atlas/design_payload.json
   atlas_api_server.mjs                       (записан nightly)
              │                                       │
              └───────────────────┬───────────────────┘
                                  ▼
              window.SIMA_DATA  (data_loader.js)
                                  │
                                  ▼
                      App / GraphCanvas / Detail
```

## Маппинг shape

| Atlas | SIMA_DATA |
|---|---|
| `graph.blocks[i].id` | `modules[i].id` |
| `graph.blocks[i].title` | `modules[i].title` |
| `graph.blocks[i].layer` (`user/front/logic/ai/data/ext/testing/content`) | `modules[i].layer` (`frontend/logic/backend/tests`) |
| `graph.blocks[i].status` (`done/wip/review/idea/broken`) | `modules[i].status` (`done/progress/todo/fail`) |
| `graph.blocks[i].depends_on` | `edges[]` (одно ребро на каждое depends_on) |
| `graph.blocks[i].mvp` + `status` | `modules[i].priority` |
| `graph.blocks[i].depends_on.length` + `files.length` | `modules[i].size` |
| `graph.blocks[i].status_reason` (если status broken) | `modules[i].warn` |
| `atlas/blocks/<id>/mission.md` excerpt | `moduleDocs[id].short` |
| `atlas/blocks/<id>/tasks.md` `- [ ] T1: ...` | `tasks[id]` |
| `atlas/transitions.log` (last 12) | `history[]` |
| `atlas/operator_profile/lessons.json` | `lessons[]` |
| `atlas/project.md` headers | `product.{title, goal, mission}` |
| `atlas/tech_stack.md` секции | `product.conditions.{backend, frontend, logic, checks}` |

Отсутствующие поля (например, кастомные x/y координаты) автоматически
пересчитываются через `autoLayout()`: блоки группируются по visual layer и
раскладываются слева-направо в каждой полосе.

## Multi-tenant

Структура (опциональная — создаётся когда нужен per-client data):

```
atlas/clients/<id>/
  graph.json        # обязательно если override
  project.md        # опционально
  blocks/...        # опционально
  transitions.log   # опционально
  operator_profile/lessons.json  # опционально
```

Адаптер `build_sima_design_payload.mjs --client <id>`:
- Если `atlas/clients/<id>/graph.json` существует → читает оттуда
- Иначе → fallback на главный `atlas/`

URL `?client=<id>` пробрасывается через `data_loader.js` в endpoint.

## Live updates

`data_loader.js`:
1. На load — fetch `/atlas/design-payload?client=<id>` (с hard cap 600ms; на таймауте — offline fallback и продолжение фоновой загрузки)
2. Каждые 5 секунд — poll `/atlas/state` (тот же hash-механизм, что у основного UI)
3. На изменение hash — refetch + dispatch `sima-data-changed` CustomEvent
4. App re-mount'ится через `key` change → читает свежий `window.SIMA_DATA`

## Production deployment

```html
<!-- В вашем production HTML (за reverse proxy): -->
<script>window.SIMA_API_BASE = 'https://api.example.com';</script>
<script src="/atlas_design/data_static.js"></script>
<script src="/atlas_design/data_loader.js"></script>
<!-- ... rest as in index.html ... -->
```

Endpoint `/atlas/design-payload?client=<id>` должен быть проксирован
через ваш API, который:
1. Проверяет аутентификацию клиента
2. Извлекает `client_id` из сессии (а не из URL — для безопасности)
3. Вызывает `node scripts/build_sima_design_payload.mjs --stdout --client <id>`
4. Возвращает JSON

Альтернативно — pre-build статически: `cron '*/5 * * * *'` запускает
`build_sima_design_payload.mjs --client X` для каждого клиента, фронт
читает `/clients/<id>/design_payload.json` напрямую без API.

## Что сейчас НЕ работает

- **Запись из UI обратно в `atlas/graph.json`**: дизайн позволяет drag и
  inline-edit, но изменения остаются только в React-state. Persistence —
  следующий PR. Текущий канонический write path — Accept/Reject через
  `frontend/index.html` ProposalsPanel.

- **Локальные редактируемые координаты x/y**: auto-layout пересчитывает
  при каждом payload-build'е. Чтобы сохранить кастомные координаты —
  нужно дополнить `graph.json` полями `block.canvas_x` / `block.canvas_y`
  и читать их в адаптере (если есть → не вызывать autoLayout для них).

- **Per-client auth**: `?client=<id>` сейчас trust'ит URL. Production
  должен проверять подпись/сессию.

## Тесты

```sh
# Адаптер unit:
node tests/sima_design_payload.selftest.mjs

# Сборка payload вручную:
node scripts/build_sima_design_payload.mjs              # → atlas/design_payload.json
node scripts/build_sima_design_payload.mjs --stdout     # JSON в stdout
node scripts/build_sima_design_payload.mjs --client x   # → atlas/clients/x/design_payload.json

# Endpoint:
curl http://localhost:8787/atlas/design-payload | jq .data.modules[0]
curl 'http://localhost:8787/atlas/design-payload?client=acme' | jq ._meta

# UI smoke (Playwright):
npx playwright test tests/playwright/sima_design.spec.ts
# → tests/playwright/screenshots/sima_design_offline.png + sima_design_live.png
```

В sandbox-средах без Internet (когда unpkg.com не достижим) Playwright
скриншоты получаются пустыми — браузер не может загрузить React/Babel с
CDN. На реальной машине оператора (или в production-сборке с
локально-вендорнутым React) UI отрисовывается полностью.

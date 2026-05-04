# SIMA Atlas — Backlog (visual-component-system-N2W07)

Единый трекер: что уже сделано, что осталось из старой версии, что описано в PDF
с Клод-дизайнером, и что добавилось как новые задачи. **Ничего не забываем.**

Источники:
- `Sima (Remix)/uploads/sima_claude_design.pdf` — переписка с Клод-дизайнером
  (артефакты, drill-into-block, exclamation-marks, Claude-rewrite, iteration loop).
- `atlas/blocks/*/mission.md` — старый функционал, разложенный по блокам.
- Phase A (commit `a136c91`) / Phase B (`98de36f`) / Phase C (`88d4424`).

Статусы: `[x]` done · `[~]` partially wired (есть backend, нет UI или наоборот) ·
`[ ]` todo · `[!]` blocker / open question. Приоритет в скобках:
**P0** — без неё новый UI не отвечает обещаниям; **P1** — нужно для PDF-видения;
**P2** — улучшение качества жизни.

---

## ✓ DONE (Phase A–C)

### A — Persistence layer
- [x] `scripts/atlas_blocks_api.mjs` — createBlock / patchBlock / deleteBlock /
      addEdge / deleteEdge / addNote / patchNote / deleteNote (atomic writes,
      audit log, soft-archive).
- [x] 8 POST routes wired в `atlas_api_server.mjs`.
- [x] App component персистит drag/title/size/status (debounced 500ms,
      optimistic + rollback).
- [x] Selftest 8/8, в nightly.

### B — Old features ported
- [x] `scripts/atlas_artifacts_api.mjs` + 5 routes (real `/api/artifacts`).
- [x] Composer (text / meeting transcript / file / URL → артефакт).
- [x] Gallery (browse / search / filter / insert / delete).
- [x] Library (saved blocks по типу + слою).
- [x] TZExporter (markdown TZ + send-to-agent + save-as-artifact).
- [x] Topbar pills + CommandBar entries.
- [x] DELETE добавлен в CORS allow-methods.

### C — Agent + Acceptance + LLM advice
- [x] `scripts/atlas_runs_api.mjs` — listRunsByBlock / getRun /
      getLatestAcceptance / startRunAsync / callAdvice.
- [x] `POST /runs/start` (non-blocking spawn).
- [x] `GET /runs/list?block_id=&active=1` + `/runs/get?run_id=`.
- [x] `GET /acceptance/get?block_id=` (verdict, summary, per-assertion).
- [x] `POST /llm/advice` (callLLM + mock fallback с пометкой).
- [x] DetailPanel: «Запуски» tab (poll FSM) + «Приёмка» tab (verdict).
- [x] onSendToAgent → реальный `/runs/start` для b.\* блоков.
- [x] onClaudeAdvice surfaces в activity log (с пометкой demo для mock).

---

## P0 — Phase D · Iteration loop & live observability

Без этого «Send to Claude Code» работает вслепую — ты видишь FSM «Running», но не
видишь что агент делает; и acceptance после run руками запускать.

- [ ] **D1** Live run output. Стримить хвост `atlas/llm_traces/<run_id>.log`
      (или stdout/stderr agent-процесса) в RunStatusSection. Endpoint:
      `GET /runs/log?run_id=&since_ms=` → последние N строк. Polling 2s.
- [ ] **D2** Auto-verify после run. Когда `current_state` переходит в
      `Succeeded` → серверная side эффект-цепочка дёргает
      `verify_all_acceptance.mjs --block <id>` и записывает свежий
      `_latest.json`. UI само перерисует «Приёмку».
- [ ] **D3** Diff view: acceptance before/after. Хранить предыдущий
      `_latest.json` как `_previous.json`, в DetailPanel показать разницу
      verdicts по assertion (A1: pass→fail, A2: skip→pass).
- [ ] **D4** «Revise TZ + re-run». Кнопка в AcceptanceSection при verdict=fail.
      Промпт собирается: TZ блока + список failed assertions с reasoning →
      `/runs/start` с `prompt: "Исправь следующее: ..."`.
- [ ] **D5** Cancel running run. Кнопка в RunStatusSection live card →
      `POST /runs/cancel { run_id }` (endpoint уже есть, нужно подключить).
- [ ] **D6** Run output: которые файлы агент трогал. Парсить из `checks.log`
      или из `git diff` в workspace; показать как chips «↑ scripts/foo.mjs».

---

## P1 — Phase E · Field-level AI assist (PDF vision)

«Восклицательный знак + Sima предложит заполнить» — самая характерная фича
PDF-видения, которой сейчас вообще нет.

- [ ] **E1** EditableField компонент с состоянием `empty | draft | filled`.
      Если поле empty (mission / kpi / acceptance / depends_on / provides) —
      показывать иконку «!» + кнопку «Заполнить через Sima».
- [ ] **E2** «Заполнить через Sima» вызывает `/llm/fill-field` body
      `{ block_id, field, context: { layer, neighbors, kpi } }` →
      возвращает draft → пользователь approve → сохраняется в `<field>.md`.
- [ ] **E3** «Переформулировать через Клода» на filled field — отдельная
      кнопка-молния, не overrides, а pop-up «было / стало → принять / отменить».
- [ ] **E4** Validation indicator на блок-карточке: красная точка если
      acceptance.md пустой, оранжевая если mission ≤ 80 символов.
- [ ] **E5** Backend-route `/llm/fill-field` — обёртка callLLM с правильным
      system-промптом (Atlas conventions: ru/en, конкретные критерии и т.д.).

---

## P1 — Phase F · Subsystem editor (drill-into-block PDF vision)

В UI drill уже работает визуально (drillStack), но subsystems
**не синхронизируются на диск** — правки внутри подсхемы теряются после reload.

- [ ] **F1** Backend: `scripts/atlas_subschemas_api.mjs` — read/write
      `atlas/subschemas/<block_id>.json` с собственными modules/edges/lanes.
- [ ] **F2** Расширить `atlas_blocks_api.patchBlock` чтобы при патче
      поднялся флаг `has_subsystem` если subschema-файл существует.
- [ ] **F3** UI: drill state хранить в `subState` ↔ POST патчи в
      `/subschemas/patch?block_id=...`.
- [ ] **F4** «Сохранить эту подсхему как шаблон» → артефакт kind='map',
      reuse в другом блоке через Library.
- [ ] **F5** Generic schema types (книга / идея / маркетинг / продукт) —
      seed-шаблоны в `atlas/schema_templates/<type>.json`, выбор при создании
      нового блока.

---

## P1 — Phase G · Audio / meeting intake (PDF vision)

Composer сейчас принимает текст, но не **извлекает** цели / ограничения / идеи
LLM-ом — только сохраняет сырой transcript.

- [ ] **G1** Endpoint `POST /api/intake/transcribe` — multipart/form-data
      audio → whisper-API (если есть key) или ручной paste fallback.
- [ ] **G2** Endpoint `POST /api/intake/extract` — body `{ text }` →
      callLLM возвращает `{ goals[], constraints[], ideas[], terms[] }`.
- [ ] **G3** Composer UI: после publish автозапустить extract → показать
      превью «Sima нашла: 3 цели, 2 ограничения, 5 идей» → пользователь
      подтверждает → каждый кусок становится отдельным артефактом или тегом.
- [ ] **G4** Тег-предложения: если text упоминает «refund» / «биллинг» /
      «auth» — авто-теги.

---

## P0 — Phase H · Restore old features in new UI

Бэкенд работает (acceptance, lessons, decisions, proposals, wiki, roadmap, docs),
но новый UI этого не показывает.

### H1 · Sync check (real)
- [ ] Кнопка `runSyncCheck()` в topbar — сейчас mock-анимация. Заменить
      на реальный `POST /run-process { block_id: 'b.core-sync', process: 'sync_audit_context' }`,
      результат показывать в DetailPanel.

### H2 · Lessons / decisions / patterns
- [~] Memory tab в DetailPanel читает `data.lessons` из payload (статика).
- [ ] Адаптер `build_sima_design_payload.mjs` уже грузит lessons —
      проверить что real-data попадает. Сейчас `data.lessons` приходит
      из bootstrap, а не из block-folder.
- [ ] Кнопка «Добавить lesson» в Memory tab → POST в `decisions.log` блока.

### H3 · Proposals panel
- [ ] Backend живёт: `/proposals/accept` / `/proposals/reject` / `/proposals/refresh`.
- [ ] UI: новая кнопка в topbar или в Dock «Предложения (N)», открывает
      modal со списком pending → accept / reject UI.

### H4 · build_context_pack
- [ ] Кнопка «Собрать context pack» в Overview → POST `/build-context-pack`
      (нужно добавить роут, оборачивает `scripts/build_context_pack.mjs`)
      → показывает path к JSON и копирует prompt в clipboard.

### H5 · Roadmap view
- [ ] Topbar tab «Roadmap» → загружает `atlas/roadmap.md` через GET
      (нужен endpoint `/atlas/roadmap`) → рендерит markdown в правой
      панели через marked.js (CDN).

### H6 · Wiki / mermaid view
- [ ] Topbar tab «Wiki» → embed `atlas/wiki.html` через iframe
      (или GET-роут возвращает html, рендерим как-есть). Mermaid graph
      показывается там, где раньше был Mermaid.

### H7 · End-user docs viewer
- [ ] Backend (`b.user-docs-generator`) пишет docs в `atlas/user_docs/`.
      Topbar tab «Документация» → список markdown файлов + reader.

### H8 · Editable rules.md / project.md / tech_stack.md
- [ ] Сейчас редактируются только `data.product.title/goal/mission` (in-memory).
      Добавить endpoints `/atlas/meta/get?file=` + `/atlas/meta/patch`,
      ContextRail кнопка «Редактировать project.md».

### H9 · Cursor hooks status indicator
- [ ] Topbar читает `scripts/validate_cursor_hooks.mjs --json` каждые
      30s, показывает зелёную / жёлтую точку «Cursor hooks ok / drift».

---

## P1 — Phase I · Run output deepening

После того как D1-D6 закроют базовый run-loop, нужно глубже:

- [ ] **I1** Per-run files-changed list (git diff в workspace_path).
- [ ] **I2** Per-run decisions log (дёргать `decisions.log` блока).
- [ ] **I3** Per-block iteration history: timeline блока с runs + verdict +
      revisions.
- [ ] **I4** Run cost tracking: input/output tokens по run_id из
      `atlas/llm_traces/`.

---

## P2 — Phase J · Multi-tenant deepening

- [ ] **J1** Per-client artifact namespace: `atlas/clients/<id>/artifacts/`.
- [ ] **J2** Write auth: header `X-Atlas-Client-Token`; settings.json для
      production.
- [ ] **J3** Project picker UI: dropdown в topbar для смены `?client=`
      без перезагрузки.

---

## P2 — Phase K · UX из PDF

- [ ] **K1** Onboarding overhaul: туториал из 5 шагов как в PDF (а не
      текущая статичная карточка).
- [ ] **K2** «Совет Клода» context-aware: разные промпты для разных
      экранов (block detail vs gallery vs TZ).
- [ ] **K3** Save layer as artifact (не только block): в drill-mode
      кнопка «Сохранить эту подсхему как артефакт».
- [ ] **K4** Generic schema kinds в Composer: «Книга / Идея / Маркетинг
      / Продукт / Свой» как пресеты intent.

---

## P2 — Phase L · Robustness

- [ ] **L1** ETag conflict resolution на `/atlas/blocks/patch` —
      возвращать 409 если block.updatedAt разошёлся с client_etag.
- [ ] **L2** Undo / redo стек на mutations.
- [ ] **L3** Activity log persistence: текущий log живёт только в state,
      пропадает при reload. Сохранять в `atlas/activity_log.jsonl`,
      загружать последние 100 при mount.

---

## P0 — Phase M · «Sima сама создаёт схему» (главное обещание)

Самое сильное «вау» из PDF и из старой системы — Sima анализирует
артефакт + контекст продукта и **сама генерит черновик блока с mission /
kpi / acceptance**. Сейчас этого нет.

- [ ] **M1** Endpoint `POST /llm/synthesize-block` body
      `{ source_artifact_id?, source_text?, product_context }`
      → callLLM с structured-output schema → возвращает
      `{ id, title, layer, mission, kpi[], acceptance[] }`.
- [ ] **M2** UI flow: в Composer, после publish артефакта → кнопка
      «Sima предложит блоки на основе этого». Показывает 1-3 драфта
      блоков → пользователь approves → создаются через `/atlas/blocks/create`.
- [ ] **M3** Auto-edges: Sima предлагает связи между новым блоком и
      существующими по `provides ∩ depends_on`.
- [ ] **M4** Auto-decompose: уже есть блок без задач — кнопка «Sima
      разложит на подзадачи» в TasksList tab.

---

## Open questions / blockers

- [!] Поведение `/runs/start` без `claude` CLI / API key: сейчас FSM
      пройдёт `LaunchingAgent → Failed`, но UI не показывает почему.
      Нужно вытащить stderr в RunStatusSection (часть D1).
- [!] CORS для DELETE добавлен — нужно проверить что preflight
      OPTIONS тоже отдаёт DELETE в Access-Control-Allow-Methods (added).
- [!] `/atlas/design-payload` re-runs `build_sima_design_payload.mjs`
      на КАЖДЫЙ запрос — приемлемо при 5s polling, но тяжело при
      высоком трафике. Кэшировать по hash из `/atlas/state`.
- [!] При создании блока через UI новый id — `b.<base>-<n>`. Если
      пользователь вручную создаст файл `atlas/blocks/<id>/`, race с UI
      не учтён.

---

## Order of attack

1. **Phase D** (D1, D2, D5 — самые важные) — закрывает «вижу что агент
   делает» и iteration loop.
2. **Phase H** (H1, H3, H5, H6) — возвращает старый функционал в UI.
3. **Phase M** (M1, M2) — главная новая фича.
4. **Phase E** (E1, E2) — поднимает UX до PDF-уровня.
5. **Phase F + G** — drill-into-block + audio intake.
6. **Phase I + J + K + L** — полировка.

После каждой фазы: `node scripts/verify_all.mjs` зелёный + commit + push.

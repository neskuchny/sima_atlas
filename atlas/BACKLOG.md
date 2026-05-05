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

- [x] **D1** Live run output. stdout/stderr спавн-процесса захватываются в
      `atlas/run_logs/<run_id>.log`. `GET /runs/log?run_id=&since=`
      возвращает дельту с byte-offset. RunStatusSection поллит 2s для
      live runs, прогрессивно дописывает в textarea. (commit pending)
- [~] **D2** Auto-verify после run — оказывается, уже встроено в
      `run_block_implementation.mjs` (line 254: spawn verify_block_acceptance).
      Достаточно: после `Succeeded` UI само рефетчит `/acceptance/get`.
- [x] **D3** Diff view: `verify_all_acceptance` и `verify_block_acceptance`
      теперь снапшотят предыдущий `_latest.json` в `_previous.json` перед
      перезаписью. `GET /acceptance/diff` возвращает `{latest, previous,
      delta[id]:{from,to,kind}}`. AcceptanceSection показывает «↑ улучшилось /
      ↓ регресс» badges + outline вокруг изменённых строк. (commit pending)
- [x] **D4** «Исправить и перезапустить». Кнопка в AcceptanceSection
      при наличии fail. Собирает prompt из failed/inconclusive assertions
      (id + text + reasoning) → POST /runs/start с этим промптом для
      claude. (commit pending)
- [x] **D5** Cancel running run. Кнопка `✕ Отменить` на live run card →
      `POST /runs/cancel`. (commit pending)
- [x] **D6** Run output: какие файлы агент трогал. `listRunFiles`
      парсит block's `checks.log` (фильтр по started_at), показываются
      chips в RunStatusSection. (commit pending)

---

## P1 — Phase E · Field-level AI assist (PDF vision)

«Восклицательный знак + Sima предложит заполнить» — самая характерная фича
PDF-видения, которой сейчас вообще нет.

- [x] **E1** ContractSection в DetailPanel показывает 5 контрактных
      файлов с цветным флагом-индикатором: `!` empty (red), `⚠` weak (orange),
      `✓` filled (green). Классификация — на основе длины + распознавания
      seeded-плейсхолдеров.
- [x] **E2** «✨ Заполнить» для empty полей → `/llm/fill-field` с контекстом
      (mission + neighbors) → modal с черновиком (можно поправить) →
      «💾 Принять и записать» атомарно через `patchBlockFile`.
- [x] **E3** «✏ Переформулировать» для filled полей → `/llm/rewrite-field` →
      modal с двумя колонками «БЫЛО / СТАЛО» и редактируемой правой частью.
- [x] **E4** `build_sima_design_payload.mjs` считает `contract` per
      module: `{score, filled, total, missing[]}`. На карточках в графе
      появляется красный/оранжевый `!` dot с tooltip «Контракт: 2/5
      заполнено (отсутствует: kpi.md, acceptance.md, provides.md)».
- [x] **E5** `synthesizeBlock` API расширен: `fillField()` и
      `rewriteField()` с structured schema `{content}`, system-prompt
      содержит per-field guidance + ru/en autodetect. Routes
      `/llm/fill-field`, `/llm/rewrite-field`. Selftest 8/8.

---

## P1 — Phase F · Subsystem editor (drill-into-block PDF vision)

В UI drill уже работает визуально (drillStack), но subsystems
**не синхронизируются на диск** — правки внутри подсхемы теряются после reload.

- [x] **F1** `scripts/atlas_subsystems_api.mjs` — list/get/save/delete
      с atomic writes + selftest 5/5. Storage: `atlas/subsystems/<parent_id>.json`.
- [x] **F2** `build_sima_design_payload.mjs` читает
      `atlas/subsystems/*.json` и мерджит в `data.subsystems`. Модули,
      у которых есть подсистема, получают флаг `has_subsystem`.
- [x] **F3** `subsystemTouched()` debounce 700ms — каждое изменение
      `subState` (drag модуля, edit edge, add/del note) автоматически
      пушится в `/atlas/subsystems/save`. Статус «сохраняю / ✓ сохранено
      / ✗ ошибка» виден в sub-banner.
- [x] **F4** Кнопка «💾 как артефакт» в drill-banner → создаёт
      артефакт `kind='map'` с JSON-телом подсхемы (parent_id, codename,
      modules, edges, kpi). Достаётся через Gallery.
- [x] **F5** 4 шаблона в `atlas/schema_templates/`:
      product (5 блоков), book (5 блоков), idea (5 блоков),
      marketing (6 блоков). Topbar pill «⌬ Шаблоны» открывает
      TemplatesPanel; пользователь выбирает префикс ID → POST
      `/atlas/schema-templates/apply` создаёт все блоки + edges с
      идемпотентностью (skipped если уже существуют).

---

## P1 — Phase G · Audio / meeting intake (PDF vision)

Composer сейчас принимает текст, но не **извлекает** цели / ограничения / идеи
LLM-ом — только сохраняет сырой transcript.

- [~] **G1** `POST /api/intake/transcribe` — graceful stub.
      Возвращает `{ok:false, error:'transcription not configured', hint:...}`
      с подсказкой про `WHISPER_API_KEY`. Реальная интеграция (OpenAI
      Whisper / whisper.cpp) — отдельная задача провайдера; сейчас
      пользователь вставляет транскрипт текстом.
- [x] **G2** `POST /api/intake/extract` body `{text, kind}` →
      `{summary, goals[], constraints[], ideas[], risks[], terms[]}`.
      Schema-driven callLLM. Terms нормализуются в kebab/snake.
      Selftest 9/9 (group 6c).
- [x] **G3** Composer post-publish — кнопка «◔ Найти смыслы» рядом с
      синтезом блоков. Открывает `insights-panel`: summary, terms
      (clickable chips → добавить в теги), 4 бакета (goals/constraints/
      ideas/risks) с checkbox-списком. Кнопка «💾 Сохранить отмеченные
      как артефакты» создаёт каждый отмеченный пункт отдельным
      артефактом (kind=document для goals/constraints/risks, kind=note
      для ideas).
- [x] **G4** Tag suggestions: terms из `extract` показываются как
      clickable chips. Клик добавляет термин в поле tags (с pill-state
      «on» если уже добавлен).

---

## P0 — Phase H · Restore old features in new UI

Бэкенд работает (acceptance, lessons, decisions, proposals, wiki, roadmap, docs),
но новый UI этого не показывает.

### H1 · Sync check (real)
- [x] `runSyncCheck()` теперь POST `/atlas/sync-check { block_id }` →
      `run_block_process.mjs <id> sync_audit_context`. Хвост вывода
      рендерится в activity log; задний план рисует sync_state по
      наличию /drift|mismatch/. Editorial fallback если API недоступен.

### H2 · Lessons / decisions / patterns
- [x] Memory tab читает `decisions.log` (последние 12 строк), `patterns.md`
      через `GET /atlas/blocks/<id>/file?name=`. Static lessons остаются
      как «уроки бутстрапа» снизу.
- [ ] Кнопка «Добавить lesson» — следующая итерация.

### H3 · Proposals panel
- [x] `GET /atlas/proposals/list` (обёртка над list_proposals.mjs).
      Topbar pill «✦ Предложения (N)» с live-counter (poll 30s).
      Modal `ProposalsPanel` показывает pending, accept/reject
      кнопки → `/proposals/accept` / `/proposals/reject`.

### H4 · build_context_pack
- [x] Кнопка «🗂 Собрать context_pack» в Memory tab → POST
      `/atlas/build-context-pack` → возвращает путь к JSON.

### H5 · Roadmap view
- [x] Tab `Roadmap` в `📖 Доки` modal → `/atlas/meta?file=roadmap.md`.

### H6 · Wiki / mermaid view
- [x] Tab `Wiki (mermaid)` в `📖 Доки` modal → iframe srcDoc с
      `atlas/wiki.html`. Mermaid рендерится так же как был.

### H7 · End-user docs viewer
- [x] Tab `Пользователю` в `📖 Доки` modal → `/atlas/user-docs/list`
      и `/atlas/user-docs/get?block_id=`. Список + reader.

### H8 · Editable rules.md / project.md / tech_stack.md
- [x] Tabs `project.md` / `rules.md` / `tech_stack.md` в `📖 Доки`
      modal с режимом ✎ Редактировать → 💾 Сохранить (atomic write).
      `/atlas/meta?file=` (GET) + `/atlas/meta/save` (POST whitelist).

### H9 · Cursor hooks status indicator
- [x] Topbar pill `cursor` с цветной точкой (зелёная/красная).
      `/atlas/cursor-hooks/status` опрашивается раз в 30s.

---

## P1 — Phase I · Run output deepening

После того как D1-D6 закроют базовый run-loop, нужно глубже:

- [x] **I1** `listRunFiles` уже сделан в Phase D (parses checks.log
      filtered by started_at). Добавлено как chip-pill в run-card —
      «↑ 4 файла» с подсчётом из `enrichRun`.
- [~] **I2** `decisions.log` уже виден в Memory tab (Phase H-2);
      per-run filter по timestamp — будущая итерация.
- [x] **I3** Iteration history в «Запуски» tab: каждая run-card
      показывает acceptance verdict pill (приёмка pass/fail с
      pass/total counts), который пришёл в окне между этим и
      следующим запуском. Закрывает loop run → verify → revise.
- [x] **I4** Cost aggregation: `enrichRunsBatch` суммирует
      `cost_usd` из всех `atlas/llm_traces/*.json` в окне run-а.
      Показывается на run-card как `$0.0042` (или `N mock` если
      provider=mock и cost=0). `trace_count` в title.
      Selftest 8/8 (group 5b).

---

## P2 — Phase J · Multi-tenant deepening

- [x] **J1** `atlas_artifacts_api.mjs` функции принимают `client_id` →
      `atlas/clients/<id>/artifacts/<art-id>/`. Path traversal защищён
      regex'ом, malformed → fallback на default. Selftest group 5b
      (7/7 green). API server route'ы read `_client` из body или
      `?client=` query.
- [ ] **J2** Write auth: header `X-Atlas-Client-Token`. Defer.
- [x] **J3** Topbar pill «<client>» с цветной точкой; clicked открывает
      dropdown со списком из `/atlas/clients/list`. Кнопка «＋ новый
      клиент» с prompt'ом создаёт new namespace при первом write.
      Switch меняет `?client=` в URL и reload.

---

## P2 — Phase K · UX из PDF

- [x] **K1** Onboarding теперь интерактивный 5-step tour: Карта /
      Детали блока / Агенты (FSM) / Артефакты / ⌘K + ✨ Sima.
      Progress dots + ← назад / далее → / поехали. «Skip» персистится
      в localStorage, повторно открывается через TweakButton.
      Каждый шаг подсвечивает свою фишку с уже-реализованного UI
      (Запуски FSM, ＋ Артефакт, ! на блоке, Совет Клода).
- [x] **K2** `callAdvice` принимает `context_kind` ∈ {block,
      block_acceptance, block_field, block_connections, tz,
      graph_overview, gallery}. Каждый kind имеет свой system-prompt
      angle. UI сделал 4 entry-point: topbar pill «✨ Совет Клода»
      (graph_overview), Acceptance «Почему упала?» (block_acceptance),
      Connections «что упускаю?» (block_connections), TZ «Sima ужмёт ТЗ»
      (tz). Возвращаемое поле `kind` echo'ится для UI-валидации.
- [x] **K3** «＋ Снимок графа» в TemplatesPanel: form с id /
      title / description → POST `/atlas/schema-templates/snapshot`
      реверс-инжинирит текущий `atlas/[clients/<c>/]graph.json` +
      все per-block mission/kpi/acceptance в template-shape.
      Авто-вычисляется common-prefix для chistых suffix-ов
      (например `b.lensa-auth + b.lensa-ingest` → suffix `auth/ingest`).
      Edges приводятся к suffix-ссылкам. Dup-защита (`overwrite=true`
      для перезаписи). Multi-tenant: `?client=` сохраняет per-client.
      F4 (subsystem-as-artifact) остаётся как complementary flow.
- [x] **K4** Composer теперь имеет intent-picker: Продукт / Книга /
      Идея / Маркетинг / Своё. Передаётся в `synthesizeBlock` как
      `intent`, оборачивается в system-prompt через `INTENT_HINTS`
      table (book → "frame as chapters/audience/sources"; idea →
      "hypothesis/risk/experiment"; marketing → "ICP/channel/offer";
      etc). Дополняет F5 templates: templates создают фиксированный
      скелет, intent-picker гибко переинтерпретирует любой источник.

---

## P2 — Phase L · Robustness

- [x] **L1** ETag conflict resolution. Backend:
      `EtagMismatchError` class, `block.updated_at` стампится на
      каждый createBlock/patchBlock/deleteBlock. patchBlock принимает
      `if_match_updated_at` → throws → API server конвертирует в 409
      `{ok:false, error:'etag_mismatch', current:{...}}`. patchBlockFile
      использует mtime файла как ETag. Selftest 9/9 (group 9).
      Frontend: `blockEtags` ref хранит последний known updated_at,
      `persistBlock` шлёт его на каждый patch. На 409 поднимается
      conflict-modal с двумя колонками «СЕРВЕР / ВАША ПРАВКА» и
      кнопками «↻ Загрузить серверную» (+refresh) или «⚠ Перезаписать
      своим» (re-patch без if_match).
- [x] **L2** Undo/redo стек на top-level graph mutations
      (createBlock, addEdge, deleteEdge, addNote, deleteNote).
      Ctrl+Z отменяет, Ctrl+Shift+Z / Ctrl+Y повторяет (skip когда
      курсор в input/textarea). Topbar pills «↶ Undo (N)» / «↷ Redo
      (N)» показывают глубину. Stack capped at 100, in-memory.
      Subsystem mutations и contract-file edits — outside (свои
      flows). recordHistory(label, undoFn) собирает inverse cmd,
      `_noHistory` flag предотвращает рекурсивные записи при
      undo↔redo.
- [x] **L3** Activity log persistence: `pushLog()` теперь
      fire-and-forget пишет в `atlas/activity_log.jsonl` через
      `/atlas/activity-log/append`. На mount UI грузит последние 100
      entries через `/atlas/activity-log/tail` и заменяет ими
      editorial demo lines. Файл ротируется при > 1MB (хранится
      хвост 3000 строк).

---

## P0 — Phase M · «Sima сама создаёт схему» (главное обещание)

Самое сильное «вау» из PDF и из старой системы — Sima анализирует
артефакт + контекст продукта и **сама генерит черновик блока с mission /
kpi / acceptance**. Сейчас этого нет.

- [x] **M1** `scripts/atlas_synthesis_api.mjs` — synthesizeBlock(),
      suggestEdges(), decomposeTasks(). Каждая функция вызывает
      `callLLM` с structured-output schema. Возвращает sanitized
      proposals (id принудительно в `b.<base>` форме, layers
      нормализованы, нерелевантные drop'нуты). Mock-провайдер
      возвращает `[]` с флагом `mock:true` чтобы UI пометил «demo-режим».
- [x] **M2** Composer post-publish flow: кнопка «✦ Sima предложит блоки
      на основе этого» → показывает 1-3 карточки draft-ов с
      title/mission/KPI/acceptance/capabilities/rationale → «＋ Принять и
      создать блок» атомарно вызывает `createBlock` + `patchBlockFile`
      для mission.md/kpi.md/acceptance.md/depends_on.md/provides.md.
- [x] **M3** ConnectionsTab: кнопка «✦ предложить» → POST `/llm/suggest-edges`
      с focal_block_id + всеми modules + edges → cards с rationale →
      «＋ принять» вызывает `addEdge` (UI + persist).
- [x] **M4** TasksList: кнопка «✦ предложить декомпозицию» (для b.* блоков) →
      POST `/llm/decompose-tasks` → 4-8 задач с приоритетом и agent.
      Записываются как preview; запись в tasks.md — следующая итерация.

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

---

## P0 — Phase N · Fixes from ТЗ audit (commit 496b7e2 + N3)

После прочтения 4 ТЗ-файлов (`описание.md`, `новое_тз.md`, `старое_тз.md`,
`аудит_выполнения_ТЗ.md`, `план_реализации_sync-first.md`,
`юзерстори.md`) обнаружились explicit-требования, которые я пропустил.

- [x] **N1** LLM-валидатор «миссия vs реализация». `validateBlock()`
      собирает project.md + rules.md + tech_stack.md + блок (mission /
      KPI / acceptance / tasks / depends / provides) + tail decisions.log
      + tail checks.log + neighbor provides → LLM возвращает
      `{verdict: aligned|drift|broken, summary, violations[{kind,
      severity, evidence, fix}], matches[]}`. 7 kind: mission / kpi /
      acceptance / rules / tech_stack / depends_on / condition.
      Persisted в `atlas/validations/<id>/_latest.json`. UI: новая
      вкладка «Соответствие» в DetailPanel. Selftest 10/10.
- [x] **N2** Files registry alive/dead/archived. `atlas_files_api.mjs` +
      `atlas/files_registry.json` (+ markdown mirror). 6 функций
      (list/get/mark/remove/isAlive/filterAlive/syncFromBlockFilesMd).
      `build_context_pack.mjs` теперь использует `filterAlive` →
      агенты НЕ видят dead/archived файлы (закрывает «мёртвые файлы»
      из новое_тз §5). UI: новая вкладка «Файлы» с alive/dead/archived
      badges + per-file mark кнопками + import-from-block-files.md.
      Selftest 5/5.
- [x] **N3** Cursor subagents:
      `subagent_schema_syncer.mjs` (drift report по всему графу — 9
      валидаторов), `subagent_verifier.mjs` (acceptance + LLM-judge
      объединённый verdict), `subagent_wiki_builder.mjs` (regenerate
      WIKI/wiki.html/roadmap/auto_tz). Все три: (a) callable из CLI,
      (b) MCP-tools `subagent_*` в `mcp_atlas_server.mjs`, (c) listed
      в `.cursor/agents.json` для Cursor SDK, (d) UI panel ⚙ Подагенты
      в topbar — каждый с кнопкой «▶ запустить» + structured render
      результата.

## Что осталось из ТЗ (P1 — приоритет средний)

- [ ] Счётчики «N/M задач, K/L KPI» прямо на карточках в графе
- [ ] screenshots/<block>/ + автозахват per-block
- [ ] history/<block>/ diff-версии mission при patchBlockFile
- [x] Sync-report viewer (Phase O-1)
- [ ] Демо-проект `atlas/clients/example/` (атлас описывает сам себя)
- [ ] Кнопка «Запустить ревью продукта» в Gallery
- [ ] tech_stack блока в DetailPanel

## Phase O — gaps from re-read of ТЗ

- [x] **O1** Sync-report viewer. Topbar `⟳ Sync` pill открывает
      `SyncReportPanel`: tabs Обзор / По блокам / Валидаторы.
      Считает `subagent_schema_syncer` + опционально `subagent_verifier --all`
      (LLM-судья), мерджит deterministic+LLM verdicts, рисует ✓/⚠/✗
      counts + click-to-jump per-block list с reason. Заменяет mock-
      narration в activity log.
- [x] **O5** Auto-reflect after run. `reflect_after_run.mjs` читает
      run_state + run_logs/<id>.log + acceptance _latest + validation
      _latest + mission → callLLM возвращает structured reflection
      (summary + what_worked + what_failed + next_time + decision_line)
      → дописывается в `patterns.md` блока + `decisions.log`.
      Хук вызывается из `run_block_implementation.mjs` после `fsm
      Succeeded/Failed`. Skip via `ATLAS_SKIP_REFLECT=1`. Mock provider
      не падает — пишет «[demo]» секцию.

- [ ] **O2** Auto-ingest run log → distillate в decisions.log блока
      (отдельно от reflection — для длинного транскрипта)
- [ ] **O3** Click-walkthrough tutorials с привязкой UI компонентов
- [ ] **O4** Operator-profile-aware advice + «Профиль» tab

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

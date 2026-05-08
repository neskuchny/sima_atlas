// Sima Atlas — minimal i18n (Phase R-7.52)
//
// Why a hand-rolled i18n vs. react-intl/i18next:
//   - 1 file, no deps, no build step
//   - the UI is babel-in-browser; we avoid extra CDN-loaded libs
//   - bilingual scope: EN (default for opensource visitors) + RU
//
// Usage in components:
//   const t = window.__SIMA_T;
//   <button>{t('toolbar.architecture')}</button>     // returns localized string
//   <button>{t('foo.bar', 'fallback if missing')}</button>
//
// To re-render on locale change, use the useLocale() hook:
//   function MyComponent() {
//     const locale = useLocale();   // re-renders on 'sima-locale-change' event
//     return <div>{t('hello')}</div>;
//   }
//
// To switch language (called from tweaks-panel toggle):
//   window.__SIMA_SET_LOCALE('ru')  // or 'en'
//
// Adding a new translation key:
//   1. Add { ru: '...', en: '...' } pair below
//   2. Replace the literal string in JSX with t('your.key')

(function () {
  'use strict';

  const TRANSLATIONS = {
    ru: {
      // ── DetailPanel tabs ────────────────────────────────
      'tab.overview':     'Обзор',
      'tab.contract':     'Контракт',
      'tab.tasks':        'Задачи',
      'tab.runs':         'Запуски',
      'tab.acceptance':   'Приёмка',
      'tab.validation':   'Соответствие',
      'tab.files':        'Файлы',
      'tab.subs':         'Подмодули',
      'tab.memory':       'Память',
      'tab.connections':  'Связи',

      // ── Toolbar ─────────────────────────────────────────
      'toolbar.new_module':       '＋ Новый модуль',
      'toolbar.depth':            'Глубина',
      'toolbar.depth_1_title':    'Только верхний уровень — без потомков',
      'toolbar.depth_2_title':    'Верхний уровень + 1 уровень детей',
      'toolbar.depth_all_title':  'Все потомки сразу — full overview',
      'toolbar.layers_on':        '▦ Слои стэка',
      'toolbar.edge_labels':      '⇄ Подписи связей',
      'toolbar.architecture':     '🏛 Архитектура',
      'toolbar.architecture_title': 'Архитектурное ревью — целостность фреймворков, масштаб, поток данных по всему графу',
      'toolbar.subagents':        '⚙ Подагенты',
      'toolbar.docs':             '📖 Доки',
      'toolbar.artifact':         '✦ Артефакт',
      'toolbar.suggestions':      '✦ Предложения',
      'toolbar.status_filter':    'Фильтр статуса',

      // ── View tabs (top header) ──────────────────────────
      'view.graph':               'Граф',
      'view.layered':             'Слои 3D',
      'view.split':               'Граф + детали',

      // ── Toolbar / hints ─────────────────────────────────
      'toolbar.product_review':   '🔍 Ревью продукта',
      'toolbar.product_review_title': 'Глубокое ревью продукта — schema-syncer + LLM-судья по каждому блоку (миссия vs реализация)',
      'toolbar.cmd_hint':         '⌘K · команда',
      'toolbar.new_project':      '＋ новый проект',
      'toolbar.crumb_done':       'готово',

      // ── Status filters ──────────────────────────────────
      'filter.done':              'готово',
      'filter.progress':          'в работе',
      'filter.todo':              'в очереди',
      'filter.desync':            'рассинхрон',
      'filter.fail':              'ошибка',

      // ── Drill view / canvas hints ───────────────────────
      'drill.opened_with_modules': '↳ открыл подсистему @${tag} (${count} модулей)',
      'drill.opened_empty':       '↳ открыл пустую подсистему @${tag}. Жми «+ Новый модуль» внутри.',
      'drill.up_top':             '↑ верхний уровень',
      'drill.canvas':             'Канвас',
      'canvas.hint':              '— внутрь модуля · точки по краям ноды → тяни на другую — связь · клик по линии — удалить',
      'canvas.hint_kbd':          '2×клик',
      'canvas.empty_state':       'Канвас пуст — это ожидаемо. Создайте проект, чтобы Sima могла читать и писать в',

      // ── Layer picker ────────────────────────────────────
      'layer.picker_label':       'Слой',
      'layer.backend':            'Backend',
      'layer.logic':              'Logic',
      'layer.frontend':           'Frontend',
      'layer.tests':              'Tests',
      'layer.backend_hint':       'API, persistence, серверная логика',
      'layer.logic_hint':         'бизнес-правила, чистые функции',
      'layer.frontend_hint':      'UI-компоненты, экраны',
      'layer.tests_hint':         'unit, e2e, проверки',

      // ── B/L/F/T toolbar buttons ─────────────────────────
      'toolbar.add_backend':      '+ Backend блок',
      'toolbar.add_logic':        '+ Logic блок',
      'toolbar.add_frontend':     '+ Frontend блок',
      'toolbar.add_tests':        '+ Tests блок',
      'toolbar.add_backend_sub':  '+ Backend подмодуль',
      'toolbar.add_logic_sub':    '+ Logic подмодуль',
      'toolbar.add_frontend_sub': '+ Frontend подмодуль',
      'toolbar.add_tests_sub':    '+ Tests подмодуль',

      // ── Drill-view ──────────────────────────────────────
      'drill.up_top_level':       '↑ верхний уровень',
      'drill.canvas_label':       'Канвас',
      'drill.parent_pill':        '↑ parent:',

      // ── Status (block lifecycle) ────────────────────────
      'status.idea':              'идея',
      'status.todo':              'todo',
      'status.progress':          'в работе',
      'status.done':              'готово',
      'status.broken':            'сломано',

      // ── Detail panel — common ───────────────────────────
      'detail.close':             '✕ Закрыть',
      'detail.collapse':          'Свернуть',
      'detail.expand':            'Раскрыть',
      'detail.cancel':            'Отменить',

      // ── Tweaks panel — language toggle ──────────────────
      'tweaks.language':          'Язык интерфейса',
      'tweaks.language_en':       'English',
      'tweaks.language_ru':       'Русский',

      // ── Architecture review ─────────────────────────────
      'arch.what_wrong':          'что не так',
      'arch.how_fix':             'как пофиксить',
      'arch.affects_blocks':      'затрагивает блоки',
      'arch.concerns':            'Concerns',
      'arch.strengths':           'Что хорошо',
      'arch.run':                 '▶ запустить',
      'arch.analyzing':           'анализирую…',
      'arch.subtitle':            'Целостность фреймворков, масштаб, поток данных',

      // ── ContextRail (left sidebar) ──────────────────────
      'rail.product_context':     'Контекст продукта',
      'rail.collapse_title':      'Свернуть',
      'rail.goal':                'Цель',
      'rail.mission':             'Миссия',
      'rail.quality_kpi':         'Качество / KPI',
      'rail.conditions_stack':    'Условия / стек',
      'rail.layer_backend':       'BACKEND',
      'rail.layer_frontend':      'FRONTEND',
      'rail.layer_logic':         'ЛОГИКА',
      'rail.layer_checks':        'ПРОВЕРКИ',
      'rail.fill_in_docs':        'Заполни в 📖 Доки → project.md',
      'rail.kpi_label':           'KPI (project.md)',
      'rail.stack_label':         'стек (tech_stack.md)',
      'rail.edit_in_docs_prefix': 'Редактировать',
      'rail.edit_in_docs_suffix': 'в 📖 Доки',

      // ── DetailPanel header / hints ──────────────────────
      'detail.select_module':     'Выберите модуль',
      'detail.select_module_hint':'Кликните на узел в схеме — здесь появится описание, KPI, задачи, логика и история решений. Через эту панель агенты (Claude Code, Cursor, Codex) получают контекст именно нужного блока.',
      'detail.block_not_loaded':  'Блок ещё не подгружен. Возможно, страница не обновилась после создания — нажмите Sync вверху или Ctrl+R.',
      'detail.delete_title':      'Удалить блок (hard, с диска)',
      'detail.title_placeholder': 'название блока…',
      'detail.checked':           '✓ проверено',
      'detail.gate_hint':         'чтобы продвинуть статус — заполни:',

      // ── Overview tab ────────────────────────────────────
      'overview.subsystem':       'SUBSYSTEM',
      'overview.subsystem_title': 'Это — целая подсистема со своим контуром',
      'overview.subsystem_sub':   'модули, KPI, стек, задачи — открой схему внутри',
      'overview.open_schema':     'Открыть схему →',
      'overview.warn_attention':  'внимание · sima-core',
      'overview.why':             'Зачем',
      'overview.logic':           'Логика',
      'overview.backend':         'Бэкенд',
      'overview.frontend':        'Фронтенд',
      'overview.tech_stack':      'Tech stack блока',
      'overview.kpi':             'KPI блока',
      'overview.send_to_agent':   'Отправить в агента',
      'overview.this_block_ctx':  'Контекст этого блока →',
      'overview.documents':       'Документы',
      'overview.generate_export': 'Сгенерировать / экспорт →',
      'overview.tz_block':        '✎ ТЗ блока',
      'overview.claude_advice':   '✨ Совет Клода',
      'overview.module_desc_placeholder':'Описание модуля будет дополнено во время работы с агентом. Откройте таб «Контракт» и нажмите ✎ Руками рядом с mission.md, чтобы заполнить.',
      'overview.loading':         'Загрузка…',

      // ── Block screenshot ────────────────────────────────
      'screenshot.title':         'Скрин блока',
      'screenshot.no_shot':       'Скрин ещё не снят. Нажмите ниже.',
      'screenshot.set_url':       'Задайте ui_url блока, чтобы Sima могла снять скрин.',
      'screenshot.updated':       'обновлено:',
      'screenshot.history':       'история:',
      'screenshot.kb':            'КБ',
      'screenshot.ui_url':        'UI URL →',
      'screenshot.save':          '💾 сохранить',
      'screenshot.cancel':        'отмена',
      'screenshot.not_set':       '_(не задан)_',
      'screenshot.edit':          '✎ изменить',
      'screenshot.taking':        'снимаю…',
      'screenshot.take':          '📸 снять скрин',
      'screenshot.url_invalid':   'URL должен начинаться с http:// или https://',
      'screenshot.saved':         '✓ сохранено',
      'screenshot.save_failed':   'не удалось сохранить',

      // ── User docs button ────────────────────────────────
      'userdocs.no_response':     'нет ответа',
      'userdocs.ok':              '✓ доки сгенерированы — открой 📖 Доки → Пользователю',
      'userdocs.title':           'Сгенерировать пошаговый гайд для конечного пользователя (Click X → field Y → button Z)',
      'userdocs.label':           '📖 Гайд пользователю',

      // ── Tasks tab ───────────────────────────────────────
      'tasks.decomposition':      'Декомпозиция',
      'tasks.no_tasks':           'Задачи появятся, когда агент начнёт декомпозицию.',
      'tasks.sima_will_decompose':'✦ Sima разложит на задачи',
      'tasks.from_block_mission': 'Из mission блока →',
      'tasks.thinking':           'думаю…',
      'tasks.propose_decomp':     '✦ предложить декомпозицию',
      'tasks.demo_need_key':      'Demo-режим — нужен ANTHROPIC_API_KEY.',
      'tasks.suggestions_hint':   'Предложения только показаны — записать их в tasks.md можно через «Send to Claude Code» с этим контекстом.',

      // ── Subs tab ────────────────────────────────────────
      'subs.no_subs':             'У этого блока пока нет подмодулей.',
      'subs.title':               'Подмодули',

      // ── Memory tab ──────────────────────────────────────
      'memory.context_pack':      'Контекст-пак →',
      'memory.collecting':        'Собираю…',
      'memory.build_pack':        '🗂 Собрать context_pack',
      'memory.decisions_title':   'Решения блока (decisions.log)',
      'memory.decisions_empty':   'decisions.log пуст для этого блока.',
      'memory.only_b_blocks':     'Память — для b.* блоков atlas.',
      'memory.patterns_title':    'Паттерны (patterns.md)',
      'memory.lessons_title':     'Уроки (бутстрап)',
      'memory.lesson_good':       '✓ что сработало',
      'memory.lesson_bad':        '✗ что не сработало',
      'memory.no_lessons':        'Уроков по этому блоку нет.',
      'memory.events':            'События',
      'memory.no_events':         'Нет событий по этому блоку.',

      // ── Connections tab ─────────────────────────────────
      'conn.incoming':            'Входящие',
      'conn.outgoing':            'Исходящие',
      'conn.sima_suggest_edges':  '✦ Sima предложит связи',
      'conn.based_on_graph':      'На основе графа →',
      'conn.thinking':            'думаю…',
      'conn.suggest':             '✦ предложить',
      'conn.what_missing':        '✨ что упускаю?',
      'conn.demo_need_key':       'Demo-режим — нужен ANTHROPIC_API_KEY.',
      'conn.accept':              '＋ принять',
      'conn.skip':                '✗ пропустить',
      'conn.added':               '✓ добавлено',

      // ── Dock ────────────────────────────────────────────
      'dock.all_agents':          'Все агенты',
      'dock.cmd_for_command':     'для команды',
      'dock.expand':              'Раскрыть',
      'dock.collapse':            'Свернуть',
      'dock.log_empty':           'Лог пуст. Отправьте задачу из детальной панели — здесь появятся события агента.',
      'dock.roadmap':             'Дорожная карта',

      // ── LayeredV2 ───────────────────────────────────────
      'layered.view_label':       'view · layered',
      'layered.title_suffix':     '— по слоям',
      'layered.intro':            'Тот же продукт, что и в графе, но разложен по уровням ответственности. Слой → модули → описание + прогресс. Кликните любой модуль, чтобы открыть детали справа.',
      'layered.fe_title':         'Frontend · UI',
      'layered.fe_code':          'L3 · что видит пользователь',
      'layered.lo_title':         'Domain · Logic',
      'layered.lo_code':          'L2 · как продукт думает',
      'layered.be_title':         'Backend · Data',
      'layered.be_code':          'L1 · что хранит и считает',
      'layered.te_title':         'Tests · Ops',
      'layered.te_code':          'L4 · как мы это проверяем',
      'layered.empty':            'пока пусто',

      // ── Run status section ──────────────────────────────
      'runs.start_agent':         'Запуск агента',
      'runs.start_block':         'Запустить блок →',
      'runs.cancel_title':        'Отменить',
      'runs.cancel_btn':          '✕ Отменить',
      'runs.log_label':           'лог ·',
      'runs.bytes':               'байт',
      'runs.external_no_desc':    '(без описания в checks.log)',
      'runs.waiting_output':      'ожидаю вывод…',
      'runs.log_empty':           'лог пуст или удалён',
      'runs.changed_label':       'ИЗМЕНИЛ',
      'runs.history':             'История',
      'runs.no_runs':             'Запусков пока нет — нажмите кнопку выше.',
      'runs.extern_title':        'Внешний прогон — записан в checks.log агентом напрямую (Cursor IDE / Claude в другом терминале и т.д.)',
      'runs.extern':              'extern',
      'runs.acceptance':          'приёмка',
      'runs.changed_files':       'изменено файлов',
      'runs.mock':                'mock',
      'runs.mock_title':          'LLM вызовы (mock, без оплаты)',
      'runs.poll_pre':            'Опрос каждые',
      'runs.poll_post':           'сек.',

      // ── Acceptance section ──────────────────────────────
      'acc.loading':              'Загрузка…',
      'acc.no_data':              'Нет данных приёмки. Запустите acceptance-verifier по этому блоку.',
      'acc.title':                'Приёмка блока',
      'acc.checked_at':           'проверено:',
      'acc.starting':             'Запускаю…',
      'acc.fix_and_rerun':        '↻ Исправить и перезапустить',
      'acc.why_failed':           '✨ Почему упала?',
      'acc.improved_tag':         '↑ улучшилось',
      'acc.regressed_tag':        '↓ регресс',
      'acc.new_tag':              '+ новое',
      'acc.improved_count':       'улучшилось',
      'acc.regressed_count':      'регресс',
      'acc.see_runs':             'Откройте «Запуски» для прогресса.',
      'acc.run_created':          'Запуск создан:',

      // ── Validation section ──────────────────────────────
      'val.title':                'LLM-валидатор соответствия',
      'val.intro':                'Sima сравнивает миссию / KPI / acceptance блока с тем, что реально сделано (decisions / checks / files), и проверяет соблюдение rules.md и tech_stack.md.',
      'val.judge':                'Sima-судья →',
      'val.checking':             'проверяю…',
      'val.check_compliance':     '✦ Проверить соответствие',
      'val.last':                 'последняя:',
      'val.not_yet':              'Ещё не проверялось — нажмите кнопку выше.',
      'val.demo_need_key':        'Demo-режим — задайте ANTHROPIC_API_KEY для реальной проверки.',
      'val.aligned':              '✓ соответствует',
      'val.drift':                '⚠ дрейф',
      'val.broken':               '✗ сломано',
      'val.b_only':               'Доступно только для b.* блоков atlas.',
      'val.violations':           'Нарушения',
      'val.fix_suggestion':       'предлагаемый фикс:',
      'val.matches':              'Что хорошо',

      // ── Files section ───────────────────────────────────
      'files.title':              'Файлы блока (alive / dead / archived)',
      'files.intro':              'dead и archived файлы исключаются из context-pack, который читают агенты — так они никогда не натыкаются на старый код.',
      'files.b_only':             'Файловый реестр доступен только для b.* блоков atlas.',
      'files.importing':          'импорт…',
      'files.import_from_block':  '↻ импорт из files.md блока',
      'files.add_placeholder':    'src/path/file.ts — добавить новый',
      'files.add_alive':          '＋ alive',
      'files.loading':            'Загрузка…',
      'files.empty':              'Нет файлов в реестре. Импортируйте из files.md блока или добавьте вручную.',
      'files.reason_prompt':      'Причина (опционально):',

      // ── Contract section ────────────────────────────────
      'contract.fill_unavailable':'SIMA_API.synthesis.fillField недоступен. Открой DevTools → Console.',
      'contract.rewrite_unavailable':'SIMA_API.synthesis.rewriteField недоступен. Открой DevTools → Console.',
      'contract.expand_unavailable':'SIMA_API.synthesis.expandField недоступен. Открой DevTools → Console.',
      'contract.loading':         'Загрузка контракта…',
      'contract.b_only':          'Контракт доступен только для b.* блоков atlas.',
      'contract.title':           'Контракт блока',
      'contract.intro':           '! пусто · ⚠ слабо · ✓ заполнено. Sima может предложить черновик через ✨ или переформулировать через ✏.',
      'contract.manual_title':    'Открыть текстовое поле и отредактировать содержимое вручную (без LLM)',
      'contract.manual_btn':      '✎ Руками',
      'contract.fill_title':      'Sima сгенерирует черновик через LLM',
      'contract.fill_btn':        '✨ Заполнить',
      'contract.rewrite_title':   'Sima правит черновик не добавляя новых фактов (ошибки/стиль/ясность)',
      'contract.rewrite_btn':     '✏ Переписать',
      'contract.expand_title':    'Sima развернёт черновик: добавит акторов, edge cases, успех-критерии используя контекст проекта и соседей',
      'contract.expand_btn':      '✨ Развернуть',
      'contract.mode_fill':       'SIMA · ЗАПОЛНЯЕТ',
      'contract.mode_rewrite':    'SIMA · ПЕРЕФОРМУЛИРУЕТ',
      'contract.mode_expand':     'SIMA · РАЗВОРАЧИВАЕТ (добавляет контекст)',
      'contract.mode_manual':     'РЕДАКТИРОВАНИЕ ВРУЧНУЮ',
      'contract.demo_modal':      'Demo-режим: задайте ANTHROPIC_API_KEY чтобы получать реальные предложения.',
      'contract.was':             'БЫЛО',
      'contract.became_rewrite':  'СТАЛО (можно поправить)',
      'contract.became_expand':   'РАЗВЁРНУТО (можно поправить)',
      'contract.became_manual':   'ТЕКУЩЕЕ СОДЕРЖИМОЕ (правьте напрямую)',
      'contract.became_fill':     'ЧЕРНОВИК (можно поправить)',
      'contract.cancel':          'Отмена',
      'contract.saving':          'сохраняю…',
      'contract.approve':         '💾 Принять и записать',
      'contract.file_mission':    'Миссия',
      'contract.file_user_story': 'User story',
      'contract.file_user_story_ph':'Как X / Когда Y / Я хочу Z / Чтобы W — что пользователь реально хочет.',
      'contract.file_kpi':        'KPI',
      'contract.file_kpi_ph':     'Измеримые метрики успеха.',
      'contract.file_acceptance': 'Приёмка',
      'contract.file_acceptance_ph':'Тестируемые критерии готовности.',
      'contract.file_depends_on': 'Зависит от',
      'contract.file_depends_on_ph':'Какие блоки нужны для работы.',
      'contract.file_provides':   'Даёт',
      'contract.file_provides_ph':'Какие capability отдаёт.',
      'contract.file_code_summary':'Code summary',
      'contract.file_code_summary_ph':'Auto-gen после run-а: на чём написан, как, зачем (sub-summary вместо перечитывания всего кода).',
      'contract.file_mission_ph': 'Зачем существует этот блок?',
    },

    en: {
      // ── DetailPanel tabs ────────────────────────────────
      'tab.overview':     'Overview',
      'tab.contract':     'Contract',
      'tab.tasks':        'Tasks',
      'tab.runs':         'Runs',
      'tab.acceptance':   'Acceptance',
      'tab.validation':   'Validation',
      'tab.files':        'Files',
      'tab.subs':         'Submodules',
      'tab.memory':       'Memory',
      'tab.connections':  'Connections',

      // ── Toolbar ─────────────────────────────────────────
      'toolbar.new_module':       '＋ New block',
      'toolbar.depth':            'Depth',
      'toolbar.depth_1_title':    'Top level only — no descendants',
      'toolbar.depth_2_title':    'Top level + 1 level of children',
      'toolbar.depth_all_title':  'All descendants at once — full overview',
      'toolbar.layers_on':        '▦ Stack layers',
      'toolbar.edge_labels':      '⇄ Edge labels',
      'toolbar.architecture':     '🏛 Architecture',
      'toolbar.architecture_title': 'Architecture review — framework consistency, scale, data flow across the whole graph',
      'toolbar.subagents':        '⚙ Subagents',
      'toolbar.docs':             '📖 Docs',
      'toolbar.artifact':         '✦ Artifact',
      'toolbar.suggestions':      '✦ Suggestions',
      'toolbar.status_filter':    'Status filter',

      // ── View tabs (top header) ──────────────────────────
      'view.graph':               'Graph',
      'view.layered':             '3D layers',
      'view.split':               'Graph + details',

      // ── Toolbar / hints ─────────────────────────────────
      'toolbar.product_review':   '🔍 Product review',
      'toolbar.product_review_title': 'Deep product review — schema-syncer + LLM judge per block (mission vs implementation)',
      'toolbar.cmd_hint':         '⌘K · command',
      'toolbar.new_project':      '＋ new project',
      'toolbar.crumb_done':       'done',

      // ── Status filters ──────────────────────────────────
      'filter.done':              'done',
      'filter.progress':          'in progress',
      'filter.todo':              'todo',
      'filter.desync':            'desync',
      'filter.fail':              'failed',

      // ── Drill view / canvas hints ───────────────────────
      'drill.opened_with_modules': '↳ opened subsystem @${tag} (${count} modules)',
      'drill.opened_empty':       '↳ opened empty subsystem @${tag}. Hit «+ New block» inside.',
      'drill.up_top':             '↑ top level',
      'drill.canvas':             'Canvas',
      'canvas.hint':              '— go inside the module · drag from edge dots to another node — connection · click an edge — delete',
      'canvas.hint_kbd':          'dbl-click',
      'canvas.empty_state':       'Canvas is empty — that\'s expected. Create a project so Sima can read and write to',

      // ── Layer picker ────────────────────────────────────
      'layer.picker_label':       'Layer',
      'layer.backend':            'Backend',
      'layer.logic':              'Logic',
      'layer.frontend':           'Frontend',
      'layer.tests':              'Tests',
      'layer.backend_hint':       'API, persistence, server logic',
      'layer.logic_hint':         'business rules, pure functions',
      'layer.frontend_hint':      'UI components, screens',
      'layer.tests_hint':         'unit, e2e, validations',

      // ── B/L/F/T toolbar buttons ─────────────────────────
      'toolbar.add_backend':      '+ Backend block',
      'toolbar.add_logic':        '+ Logic block',
      'toolbar.add_frontend':     '+ Frontend block',
      'toolbar.add_tests':        '+ Tests block',
      'toolbar.add_backend_sub':  '+ Backend submodule',
      'toolbar.add_logic_sub':    '+ Logic submodule',
      'toolbar.add_frontend_sub': '+ Frontend submodule',
      'toolbar.add_tests_sub':    '+ Tests submodule',

      // ── Drill-view ──────────────────────────────────────
      'drill.up_top_level':       '↑ top level',
      'drill.canvas_label':       'Canvas',
      'drill.parent_pill':        '↑ parent:',

      // ── Status (block lifecycle) ────────────────────────
      'status.idea':              'idea',
      'status.todo':              'todo',
      'status.progress':          'in progress',
      'status.done':              'done',
      'status.broken':            'broken',

      // ── Detail panel — common ───────────────────────────
      'detail.close':             '✕ Close',
      'detail.collapse':          'Collapse',
      'detail.expand':            'Expand',
      'detail.cancel':            'Cancel',

      // ── Tweaks panel — language toggle ──────────────────
      'tweaks.language':          'UI language',
      'tweaks.language_en':       'English',
      'tweaks.language_ru':       'Русский',

      // ── Architecture review ─────────────────────────────
      'arch.what_wrong':          'what\'s wrong',
      'arch.how_fix':             'how to fix',
      'arch.affects_blocks':      'affects blocks',
      'arch.concerns':            'Concerns',
      'arch.strengths':           'Strengths',
      'arch.run':                 '▶ run',
      'arch.analyzing':           'analyzing…',
      'arch.subtitle':            'Framework consistency, scale, data flow',
    },
  };

  const STORAGE_KEY = 'sima.locale';
  const DEFAULT_LOCALE = 'en';

  function detectLocale() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'en' || saved === 'ru') return saved;
    } catch {}
    return DEFAULT_LOCALE;
  }

  window.__SIMA_LOCALE = detectLocale();

  window.__SIMA_T = function (key, fallback) {
    const dict = TRANSLATIONS[window.__SIMA_LOCALE] || TRANSLATIONS.en;
    if (dict[key] != null) return dict[key];
    if (TRANSLATIONS.en[key] != null) return TRANSLATIONS.en[key];
    return fallback != null ? fallback : key;
  };

  window.__SIMA_SET_LOCALE = function (lang) {
    if (lang !== 'en' && lang !== 'ru') return;
    if (window.__SIMA_LOCALE === lang) return;
    window.__SIMA_LOCALE = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch {}
    try { window.dispatchEvent(new Event('sima-locale-change')); } catch {}
  };

  // Note: there's deliberately NO useLocale hook here. A wrapper that
  // returns early when React isn't loaded yet violates rules-of-hooks
  // (conditional hook count between renders → "Rendered more hooks than
  // during previous render"). Components subscribe directly via
  // useState+useEffect; see App() in index.html for the canonical pattern.
})();

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

  // Convenience hook for React components — re-renders on locale change.
  // Usage: const locale = useLocale();
  window.__SIMA_USE_LOCALE = function () {
    const React = window.React;
    if (!React) return window.__SIMA_LOCALE;
    const [, setN] = React.useState(0);
    React.useEffect(() => {
      const fn = () => setN((n) => n + 1);
      window.addEventListener('sima-locale-change', fn);
      return () => window.removeEventListener('sima-locale-change', fn);
    }, []);
    return window.__SIMA_LOCALE;
  };
})();

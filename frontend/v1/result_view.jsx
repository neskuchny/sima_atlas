// result_view.jsx — synthesized result with positional layout + collapsible children
// Artifact family: many frameworks can share a "product" (same source net, different output).
const ARTIFACT_FAMILY = {
  product: [
    { key: 'product',   label: 'Карта продукта', kind: 'обзор',      icon: 'schema' },
    { key: 'tz',        label: 'ТЗ',             kind: 'требования', icon: 'text' },
    { key: 'manual',    label: 'Инструкция',     kind: 'как пользоваться', icon: 'note' },
    { key: 'mission',   label: 'Миссия',         kind: 'одна страница', icon: 'sparkle' },
    { key: 'release',   label: 'Release notes',  kind: 'анонс версии', icon: 'compose' },
    { key: 'pitch',     label: 'Питч',           kind: 'презентация 1 слайд', icon: 'meet' },
    { key: 'faq',       label: 'FAQ',            kind: 'частые вопросы', icon: 'comment' },
  ],
  book: [
    { key: 'book',     label: 'Карта книги',     kind: 'обзор',     icon: 'schema' },
    { key: 'synopsis', label: 'Синопсис',        kind: 'краткое',    icon: 'text' },
    { key: 'toc',      label: 'Оглавление',      kind: 'развёрнутое',icon: 'note' },
  ],
  idea: [
    { key: 'idea',       label: 'Карта идеи',    kind: 'обзор',      icon: 'schema' },
    { key: 'onepager',   label: 'Одностраничник',kind: 'кратко',     icon: 'text' },
    { key: 'validation', label: 'План валидации',kind: 'что проверить',icon: 'check' },
  ]
};

// which product family a framework belongs to
const FAMILY_FOR = {};
Object.entries(ARTIFACT_FAMILY).forEach(([fam, list]) => list.forEach(x => { FAMILY_FOR[x.key] = fam; }));

const RESULT_FRAMEWORKS = {
  book: {
    name: 'Книга',
    color: 'indigo',
    centerKind: 'книга',
    blocks: [
      // top — идейный уровень
      { id: 'meaning', title: 'Смысл книги', kind: 'зачем написана', region: 'top', col: 0,
        body: 'О том, что контекст — новая единица мышления. Мы разучились удерживать длинные цепочки смыслов и отдаём их ИИ одноразовыми запросами. Книга возвращает навык: собирать идеи как конструктор, а не потреблять как ленту.',
        takes: ['главная идея меморандума','цитата Карпати про вики'] },
      { id: 'audience', title: 'Читатель', kind: 'для кого', region: 'top', col: 1,
        body: 'Думающий практик 25-45, ежедневно работает с ИИ и чувствует что что-то не так. Дизайнеры, консультанты, исследователи, авторы.',
        takes: ['портрет из интервью'] },
      { id: 'narrative', title: 'Нарратив', kind: 'как ведём читателя', region: 'top', col: 2,
        body: 'От личной боли → через удивление от первого опыта с ИИ-кубиками → к системе работы. Каждая глава открывается сценой из жизни, дальше разбор и инструмент.',
        takes: ['приём вовлечения из другой книги'] },

      // left — форма
      { id: 'style', title: 'Стиль', kind: 'как звучит', region: 'left', col: 0,
        body: 'Тёплая публицистика с техническими вставками. Короткие абзацы, много конкретных примеров из практики. Без жаргона, но и не упрощённо. Тон разговорный, от первого лица.',
        takes: ['описание стиля из документа автора'] },

      // center — структура
      { id: 'toc', title: 'Оглавление', kind: '6 глав', region: 'center',
        body: 'Каркас книги. Каждая глава раскрывается в отдельный кубик справа.',
        takes: ['структура первой версии'],
        children: ['ch1','ch2','ch3','ch4','ch5','ch6'] },

      // right — раскрытие оглавления в главы (children)
      { id: 'ch1', title: 'Гл.1 · Почему ответы ИИ умирают в Google Docs', kind: 'глава', region: 'right', col: 0, parent: 'toc',
        body: 'Два месяца я копировал ответы ChatGPT в Google Docs. В марте обнаружил — 80% этих документов я никогда не открывал повторно. Контекст проваливался не потому что был плохим, а потому что не имел связи с остальным.',
        takes: ['черновик главы 1','приём вовлечения из другой книги'] },
      { id: 'ch2', title: 'Гл.2 · Контекст как актив', kind: 'глава', region: 'right', col: 1, parent: 'toc',
        body: 'Раскрываем метафору: контекст — это капитал, а не расход. Разбор трёх сценариев накопления.',
        takes: ['заметки из дневника'] },
      { id: 'ch3', title: 'Гл.3 · Кубик как единица смысла', kind: 'глава', region: 'right', col: 2, parent: 'toc',
        body: 'Определение. Виды кубиков. Минимальный жизнеспособный кубик. Антипаттерны.',
        takes: ['определение из меморандума'] },
      { id: 'ch4', title: 'Гл.4 · Связь важнее содержания', kind: 'глава', region: 'right', col: 3, parent: 'toc',
        body: 'Почему графы побеждают папки. Кейсы на связях разного типа.',
        takes: ['концепт SyncLoop'] },
      { id: 'ch5', title: 'Гл.5 · Синтез как ежедневная практика', kind: 'глава', region: 'right', col: 4, parent: 'toc',
        body: 'Ритуал: вечерний синтез, недельная пересборка. Примеры артефактов.',
        takes: [] },
      { id: 'ch6', title: 'Гл.6 · Что собирать за 100 дней', kind: 'глава', region: 'right', col: 5, parent: 'toc',
        body: 'Практический чеклист. Шаблоны кубиков. Финал с приглашением.',
        takes: [] },

      // bottom — издание
      { id: 'publish', title: 'Публикация', kind: 'издание', region: 'bottom', col: 1,
        body: 'Объём ~180 стр. Формат: печатная + веб-версия со связями. Издатель — независимый, с возможностью live-обновлений.',
        takes: ['решение из планёрки'] },
    ],
    edges: [
      ['meaning','narrative'], ['audience','narrative'], ['narrative','toc'],
      ['style','toc'], ['meaning','toc'],
      ['toc','ch1'], ['toc','ch2'], ['toc','ch3'], ['toc','ch4'], ['toc','ch5'], ['toc','ch6'],
      ['toc','publish']
    ]
  },

  product: {
    name: 'Продукт',
    color: 'orange',
    centerKind: 'продукт',
    blocks: [
      // top — стратегия
      { id: 'mission', title: 'Миссия', kind: 'зачем существует', region: 'top', col: 0,
        body: 'Превратить контекст из отходов работы с ИИ в собираемый актив. Чтобы каждый разговор, встреча, документ становились строительным материалом.',
        takes: ['миссия из меморандума','инсайт из опроса'] },
      { id: 'idea', title: 'Идея и фишка', kind: 'в чём новое', region: 'top', col: 1,
        body: 'Конструктор: складываешь контекст → пересобираешь в любой артефакт с живой связью до источников. SyncLoop уведомляет когда источник изменился.',
        takes: ['концепция ForkEngine','концепция SyncLoop'] },
      { id: 'metrics', title: 'Метрики', kind: 'на что влияет', region: 'top', col: 2,
        body: 'Time-to-first-artifact < 10 мин. D7 retention через библиотеку. Медиана 20+ кубиков к концу первой недели. 3+ композиции на пользователя.',
        takes: ['метрики из регламента'] },

      // left — люди и бренд
      { id: 'audience', title: 'Аудитория', kind: 'для кого', region: 'left', col: 0,
        body: 'Vibe-кодеры, консультанты, продуктовые команды — все кто ежедневно работает с ИИ и накапливает фрагменты в разных окнах.',
        takes: ['портрет из опроса'] },
      { id: 'visual', title: 'Визуал и бренд', kind: 'как выглядит', region: 'left', col: 1,
        body: 'Тёплые нейтральные тона, тонкие бордеры 0.5px, serif для цитат, акценты orange/indigo/amber/olive. Главный жест — связи между кубиками как живая ткань.',
        takes: ['гайдлайны из документа о стиле'] },

      // center — сам продукт
      { id: 'core', title: 'Ядро продукта', kind: 'что внутри', region: 'center',
        body: 'Три разворачивающихся подсистемы: интерфейс, логика, данные. Клик по стрелке — раскрывает подкубики.',
        takes: [],
        children: ['frontend','backend','data'] },

      // right — подсистемы, раскрываются
      { id: 'frontend', title: 'Фронт · интерфейс', kind: 'подсистема', region: 'right', col: 0, parent: 'core',
        body: 'Библиотека кубиков, композитор, граф, результат. React + Claude через интерфейс. Живые связи визуализируются SVG-линиями.',
        takes: ['решение Claude SDK путь'] },
      { id: 'backend', title: 'Бэк · логика', kind: 'подсистема', region: 'right', col: 1, parent: 'core',
        body: 'Движок SyncLoop (распространение изменений), ForkEngine (ветвление контекста), индексатор для семантического поиска связей.',
        takes: ['архитектура из меморандума'] },
      { id: 'data', title: 'Данные · хранение', kind: 'подсистема', region: 'right', col: 2, parent: 'core',
        body: 'Кубики как типизированные узлы. Связи с метаданными (что именно взято). Снимки состояний для отката. Импорт из Meetflow, Google Docs.',
        takes: ['принцип Context first-class'] },

      // bottom — исполнение
      { id: 'steps', title: 'Задачи', kind: 'ближайшие шаги', region: 'bottom', col: 0,
        body: '1. Запуск композитора на Claude через интерфейс\n2. Импорт встреч из Meetflow\n3. Шесть каркасов: книга, продукт, идея, стратегия, регламент, вики',
        takes: ['решения из планёрки 18 марта'] },
      { id: 'risks', title: 'Риски', kind: 'что может сломать', region: 'bottom', col: 1,
        body: 'Сложность онбординга — непривычная метафора кубиков. Перегрузка графа на больших корпусах. Зависимость от интерфейса Claude без API.',
        takes: [] },
      { id: 'gtm', title: 'Go-to-market', kind: 'как доносим', region: 'bottom', col: 2,
        body: 'Launch через личный блог автора + 3 кейс-стади пилотных пользователей. Twitter/X thread с видео-демо.',
        takes: [] },
    ],
    edges: [
      ['mission','idea'], ['idea','metrics'], ['mission','audience'], ['audience','idea'],
      ['visual','idea'], ['idea','core'], ['metrics','core'],
      ['core','frontend'], ['core','backend'], ['core','data'],
      ['core','steps'], ['steps','gtm'], ['steps','risks']
    ]
  },

  idea: {
    name: 'Идея',
    color: 'amber',
    centerKind: 'идея',
    blocks: [
      { id: 'why', title: 'Зачем', kind: 'какую боль решает', region: 'top', col: 0,
        body: 'ИИ генерирует одноразовые ответы. Пользователи копируют их в Google Docs и теряют связи. Контекст рассыпается между окнами.',
        takes: ['8 из 12 в опросе жалуются'] },
      { id: 'unique', title: 'Что уникально', kind: 'в чём отличие', region: 'top', col: 1,
        body: 'Синтез видимый и трассируемый. Каждый результат показывает — из каких кубиков собран. Источник изменился — видно где разошлось.',
        takes: ['концепт SyncLoop'] },
      { id: 'audience', title: 'Аудитория', kind: 'для кого', region: 'left', col: 0,
        body: 'Думающие практики, работающие с ИИ ежедневно.',
        takes: ['сегменты из интервью'] },
      { id: 'core', title: 'Суть идеи', kind: 'одной фразой', region: 'center',
        body: 'Контекст собирается как LEGO. Каждый разговор с ИИ — кубик. Проекты собираются из кубиков, а не пишутся с нуля.',
        takes: ['определение из меморандума'],
        children: ['exp1','exp2','exp3'] },
      { id: 'exp1', title: 'Проявление · библиотека', kind: 'как видно', region: 'right', col: 0, parent: 'core',
        body: 'Каждый ответ ИИ становится карточкой в типизированной библиотеке с тегами и источником.', takes: [] },
      { id: 'exp2', title: 'Проявление · синтез', kind: 'как видно', region: 'right', col: 1, parent: 'core',
        body: 'Новый артефакт собирается выбором кубиков и описанием намерения. Трассировка до источника сохраняется.', takes: [] },
      { id: 'exp3', title: 'Проявление · SyncLoop', kind: 'как видно', region: 'right', col: 2, parent: 'core',
        body: 'Источник меняется — производные подсвечиваются. Можно принять или ветвить.', takes: [] },
      { id: 'validation', title: 'Валидация', kind: 'чем подтверждается', region: 'bottom', col: 0,
        body: '12 интервью, 8 жалуются на потерю контекста. Личный кейс автора: 80% скопированных ответов никогда не переоткрываются.',
        takes: ['данные опроса','личный дневник'] },
      { id: 'next', title: 'Следующий шаг', kind: 'что делать', region: 'bottom', col: 1,
        body: 'Собрать MVP: библиотека + один каркас «Идея продукта» + Claude через интерфейс. Измерить time-to-first-artifact на 10 пользователях.',
        takes: ['решение Claude SDK путь'] },
    ],
    edges: [
      ['why','core'], ['unique','core'], ['audience','core'],
      ['core','exp1'], ['core','exp2'], ['core','exp3'],
      ['core','validation'], ['validation','next']
    ]
  },

  // === артефакты продуктовой семьи — собираются из той же сети ===

  tz: {
    name: 'ТЗ',
    color: 'indigo',
    centerKind: 'техзадание',
    blocks: [
      { id: 'goal', title: 'Цель задачи', kind: 'зачем делаем', region: 'top', col: 0,
        body: 'Запустить универсальный конструктор: пользователь складывает контекст в кубики и собирает из них артефакт за минуты, а не дни.',
        takes: ['миссия продукта','Time-to-first-artifact'] },
      { id: 'scope', title: 'Scope v1', kind: 'что входит', region: 'top', col: 1,
        body: '• библиотека кубиков\n• композитор с тремя каркасами (идея / продукт / книга)\n• синтез через Claude через интерфейс\n• SyncLoop на изменение источников',
        takes: ['решение Claude SDK путь','архитектура из меморандума'] },
      { id: 'noscope', title: 'Вне scope', kind: 'что не делаем', region: 'top', col: 2,
        body: 'Командная работа, права доступа, версионирование артефактов — в v2. Мобильный клиент — после.',
        takes: [] },

      { id: 'personas', title: 'Кто будет пользоваться', kind: 'персоны', region: 'left', col: 0,
        body: 'Индивидуальный think-worker: консультант, исследователь, автор. Знает Claude, устал копировать ответы в Google Docs.',
        takes: ['портрет из интервью'] },
      { id: 'stack', title: 'Стек', kind: 'технологии', region: 'left', col: 1,
        body: 'React, плоский граф состояния. Интеграция с Claude через клиентский интерфейс. Локальный сторадж + экспорт.',
        takes: ['решение Claude SDK путь'] },

      { id: 'core', title: 'Основные сценарии', kind: 'user-journey', region: 'center',
        body: 'Три ключевых потока, раскрываются справа.',
        takes: [],
        children: ['flow1','flow2','flow3'] },

      { id: 'flow1', title: 'Сценарий 1 · первый артефакт', kind: 'поток', region: 'right', col: 0, parent: 'core',
        body: 'Пользователь импортирует 3-5 документов → открывает композитор → выбирает «Идея продукта» → получает заполненный каркас за 30 сек.',
        takes: [] },
      { id: 'flow2', title: 'Сценарий 2 · синхронизация', kind: 'поток', region: 'right', col: 1, parent: 'core',
        body: 'Пользователь правит источник → видит уведомление во всех артефактах, где он использован → принимает или ветвит.',
        takes: ['концепт SyncLoop'] },
      { id: 'flow3', title: 'Сценарий 3 · повторная сборка', kind: 'поток', region: 'right', col: 2, parent: 'core',
        body: 'Из той же сети пользователь собирает второй артефакт (ТЗ из идеи продукта). Кубики переиспользуются.',
        takes: [] },

      { id: 'accept', title: 'Критерии приёмки', kind: 'definition of done', region: 'bottom', col: 0,
        body: '• TTFA на 5 новых пользователях < 10 мин\n• 90% синтезов трассируемы до источников\n• 0 потерь при обновлении источника',
        takes: ['метрики из регламента'] },
      { id: 'milestones', title: 'Вехи', kind: 'сроки', region: 'bottom', col: 1,
        body: 'M1 · библиотека + 1 каркас — 2 недели\nM2 · все три каркаса — +1 неделя\nM3 · SyncLoop — +2 недели',
        takes: [] },
      { id: 'risks', title: 'Риски и допущения', kind: 'что может сломать', region: 'bottom', col: 2,
        body: 'Интерфейс Claude может ограничить автоматизацию. Пользователи не привыкнут к метафоре кубиков за первую сессию.',
        takes: [] },
    ],
    edges: [
      ['goal','scope'], ['scope','core'], ['noscope','scope'],
      ['personas','core'], ['stack','core'],
      ['core','flow1'], ['core','flow2'], ['core','flow3'],
      ['core','accept'], ['accept','milestones'], ['milestones','risks']
    ]
  },

  manual: {
    name: 'Инструкция пользователя',
    color: 'olive',
    centerKind: 'гайд',
    blocks: [
      { id: 'promise', title: 'Что вы получите', kind: 'обещание', region: 'top', col: 0,
        body: 'За 10 минут соберёте первый артефакт — описание продукта, ТЗ или план исследования — из уже накопленного контекста.',
        takes: ['миссия продукта'] },
      { id: 'prereq', title: 'Что понадобится', kind: 'подготовка', region: 'top', col: 1,
        body: '3-5 документов, заметок или стенограмм встреч. Лучше — на одну тему. Подписка Claude активна.',
        takes: [] },

      { id: 'core', title: 'Три шага', kind: 'основной флоу', region: 'center',
        body: 'Короткий маршрут: импорт → сборка → доработка. Каждый шаг раскрывается справа.',
        takes: [],
        children: ['s1','s2','s3'] },

      { id: 's1', title: 'Шаг 1 · импорт', kind: 'действие', region: 'right', col: 0, parent: 'core',
        body: 'Перетащите файлы в библиотеку. Сима разобьёт их на кубики — инсайты, решения, цитаты. Посмотрите что получилось, переименуйте что нужно.',
        takes: [] },
      { id: 's2', title: 'Шаг 2 · композитор', kind: 'действие', region: 'right', col: 1, parent: 'core',
        body: 'Нажмите «собрать». Выберите тип: идея, продукт, ТЗ. Отметьте 5-10 кубиков, которые должны лечь в основу. Опишите намерение одной фразой.',
        takes: [] },
      { id: 's3', title: 'Шаг 3 · доработка', kind: 'действие', region: 'right', col: 2, parent: 'core',
        body: 'Каждый блок редактируется. Видно, из каких кубиков собран. Подправьте формулировки, добавьте или уберите блоки — Сима пересоберёт связи.',
        takes: [] },

      { id: 'tip', title: 'Подсказки', kind: 'приёмы', region: 'left', col: 0,
        body: '• лучше 10 атомарных кубиков, чем 3 больших документа\n• тег = будущий артефакт\n• если блок неточен — переформулируйте намерение',
        takes: [] },

      { id: 'faq', title: 'Если что-то не так', kind: 'troubleshoot', region: 'bottom', col: 0,
        body: 'Пусто — не хватает контекста, добавьте ещё кубиков. Непонятно — включите «трассировку», посмотрите источники. Дубли — удалите старые в библиотеке.',
        takes: [] },
      { id: 'next', title: 'Что дальше', kind: 'углубление', region: 'bottom', col: 1,
        body: 'Соберите второй артефакт из той же сети — ТЗ из идеи, питч из ТЗ. Кубики переиспользуются автоматически.',
        takes: [] },
    ],
    edges: [
      ['promise','core'], ['prereq','core'], ['tip','core'],
      ['core','s1'], ['core','s2'], ['core','s3'],
      ['s3','faq'], ['faq','next']
    ]
  },

  mission: {
    name: 'Миссия',
    color: 'orange',
    centerKind: 'декларация',
    blocks: [
      { id: 'who', title: 'Кто мы', kind: 'идентичность', region: 'top', col: 0,
        body: 'Конструктор смыслов для людей, которые ежедневно работают с ИИ.',
        takes: ['меморандум Сима v3'] },

      { id: 'belief', title: 'Во что верим', kind: 'убеждение', region: 'left', col: 0,
        body: 'Контекст — это актив, а не расходник. Каждый разговор должен оставлять кубик, а не теряться в ленте.',
        takes: ['эссе Карпати'] },

      { id: 'core', title: 'Что мы делаем', kind: 'одна фраза', region: 'center',
        body: 'Превращаем рассыпанный контекст в собираемые артефакты со связью до источников.',
        takes: ['миссия из меморандума'] },

      { id: 'for', title: 'Для кого', kind: 'аудитория', region: 'right', col: 0,
        body: 'Для практиков, которые накапливают знания в разных окнах и теряют связи.',
        takes: ['сегменты из опроса'] },

      { id: 'how', title: 'Как это меняет мир', kind: 'эффект', region: 'bottom', col: 0,
        body: 'Люди перестают начинать с нуля. Каждый час работы с ИИ становится вкладом в собственный контекст — вместо сгорающих ответов.',
        takes: ['инсайт копипаста'] },
    ],
    edges: [
      ['who','core'], ['belief','core'], ['core','for'], ['core','how']
    ]
  },

  release: {
    name: 'Release notes',
    color: 'amber',
    centerKind: 'релиз',
    blocks: [
      { id: 'headline', title: 'Главное', kind: 'что нового', region: 'top', col: 0,
        body: 'Сима v1 · универсальный конструктор. Теперь из одного набора кубиков вы собираете любой артефакт — и ТЗ, и инструкцию, и питч.',
        takes: ['миссия'] },

      { id: 'core', title: 'Ключевые фичи', kind: 'что появилось', region: 'center',
        body: 'Три головные фичи раскрываются справа.',
        takes: [],
        children: ['f1','f2','f3'] },

      { id: 'f1', title: 'Композитор с каркасами', kind: 'фича', region: 'right', col: 0, parent: 'core',
        body: 'Выберите тип результата — получите заполненную схему. Три каркаса на старте, дальше добавляем регулярно.',
        takes: [] },
      { id: 'f2', title: 'SyncLoop', kind: 'фича', region: 'right', col: 1, parent: 'core',
        body: 'Источник изменился — производные артефакты подсвечиваются. Можно принять или ветвить без потери истории.',
        takes: ['концепт SyncLoop'] },
      { id: 'f3', title: 'Семья артефактов', kind: 'фича', region: 'right', col: 2, parent: 'core',
        body: 'Один продукт — много артефактов: карта, ТЗ, инструкция, питч. Собираются из одной сети, тегируются общим продуктом.',
        takes: [] },

      { id: 'fixes', title: 'Улучшения', kind: 'доработки', region: 'left', col: 0,
        body: '• Граф проекта держит 500+ кубиков без лагов\n• Библиотека научилась группировке по тегам\n• Быстрое переключение между артефактами одного продукта',
        takes: [] },

      { id: 'next', title: 'Что дальше', kind: 'в работе', region: 'bottom', col: 0,
        body: 'Командный режим, версионирование артефактов, мобильный клиент для диктовки-в-кубик.',
        takes: [] },
      { id: 'thanks', title: 'Спасибо', kind: 'благодарности', region: 'bottom', col: 1,
        body: '12 тестерам, которые перетаскивали файлы и ломали композитор — без вас не собрали бы настолько живой продукт.',
        takes: [] },
    ],
    edges: [
      ['headline','core'], ['fixes','core'],
      ['core','f1'], ['core','f2'], ['core','f3'],
      ['f3','next'], ['next','thanks']
    ]
  },

  pitch: {
    name: 'Питч',
    color: 'indigo',
    centerKind: 'один слайд',
    blocks: [
      { id: 'problem', title: 'Проблема', kind: 'что болит', region: 'top', col: 0,
        body: 'ИИ генерирует одноразовые ответы. 80% скопированного в Google Docs не открывается повторно.',
        takes: ['инсайт копипаста'] },
      { id: 'insight', title: 'Инсайт', kind: 'почему важно', region: 'top', col: 1,
        body: 'Контекст — это актив, который сейчас сгорает. Кто научится его собирать — выиграет следующее десятилетие.',
        takes: ['эссе Карпати'] },

      { id: 'core', title: 'Решение', kind: 'что мы делаем', region: 'center',
        body: 'Сима · конструктор смыслов. Кубики вместо ответов, артефакты вместо чатов, связи вместо папок.',
        takes: ['миссия'] },

      { id: 'why', title: 'Почему мы', kind: 'уникальность', region: 'left', col: 0,
        body: 'Единственные, кто делает трассировку синтеза видимой. Источник → кубик → артефакт, без чёрного ящика.',
        takes: ['ForkEngine','SyncLoop'] },

      { id: 'tractions', title: 'Трэкшн', kind: 'на чём стоим', region: 'right', col: 0,
        body: '12 интервью, 8 чётких «это мне нужно». Автор 6 недель живёт в прототипе.',
        takes: ['данные опроса'] },

      { id: 'ask', title: 'Ask', kind: 'что нужно', region: 'bottom', col: 0,
        body: 'Пилот на 50 пользователях, обратная связь за 4 недели, первый коммерческий контур к концу квартала.',
        takes: [] },
    ],
    edges: [
      ['problem','core'], ['insight','core'], ['why','core'], ['core','tractions'], ['core','ask']
    ]
  },

  faq: {
    name: 'FAQ',
    color: 'olive',
    centerKind: 'частые вопросы',
    blocks: [
      { id: 'core', title: 'О продукте', kind: 'топ-вопрос', region: 'center',
        body: 'Что такое Сима и зачем она нужна, если у меня уже есть Notion и ChatGPT?',
        takes: [],
        children: ['q1','q2','q3'] },

      { id: 'q1', title: 'Чем отличается от Notion', kind: 'вопрос', region: 'right', col: 0, parent: 'core',
        body: 'Notion — контейнер для документов. Сима — движок связей между ними. Здесь артефакты собираются, а не хранятся.',
        takes: [] },
      { id: 'q2', title: 'Чем отличается от ChatGPT', kind: 'вопрос', region: 'right', col: 1, parent: 'core',
        body: 'ChatGPT выдаёт ответ и забывает. Сима превращает каждый ответ в кубик и сохраняет связи между ними.',
        takes: [] },
      { id: 'q3', title: 'Как работает синтез', kind: 'вопрос', region: 'right', col: 2, parent: 'core',
        body: 'Вы выбираете кубики и тип результата. Сима раскладывает их по каркасу (идея, ТЗ, инструкция). Видно, что откуда пришло.',
        takes: ['концепт ForkEngine'] },

      { id: 'price', title: 'Про деньги', kind: 'цена', region: 'top', col: 0,
        body: 'Сколько стоит? В v1 — бесплатно для индивидуальных пользователей, платная команда после 3 участников.',
        takes: [] },
      { id: 'data', title: 'Про данные', kind: 'приватность', region: 'left', col: 0,
        body: 'Где хранится контекст? Локально у вас, синхронизация опциональна. Тексты не уходят на обучение моделей.',
        takes: [] },
      { id: 'migrate', title: 'Про перенос', kind: 'интеграции', region: 'bottom', col: 0,
        body: 'Можно ли импортировать из Notion, Obsidian, Google Docs? Да, из всех трёх через экспорт Markdown.',
        takes: [] },
      { id: 'team', title: 'Про команду', kind: 'коллаборация', region: 'bottom', col: 1,
        body: 'Работает в команде? Пока нет — v2. В v1 один пользователь.',
        takes: [] },
    ],
    edges: [
      ['price','core'], ['data','core'], ['core','q1'], ['core','q2'], ['core','q3'],
      ['q3','migrate'], ['migrate','team']
    ]
  },

  synopsis: {
    name: 'Синопсис книги',
    color: 'indigo',
    centerKind: 'синопсис',
    blocks: [
      { id: 'hook', title: 'Крючок', kind: 'первая фраза', region: 'top', col: 0,
        body: 'Мы разучились удерживать длинные цепочки смыслов — и отдаём их ИИ одноразовыми запросами.',
        takes: ['меморандум','эссе Карпати'] },
      { id: 'thesis', title: 'Тезис', kind: 'главный аргумент', region: 'top', col: 1,
        body: 'Контекст — не побочный продукт работы с ИИ, а центральный актив. Книга учит собирать его как капитал.',
        takes: [] },

      { id: 'core', title: 'О чём эта книга', kind: 'центр', region: 'center',
        body: 'Шесть глав — от личной боли до системы ежедневной работы с кубиками контекста.',
        takes: [] },

      { id: 'reader', title: 'Для кого', kind: 'читатель', region: 'left', col: 0,
        body: 'Практик 25-45, работает с ИИ ежедневно, чувствует что что-то не так.',
        takes: ['портрет из интервью'] },

      { id: 'takeaway', title: 'Главный вывод', kind: 'что уносишь', region: 'right', col: 0,
        body: 'Начните вести личную вики как побочный продукт работы с ИИ. Через 100 дней у вас будет больше, чем у любого эксперта.',
        takes: ['эссе Карпати'] },

      { id: 'plan', title: 'План', kind: '6 глав', region: 'bottom', col: 0,
        body: '1 · Почему ответы умирают в Google Docs\n2 · Контекст как актив\n3 · Кубик как единица смысла\n4 · Связь важнее содержания\n5 · Синтез как ежедневная практика\n6 · Что собирать за 100 дней',
        takes: [] },
    ],
    edges: [['hook','core'], ['thesis','core'], ['reader','core'], ['core','takeaway'], ['core','plan']]
  },

  toc: {
    name: 'Оглавление',
    color: 'indigo',
    centerKind: 'структура',
    blocks: [
      { id: 'core', title: 'Структура книги', kind: '6 глав', region: 'center',
        body: 'Разворачивается справа.',
        takes: [],
        children: ['c1','c2','c3','c4','c5','c6'] },
      { id: 'c1', title: '1 · Google Docs-кладбище', kind: 'глава', region: 'right', col: 0, parent: 'core',
        body: 'Личная история о 80% скопированного. Данные из опроса. Почему так происходит.', takes: [] },
      { id: 'c2', title: '2 · Контекст как актив', kind: 'глава', region: 'right', col: 1, parent: 'core',
        body: 'Метафора капитала. Три сценария накопления. Как считать «прибыль».', takes: [] },
      { id: 'c3', title: '3 · Кубик', kind: 'глава', region: 'right', col: 2, parent: 'core',
        body: 'Определение. Минимальный жизнеспособный кубик. Антипаттерны.', takes: [] },
      { id: 'c4', title: '4 · Связь', kind: 'глава', region: 'right', col: 3, parent: 'core',
        body: 'Граф vs папки. Типы связей. Кейсы.', takes: [] },
      { id: 'c5', title: '5 · Синтез', kind: 'глава', region: 'right', col: 4, parent: 'core',
        body: 'Ритуалы. Вечерний синтез. Недельная пересборка.', takes: [] },
      { id: 'c6', title: '6 · 100 дней', kind: 'глава', region: 'right', col: 5, parent: 'core',
        body: 'Чеклист. Шаблоны. Приглашение.', takes: [] },
    ],
    edges: [['core','c1'],['core','c2'],['core','c3'],['core','c4'],['core','c5'],['core','c6']]
  },

  onepager: {
    name: 'Одностраничник',
    color: 'amber',
    centerKind: 'A4',
    blocks: [
      { id: 'top', title: 'Идея одной фразой', kind: 'hook', region: 'top', col: 0,
        body: 'Контекст собирается как LEGO — каждый разговор с ИИ становится кубиком.',
        takes: ['определение из меморандума'] },
      { id: 'core', title: 'Что получается', kind: 'результат', region: 'center',
        body: 'Артефакты собираются из кубиков за минуты, связи до источников сохраняются.', takes: [] },
      { id: 'why', title: 'Почему сейчас', kind: 'timing', region: 'left', col: 0,
        body: 'Все перешли на ежедневный ИИ. Контекст превратился в проблему масштаба.', takes: [] },
      { id: 'how', title: 'Как', kind: 'в двух строчках', region: 'right', col: 0,
        body: 'Библиотека + композитор + SyncLoop.', takes: [] },
      { id: 'proof', title: 'Чем подтверждаем', kind: 'фактура', region: 'bottom', col: 0,
        body: '12 интервью · 8 жалоб на копипаст · автор живёт в прототипе 6 недель.',
        takes: ['данные опроса'] },
    ],
    edges: [['top','core'], ['why','core'], ['core','how'], ['core','proof']]
  },

  validation: {
    name: 'План валидации',
    color: 'olive',
    centerKind: 'эксперимент',
    blocks: [
      { id: 'hypo', title: 'Гипотеза', kind: 'что проверяем', region: 'top', col: 0,
        body: 'Если дать людям место, где контекст копится и пересобирается — они перестанут начинать с нуля и TTFA упадёт до 10 мин.',
        takes: ['инсайт копипаста'] },

      { id: 'core', title: 'Что тестируем', kind: '3 сигнала', region: 'center',
        body: 'Три критерия-сигнала, раскрываются справа.',
        takes: [],
        children: ['s1','s2','s3'] },

      { id: 's1', title: 'Сигнал 1 · TTFA', kind: 'метрика', region: 'right', col: 0, parent: 'core',
        body: 'Медиана времени до первого артефакта на 10 новых пользователях < 10 мин.',
        takes: ['метрика из регламента'] },
      { id: 's2', title: 'Сигнал 2 · повтор', kind: 'метрика', region: 'right', col: 1, parent: 'core',
        body: '40%+ пользователей возвращаются и собирают второй артефакт в первую неделю.',
        takes: [] },
      { id: 's3', title: 'Сигнал 3 · связность', kind: 'метрика', region: 'right', col: 2, parent: 'core',
        body: 'Средний артефакт использует 5+ источников. Показатель, что кубики реально переиспользуются.',
        takes: [] },

      { id: 'audience', title: 'На ком', kind: 'выборка', region: 'left', col: 0,
        body: '10 практиков из сегмента vibe-кодеров, знакомых с Claude. Набираем через личные сети.',
        takes: ['сегменты'] },

      { id: 'plan', title: 'Протокол', kind: 'как меряем', region: 'bottom', col: 0,
        body: 'Первая неделя — пассивный сбор метрик. Вторая — интервью на 30 минут с каждым участником. Третья — сводка и решение.',
        takes: [] },
      { id: 'kill', title: 'Что зарубит', kind: 'порог отказа', region: 'bottom', col: 1,
        body: 'Если TTFA > 25 мин у 6/10 — гипотеза не подтверждена. Возвращаемся к онбордингу.',
        takes: [] },
    ],
    edges: [['hypo','core'],['audience','core'],['core','s1'],['core','s2'],['core','s3'],['core','plan'],['plan','kill']]
  },
};

// positional layout — center hub, then regions around it
function computeLayout(fw, collapsed) {
  const W = 1100, H = 720;
  const cx = W/2, cy = H/2;
  const blocks = fw.blocks;

  // filter children when parent is collapsed
  const hidden = new Set();
  blocks.forEach(b => {
    if (b.children && collapsed[b.id]) b.children.forEach(c => hidden.add(c));
  });

  // group by region
  const groups = { top: [], left: [], right: [], bottom: [], center: [] };
  blocks.forEach(b => { if (!hidden.has(b.id)) groups[b.region || 'center'].push(b); });

  const positions = {};
  const bw = 180, bh = 74;

  // TOP row
  const topY = 70;
  groups.top.forEach((b, i) => {
    const count = groups.top.length;
    const totalW = count * bw + (count - 1) * 30;
    const startX = cx - totalW/2;
    positions[b.id] = { x: startX + i * (bw + 30), y: topY, w: bw, h: bh };
  });

  // BOTTOM row
  const botY = H - 70 - bh;
  groups.bottom.forEach((b, i) => {
    const count = groups.bottom.length;
    const totalW = count * bw + (count - 1) * 30;
    const startX = cx - totalW/2;
    positions[b.id] = { x: startX + i * (bw + 30), y: botY, w: bw, h: bh };
  });

  // LEFT column
  const leftX = 60;
  groups.left.forEach((b, i) => {
    const count = groups.left.length;
    const totalH = count * bh + (count - 1) * 24;
    const startY = cy - totalH/2;
    positions[b.id] = { x: leftX, y: startY + i * (bh + 24), w: bw, h: bh };
  });

  // RIGHT column — expanded children stack vertically
  const rightX = W - 60 - bw;
  groups.right.forEach((b, i) => {
    const count = groups.right.length;
    const totalH = count * bh + (count - 1) * 14;
    const startY = cy - totalH/2;
    positions[b.id] = { x: rightX, y: startY + i * (bh + 14), w: bw, h: bh };
  });

  // CENTER
  const centerBlock = groups.center[0];
  if (centerBlock) {
    positions[centerBlock.id] = { x: cx - bw/2, y: cy - bh/2, w: bw, h: bh, isCenter: true };
  }

  return { positions, hidden, W, H };
}

function ResultView({ framework, onClose, sourceCount }) {
  const fw = RESULT_FRAMEWORKS[framework] || RESULT_FRAMEWORKS.product;
  const [blocks, setBlocks] = useState(fw.blocks);
  const [collapsed, setCollapsed] = useState({}); // parentId -> bool
  const [selected, setSelected] = useState(blocks.find(b => b.region === 'center')?.id || blocks[0].id);
  const selBlock = blocks.find(b => b.id === selected);
  const updateBlock = (id, patch) => setBlocks(bs => bs.map(b => b.id === id ? { ...b, ...patch } : b));

  const fwForLayout = { ...fw, blocks };
  const { positions, hidden, W, H } = useMemo(() => computeLayout(fwForLayout, collapsed), [blocks, collapsed]);
  const visibleBlocks = blocks.filter(b => !hidden.has(b.id));
  const visibleEdges = fw.edges.filter(([a,b]) => !hidden.has(a) && !hidden.has(b));

  const toggleChildren = (id) => setCollapsed(c => ({ ...c, [id]: !c[id] }));

  const regionLabel = (r) => ({ top: 'идейный уровень', left: 'форма и аудитория', right: 'раскрытие', bottom: 'исполнение', center: 'ядро' })[r] || r;

  return (
    <div className="canvas-wrap" style={{padding:0,display:'flex',flexDirection:'column',overflow:'hidden',height:'100%'}}>
      {/* Header */}
      <div style={{padding:'12px 22px',borderBottom:'0.5px solid var(--line-1)',display:'flex',alignItems:'center',gap:12}}>
        <div style={{width:28,height:28,borderRadius:'50%',background:'var(--olive-bg)',color:'var(--olive-ink)',display:'flex',alignItems:'center',justifyContent:'center'}}>
          <Icon name="check" size={14}/>
        </div>
        <div>
          <div style={{fontSize:15,fontWeight:500}}>Синтез завершён · {fw.name}</div>
          <div className="meta" style={{marginTop:2}}>{blocks.length} блоков · {fw.edges.length} связей · собрано из {sourceCount || 6} кубиков · сейчас</div>
        </div>
        <span className="grow"></span>
        <button className="btn sm ghost"><Icon name="download" size={11}/> экспорт</button>
        <button className="btn sm" style={{background:'var(--ink-1)',color:'var(--paper)',borderColor:'var(--ink-1)',display:'inline-flex',alignItems:'center',gap:6}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M3 6l9 6 9-6M3 6v12l9 6 9-6V6" stroke="currentColor" strokeWidth="1.5"/></svg>
          в Claude Code
        </button>
        <button className="btn sm ghost" onClick={onClose}>← в проект</button>
      </div>

      {/* Body: left = schema, right = editor */}
      <div style={{flex:1,display:'grid',gridTemplateColumns:'minmax(0,1.25fr) minmax(0,1fr)',overflow:'hidden'}}>
        {/* SCHEMA */}
        <div style={{borderRight:'0.5px solid var(--line-1)',overflow:'auto',background:`radial-gradient(circle at 1px 1px, var(--line-1) 1px, transparent 1px) 0 0 / 24px 24px, var(--bg-0)`,position:'relative'}}>
          <div style={{padding:'12px 22px 4px'}}>
            <div className="sec-ttl" style={{margin:0}}>схема {fw.name.toLowerCase()}</div>
            <div className="meta" style={{marginTop:4,lineHeight:1.5}}>
              блоки расположены по смыслу: вверху — идея и стратегия, внизу — исполнение, слева — форма, справа — раскрытие, в центре — ядро. Блоки с ▸ разворачиваются.
            </div>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{width:'100%',height:'calc(100% - 70px)',display:'block'}}>
            <defs>
              <marker id="r-arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="var(--ink-4)"/>
              </marker>
              <marker id="r-arr-accent" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill={`var(--${fw.color})`}/>
              </marker>
            </defs>

            {/* region labels, very subtle */}
            <text x={W/2} y={30} textAnchor="middle" style={{fontSize:10,fill:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'0.12em',fontStyle:'italic'}}>идея · стратегия · смысл</text>
            <text x={W/2} y={H - 18} textAnchor="middle" style={{fontSize:10,fill:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'0.12em',fontStyle:'italic'}}>исполнение · запуск · риски</text>
            <g transform={`translate(20 ${H/2}) rotate(-90)`}>
              <text textAnchor="middle" style={{fontSize:10,fill:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'0.12em',fontStyle:'italic'}}>форма · люди</text>
            </g>
            <g transform={`translate(${W-20} ${H/2}) rotate(90)`}>
              <text textAnchor="middle" style={{fontSize:10,fill:'var(--ink-4)',textTransform:'uppercase',letterSpacing:'0.12em',fontStyle:'italic'}}>раскрытие · детали</text>
            </g>

            {/* edges */}
            {visibleEdges.map(([a,b], i) => {
              const pa = positions[a], pb = positions[b]; if (!pa || !pb) return null;
              const ax = pa.x + pa.w/2, ay = pa.y + pa.h/2;
              const bx = pb.x + pb.w/2, by = pb.y + pb.h/2;
              // attach to closer edges
              const dx = bx - ax, dy = by - ay;
              const absDx = Math.abs(dx), absDy = Math.abs(dy);
              let axa, aya, bxa, bya;
              if (absDx > absDy) {
                axa = ax + Math.sign(dx) * pa.w/2; aya = ay;
                bxa = bx - Math.sign(dx) * pb.w/2; bya = by;
              } else {
                axa = ax; aya = ay + Math.sign(dy) * pa.h/2;
                bxa = bx; bya = by - Math.sign(dy) * pb.h/2;
              }
              // central block edges use accent color
              const isFromCenter = pa.isCenter || pb.isCenter;
              return (
                <path key={i} d={`M ${axa} ${aya} C ${(axa+bxa)/2} ${aya}, ${(axa+bxa)/2} ${bya}, ${bxa} ${bya}`}
                  fill="none" stroke={isFromCenter ? `var(--${fw.color}-soft)` : 'var(--ink-5)'}
                  strokeWidth={isFromCenter ? 1.1 : 0.8}
                  markerEnd={isFromCenter ? 'url(#r-arr-accent)' : 'url(#r-arr)'}
                  opacity={0.8}/>
              );
            })}

            {/* blocks */}
            {visibleBlocks.map(b => {
              const p = positions[b.id]; if (!p) return null;
              const isSel = selected === b.id;
              const isCenter = p.isCenter;
              const hasChildren = b.children && b.children.length > 0;
              const isCollapsed = !!collapsed[b.id];

              return (
                <g key={b.id} data-block-id={b.id} transform={`translate(${p.x} ${p.y})`} style={{cursor:'pointer'}} onClick={() => setSelected(b.id)}>
                  <rect width={p.w} height={p.h} rx={8}
                    fill={isCenter ? 'var(--paper)' : 'var(--paper)'}
                    stroke={isSel ? `var(--${fw.color})` : (isCenter ? `var(--${fw.color})` : 'var(--line-2)')}
                    strokeWidth={isSel ? 1.6 : (isCenter ? 1.2 : 0.7)}/>
                  <rect width={isCenter ? 4 : 3} height={p.h} rx={1.5} fill={`var(--${fw.color}${isCenter ? '' : '-soft'})`}/>
                  <text x={12} y={18} style={{fontSize:9,fill:isCenter ? `var(--${fw.color}-ink)` : 'var(--ink-4)',textTransform:'uppercase',letterSpacing:'0.06em',fontWeight: isCenter ? 600 : 400}}>
                    {b.kind}
                  </text>
                  <foreignObject x={10} y={22} width={p.w - 20} height={p.h - 28}>
                    <div xmlns="http://www.w3.org/1999/xhtml" style={{fontSize:isCenter?14:12,fontWeight:isCenter?600:500,color:'var(--ink-1)',lineHeight:1.3,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',fontFamily:'var(--font-sans)'}}>
                      {b.title}
                    </div>
                  </foreignObject>

                  {/* takes badge */}
                  {b.takes && b.takes.length > 0 && (
                    <g transform={`translate(${p.w - 30} ${p.h - 14})`}>
                      <rect width={24} height={11} rx={5} fill="var(--amber-bg)"/>
                      <text x={12} y={8} textAnchor="middle" style={{fontSize:8,fill:'var(--amber-ink)',fontWeight:500}}>← {b.takes.length}</text>
                    </g>
                  )}

                  {/* expand/collapse toggle */}
                  {hasChildren && (
                    <g transform={`translate(${p.w - 22} 6)`} onClick={(e) => { e.stopPropagation(); toggleChildren(b.id); }}>
                      <rect x={-2} y={-2} width={20} height={16} rx={4} fill={isCollapsed ? `var(--${fw.color}-bg)` : 'var(--bg-1)'} stroke={`var(--${fw.color}-soft)`} strokeWidth="0.5"/>
                      <text x={8} y={9} textAnchor="middle" style={{fontSize:9,fill:`var(--${fw.color}-ink)`,fontWeight:600,fontFamily:'var(--font-mono)'}}>
                        {isCollapsed ? `▸${b.children.length}` : '▾'}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* hint for collapsed parent */}
            {visibleBlocks.filter(b => b.children && collapsed[b.id]).map(b => {
              const p = positions[b.id]; if (!p) return null;
              return (
                <g key={`hint-${b.id}`} transform={`translate(${p.x + p.w + 10} ${p.y + p.h/2 - 8})`} style={{pointerEvents:'none'}}>
                  <text style={{fontSize:10,fill:'var(--ink-4)',fontStyle:'italic'}}>· свёрнуто {b.children.length}</text>
                </g>
              );
            })}
          </svg>

          {/* mini-toolbar */}
          <div style={{position:'absolute',bottom:14,left:22,display:'flex',gap:6,flexWrap:'wrap',background:'var(--paper)',padding:'6px 10px',borderRadius:6,border:'0.5px solid var(--line-2)'}}>
            <button className="btn xs"><Icon name="plus" size={10}/> блок</button>
            <button className="btn xs"><Icon name="link" size={10}/> связь</button>
            <button className="btn xs"><Icon name="sparkle" size={10}/> Сима предложит блок</button>
            <button className="btn xs ghost" onClick={() => {
              const next = {}; blocks.forEach(b => { if (b.children) next[b.id] = Object.values(collapsed).every(v => v) ? false : true; });
              setCollapsed(next);
            }}>свернуть всё</button>
          </div>
        </div>

        {/* EDITOR */}
        <div style={{overflow:'auto',padding:'18px 24px'}}>
          {selBlock && (
            <>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                <span style={{padding:'2px 8px',fontSize:10,background:`var(--${fw.color}-bg)`,color:`var(--${fw.color}-ink)`,borderRadius:10,fontWeight:500,textTransform:'uppercase',letterSpacing:'0.05em'}}>
                  {selBlock.kind}
                </span>
                <span className="meta">· {regionLabel(selBlock.region)}</span>
                {selBlock.parent && <span className="meta" style={{opacity:0.7}}>· часть «{blocks.find(x => x.id === selBlock.parent)?.title}»</span>}
              </div>
              <input value={selBlock.title} onChange={e => updateBlock(selBlock.id, { title: e.target.value })}
                style={{width:'100%',fontSize:22,fontWeight:500,border:'none',outline:'none',background:'transparent',color:'var(--ink-1)',letterSpacing:'-0.01em',fontFamily:'var(--font-serif)',marginBottom:10,padding:0}}/>

              {selBlock.takes && selBlock.takes.length > 0 && (
                <div style={{padding:'10px 12px',background:'var(--amber-bg)',borderRadius:6,marginBottom:12}}>
                  <div style={{fontSize:10,color:'var(--amber-ink)',textTransform:'uppercase',letterSpacing:'0.05em',fontWeight:500,marginBottom:6}}>
                    что взято из источников
                  </div>
                  <div className="col" style={{gap:4}}>
                    {selBlock.takes.map((t, i) => (
                      <div key={i} style={{fontSize:11.5,color:'var(--amber-ink)',lineHeight:1.45,display:'flex',gap:6}}>
                        <span style={{opacity:0.5,fontFamily:'var(--font-mono)',fontSize:10}}>{String(i+1).padStart(2,'0')}</span>
                        <span>{t}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <textarea value={selBlock.body} onChange={e => updateBlock(selBlock.id, { body: e.target.value })}
                style={{width:'100%',minHeight:240,border:'0.5px solid var(--line-2)',background:'var(--paper)',borderRadius:8,padding:'14px 16px',fontSize:14,lineHeight:1.6,color:'var(--ink-1)',fontFamily:'var(--font-serif)',outline:'none',resize:'vertical',whiteSpace:'pre-wrap'}}/>

              <div style={{display:'flex',gap:6,marginTop:10,flexWrap:'wrap'}}>
                <button className="btn sm"><Icon name="sparkle" size={11}/> расписать</button>
                <button className="btn sm"><Icon name="sparkle" size={11}/> другой тон</button>
                <button className="btn sm"><Icon name="mic" size={11}/> надиктовать</button>
                {selBlock.children && (
                  <button className="btn sm" onClick={() => toggleChildren(selBlock.id)}>
                    {collapsed[selBlock.id] ? `развернуть ${selBlock.children.length}` : `свернуть ${selBlock.children.length}`}
                  </button>
                )}
                <span className="grow"></span>
                <button className="btn sm ghost">→ Google Docs</button>
              </div>

              {/* Children list */}
              {selBlock.children && selBlock.children.length > 0 && (
                <div style={{marginTop:18,paddingTop:14,borderTop:'0.5px solid var(--line-1)'}}>
                  <div className="sec-ttl">разворачивается в</div>
                  <div className="col" style={{gap:6}}>
                    {selBlock.children.map(cid => {
                      const c = blocks.find(x => x.id === cid); if (!c) return null;
                      return (
                        <button key={cid} className="chip" style={{justifyContent:'flex-start',textAlign:'left',padding:'6px 10px',display:'flex',gap:8,alignItems:'center',width:'100%'}} onClick={() => setSelected(cid)}>
                          <span style={{fontSize:10,color:'var(--ink-4)',fontFamily:'var(--font-mono)'}}>{c.kind}</span>
                          <span style={{flex:1}}>{c.title}</span>
                          <Icon name="arrow" size={11} color="var(--ink-4)"/>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Connected blocks */}
              <div style={{marginTop:18,paddingTop:14,borderTop:'0.5px solid var(--line-1)'}}>
                <div className="sec-ttl">связанные блоки</div>
                <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
                  {fw.edges.filter(([a,b]) => a === selBlock.id || b === selBlock.id).map(([a,b], i) => {
                    const otherId = a === selBlock.id ? b : a;
                    const other = blocks.find(x => x.id === otherId);
                    if (!other) return null;
                    const dir = a === selBlock.id ? '→' : '←';
                    return (
                      <button key={i} className="chip" onClick={() => setSelected(otherId)}>
                        {dir} {other.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

window.ResultView = ResultView;
window.RESULT_FRAMEWORKS = RESULT_FRAMEWORKS;

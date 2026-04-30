// data_v2.js — three projects (product / book / idea), each with 4 layers.
// Layer 1 = canvas (task + sources + links)
// Layer 2 = map with pre-filled fields + gap indicators
// Layer 3 = tz document
// Layer 4 = implementation (Claude Code status)
// + shared artifact gallery

window.SIMA_DATA_V2 = (() => {

  // ---------- SHARED ARTIFACT GALLERY ----------
  const artifacts = [
    // blocks
    { id:'art.data', type:'block', title:'Блок Data · источники и пайплайн', kind:'блок',
      body:'Универсальный блок для импорта встреч, документов, аудио. Типы источников, расписание синхронизации, схема хранения.',
      tags:['#block','#data','#reusable'], usedIn:['prj.sima','prj.book','prj.idea'], savedAt:'22 апр 2026', preview:'pipeline' },
    { id:'art.auth', type:'block', title:'Блок Auth · авторизация через Google', kind:'блок',
      body:'OAuth поток, хранение токенов, обновление сессии. Проверено в 3 продуктах.',
      tags:['#block','#auth','#canon'], usedIn:['prj.sima','prj.crm'], savedAt:'14 апр 2026', preview:'auth' },

    // sub-schemas
    { id:'art.us_map', type:'subschema', title:'User Story карта для SaaS', kind:'подсхема',
      body:'Каркас User Story: персона → цель → сценарий → критерии. Ссылки на источники.',
      tags:['#subschema','#userstory','#saas'], usedIn:['prj.sima','prj.crm'], savedAt:'19 апр 2026', preview:'us' },

    // full maps
    { id:'art.map_ecosys', type:'map', title:'Карта экосистемы продуктов v0.3', kind:'карта',
      body:'Три продукта (Сима, CRM, библиотека) объединены как слой. Связи между продуктами подписаны.',
      tags:['#map','#ecosystem'], usedIn:['org.eko'], savedAt:'20 апр 2026', preview:'eco' },

    // tz documents
    { id:'art.tz_landing', type:'tz', title:'ТЗ лендинга Симы v1', kind:'ТЗ',
      body:'23 страницы. Миссия, цели, карта пользовательского пути, технический стек, роадмап.',
      tags:['#tz','#landing','#sima'], usedIn:['prj.sima'], savedAt:'18 апр 2026', preview:'tz' },

    // wiki
    { id:'art.wiki_sima', type:'wiki', title:'Вики Симы для новичков', kind:'вики',
      body:'13 страниц. Как работает канвас, как собирать артефакты, как переиспользовать.',
      tags:['#wiki','#sima','#onboarding'], usedIn:['prj.sima'], savedAt:'23 апр 2026', preview:'wiki' },

    // previous synthesized results
    { id:'art.tz_prev', type:'tz', title:'ТЗ Meetflow-импорт v1', kind:'ТЗ',
      body:'Короткое ТЗ для одной фичи. Переиспользовано в Симе.',
      tags:['#tz','#meetflow'], usedIn:['prj.mf'], savedAt:'10 апр 2026', preview:'tz' },

    { id:'art.prod_similar', type:'map', title:'Карта похожего продукта (Substrate)', kind:'карта',
      body:'Готовая карта продукта с подсхемой маркетинга. Берём оттуда часть про продажи.',
      tags:['#map','#marketing','#reference'], usedIn:['prj.substrate'], savedAt:'5 апр 2026', preview:'prod' },
  ];

  // ---------- PROJECTS ----------

  // ==========================================================
  // PROJECT 1 — ПРОДУКТ (Сима как универсальный конструктор)
  // ==========================================================
  const project_product = {
    id: 'prj.sima',
    name: 'Сима как универсальный конструктор',
    taskKind: 'продукт',
    taskTitle: 'Построить универсальный конструктор смыслов',
    taskNote: 'из контекста пользователя собираются артефакты: идея, ТЗ, инструкция, книга',
    created: '18 апр 2026',
    owner: 'Егор',

    // Layer 1 — free canvas
    // sources are positioned on a free canvas; each has a caption = "что отсюда берём"
    canvas: {
      task: {
        id: 't1', x: 540, y: 40, w: 320, h: 90,
        title: 'Продукт · универсальный конструктор Сима',
        subtitle: 'что нужно получить: работающий каркас, где пользователь собирает артефакты из контекста',
      },
      sources: [
        { id: 's1', type: 'meet',  x: 120, y: 220, w: 240, h: 120, source: 'Meetflow',
          title: 'Планёрка 18 марта', meta: '52 мин · 3 участника',
          take: 'как мы видим наш продукт, какой первый каркас делать', tags:['#meet','#vision'] },
        { id: 's2', type: 'meet',  x: 400, y: 220, w: 240, h: 120, source: 'Meetflow',
          title: 'Интервью с клиентами', meta: '12 интервью · март',
          take: 'потребности клиентов, главные боли', tags:['#meet','#research'] },
        { id: 's3', type: 'meet',  x: 680, y: 220, w: 240, h: 120, source: 'Meetflow',
          title: 'Синхрон по ограничениям', meta: '38 мин · техлид + PM',
          take: 'технические ограничения, что не можем сделать в v1', tags:['#meet','#tech'] },
        { id: 's4', type: 'doc',   x: 960, y: 220, w: 240, h: 120, source: 'Google Docs',
          title: 'Меморандум Сима v3', meta: 'документ · 11 стр',
          take: 'описание того, как строится бэклог', tags:['#doc','#canon'] },
        { id: 's5', type: 'audio', x: 260, y: 420, w: 240, h: 120, source: 'диктофон',
          title: 'Голосовая заметка · утро', meta: '4 мин · 04.12',
          take: 'ключевые тезисы — что обязательно должно быть в продукте', tags:['#audio','#insight'] },
        { id: 's6', type: 'text',  x: 540, y: 420, w: 240, h: 120, source: 'вставка',
          title: 'Тезисы продукта', meta: 'рукописный текст',
          take: 'верхнеуровневые принципы: контекст как актив, трассируемость', tags:['#text','#principles'] },
        { id: 's7', type: 'artifact', x: 820, y: 420, w: 240, h: 120, source: 'Галерея',
          title: 'Блок Data · готовый', meta: 'артефакт · переиспользуется',
          take: 'готовый блок для импорта, вставляем как подсхему', tags:['#artifact','#block'] },
      ],
      links: [
        // meetflow links
        { id: 'l1', from: 's1', to: 't1', label: 'видение продукта', direction: 'to-task' },
        { id: 'l2', from: 's2', to: 't1', label: 'потребности клиентов', direction: 'to-task' },
        { id: 'l3', from: 's3', to: 't1', label: 'ограничения → архитектура бэка', direction: 'to-task' },
        // cross-link between sources
        { id: 'l4', from: 's3', to: 's1', label: 'добавить ограничения в видение', direction: 'one-way' },
        { id: 'l5', from: 's4', to: 's1', label: 'описание + видение', direction: 'two-way' },
        { id: 'l6', from: 's5', to: 't1', label: 'главные тезисы', direction: 'to-task' },
        { id: 'l7', from: 's6', to: 't1', label: 'принципы', direction: 'to-task' },
        { id: 'l8', from: 's7', to: 't1', label: 'готовый блок Data', direction: 'to-task' },
      ],
    },

    // Layer 2 — map with pre-filled fields + gaps
    map: {
      mission: {
        id: 'm.mission',
        title: 'Миссия',
        value: 'Превратить контекст пользователя в актив — каждый разговор с ИИ становится кубиком, из которого собирается следующий артефакт.',
        filled: true,
        sources: ['s4','s6','s5'],
      },
      idea: {
        id: 'm.idea',
        title: 'Идея и фишка',
        value: 'Собираешь контекст → пересобираешь в любой артефакт (идея, ТЗ, инструкция) с живой связью до источников.',
        metaphor: 'как LEGO: кубики плюс инструкция сборки',
        filled: true,
        sources: ['s4','s6'],
      },
      goal: {
        id: 'm.goal',
        title: 'Just-to-be-done',
        value: 'Пользователь за 10 минут собирает первый рабочий артефакт из уже имеющегося контекста.',
        filled: true,
        sources: ['s2'],
      },
      audience: {
        id: 'm.audience',
        title: 'Для кого',
        value: 'Vibe-кодеры, консультанты, продуктовые команды — все, кто ежедневно работает с ИИ.',
        filled: true,
        sources: ['s2'],
      },
      value: {
        id: 'm.value',
        title: 'Что даст клиенту',
        value: null,
        filled: false,
        gap: true,
        hint: 'в источниках не нашлось явной формулировки, что получает клиент измеримо. Можно попросить Симу заполнить.',
      },
      important: {
        id: 'm.important',
        title: 'Важные элементы (must have)',
        items: [
          { label: 'Канвас с задачей и источниками', filled: true },
          { label: 'Карта продукта с предзаполненными полями', filled: true },
          { label: 'SyncLoop — обновление производных при правке источника', filled: true },
          { label: 'Метрики успеха', filled: false, gap: true, hint: 'метрики времени и ретеншна не обсуждались явно' },
          { label: 'Модель доступа и ролей', filled: false, gap: true, hint: 'скорее на v2, но нужна пометка' },
        ],
      },

      // User Story map
      userstory: {
        id: 'm.us',
        title: 'User Story карта',
        nodes: [
          { id: 'us.data',  title: 'Data', kind: 'подсхема', filled: true,
            body: 'откуда приходит контекст: Meetflow, Google Docs, аудио, тексты. Хранение и индексация.',
            hasSubschema: true, sources: ['s4'] },
          { id: 'us.scheme', title: 'Схема', kind: 'подсхема', filled: true,
            body: 'MVP, архитектура, User Story — всё расставляется на карте проекта.',
            hasSubschema: true, sources: ['s1','s4'] },
          { id: 'us.regtz',  title: 'Регламент и ТЗ', kind: 'блок', filled: true,
            body: 'Система формирует регламент и ТЗ, отдаёт в Claude Code на реализацию.',
            hasSubschema: false, sources: ['s1'] },
          { id: 'us.review', title: 'Проверка человеком', kind: 'блок', filled: true,
            body: 'Человек возвращает в регламент доработки или принимает. Несколько итераций.',
            hasSubschema: false, sources: [] },
          { id: 'us.impl',   title: 'Реализация', kind: 'блок', filled: true,
            body: 'Claude Code создаёт код, Сима проверяет по регламенту.',
            hasSubschema: true, sources: ['s3'] },
        ],
        edges: [
          ['us.data','us.scheme'],
          ['us.scheme','us.regtz'],
          ['us.regtz','us.impl'],
          ['us.impl','us.review'],
          ['us.review','us.regtz'],
        ],
      },
    },

    // Layer 3 — TZ document
    tz: {
      title: 'ТЗ · Сима как универсальный конструктор',
      version: 'v1 · 24 апр 2026',
      sections: [
        { id: 'sec.1', num: '1', title: 'Миссия и цель',
          body: 'Сима — конструктор смыслов для людей, которые ежедневно работают с ИИ. Контекст, разговоры, документы превращаются в собираемые артефакты со связью до источников.\n\nЦель v1: пользователь за 10 минут собирает первый артефакт из собственного контекста.',
          sources: ['s4','s6','s5'] },
        { id: 'sec.2', num: '2', title: 'Аудитория',
          body: 'Vibe-кодеры (ежедневные пользователи Claude), консультанты, продуктовые команды. Главная боль — потеря контекста между окнами ИИ.',
          sources: ['s2'] },
        { id: 'sec.3', num: '3', title: 'Карта продукта',
          body: 'См. вложенную схему: Data → Scheme → Regulation/TZ → Implementation → Review.',
          embedsMap: true },
        { id: 'sec.4', num: '4', title: 'Функциональные требования',
          list: [
            'F1 · Канвас с задачей, источниками и подписанными связями',
            'F2 · Карта с предзаполненными полями и индикаторами пропусков',
            'F3 · Кнопка «Сима, помоги» — заполнение пропущенных полей',
            'F4 · Подсхема внутри блока — несколько уровней',
            'F5 · ТЗ-документ из карты, экспорт в Google Docs / Notion / Claude Code',
            'F6 · Галерея артефактов: блоки, подсхемы, карты, ТЗ, вики',
            'F7 · Статус реализации: Claude Code отмечает что доделал',
          ],
          sources: ['s1','s3'] },
        { id: 'sec.5', num: '5', title: 'Нефункциональные требования',
          body: 'Отклик интерфейса <100мс. Синтез <30с на 10 кубиках. Локальное хранение + шифрование в покое. Офлайн-режим не требуется.' },
        { id: 'sec.6', num: '6', title: 'Технический стек',
          body: 'React 18 + TypeScript, инлайн JSX через Babel. Claude через клиентский интерфейс (без API ключей пользователя). Граф-хранилище в локальной IndexedDB + облачная синхронизация.',
          sources: ['s3'] },
        { id: 'sec.7', num: '7', title: 'Критерии готовности',
          list: [
            'TTFA < 10 мин на 5 новых пользователях',
            '90% синтезов трассируемы до источников',
            '0 потерь при обновлении источника',
          ] },
        { id: 'sec.8', num: '8', title: 'Сроки',
          body: 'M1 · канвас + карта — 2 недели\nM2 · ТЗ и галерея — +2 недели\nM3 · реализация через Claude Code — +3 недели' },
      ],
    },

    // Layer 4 — implementation status
    impl: {
      startedAt: '24 апр 2026 10:14',
      tool: 'Claude Code',
      items: [
        { id: 'i.1', label: 'F1 · Канвас', status: 'done',    note: 'готово: блоки двигаются, связи подписываются' },
        { id: 'i.2', label: 'F2 · Карта продукта', status: 'done',    note: 'предзаполненные поля + ! для пропусков' },
        { id: 'i.3', label: 'F3 · Сима, помоги', status: 'in-progress', note: 'работает для текстовых полей, для списков — в доработке' },
        { id: 'i.4', label: 'F4 · Подсхемы', status: 'in-progress', note: 'два уровня работают, третий — тесты' },
        { id: 'i.5', label: 'F5 · ТЗ-документ', status: 'done',    note: 'генерация + экспорт в Google Docs' },
        { id: 'i.6', label: 'F6 · Галерея артефактов', status: 'done',    note: 'сохранение блоков, подсхем, карт' },
        { id: 'i.7', label: 'F7 · Статус реализации', status: 'in-progress', note: 'синхронизация с Claude Code' },
        { id: 'i.8', label: 'Нефунк · отклик <100мс', status: 'done',    note: 'измерено на 100 блоках' },
        { id: 'i.9', label: 'Нефунк · офлайн', status: 'skipped', note: 'не требуется в v1' },
      ],
      log: [
        { at: '10:14', text: 'Получено ТЗ, начинаю с F1 · Канвас' },
        { at: '11:02', text: 'F1 готов. Переход к F2' },
        { at: '12:45', text: 'F2 + F5 готовы параллельно' },
        { at: '14:20', text: 'F6 готов' },
        { at: '15:05', text: 'F3, F4, F7 — в работе одновременно' },
      ],
    },
  };

  // ==========================================================
  // PROJECT 2 — КНИГА
  // ==========================================================
  const project_book = {
    id: 'prj.book',
    name: 'Книга · Контекст как актив',
    taskKind: 'книга',
    taskTitle: 'Написать книгу о контексте как активе',
    taskNote: 'для практиков, работающих с ИИ каждый день',
    created: '10 апр 2026',
    owner: 'Егор',

    canvas: {
      task: {
        id: 't1', x: 540, y: 40, w: 320, h: 90,
        title: 'Книга · Контекст как актив',
        subtitle: 'как накапливать контекст вместо потребления ленты',
      },
      sources: [
        { id: 's1', type: 'text', x: 120, y: 220, w: 240, h: 120, source: 'вставка',
          title: 'Идея книги (тезис)', meta: 'рукопись · 3 абзаца',
          take: 'главная идея — контекст как актив, а не расход', tags:['#text','#thesis'] },
        { id: 's2', type: 'text', x: 400, y: 220, w: 240, h: 120, source: 'вставка',
          title: 'Методология пути героя', meta: 'конспект 2 стр',
          take: 'структурная методология, путь героя как каркас глав', tags:['#text','#method'] },
        { id: 's3', type: 'doc', x: 680, y: 220, w: 240, h: 120, source: 'Google Docs',
          title: 'Reference · эссе Карпати', meta: 'evidence',
          take: 'стиль написания — разговорный, с личными историями', tags:['#doc','#reference'] },
        { id: 's4', type: 'meet', x: 960, y: 220, w: 240, h: 120, source: 'Meetflow',
          title: 'Встреча · смыслы', meta: '48 мин · соло',
          take: 'смысловой каркас книги, почему сейчас', tags:['#meet','#meaning'] },
        { id: 's5', type: 'meet', x: 260, y: 420, w: 240, h: 120, source: 'Meetflow',
          title: 'Встреча · сторилайн', meta: '35 мин',
          take: 'сторилайн — как ведём читателя', tags:['#meet','#story'] },
        { id: 's6', type: 'meet', x: 540, y: 420, w: 240, h: 120, source: 'Meetflow',
          title: 'Встреча · первая глава', meta: '40 мин',
          take: 'черновик первой главы — сцены, тон', tags:['#meet','#chapter'] },
        { id: 's7', type: 'meet', x: 820, y: 420, w: 240, h: 120, source: 'Meetflow',
          title: 'Встреча · финал книги', meta: '28 мин',
          take: 'как заканчивается книга, чем читатель уходит', tags:['#meet','#ending'] },
      ],
      links: [
        { id: 'l1', from: 's1', to: 't1', label: 'главная идея', direction: 'to-task' },
        { id: 'l2', from: 's2', to: 't1', label: 'методология → структура', direction: 'to-task' },
        { id: 'l3', from: 's3', to: 't1', label: 'взять стиль оттуда', direction: 'to-task' },
        { id: 'l4', from: 's4', to: 't1', label: 'смыслы', direction: 'to-task' },
        { id: 'l5', from: 's5', to: 't1', label: 'сторилайн', direction: 'to-task' },
        { id: 'l6', from: 's6', to: 't1', label: 'глава 1', direction: 'to-task' },
        { id: 'l7', from: 's7', to: 't1', label: 'финал', direction: 'to-task' },
        { id: 'l8', from: 's5', to: 's6', label: 'сторилайн определяет главу', direction: 'one-way' },
      ],
    },

    map: {
      mission: {
        id: 'm.mission', title: 'Миссия книги',
        value: 'Вернуть людям навык собирать длинные цепочки смыслов в эпоху ИИ.',
        filled: true, sources: ['s1','s4'],
      },
      idea: {
        id: 'm.idea', title: 'Идея',
        value: 'Контекст — это капитал. Книга учит копить его ежедневно, как портфель инвестиций.',
        metaphor: 'как инвест-портфель: маленькие регулярные вклады',
        filled: true, sources: ['s1'],
      },
      goal: {
        id: 'm.goal', title: 'Just-to-be-done',
        value: 'Читатель через 100 дней имеет собственную живую вики из повседневных разговоров с ИИ.',
        filled: true, sources: ['s4'],
      },
      audience: {
        id: 'm.audience', title: 'Для кого',
        value: 'Думающий практик 25-45, ежедневно работает с ИИ, чувствует что «что-то не так».',
        filled: true, sources: ['s4'],
      },
      value: {
        id: 'm.value', title: 'Что даст читателю',
        value: null, filled: false, gap: true,
        hint: 'конкретный измеримый результат для читателя не прозвучал. Попроси Симу заполнить.',
      },
      important: {
        id: 'm.important', title: 'Важные элементы книги',
        items: [
          { label: 'Методология пути героя как каркас', filled: true },
          { label: 'Разговорный стиль (референс — Карпати)', filled: true },
          { label: 'Минимум 3 личных истории', filled: true },
          { label: 'Шаблоны и чеклисты для читателя', filled: false, gap: true, hint: 'в источниках не упоминаются — нужны для практичности' },
        ],
      },

      userstory: {
        id: 'm.us', title: 'Структура книги',
        nodes: [
          { id: 'n.style',  title: 'Стиль', kind: 'блок', filled: true,
            body: 'Разговорный, публицистика с техническими вставками. Референс — Карпати.', hasSubschema: false, sources: ['s3'] },
          { id: 'n.story',  title: 'Сторилайн', kind: 'подсхема', filled: true,
            body: 'Как ведём читателя от боли к системе. Путь героя с 6 актами.', hasSubschema: true, sources: ['s5'] },
          { id: 'n.toc',    title: 'Оглавление', kind: 'подсхема', filled: true,
            body: '6 глав. Каждая раскрывается в свой кубик с сценами и материалом.', hasSubschema: true, sources: ['s5','s6'] },
          { id: 'n.publish',title: 'Публикация', kind: 'блок', filled: false,
            body: 'Издатель, формат, объём — не решено.', hasSubschema: false, sources: [] },
        ],
        edges: [
          ['n.style','n.toc'],
          ['n.story','n.toc'],
          ['n.toc','n.publish'],
        ],
      },
    },

    tz: {
      title: 'ТЗ на книгу · Контекст как актив',
      version: 'v0.3 · 24 апр 2026',
      sections: [
        { id:'b.1', num:'1', title:'Миссия книги', body:'Вернуть людям навык собирать длинные цепочки смыслов в эпоху ИИ.', sources:['s1','s4'] },
        { id:'b.2', num:'2', title:'Аудитория', body:'Практик 25-45, ежедневно работает с ИИ.', sources:['s4'] },
        { id:'b.3', num:'3', title:'Структура · 6 глав',
          list: [
            '1 · Google Docs-кладбище — почему ответы ИИ умирают',
            '2 · Контекст как актив — метафора капитала',
            '3 · Кубик как единица смысла',
            '4 · Связь важнее содержания',
            '5 · Синтез как ежедневная практика',
            '6 · Что собирать за 100 дней',
          ], sources:['s5','s6'] },
        { id:'b.4', num:'4', title:'Стиль', body:'Разговорный, от первого лица, короткие абзацы, конкретные примеры. Без жаргона, но и не упрощённо.', sources:['s3'] },
        { id:'b.5', num:'5', title:'Объём и формат', body:'~180 страниц. Печатная книга + веб-версия со связями кубиков.' },
        { id:'b.6', num:'6', title:'Критерии готовности', list:[
          'каждая глава содержит минимум одну личную сцену и один инструмент',
          'все главы связаны сквозной метафорой капитала',
          'в конце — чеклист на 100 дней',
        ] },
      ],
    },

    impl: {
      startedAt: '24 апр 2026 14:00',
      tool: 'Claude Code',
      items: [
        { id:'b.i1', label:'Гл.1 — Google Docs-кладбище', status:'done',    note:'черновик готов, правит редактор' },
        { id:'b.i2', label:'Гл.2 — Контекст как актив', status:'in-progress', note:'написано 60%' },
        { id:'b.i3', label:'Гл.3 — Кубик', status:'in-progress', note:'собирается из кубиков определения' },
        { id:'b.i4', label:'Гл.4 — Связь', status:'waiting', note:'ждём завершения гл.3' },
        { id:'b.i5', label:'Гл.5 — Синтез',       status:'waiting', note:'в очереди' },
        { id:'b.i6', label:'Гл.6 — 100 дней',     status:'waiting', note:'в очереди' },
        { id:'b.i7', label:'Ревью стиля',         status:'in-progress', note:'проверяется соответствие референсу' },
        { id:'b.i8', label:'Издание',             status:'waiting', note:'решение по издателю отложено' },
      ],
      log: [
        { at: '14:00', text: 'Получен ТЗ на книгу' },
        { at: '14:45', text: 'Гл.1 — черновик готов' },
        { at: '15:30', text: 'Гл.2 — 60%' },
      ],
    },
  };

  // ==========================================================
  // PROJECT 3 — ИДЕЯ
  // ==========================================================
  const project_idea = {
    id: 'prj.idea',
    name: 'Идея · AI-консьерж для исследователей',
    taskKind: 'идея',
    taskTitle: 'AI-консьерж для исследователей',
    taskNote: 'пока только концепция, нужно проверить на 10 интервью',
    created: '22 апр 2026',
    owner: 'Егор',

    canvas: {
      task: {
        id: 't1', x: 540, y: 40, w: 320, h: 90,
        title: 'Идея · AI-консьерж для исследователей',
        subtitle: 'помощник, который помнит весь контекст исследования',
      },
      sources: [
        { id: 's1', type: 'audio', x: 180, y: 220, w: 240, h: 120, source: 'диктофон',
          title: 'Концепция · голос', meta: '6 мин · 22 апр',
          take: 'основная концепция идеи', tags:['#audio','#concept'] },
        { id: 's2', type: 'text', x: 460, y: 220, w: 240, h: 120, source: 'вставка',
          title: 'Тезисы · must have', meta: 'рукопись',
          take: 'что обязательно должно быть', tags:['#text','#must'] },
        { id: 's3', type: 'doc', x: 740, y: 220, w: 240, h: 120, source: 'Google Docs',
          title: 'Reference 1 · Elicit', meta: 'конкурент',
          take: 'как делают похожие продукты', tags:['#doc','#ref'] },
        { id: 's4', type: 'doc', x: 1020, y: 220, w: 240, h: 120, source: 'Google Docs',
          title: 'Reference 2 · ResearchRabbit', meta: 'конкурент',
          take: 'навигация по графу цитирований', tags:['#doc','#ref'] },
        { id: 's5', type: 'doc', x: 320, y: 420, w: 240, h: 120, source: 'Notion',
          title: 'Reference 3 · Notion AI', meta: 'приём UX',
          take: 'UX-приёмы интеграции ИИ в заметки', tags:['#doc','#ref'] },
        { id: 's6', type: 'artifact', x: 600, y: 420, w: 260, h: 120, source: 'Галерея',
          title: 'Похожий продукт · Substrate', meta: 'артефакт · карта',
          take: 'берём отсюда часть про продажи и маркетинг', tags:['#artifact','#map'] },
      ],
      links: [
        { id: 'l1', from: 's1', to: 't1', label: 'концепция', direction: 'to-task' },
        { id: 'l2', from: 's2', to: 't1', label: 'обязательные элементы', direction: 'to-task' },
        { id: 'l3', from: 's3', to: 't1', label: 'как делают похожие', direction: 'to-task' },
        { id: 'l4', from: 's4', to: 't1', label: 'граф цитирований', direction: 'to-task' },
        { id: 'l5', from: 's5', to: 't1', label: 'UX-приёмы', direction: 'to-task' },
        { id: 'l6', from: 's6', to: 't1', label: 'продажи → маркетинг', direction: 'to-task' },
        { id: 'l7', from: 's3', to: 's4', label: 'один рынок', direction: 'two-way' },
      ],
    },

    map: {
      mission: {
        id: 'm.mission', title: 'Миссия идеи',
        value: 'Исследователь перестаёт начинать каждую сессию с нуля — консьерж помнит весь контекст проекта.',
        filled: true, sources: ['s1'],
      },
      idea: {
        id: 'm.idea', title: 'Идея одной фразой',
        value: 'AI-консьерж с долговременной памятью исследовательского проекта. Не чат, а собственный контекст с трассировкой.',
        metaphor: 'как секретарь-исследователь, который помнит всё и ничего не путает',
        filled: true, sources: ['s1'],
      },
      goal: {
        id: 'm.goal', title: 'Just-to-be-done',
        value: null, filled: false, gap: true,
        hint: 'чёткий measurable outcome не сформулирован. Можем собрать черновик из тезисов и референсов.',
      },
      audience: {
        id: 'm.audience', title: 'Для кого',
        value: 'Научные исследователи, продуктовые аналитики, журналисты-расследователи — все, кто ведёт длинные многомесячные проекты.',
        filled: true, sources: ['s1','s5'],
      },
      value: {
        id: 'm.value', title: 'Ценность',
        value: null, filled: false, gap: true,
        hint: 'ценность для клиента описана только абстрактно. Требуются примеры.',
      },
      important: {
        id: 'm.important', title: 'Важные элементы',
        items: [
          { label: 'Долговременная память проекта', filled: true },
          { label: 'Трассировка до источника (цитата)', filled: true },
          { label: 'Граф цитирований', filled: true },
          { label: 'Бизнес-модель', filled: false, gap: true, hint: 'как монетизируем — не обсуждали' },
          { label: 'MVP scope', filled: false, gap: true, hint: 'минимум что тестируем — не определено' },
        ],
      },

      userstory: {
        id: 'm.us', title: 'Концепция и проявления',
        nodes: [
          { id: 'i.core',   title: 'Суть идеи', kind: 'блок', filled: true,
            body: 'Память проекта + трассировка + граф цитирований.', hasSubschema: false, sources: ['s1'] },
          { id: 'i.refs',   title: 'Референсы', kind: 'подсхема', filled: true,
            body: '3 конкурента, берём от каждого по одной фиче.', hasSubschema: true, sources: ['s3','s4','s5'] },
          { id: 'i.market', title: 'Маркетинг', kind: 'подсхема', filled: true,
            body: 'Из артефакта Substrate — приёмы продаж и позиционирования.', hasSubschema: true, sources: ['s6'] },
          { id: 'i.mvp',    title: 'MVP', kind: 'блок', filled: false,
            body: 'Не определён. Нужно провести 10 интервью.', hasSubschema: false, sources: [] },
        ],
        edges: [
          ['i.core','i.refs'],
          ['i.core','i.market'],
          ['i.core','i.mvp'],
        ],
      },
    },

    tz: {
      title: 'ТЗ на MVP · AI-консьерж для исследователей',
      version: 'v0.1 · 24 апр 2026',
      sections: [
        { id:'i.1', num:'1', title:'Концепция', body:'AI-консьерж с долговременной памятью исследовательского проекта.', sources:['s1'] },
        { id:'i.2', num:'2', title:'Аудитория и кейсы', body:'Исследователь ведёт проект 3-12 месяцев, накапливает источники.', sources:['s1','s5'] },
        { id:'i.3', num:'3', title:'Референсы',
          list: [
            'Elicit — работа с источниками',
            'ResearchRabbit — граф цитирований',
            'Notion AI — UX-приёмы',
            'Substrate (из артефактов) — приёмы продаж',
          ], sources:['s3','s4','s5','s6'] },
        { id:'i.4', num:'4', title:'MVP scope', body:'Не определён — планируются 10 интервью в течение 2 недель.', gap:true },
        { id:'i.5', num:'5', title:'Метрики валидации',
          list: [
            'не менее 6/10 интервью подтвердят проблему памяти',
            'не менее 3/10 готовы платить $20/мес',
            'медиана «я хочу это попробовать» — 7/10 по шкале',
          ] },
      ],
    },

    impl: {
      startedAt: null,
      tool: 'Не запущено',
      items: [
        { id:'i.i1', label:'Провести 10 интервью', status:'in-progress', note:'3 из 10 сделано' },
        { id:'i.i2', label:'Определить MVP scope', status:'waiting', note:'после интервью' },
        { id:'i.i3', label:'Подтвердить спрос',    status:'waiting', note:'после интервью' },
        { id:'i.i4', label:'Собрать команду',      status:'waiting', note:'после подтверждения' },
      ],
      log: [
        { at: 'пока не стартовали', text: 'Идея в режиме валидации. Реализация — после интервью.' },
      ],
    },
  };

  return { artifacts, projects: [project_product, project_book, project_idea] };
})();

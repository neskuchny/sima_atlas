// data.js — fixture data for Sima prototype
window.SIMA_DATA = (() => {
  const cubes = [
    // documents / meeting sources
    { id:'doc.memo', type:'layer', kind:'меморандум', title:'Меморандум Сима v3', body:'Сима — строитель смыслов из контекста. Превращает встречи, документы, диктовки в кубики и пересобирает их в готовые артефакты.', meta:'канонический · ред. вчера', tags:['сима','продукт'] , maturity:'canonical', accent:'orange' },
    { id:'doc.karpathy', type:'doc', kind:'эссе', title:'Karpathy — Build Your Own Wiki', body:'Личная вики как побочный продукт обучения. Не потреблять контент, а превращать его в атомы.', meta:'ai · знания', tags:['wiki','knowledge'], maturity:'verified', accent:'neutral' },
    { id:'doc.meet1803', type:'doc', kind:'встреча', title:'Планёрка 18 марта', body:'Обсуждали запуск универсального конструктора. Решили: первый тип проекта — «Идея продукта».', meta:'meetflow · 52 мин · 3 участника', tags:['встречи','март'], maturity:'verified', accent:'neutral' },
    { id:'doc.voice0412', type:'doc', kind:'диктовка', title:'Голосовая заметка · утро', body:'Мысль: нужно чтобы синтез не был чёрным ящиком — видно какой кубик во что превратился.', meta:'04.12 · 1:48', tags:['идеи'], maturity:'draft', accent:'neutral' },
    { id:'doc.res_survey', type:'doc', kind:'исследование', title:'Опрос vibe-кодеров', body:'12 интервью. Главная боль — контекст теряется между чатами, приходится копировать вручную.', meta:'n=12 · март', tags:['research'], maturity:'verified', accent:'neutral' },

    // concepts
    { id:'con.forkengine', type:'concept', title:'ForkEngine', body:'Развилка как инсайт, а не блокер. Видим все варианты сразу.', meta:'ux · принципы', tags:['принципы'], maturity:'verified', accent:'indigo' },
    { id:'con.syncloop', type:'concept', title:'SyncLoop', body:'Изменение источника распространяется по всем композициям, где он использован.', meta:'архитектура', tags:['sync'], maturity:'canonical', accent:'indigo' },
    { id:'con.vibecoding', type:'concept', title:'Vibe-coding', body:'Работа с ИИ как с кубиками: собираешь контекст, а не пишешь с нуля.', meta:'позиционирование', tags:['культура'], maturity:'verified', accent:'indigo' },
    { id:'con.context1st', type:'concept', title:'Context first-class', body:'Контекст — не приложение к запросу, а основная сущность продукта.', meta:'архитектура', tags:['архитектура'], maturity:'verified', accent:'indigo' },

    // extractions
    { id:'ext.sdk', type:'extract', kind:'решение', title:'Claude SDK путь', body:'Из путей 1 и 2 выбираем первый — подписка пользователя, никаких API-ключей в Сима.', meta:'встреча 12.03 · подтверждено', tags:['решение'], maturity:'verified', accent:'amber' },
    { id:'ext.metrics', type:'extract', kind:'метрика', title:'Time-to-first-artifact', body:'Главная метрика: время от открытия до первого собранного артефакта.', meta:'из регламента', tags:['метрики'], maturity:'verified', accent:'amber' },
    { id:'ext.pain', type:'extract', kind:'инсайт', title:'Копипаст из ИИ в Google Docs', body:'Пользователи жалуются: копируют ответы ИИ вручную, теряют связи.', meta:'из опроса · 8 из 12', tags:['боль'], maturity:'verified', accent:'amber' },

    // result (previously synthesized cube)
    { id:'res.tz', type:'result', title:'ТЗ лендинга Сима v1', body:'Собрано из 6 кубиков неделю назад. Используется командой разработки.', meta:'5 слоёв · landing_tz', tags:['лендинг'], maturity:'verified', accent:'olive' },
  ];

  // library tiles (grid) — we reuse `cubes`
  const libraryCount = { total: 127, links: 43, canonical: 4 };

  // current open project
  const project = {
    id:'prj.universal-constructor',
    name:'Сима как универсальный конструктор',
    kind:'Идея продукта',
    status:'в работе',
    created:'18 апр 2026',
    mission:'Превратить Сима из среды проектирования продуктов в универсальный конструктор смыслов — любой человек из своего контекста собирает рабочие артефакты.',
    why:'AI-инструменты генерируют одноразовые ответы. Контекст рассыпается. Пользователи копируют результаты в Google Docs и теряют связи. Нужен слой, где контекст накапливается и пересобирается.',
    impact:'Ежедневный AI-пользователь перестаёт начинать с нуля. Команды получают живую вики, которая сама отражает реальность встреч и документов.',
    owner:'Егор',
    layers: [
      {
        id:'L.mission', num:'00', title:'Миссия', kind:'зачем это существует', nodes:[
          { id:'n.mission', type:'layer', accent:'orange', kind:'миссия', title:'Конструктор смыслов из контекста',
            body:'Любой пользователь складывает свой контекст (встречи, документы, мысли, исследования) в библиотеку и пересобирает из неё нужный артефакт: идею продукта, стратегию, регламент, исследование, вики.',
            sources:['doc.memo','con.vibecoding','doc.karpathy'] }
        ]
      },
      {
        id:'L.audience', num:'01', title:'Аудитория и ценность', kind:'для кого и зачем', nodes:[
          { id:'n.aud', type:'layer', accent:'orange', kind:'для кого', title:'Vibe-кодеры, консультанты, product-команды',
            body:'Все, кто ежедневно работает с ИИ и накапливает фрагменты знаний в разных окнах.',
            sources:['doc.res_survey','con.vibecoding'] },
          { id:'n.value', type:'layer', accent:'orange', kind:'ценность', title:'Контекст превращается в актив',
            body:'Каждая встреча и документ становится кубиком. Чем больше работаете — тем быстрее собирается следующий артефакт.',
            sources:['doc.karpathy','ext.pain'] }
        ]
      },
      {
        id:'L.metrics', num:'02', title:'Метрики', kind:'на что физически влияет', nodes:[
          { id:'n.ttfa', type:'extract', accent:'amber', kind:'метрика', title:'Time-to-first-artifact',
            body:'Время от первого открытия до собранного артефакта. Цель: < 10 минут.',
            sources:['ext.metrics'] },
          { id:'n.d7', type:'extract', accent:'amber', kind:'метрика', title:'D7 retention через библиотеку',
            body:'Возвращается ли пользователь к своей библиотеке через неделю.',
            sources:['doc.res_survey'] },
          { id:'n.cubes', type:'extract', accent:'amber', kind:'метрика', title:'Кубиков / композиций на пользователя',
            body:'Медиана 20+ кубиков и 3+ композиций к концу первой недели.',
            sources:[] }
        ]
      },
      {
        id:'L.arch', num:'03', title:'Архитектура', kind:'из чего состоит', nodes:[
          { id:'n.cube', type:'concept', accent:'indigo', kind:'принцип', title:'Кубик — атом системы',
            body:'Документ, слой, концепт, извлечение или результат синтеза. У каждого есть тип, источники и связи.',
            sources:['con.context1st'] },
          { id:'n.schema', type:'concept', accent:'indigo', kind:'принцип', title:'Многоуровневая схема проекта',
            body:'Проект — не плоский документ, а стек слоёв: миссия → аудитория → метрики → задачи → источники.',
            sources:['con.forkengine'] },
          { id:'n.sync', type:'concept', accent:'indigo', kind:'принцип', title:'SyncLoop — живая связь',
            body:'Изменение источника распространяется во все композиции. Видно, где именно расходится.',
            sources:['con.syncloop'] }
        ]
      },
      {
        id:'L.tasks', num:'04', title:'Задачи по шагам', kind:'что делаем дальше', nodes:[
          { id:'n.t1', type:'layer', accent:'orange', kind:'шаг 1', title:'Запуск композитора на Claude через интерфейс',
            body:'Использовать подписку пользователя, а не API-ключ. Интеграция как у Claude Code.',
            sources:['ext.sdk'] },
          { id:'n.t2', type:'layer', accent:'orange', kind:'шаг 2', title:'Импорт встреч из Meetflow',
            body:'Транскрипция → автоматическое извлечение решений и тезисов → кубики в библиотеке.',
            sources:['doc.meet1803'] },
          { id:'n.t3', type:'layer', accent:'orange', kind:'шаг 3', title:'Шаблоны проектов — 6 типов',
            body:'Идея продукта, исследование, регламент, стратегия, концепция статьи, персональная вики.',
            sources:[] }
        ]
      }
    ]
  };

  // connections within the project schema (extra semantic links)
  const conns = [
    { from:'n.aud', to:'n.ttfa', kind:'live' },
    { from:'n.value', to:'n.cubes', kind:'live' },
    { from:'n.schema', to:'n.t3', kind:'live' },
    { from:'n.sync', to:'n.t1', kind:'semantic' },
    { from:'n.cube', to:'n.t2', kind:'semantic' },
    { from:'n.mission', to:'n.value', kind:'live' },
  ];

  return { cubes, libraryCount, project, conns };
})();

// arch_data.js — architecture schema data for 3 projects.
// Layers are horizontal bands. Blocks live in a layer; connections are typed.
//
// Layer catalog (superset). Each project picks a subset + order.
window.ARCH_LAYERS = {
  user:    { id:'user',    name:'Пользователь / JTBD',     hue:'#7A6A4F', bg:'rgba(122,106,79,0.06)' },
  front:   { id:'front',   name:'Фронтенд · экраны',        hue:'#4A5CA8', bg:'rgba(74,92,168,0.06)' },
  logic:   { id:'logic',   name:'Логика / бэкенд',          hue:'#A6673A', bg:'rgba(166,103,58,0.06)' },
  ai:      { id:'ai',      name:'ИИ-агенты / модели',       hue:'#6B7A3D', bg:'rgba(107,122,61,0.07)' },
  data:    { id:'data',    name:'Данные / хранилище',       hue:'#8B7A2F', bg:'rgba(139,122,47,0.07)' },
  ext:     { id:'ext',     name:'Внешние интеграции',       hue:'#886F55', bg:'rgba(136,111,85,0.06)' },
  content: { id:'content', name:'Контент / контекст',       hue:'#B47A1F', bg:'rgba(180,122,31,0.07)' },
  market:  { id:'market',  name:'Маркетинг / каналы',       hue:'#7D3C3C', bg:'rgba(125,60,60,0.06)' },
  testing: { id:'testing', name:'Тестирование / smoke',     hue:'#5F6F77', bg:'rgba(95,111,119,0.07)' },
};

// Connection types
window.ARCH_LINK_TYPES = {
  data: { id:'data', name:'данные', stroke:'#29261B', dash:null,      width:1.2 },
  dep:  { id:'dep',  name:'зависит', stroke:'#8B8476', dash:'4 3',    width:1.0 },
  path: { id:'path', name:'путь',   stroke:'#A6673A', dash:'1 3',    width:1.4 },
};

// Block status
window.ARCH_STATUS = {
  done:    { label:'готово',       dot:'#6B7A3D' },
  wip:     { label:'в работе',     dot:'#B47A1F' },
  q:       { label:'под вопросом', dot:'#C04A4A' },
  idea:    { label:'идея',         dot:'#8B8476' },
};

// ─────────────────────────────────────────────────────────────────────────────
// Project: Сима — full, detailed
const simaArch = {
  projectId: 'sima',
  layers: ['user','front','ai','logic','data','ext','content'],
  blocks: [
    // USER
    { id:'b.jtbd',   layer:'user',    x: 40,  w: 210, title:'Исследователь ведёт проект', note:'держит в голове весь контекст · теряет к кубикам', status:'done', mvp:true,  sources:['s1','s3'] },
    { id:'b.goal',   layer:'user',    x: 270, w: 200, title:'Цель пользователя',           note:'быстро собрать карту из встреч и документов', status:'done', mvp:true,  sources:['s1'] },
    { id:'b.roles',  layer:'user',    x: 490, w: 200, title:'Роли',                        note:'исследователь · лид · редактор', status:'wip',  mvp:false, sources:['s1'] },

    // FRONT
    { id:'b.canvas', layer:'front',   x: 30,  w: 210, title:'Канвас источников',          note:'слой 1 · задача + источники + связи', status:'done', mvp:true, subschema:'us.scheme', sources:['s1','s3'] },
    { id:'b.map',    layer:'front',   x: 260, w: 210, title:'Карта продукта',              note:'слой 2 · поля + user story', status:'done', mvp:true, sources:['s1'] },
    { id:'b.arch',   layer:'front',   x: 490, w: 210, title:'Архитектура',                 note:'этот экран · слои + блоки + связи', status:'wip',  mvp:true, sources:['s1'] },
    { id:'b.tz',     layer:'front',   x: 720, w: 180, title:'ТЗ-документ',                 note:'слой 3 · генерация + экспорт', status:'done', mvp:true, sources:['s1'] },
    { id:'b.impl',   layer:'front',   x: 920, w: 180, title:'Статус реализации',           note:'слой 4 · сверка с Claude Code', status:'wip',  mvp:false, sources:['s3'] },

    // AI
    { id:'b.claude', layer:'ai',      x: 40,  w: 200, title:'Клод-сценарист',              note:'помогает заполнить поля карты', status:'done', mvp:true, sources:['s1'] },
    { id:'b.sima',   layer:'ai',      x: 260, w: 200, title:'Сима-контроль',               note:'сверяет реализацию со схемой', status:'wip',  mvp:false, sources:['s3'] },
    { id:'b.whisp',  layer:'ai',      x: 480, w: 200, title:'Whisper',                     note:'транскрипция аудио', status:'done', mvp:true, sources:['s4'] },

    // LOGIC
    { id:'b.graph',  layer:'logic',   x: 30,  w: 200, title:'Движок связей',               note:'хранит блоки и рёбра · версии', status:'done', mvp:true, sources:['s1'] },
    { id:'b.gen',    layer:'logic',   x: 250, w: 200, title:'Сборка ТЗ',                   note:'из карты + связей', status:'done', mvp:true, sources:['s1'] },
    { id:'b.sync',   layer:'logic',   x: 470, w: 200, title:'Двусторонний синк',           note:'карта ↔ архитектура', status:'q',   mvp:false, sources:['s1'] },

    // DATA
    { id:'b.store',  layer:'data',    x: 40,  w: 200, title:'Хранилище кубиков',           note:'IndexedDB + облако', status:'done', mvp:true, sources:['s1'] },
    { id:'b.gal',    layer:'data',    x: 260, w: 200, title:'Галерея артефактов',          note:'теги · поиск · пересборка', status:'done', mvp:true, sources:['s6'] },

    // EXT
    { id:'b.mf',     layer:'ext',     x: 40,  w: 200, title:'Meetflow API',                note:'транскрипты встреч', status:'done', mvp:true, subschema:'us.data', sources:['s4'] },
    { id:'b.gd',     layer:'ext',     x: 260, w: 200, title:'Google Docs коннектор',       note:'OAuth · polling 10 мин', status:'done', mvp:true, sources:['s4'] },
    { id:'b.claude_code', layer:'ext',x: 480, w: 200, title:'Claude Code',                 note:'реализация по ТЗ', status:'wip',  mvp:false, subschema:'us.impl', sources:['s3'] },

    // CONTENT
    { id:'b.meet',   layer:'content', x: 40,  w: 200, title:'Встречи',                     note:'источник кубиков', status:'done', mvp:true, sources:['s4'] },
    { id:'b.doc',    layer:'content', x: 260, w: 200, title:'Документы',                   note:'вики, заметки', status:'done', mvp:true, sources:['s1'] },
    { id:'b.audio',  layer:'content', x: 480, w: 200, title:'Аудио / голос',               note:'диктофон · загрузка', status:'done', mvp:true, sources:['s4'] },
  ],
  links: [
    // USER → FRONT (path)
    { from:'b.jtbd',   to:'b.canvas', type:'path', label:'вход' },
    { from:'b.canvas', to:'b.map',    type:'path', label:'дальше' },
    { from:'b.map',    to:'b.arch',   type:'path', label:'переключатель' },
    { from:'b.arch',   to:'b.tz',     type:'path', label:'собрать' },
    { from:'b.tz',     to:'b.impl',   type:'path', label:'отдать' },

    // CONTENT → EXT → FRONT (data)
    { from:'b.meet',   to:'b.mf',     type:'data', label:'' },
    { from:'b.doc',    to:'b.gd',     type:'data', label:'' },
    { from:'b.audio',  to:'b.whisp',  type:'data', label:'' },
    { from:'b.mf',     to:'b.canvas', type:'data', label:'транскрипт' },
    { from:'b.gd',     to:'b.canvas', type:'data', label:'текст' },
    { from:'b.whisp',  to:'b.canvas', type:'data', label:'текст' },

    // FRONT → LOGIC → DATA (dep)
    { from:'b.canvas', to:'b.graph',  type:'dep',  label:'читает/пишет' },
    { from:'b.map',    to:'b.graph',  type:'dep',  label:'' },
    { from:'b.arch',   to:'b.graph',  type:'dep',  label:'' },
    { from:'b.graph',  to:'b.store',  type:'dep',  label:'' },
    { from:'b.gal',    to:'b.store',  type:'dep',  label:'' },

    // AI → FRONT
    { from:'b.claude', to:'b.map',    type:'dep',  label:'заполняет поля' },
    { from:'b.claude', to:'b.canvas', type:'dep',  label:'описывает блоки' },

    // LOGIC
    { from:'b.map',    to:'b.gen',    type:'data', label:'поля' },
    { from:'b.arch',   to:'b.gen',    type:'data', label:'блоки+связи' },
    { from:'b.gen',    to:'b.tz',     type:'data', label:'документ' },
    { from:'b.map',    to:'b.sync',   type:'dep',  label:'' },
    { from:'b.arch',   to:'b.sync',   type:'dep',  label:'' },

    // IMPL
    { from:'b.tz',           to:'b.claude_code', type:'data', label:'задачи' },
    { from:'b.claude_code',  to:'b.sima',        type:'data', label:'результат' },
    { from:'b.sima',         to:'b.impl',        type:'data', label:'статус' },
  ],
  // optional groups (container boxes around several blocks)
  groups: [
    { id:'g.editor', layer:'front', blocks:['b.canvas','b.map','b.arch'], label:'Редактор схем · 4 слоя' },
    { id:'g.ingest', layer:'ext',   blocks:['b.mf','b.gd'], label:'Ingest · импорт контекста' },
  ],
};

// Project: Контекст как актив (книга) — lighter
const bookArch = {
  projectId: 'book',
  layers: ['user','content','ai','logic','ext'],
  blocks: [
    { id:'b.reader', layer:'user',    x: 40,  w: 220, title:'Читатель-исследователь',     note:'знаком с AI, устал от хаоса в проектах', status:'done', mvp:true, sources:['s1','s2'] },
    { id:'b.author', layer:'user',    x: 280, w: 200, title:'Автор',                       note:'ведёт книгу и блог одновременно', status:'done', mvp:true, sources:['s1'] },

    { id:'b.story',  layer:'content', x: 40,  w: 220, title:'Сторилайн',                   note:'путь героя · 6 актов', status:'done', mvp:true, subschema:'n.story', sources:['s5'] },
    { id:'b.toc',    layer:'content', x: 280, w: 220, title:'Оглавление',                  note:'6 глав · сквозная метафора', status:'done', mvp:true, subschema:'n.toc', sources:['s5','s6'] },
    { id:'b.scenes', layer:'content', x: 520, w: 200, title:'Сцены',                       note:'к каждой главе · материал', status:'wip',  mvp:true, sources:['s6'] },
    { id:'b.style',  layer:'content', x: 740, w: 180, title:'Стиль',                       note:'публицистика · Карпати', status:'done', mvp:true, sources:['s3'] },

    { id:'b.editor', layer:'ai',      x: 40,  w: 220, title:'Клод-редактор',               note:'переписывает главы в стиле', status:'wip',  mvp:true, sources:['s3'] },
    { id:'b.factck', layer:'ai',      x: 280, w: 200, title:'Фактчекер',                   note:'сверяет с источниками', status:'idea', mvp:false, sources:[] },

    { id:'b.draft',  layer:'logic',   x: 40,  w: 200, title:'Генерация черновика',         note:'из сцены → текст главы', status:'wip',  mvp:true, sources:['s5'] },
    { id:'b.citations', layer:'logic',x: 260, w: 200, title:'Цитирования',                 note:'сноски на источники', status:'wip',  mvp:true, sources:['s5'] },

    { id:'b.publish', layer:'ext',    x: 40,  w: 200, title:'Публикация',                  note:'издатель · формат не решён', status:'q',   mvp:false, sources:[] },
    { id:'b.blog',    layer:'ext',    x: 260, w: 200, title:'Блог / серия',                note:'параллельная публикация', status:'idea', mvp:false, sources:['s2'] },
  ],
  links: [
    { from:'b.reader', to:'b.story',  type:'path', label:'вход' },
    { from:'b.story',  to:'b.toc',    type:'path', label:'' },
    { from:'b.toc',    to:'b.scenes', type:'path', label:'' },
    { from:'b.scenes', to:'b.draft',  type:'data', label:'' },
    { from:'b.style',  to:'b.editor', type:'dep',  label:'' },
    { from:'b.editor', to:'b.draft',  type:'dep',  label:'' },
    { from:'b.draft',  to:'b.citations', type:'data', label:'' },
    { from:'b.citations', to:'b.factck', type:'dep', label:'' },
    { from:'b.draft',  to:'b.publish', type:'data', label:'' },
    { from:'b.draft',  to:'b.blog',   type:'data', label:'' },
    { from:'b.author', to:'b.style',  type:'dep',  label:'голос' },
  ],
  groups: [
    { id:'g.text', layer:'content', blocks:['b.story','b.toc','b.scenes'], label:'Структура книги' },
  ],
};

// Project: AI-консьерж — sparse
const ideaArch = {
  projectId: 'idea',
  layers: ['user','front','ai','data','market'],
  blocks: [
    { id:'b.user',   layer:'user',    x: 40,  w: 230, title:'Исследователь в проекте 3-12 мес', note:'источник: интервью 3 из 10', status:'wip',  mvp:true, sources:['s1','s2'] },

    { id:'b.onboard',layer:'front',   x: 40,  w: 200, title:'Онбординг',                   note:'импорт первого проекта', status:'idea', mvp:true, sources:[] },
    { id:'b.feed',   layer:'front',   x: 260, w: 200, title:'Лента памяти',                note:'карточки «вспомнил · связал»', status:'idea', mvp:true, sources:['s1'] },
    { id:'b.search', layer:'front',   x: 480, w: 200, title:'Поиск по графу',              note:'фасетный · по тегам', status:'idea', mvp:false, sources:['s2'] },

    { id:'b.memory', layer:'ai',      x: 40,  w: 220, title:'Движок памяти',               note:'векторная + граф + контекст', status:'idea', mvp:true, sources:['s1'] },
    { id:'b.concierge', layer:'ai',   x: 280, w: 220, title:'Консьерж-агент',              note:'LLM + инструменты поиска', status:'idea', mvp:true, sources:['s1'] },

    { id:'b.graph',  layer:'data',    x: 40,  w: 200, title:'Граф цитирований',            note:'как у ResearchRabbit', status:'idea', mvp:true, subschema:'i.refs', sources:['s4'] },
    { id:'b.docs',   layer:'data',    x: 260, w: 200, title:'Документы проекта',           note:'вики, заметки, pdf', status:'idea', mvp:true, sources:['s1'] },

    { id:'b.pos',    layer:'market',  x: 40,  w: 220, title:'Позиционирование',            note:'«второй мозг исследователя»', status:'wip',  mvp:false, subschema:'i.market', sources:['s6'] },
    { id:'b.channels', layer:'market',x: 280, w: 220, title:'Каналы',                      note:'академ-тви · подкасты · ньюс', status:'idea', mvp:false, sources:['s6'] },
  ],
  links: [
    { from:'b.user',    to:'b.onboard',   type:'path', label:'вход' },
    { from:'b.onboard', to:'b.feed',      type:'path', label:'' },
    { from:'b.feed',    to:'b.search',    type:'path', label:'' },
    { from:'b.feed',    to:'b.memory',    type:'dep',  label:'' },
    { from:'b.search',  to:'b.memory',    type:'dep',  label:'' },
    { from:'b.memory',  to:'b.graph',     type:'data', label:'' },
    { from:'b.memory',  to:'b.docs',      type:'data', label:'' },
    { from:'b.concierge', to:'b.memory',  type:'dep',  label:'' },
    { from:'b.concierge', to:'b.feed',    type:'dep',  label:'' },
    { from:'b.pos',     to:'b.channels',  type:'dep',  label:'' },
  ],
  groups: [],
};

window.ARCH_BY_PROJECT = {
  'prj.sima': simaArch, sima: simaArch,
  'prj.book': bookArch, book: bookArch,
  'prj.idea': ideaArch, idea: ideaArch,
};

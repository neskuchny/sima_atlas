// subschema.jsx — nested canvas modal. Shows a second-layer schema inside a node.

const SUBSCHEMAS = {
  'us.data': {
    title: 'Подсхема · Data',
    parent: 'Сима',
    stage: { w: 960, h: 420 },
    nodes: [
      { id:'d.mf', x: 40,  y: 40,  w: 200, h: 90, type:'meet', title:'Meetflow API', body:'получаем транскрипты, спикеры, тайминги' },
      { id:'d.gd', x: 40,  y: 160, w: 200, h: 90, type:'doc',  title:'Google Docs коннектор', body:'OAuth, polling раз в 10 мин' },
      { id:'d.au', x: 40,  y: 280, w: 200, h: 90, type:'audio',title:'Whisper', body:'транскрипция аудио из диктофона' },
      { id:'d.idx', x: 340, y: 140, w: 200, h: 120, type:'block', title:'Индекс и нормализация', body:'единый формат кубика: title + meta + take + tags + source' },
      { id:'d.store', x: 640, y: 140, w: 200, h: 120, type:'block', title:'Хранилище', body:'IndexedDB + облачная синхронизация' },
    ],
    links: [
      { from:'d.mf', to:'d.idx', label:'транскрипт' },
      { from:'d.gd', to:'d.idx', label:'текст' },
      { from:'d.au', to:'d.idx', label:'текст+спикеры' },
      { from:'d.idx', to:'d.store', label:'кубики' },
    ],
  },
  'us.scheme': {
    title: 'Подсхема · Схема',
    parent: 'Сима',
    stage: { w: 960, h: 360 },
    nodes: [
      { id:'s.mvp', x: 40, y: 40, w: 200, h: 90, type:'block', title:'MVP-раскладка', body:'какие кубики обязательны для минимального артефакта' },
      { id:'s.arch', x: 40, y: 160, w: 200, h: 90, type:'block', title:'Архитектурная схема', body:'техническая сторона: бэк, фронт, данные' },
      { id:'s.us', x: 40, y: 280, w: 200, h: 90, type:'subschema', title:'User Story карта', body:'путь пользователя → кубики' },
      { id:'s.synth', x: 340, y: 160, w: 240, h: 120, type:'block', title:'Синтез в карту', body:'Claude собирает карту 2-го слоя из раскладки + источников' },
      { id:'s.out', x: 680, y: 160, w: 200, h: 120, type:'artifact', title:'Карта продукта', body:'готовый артефакт · слой 2' },
    ],
    links: [
      { from:'s.mvp', to:'s.synth', label:'обязательные поля' },
      { from:'s.arch', to:'s.synth', label:'технические поля' },
      { from:'s.us', to:'s.synth', label:'путь пользователя' },
      { from:'s.synth', to:'s.out', label:'карта' },
    ],
  },
  'us.impl': {
    title: 'Подсхема · Реализация',
    parent: 'Сима',
    stage: { w: 960, h: 340 },
    nodes: [
      { id:'r.tz', x: 40, y: 40, w: 200, h: 90, type:'doc', title:'ТЗ', body:'входит в Claude Code' },
      { id:'r.cc', x: 320, y: 40, w: 200, h: 90, type:'block', title:'Claude Code', body:'исполняет задачи по ТЗ' },
      { id:'r.sima', x: 320, y: 180, w: 200, h: 90, type:'block', title:'Сима-контроль', body:'сверяет результат со схемой' },
      { id:'r.ok', x: 620, y: 40, w: 200, h: 90, type:'artifact', title:'Готовый код', body:'принят человеком' },
      { id:'r.back', x: 620, y: 180, w: 200, h: 90, type:'block', title:'Доработка', body:'возврат задач' },
    ],
    links: [
      { from:'r.tz', to:'r.cc', label:'задачи' },
      { from:'r.cc', to:'r.sima', label:'результат' },
      { from:'r.sima', to:'r.ok', label:'принято' },
      { from:'r.sima', to:'r.back', label:'вернуть' },
      { from:'r.back', to:'r.cc', label:'доделать' },
    ],
  },
  'n.story': {
    title: 'Подсхема · Сторилайн книги',
    parent: 'Контекст как актив',
    stage: { w: 1000, h: 260 },
    nodes: [
      { id:'st.1', x: 20,  y: 80, w: 170, h: 90, type:'block', title:'1 · Боль', body:'узнавание: Google Docs-кладбище' },
      { id:'st.2', x: 210, y: 80, w: 170, h: 90, type:'block', title:'2 · Зов', body:'контекст как актив · новая идея' },
      { id:'st.3', x: 400, y: 80, w: 170, h: 90, type:'block', title:'3 · Порог', body:'первые попытки · провалы' },
      { id:'st.4', x: 590, y: 80, w: 170, h: 90, type:'block', title:'4 · Система', body:'кубик и связь как единица' },
      { id:'st.5', x: 780, y: 80, w: 170, h: 90, type:'block', title:'5 · Возврат', body:'100 дней · личный каталог' },
    ],
    links: [
      { from:'st.1', to:'st.2', label:'' },
      { from:'st.2', to:'st.3', label:'' },
      { from:'st.3', to:'st.4', label:'' },
      { from:'st.4', to:'st.5', label:'' },
    ],
  },
  'n.toc': {
    title: 'Подсхема · Оглавление книги',
    parent: 'Контекст как актив',
    stage: { w: 820, h: 400 },
    nodes: [
      { id:'t.1', x: 20,  y: 20,  w: 240, h: 80, type:'doc',   title:'Гл.1 — Кладбище', body:'почему ответы ИИ умирают' },
      { id:'t.2', x: 290, y: 20,  w: 240, h: 80, type:'doc',   title:'Гл.2 — Актив', body:'метафора капитала' },
      { id:'t.3', x: 560, y: 20,  w: 240, h: 80, type:'doc',   title:'Гл.3 — Кубик', body:'единица смысла' },
      { id:'t.4', x: 20,  y: 140, w: 240, h: 80, type:'doc',   title:'Гл.4 — Связь', body:'важнее содержания' },
      { id:'t.5', x: 290, y: 140, w: 240, h: 80, type:'doc',   title:'Гл.5 — Синтез', body:'ежедневная практика' },
      { id:'t.6', x: 560, y: 140, w: 240, h: 80, type:'doc',   title:'Гл.6 — 100 дней', body:'чеклист' },
      { id:'t.x', x: 290, y: 260, w: 240, h: 100, type:'block',title:'Сквозная метафора', body:'капитал — через все 6 глав' },
    ],
    links: [
      { from:'t.1', to:'t.2', label:'' },
      { from:'t.2', to:'t.3', label:'' },
      { from:'t.3', to:'t.4', label:'' },
      { from:'t.4', to:'t.5', label:'' },
      { from:'t.5', to:'t.6', label:'' },
      { from:'t.x', to:'t.1', label:'капитал' },
      { from:'t.x', to:'t.3', label:'капитал' },
      { from:'t.x', to:'t.6', label:'капитал' },
    ],
  },
  'i.refs': {
    title: 'Подсхема · Референсы',
    parent: 'AI-консьерж',
    stage: { w: 800, h: 280 },
    nodes: [
      { id:'rf.1', x: 30,  y: 30,  w: 210, h: 90, type:'doc', title:'Elicit', body:'работа с источниками' },
      { id:'rf.2', x: 30,  y: 150, w: 210, h: 90, type:'doc', title:'ResearchRabbit', body:'граф цитирований' },
      { id:'rf.3', x: 30,  y: 270, w: 210, h: 90, type:'doc', title:'Notion AI', body:'UX-приёмы · к сожалению не видно' },
      { id:'rf.core', x: 310, y: 70, w: 240, h: 130, type:'block', title:'Сводка фич', body:'по одной ключевой фиче от каждого — в свой MVP' },
      { id:'rf.mvp', x: 600, y: 90, w: 160, h: 100, type:'artifact', title:'Scope MVP', body:'черновик' },
    ],
    links: [
      { from:'rf.1', to:'rf.core', label:'работа с источниками' },
      { from:'rf.2', to:'rf.core', label:'граф' },
      { from:'rf.3', to:'rf.core', label:'UX' },
      { from:'rf.core', to:'rf.mvp', label:'' },
    ],
  },
  'i.market': {
    title: 'Подсхема · Маркетинг',
    parent: 'AI-консьерж',
    stage: { w: 800, h: 280 },
    nodes: [
      { id:'mk.art', x: 30,  y: 80,  w: 230, h: 100, type:'artifact', title:'Substrate · карта', body:'переиспользуем часть про продажи' },
      { id:'mk.pos', x: 300, y: 20,  w: 210, h: 90, type:'block', title:'Позиционирование', body:'"второй мозг для исследователя"' },
      { id:'mk.ch',  x: 300, y: 130, w: 210, h: 90, type:'block', title:'Каналы', body:'академ-тви / подкасты / ньюслеттеры' },
      { id:'mk.exp', x: 560, y: 80, w: 210, h: 100, type:'block', title:'Эксперименты', body:'3 креатива × 3 канала' },
    ],
    links: [
      { from:'mk.art', to:'mk.pos', label:'приём' },
      { from:'mk.art', to:'mk.ch', label:'приём' },
      { from:'mk.pos', to:'mk.exp', label:'' },
      { from:'mk.ch', to:'mk.exp', label:'' },
    ],
  },
};

const SUB_TYPE = { meet:'встреча', doc:'документ', audio:'аудио', text:'текст', artifact:'артефакт', block:'блок', subschema:'подсхема' };

const SubschemaNode = ({ n }) => (
  <div className="cs-node src" data-type={n.type==='block'?'text':(n.type==='subschema'?'artifact':n.type)}
       style={{left:n.x,top:n.y,width:n.w,height:n.h,cursor:'default'}}>
    <div className="k">
      <Icon name={TYPE_ICONS[n.type] || 'note'} size={11}/>
      {SUB_TYPE[n.type] || n.type}
    </div>
    <div className="t">{n.title}</div>
    {n.body && <div className="take" style={{borderTop:'0.5px solid var(--line-1)',marginTop:6,paddingTop:6}}>{n.body}</div>}
  </div>
);

function linkPath(a, b){
  const pa = { x: a.x + a.w, y: a.y + a.h/2, side:'r' };
  const pb = { x: b.x,       y: b.y + b.h/2, side:'l' };
  // if b is to the left of a, flip
  if (b.x + b.w < a.x){
    pa.x = a.x; pa.side = 'l';
    pb.x = b.x + b.w; pb.side = 'r';
  }
  // vertical stacking
  if (Math.abs(b.x - a.x) < 60){
    if (b.y > a.y){
      pa.y = a.y + a.h; pa.side = 'b'; pa.x = a.x + a.w/2;
      pb.y = b.y;       pb.side = 't'; pb.x = b.x + b.w/2;
    } else {
      pa.y = a.y;       pa.side = 't'; pa.x = a.x + a.w/2;
      pb.y = b.y + b.h; pb.side = 'b'; pb.x = b.x + b.w/2;
    }
  }
  const dx = (pb.x - pa.x) * 0.4;
  return { d:`M${pa.x},${pa.y} C${pa.x+dx},${pa.y} ${pb.x-dx},${pb.y} ${pb.x},${pb.y}`,
           mid:{x:(pa.x+pb.x)/2,y:(pa.y+pb.y)/2} };
}

const SubschemaModal = ({ nodeId, onClose }) => {
  const sch = SUBSCHEMAS[nodeId];
  if (!sch) return null;
  const byId = {}; sch.nodes.forEach(n => byId[n.id] = n);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal-card" onClick={e=>e.stopPropagation()}>
        <div className="modal-hd">
          <div>
            <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:'0.08em',color:'var(--ink-4)'}}>
              {sch.parent} → подсхема 2 уровня
            </div>
            <h2 style={{margin:'4px 0 0',fontFamily:'var(--font-serif)',fontSize:20,fontWeight:500}}>{sch.title}</h2>
          </div>
          <div className="grow"/>
          <button className="btn sm"><Icon name="sparkle" size={11}/> Клод, предложи доработку</button>
          <button className="btn sm ghost"><Icon name="library" size={11}/> в артефакты</button>
          <button className="btn sm ghost" onClick={onClose}><Icon name="close" size={11}/></button>
        </div>
        <div className="modal-bd">
          <div className="canvas-stage" style={{width:sch.stage.w, height:sch.stage.h, margin:'0 auto'}}>
            <svg className="cs-svg">
              <defs>
                <marker id="arr-sub" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-3)"/>
                </marker>
              </defs>
              {sch.links.map((l,i) => {
                const a = byId[l.from], b = byId[l.to];
                if (!a || !b) return null;
                const { d, mid } = linkPath(a, b);
                return (
                  <g key={i}>
                    <path d={d} className="one-way" markerEnd="url(#arr-sub)"/>
                    {l.label && <text x={mid.x} y={mid.y - 4} textAnchor="middle">{l.label}</text>}
                  </g>
                );
              })}
            </svg>
            {sch.nodes.map(n => <SubschemaNode key={n.id} n={n}/>)}
          </div>
          <div style={{padding:'14px 20px',fontSize:11.5,color:'var(--ink-3)',display:'flex',gap:14,alignItems:'center',borderTop:'0.5px solid var(--line-1)',background:'var(--bg-1)'}}>
            <Icon name="layers" size={12}/>
            <span>Это 2-й слой схемы. Из каждого блока здесь можно опуститься ещё глубже, добавить документы и связи, как на 1-м слое.</span>
            <span className="grow"/>
            <button className="btn xs ghost"><Icon name="plus" size={10}/> блок</button>
            <button className="btn xs ghost"><Icon name="upload" size={10}/> документ</button>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { SubschemaModal, SUBSCHEMAS });

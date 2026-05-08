// landscape_view.jsx — M-31 пространственный режим.
// Три уровня масштаба: valley (долина) → settlement (поселение) → building (разрез).
// Источник правды — те же arch-данные. Этот вид только читает.

const { useState: useLSState, useMemo: useLSMemo, useRef: useLSRef, useEffect: useLSEffect } = React;

// ────────── helper: чтение архитектуры с учётом localStorage ──────────
function readArch(projectId){
  const key = 'sima.arch.'+projectId;
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch(e){}
  return JSON.parse(JSON.stringify(window.ARCH_BY_PROJECT[projectId]));
}

// ────────── Долина: 3 поселения по диагонали ──────────
// MVP-деревня впереди-слева, Средний-городок чуть выше, Идеал на горизонте справа.
// В нашей модели "слои" архитектуры стоят рядом как ландшафтные кварталы,
// а MVP/Средний/Идеал — отдельная ось эволюции (раздельная от слоёв).
// Решение: показываем по слоям как поселения. Ось эволюции — мини-индикатор.

const SETTLEMENT_POS = (count) => {
  // равномерно по диагонали слева-снизу направо-вверх
  // viewBox 1200×620
  const positions = [];
  for (let i=0; i<count; i++){
    const t = count===1 ? 0.5 : i/(count-1);
    const x = 160 + t*880;          // 160..1040
    const y = 480 - t*300;          // 480..180
    positions.push({ x, y });
  }
  return positions;
};

function Settlement({ pos, layer, blocks, scale=1, status, onClick, label }){
  // компактный силуэт поселения: круг земли + 5-7 пиктограмм-зданий
  const accent = window.layerAccent(layer.id);
  // распределение пиктограмм
  const nVisible = Math.min(blocks.length, 8);
  const offsets = [];
  for (let i=0; i<nVisible; i++){
    const a = (i/nVisible)*Math.PI*2 + 0.3;
    const r = 28 + (i%3)*8;
    offsets.push({ x: Math.cos(a)*r, y: Math.sin(a)*r*0.5 });
  }
  return (
    <g transform={`translate(${pos.x},${pos.y}) scale(${scale})`}
       style={{cursor:'pointer'}} onClick={onClick}>
      {/* land */}
      <ellipse cx="0" cy="20" rx="80" ry="22" fill={LS_PALETTE.land} stroke={LS_PALETTE.ink} strokeWidth="1"/>
      <ellipse cx="0" cy="20" rx="80" ry="22" fill={accent} opacity="0.07"/>
      {/* tiny trees on edge */}
      {[-72, 70].map((tx,i) => (
        <g key={i} transform={`translate(${tx},10)`}>
          <circle cx="0" cy="0" r="6" fill={LS_PALETTE.grass}/>
          <line x1="0" y1="2" x2="0" y2="8" stroke={LS_PALETTE.ink2} strokeWidth="0.8"/>
        </g>
      ))}
      {/* buildings — pictograms scattered */}
      {blocks.slice(0, nVisible).map((b, i) => {
        const o = offsets[i];
        const stat = b.status;
        const opacity = stat==='idea' ? 0.45 : 1;
        return (
          <g key={b.id} transform={`translate(${o.x},${o.y})`} opacity={opacity}>
            <BuildingPicto layerId={layer.id} accent={accent}/>
            {stat==='wip' && (
              <circle cx="-2" cy="-26" r="3.5" fill={LS_PALETTE.stone} opacity="0.7"/>
            )}
          </g>
        );
      })}
      {/* signpost — выше круга */}
      <g transform="translate(0,-46)">
        <rect x="-58" y="-12" width="116" height="20" rx="2" fill={LS_PALETTE.land} stroke={LS_PALETTE.ink} strokeWidth="0.8"/>
        <text x="0" y="2" textAnchor="middle" fontSize="11" fontFamily="Newsreader, serif"
              fill={accent} fontWeight="500">{label}</text>
        <line x1="0" y1="8" x2="0" y2="20" stroke={LS_PALETTE.ink2} strokeWidth="0.8"/>
      </g>
      {/* count */}
      <text x="0" y="55" textAnchor="middle" fontSize="9" fill={LS_PALETTE.ink2} opacity="0.7">
        {blocks.length} {blocks.length===1?'здание':blocks.length<5?'здания':'зданий'}
      </text>
    </g>
  );
}

// дорога (эволюция) между двумя поселениями
function Road({ from, to, type='evolution' }){
  // type: evolution (зелёная разметка), data (трубопровод), dep (опора), conflict (разлом)
  const cx = (from.x + to.x)/2;
  const cy = (from.y + to.y)/2 + 30;
  const path = `M${from.x},${from.y+30} Q${cx},${cy} ${to.x},${to.y+30}`;
  if (type==='evolution'){
    return (
      <g>
        <path d={path} fill="none" stroke={LS_PALETTE.earth} strokeWidth="9"/>
        <path d={path} fill="none" stroke={LS_PALETTE.grass} strokeWidth="11" strokeDasharray="6 8" opacity="0.45"/>
        <path d={path} fill="none" stroke={LS_PALETTE.ink2} strokeWidth="0.5" strokeDasharray="2 4" opacity="0.5"/>
      </g>
    );
  }
  if (type==='data'){
    return <path d={path} fill="none" stroke="#5C7BA8" strokeWidth="3"/>;
  }
  return <path d={path} fill="none" stroke={LS_PALETTE.stoneDk} strokeWidth="2" strokeDasharray="4 3"/>;
}

// ────────── Уровень "Поселение": здания на сетке ──────────
// Алгоритм укладки 6.2: ядро/логика в центре, ui вокруг, агенты на отшибе,
// integration на границе, output на дальнем краю.
function layoutSettlement(blocks, links){
  // Возвращаем для каждого block id координаты (x,y) на сцене 1200×680.
  // По умолчанию используем линейную укладку с правилами зон.
  const ZONE = {
    user:    { type:'square', x: 200, y: 180 },     // площадь
    front:   { type:'inner',  x: 600, y: 220 },     // у центра
    logic:   { type:'core',   x: 600, y: 350 },     // центр
    ai:      { type:'edge',   x: 250, y: 420 },     // отшиб
    data:    { type:'inner',  x: 950, y: 350 },     // рядом с ядром
    ext:     { type:'border', x: 950, y: 180 },     // граница
    content: { type:'inner',  x: 250, y: 180 },     // боковая
    market:  { type:'output', x: 950, y: 480 },     // дальний край
  };

  const positions = {};
  // группируем по target zone
  const groups = {};
  blocks.forEach(b => {
    const z = ZONE[b.layer] || { type:'inner', x: 600, y: 380 };
    const k = b.layer;
    if (!groups[k]) groups[k] = { zone: z, items: [] };
    groups[k].items.push(b);
  });

  Object.keys(groups).forEach(k => {
    const { zone, items } = groups[k];
    // раскладываем items вокруг центра зоны на сетке
    items.forEach((b, i) => {
      const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(items.length))));
      const col = i % cols;
      const row = Math.floor(i / cols);
      const dx = (col - (cols-1)/2) * 200;
      const dy = row * 150;
      positions[b.id] = {
        x: zone.x + dx,
        y: zone.y + dy,
        w: 220, h: 160,
      };
    });
  });

  // лёгкая force-correction: связанные ближе (только для тех что в одной зоне)
  for (let it=0; it<8; it++){
    links.forEach(l => {
      const a = positions[l.from], b = positions[l.to];
      if (!a || !b) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d > 280){
        const k = 0.04;
        a.x += dx*k; a.y += dy*k*0.5;
        b.x -= dx*k; b.y -= dy*k*0.5;
      }
    });
  }

  return positions;
}

function buildingPath(from, to, type){
  // Простая S-кривая по поверхности земли.
  const cx = (from.x + to.x)/2;
  const cy = Math.max(from.y, to.y) + 20;
  return `M${from.x},${from.y+10} Q${cx},${cy} ${to.x},${to.y+10}`;
}

function Pipe({ d, type, accent }){
  // type: data → синий трубопровод; dep → каменная опора; path → дорога; conflict → разлом
  if (type==='data'){
    return (
      <g>
        <path d={d} fill="none" stroke="#3E5F8A" strokeWidth="6" strokeLinecap="round"/>
        <path d={d} fill="none" stroke="#7AA2D9" strokeWidth="3.5" strokeLinecap="round"/>
        <path d={d} fill="none" stroke="#C7DCF2" strokeWidth="1" strokeLinecap="round" strokeDasharray="3 5">
          <animate attributeName="stroke-dashoffset" from="0" to="-16" dur="1.5s" repeatCount="indefinite"/>
        </path>
      </g>
    );
  }
  if (type==='dep'){
    return (
      <g>
        <path d={d} fill="none" stroke={LS_PALETTE.stoneDk} strokeWidth="5" strokeLinecap="round"/>
        <path d={d} fill="none" stroke={LS_PALETTE.stone} strokeWidth="2.5" strokeLinecap="round"/>
      </g>
    );
  }
  if (type==='path'){
    return (
      <g>
        <path d={d} fill="none" stroke={LS_PALETTE.earth} strokeWidth="6"/>
        <path d={d} fill="none" stroke={LS_PALETTE.ink2} strokeWidth="0.5" strokeDasharray="2 4" opacity="0.6"/>
      </g>
    );
  }
  return <path d={d} fill="none" stroke="#C04A4A" strokeWidth="2" strokeDasharray="3 3"/>;
}

// Здание на уровне поселения (большой SVG-силуэт)
function SettlementBuilding({ block, pos, selected, onClick, recommended }){
  const Comp = window.getBuildingComponent(block.layer);
  const accent = window.layerAccent(block.layer);
  return (
    <g transform={`translate(${pos.x - 110},${pos.y - 80})`}
       style={{cursor:'pointer'}} onClick={(e)=>{e.stopPropagation(); onClick && onClick(block);}}>
      {/* highlight ring */}
      {selected && (
        <ellipse cx="110" cy="148" rx="100" ry="18" fill="none"
                 stroke={LS_PALETTE.ink} strokeWidth="1.5" strokeDasharray="3 2"/>
      )}
      {recommended && (
        <ellipse cx="110" cy="148" rx="105" ry="20" fill="#F2DFB3" opacity="0.45"/>
      )}
      <Comp accent={accent} status={block.status}/>
      {/* signboard with title — таблички в интерьере, не UI */}
      <g transform="translate(110,170)">
        <rect x="-78" y="-2" width="156" height="22" rx="2"
              fill={LS_PALETTE.land} stroke={LS_PALETTE.ink} strokeWidth="0.7"/>
        <text x="0" y="13" textAnchor="middle" fontSize="11"
              fontFamily="Newsreader, serif" fill={LS_PALETTE.ink}
              style={{pointerEvents:'none'}}>{block.title}</text>
      </g>
      {/* status badge */}
      {block.status==='wip' && (
        <text x="110" y="-8" textAnchor="middle" fontSize="9" fill={LS_PALETTE.ink2}>в работе</text>
      )}
      {block.status==='idea' && (
        <text x="110" y="-8" textAnchor="middle" fontSize="9" fill={LS_PALETTE.ink2}>стройплощадка</text>
      )}
      {/* MVP star */}
      {block.mvp && (
        <g transform="translate(196,30)">
          <circle r="10" fill="#F2DFB3" stroke={LS_PALETTE.ink} strokeWidth="0.7"/>
          <text textAnchor="middle" y="3" fontSize="9" fill={LS_PALETTE.ink}>★</text>
        </g>
      )}
      {/* sparkle for recommended */}
      {recommended && (
        <g transform="translate(110,-22)">
          <circle r="11" fill="#FFEAB0" stroke={LS_PALETTE.ink} strokeWidth="0.7"/>
          <text textAnchor="middle" y="4" fontSize="11">→</text>
        </g>
      )}
    </g>
  );
}

// ────────── Уровень "Здание": разрез ──────────
function BuildingInterior({ block, project, onClose, onGoToConnected, connected }){
  const accent = window.layerAccent(block.layer);
  const arche = window.ARCHETYPE_BY_LAYER[block.layer];
  // Шаблонные слоты: вывеска, центральное устройство, приборы (3-5), двери (по связям), дефекты
  // Источники как «приборы».
  const sources = block.sources || [];
  // Подбираем какие связи показать как двери — берём от/к этого блока
  const doors = connected; // [{block, dir, type}]

  return (
    <g>
      {/* фон-комната — разрез изометрии */}
      <defs>
        <linearGradient id="bg-int" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={LS_PALETTE.skyTop}/>
          <stop offset="1" stopColor={LS_PALETTE.land}/>
        </linearGradient>
        <pattern id="bricks" width="40" height="14" patternUnits="userSpaceOnUse">
          <rect width="40" height="14" fill="#D4C9B0"/>
          <line x1="0" y1="14" x2="40" y2="14" stroke={LS_PALETTE.ink2} strokeWidth="0.4" opacity="0.4"/>
          <line x1="20" y1="0" x2="20" y2="7" stroke={LS_PALETTE.ink2} strokeWidth="0.4" opacity="0.4"/>
          <line x1="0" y1="7" x2="40" y2="7" stroke={LS_PALETTE.ink2} strokeWidth="0.4" opacity="0.4"/>
          <line x1="0" y1="0" x2="0" y2="7" stroke={LS_PALETTE.ink2} strokeWidth="0.4" opacity="0.4"/>
        </pattern>
      </defs>
      <rect x="0" y="0" width="1200" height="620" fill="url(#bg-int)"/>

      {/* ground / floor — большая плита */}
      <path d="M0,475 L1200,475 L1200,620 L0,620 Z" fill={LS_PALETTE.land}/>
      <line x1="0" y1="475" x2="1200" y2="475" stroke={LS_PALETTE.ink2} strokeWidth="0.5" opacity="0.4"/>

      {/* стены здания — каркас (толстые опоры) */}
      <path d="M120,120 L120,560 L150,580 L150,140 Z" fill={LS_PALETTE.stoneDk} stroke={LS_PALETTE.ink} strokeWidth="1"/>
      <path d="M1080,120 L1080,560 L1050,580 L1050,140 Z" fill={LS_PALETTE.stoneDk} stroke={LS_PALETTE.ink} strokeWidth="1"/>
      {/* задняя стена с кирпичом */}
      <rect x="150" y="140" width="900" height="380" fill="url(#bricks)" stroke={LS_PALETTE.ink} strokeWidth="0.8"/>
      {/* roof beam */}
      <path d="M120,120 L1080,120 L1050,140 L150,140 Z" fill={LS_PALETTE.stone} stroke={LS_PALETTE.ink} strokeWidth="1"/>
      {/* roof accent */}
      <rect x="120" y="100" width="960" height="22" fill={accent} opacity="0.85" stroke={LS_PALETTE.ink} strokeWidth="0.8"/>

      {/* Слот: вывеска у входа (название + ID) */}
      <g transform="translate(600,178)">
        <rect x="-220" y="-22" width="440" height="44" rx="3"
              fill={LS_PALETTE.land} stroke={LS_PALETTE.ink} strokeWidth="1.2"/>
        <text x="0" y="-2" textAnchor="middle" fontSize="9"
              fill={LS_PALETTE.ink2} fontFamily="ui-monospace, monospace" letterSpacing="0.1em">
          {block.id.toUpperCase()} · {window.ARCH_LAYERS[block.layer].name}
        </text>
        <text x="0" y="16" textAnchor="middle" fontSize="17"
              fontFamily="Newsreader, serif" fill={LS_PALETTE.ink} fontWeight="500">
          {block.title}
        </text>
      </g>

      {/* Центральное устройство — зависит от архетипа */}
      <CentralDevice arche={arche} block={block} accent={accent}/>

      {/* Приборы — критерии успеха / источники как табло */}
      <Instruments block={block} accent={accent}/>

      {/* Двери — связанные кубики */}
      <Doors doors={doors} onGoToConnected={onGoToConnected}/>

      {/* Дефекты — если статус q или idea, маленькие предупреждающие знаки */}
      {(block.status==='q' || block.status==='idea') && (
        <DefectsPattern status={block.status}/>
      )}

      {/* подсказка снизу */}
      <g transform="translate(600,640)">
        <text textAnchor="middle" fontSize="10" fill={LS_PALETTE.ink2} opacity="0.7"
              fontFamily="Newsreader, serif" fontStyle="italic">
          клик по двери — переход в соседнее здание · клик по вывеске — открыть инспектор
        </text>
      </g>
    </g>
  );
}

function CentralDevice({ arche, block, accent }){
  // У каждого архетипа своя «начинка»
  if (arche === 'tower'){
    // server / processing rack
    return (
      <g transform="translate(600,380)">
        <rect x="-90" y="-90" width="180" height="180" fill={LS_PALETTE.stoneDk} stroke={LS_PALETTE.ink} strokeWidth="1"/>
        {[-70,-30,10,50].map((y,i) => (
          <g key={i}>
            <rect x="-78" y={y} width="156" height="28" fill="#3A3530" stroke={LS_PALETTE.ink} strokeWidth="0.5"/>
            <circle cx="-65" cy={y+14} r="3" fill={i%2?'#7A8C6E':accent}/>
            <circle cx="-50" cy={y+14} r="3" fill={i%2?accent:'#7A8C6E'}/>
            <rect x="-30" y={y+10} width="80" height="8" fill={LS_PALETTE.stone} opacity="0.5"/>
            <rect x="55" y={y+10} width="14" height="8" fill={accent} opacity="0.7"/>
          </g>
        ))}
        <text x="0" y="115" textAnchor="middle" fontSize="10" fill={LS_PALETTE.ink2}>
          {block.note}
        </text>
      </g>
    );
  }
  if (arche === 'workshop'){
    // станок / конвейер
    return (
      <g transform="translate(600,380)">
        <rect x="-180" y="40" width="360" height="40" fill={LS_PALETTE.stoneDk} stroke={LS_PALETTE.ink} strokeWidth="1"/>
        {[-150,-90,-30,30,90,150].map((x,i) => (
          <circle key={i} cx={x} cy="60" r="12" fill="#5A4F40" stroke={LS_PALETTE.ink} strokeWidth="0.7"/>
        ))}
        {/* станина */}
        <rect x="-50" y="-90" width="100" height="130" fill="#9C8E7A" stroke={LS_PALETTE.ink} strokeWidth="1"/>
        <rect x="-30" y="-70" width="60" height="40" fill={accent} stroke={LS_PALETTE.ink} strokeWidth="0.8"/>
        {/* arm */}
        <path d="M0,-50 L80,-90 L100,-80" fill="none" stroke={LS_PALETTE.ink} strokeWidth="3"/>
        <circle cx="100" cy="-80" r="6" fill={accent} stroke={LS_PALETTE.ink} strokeWidth="0.8"/>
        <text x="0" y="115" textAnchor="middle" fontSize="10" fill={LS_PALETTE.ink2}>
          {block.note}
        </text>
      </g>
    );
  }
  if (arche === 'archive'){
    // полки
    return (
      <g transform="translate(600,380)">
        {[-3,-2,-1,0,1,2,3].map((c,i) => (
          <g key={i}>
            <rect x={c*52-22} y="-90" width="44" height="180" fill="#9C8E7A" stroke={LS_PALETTE.ink} strokeWidth="0.8"/>
            {[-70,-30,10,50].map((y,j) => (
              <rect key={j} x={c*52-18} y={y} width="36" height="22" fill={j%2?accent:'#D8C8AC'} opacity="0.7"/>
            ))}
          </g>
        ))}
        <text x="0" y="115" textAnchor="middle" fontSize="10" fill={LS_PALETTE.ink2}>
          {block.note}
        </text>
      </g>
    );
  }
  if (arche === 'glassFront'){
    // витрина / макет интерфейса
    return (
      <g transform="translate(600,380)">
        <rect x="-160" y="-100" width="320" height="200" fill="#E8DBBA" stroke={LS_PALETTE.ink} strokeWidth="1"/>
        <rect x="-150" y="-90" width="300" height="20" fill={accent} opacity="0.85"/>
        <rect x="-140" y="-60" width="120" height="120" fill="#C7D8E5" stroke={LS_PALETTE.ink} strokeWidth="0.5"/>
        <rect x="-10" y="-60" width="150" height="20" fill={LS_PALETTE.stone} opacity="0.5"/>
        <rect x="-10" y="-30" width="150" height="10" fill={LS_PALETTE.stone} opacity="0.4"/>
        <rect x="-10" y="-10" width="150" height="10" fill={LS_PALETTE.stone} opacity="0.4"/>
        <rect x="-10" y="20" width="80" height="30" fill={accent} opacity="0.7"/>
        <text x="0" y="115" textAnchor="middle" fontSize="10" fill={LS_PALETTE.ink2}>
          {block.note}
        </text>
      </g>
    );
  }
  if (arche === 'bridge'){
    return (
      <g transform="translate(600,380)">
        <ellipse cx="0" cy="60" rx="280" ry="20" fill={LS_PALETTE.water} opacity="0.7"/>
        <path d="M-260,-30 L260,-30 L280,0 L-280,0 Z" fill={LS_PALETTE.stone} stroke={LS_PALETTE.ink} strokeWidth="1"/>
        {[-200,-100,0,100,200].map((x,i) => (
          <path key={i} d={`M${x-40},0 Q${x},60 ${x+40},0`} fill="none" stroke={LS_PALETTE.ink} strokeWidth="1"/>
        ))}
        <text x="0" y="115" textAnchor="middle" fontSize="10" fill={LS_PALETTE.ink2}>
          {block.note}
        </text>
      </g>
    );
  }
  if (arche === 'gates'){
    return (
      <g transform="translate(600,380)">
        <path d="M-180,90 L-180,-90 L-100,-90 L-100,90 Z" fill={LS_PALETTE.stone} stroke={LS_PALETTE.ink} strokeWidth="1"/>
        <path d="M180,90 L180,-90 L100,-90 L100,90 Z" fill={LS_PALETTE.stone} stroke={LS_PALETTE.ink} strokeWidth="1"/>
        <path d="M-180,-90 L180,-90 L180,-50 L-180,-50 Z" fill={accent} stroke={LS_PALETTE.ink} strokeWidth="1"/>
        <path d="M-100,90 L-100,-30 Q0,-70 100,-30 L100,90 Z" fill={LS_PALETTE.land} stroke={LS_PALETTE.ink} strokeWidth="1"/>
        <text x="0" y="115" textAnchor="middle" fontSize="10" fill={LS_PALETTE.ink2}>
          {block.note}
        </text>
      </g>
    );
  }
  if (arche === 'square'){
    return (
      <g transform="translate(600,380)">
        <ellipse cx="0" cy="0" rx="160" ry="60" fill="#E0D6BC" stroke={LS_PALETTE.ink} strokeWidth="1"/>
        <ellipse cx="0" cy="-10" rx="36" ry="12" fill={LS_PALETTE.water} stroke={LS_PALETTE.ink} strokeWidth="0.6"/>
        <ellipse cx="0" cy="-14" rx="10" ry="3" fill={LS_PALETTE.waterDk}/>
        {[{x:-90,y:0},{x:-50,y:30},{x:60,y:25},{x:110,y:0},{x:-110,y:-10}].map((p,i) => (
          <g key={i} transform={`translate(${p.x},${p.y})`}>
            <circle cx="0" cy="-22" r="6" fill={LS_PALETTE.ink2}/>
            <path d={`M-8,-15 L-8,15 L8,15 L8,-15`} fill={i%2?accent:LS_PALETTE.ink2}/>
          </g>
        ))}
        <text x="0" y="80" textAnchor="middle" fontSize="10" fill={LS_PALETTE.ink2}>
          {block.note}
        </text>
      </g>
    );
  }
  return (
    <g transform="translate(600,380)">
      <rect x="-90" y="-90" width="180" height="180" fill={accent} opacity="0.3" stroke={LS_PALETTE.ink} strokeWidth="1"/>
      <text x="0" y="0" textAnchor="middle" fontSize="11" fill={LS_PALETTE.ink}>{block.note}</text>
    </g>
  );
}

function Instruments({ block, accent }){
  // Источники — табло на левой стене (жёлтые/зелёные шкалы)
  const sources = block.sources || [];
  const status = block.status;
  const dotColor = status==='done' ? '#6B7A3D' : status==='wip' ? '#B47A1F' : status==='q' ? '#C04A4A' : '#8B8476';
  return (
    <g>
      {/* левая стена приборов */}
      <g transform="translate(220,260)">
        <rect x="-12" y="-10" width="100" height="170" rx="3"
              fill="#D4C9B0" stroke={LS_PALETTE.ink} strokeWidth="0.8"/>
        <text x="38" y="2" textAnchor="middle" fontSize="9"
              fill={LS_PALETTE.ink2} fontFamily="ui-monospace, monospace">КРИТЕРИИ</text>
        {[0,1,2,3].map(i => (
          <g key={i} transform={`translate(0,${15 + i*38})`}>
            <rect x="-2" y="0" width="80" height="30" fill={LS_PALETTE.land} stroke={LS_PALETTE.ink} strokeWidth="0.5"/>
            {/* circular gauge */}
            <circle cx="14" cy="15" r="10" fill="#1A1814" stroke={LS_PALETTE.ink} strokeWidth="0.5"/>
            <path d={`M14,15 L${14 + Math.cos((-Math.PI*0.7) + (i+1)*0.3)*8},${15 + Math.sin((-Math.PI*0.7) + (i+1)*0.3)*8}`}
                  stroke={i < 2 + (status==='done'?2:status==='wip'?1:0) ? '#6B7A3D' : '#C04A4A'} strokeWidth="1.4"/>
            <circle cx="14" cy="15" r="1.5" fill={LS_PALETTE.land}/>
            {/* label line */}
            <rect x="30" y="9" width="40" height="3" fill={LS_PALETTE.ink2} opacity="0.5"/>
            <rect x="30" y="16" width="30" height="3" fill={LS_PALETTE.ink2} opacity="0.3"/>
          </g>
        ))}
      </g>

      {/* правая стена — источники как ярлыки */}
      <g transform="translate(880,260)">
        <rect x="-12" y="-10" width="120" height="170" rx="3"
              fill="#D4C9B0" stroke={LS_PALETTE.ink} strokeWidth="0.8"/>
        <text x="48" y="2" textAnchor="middle" fontSize="9"
              fill={LS_PALETTE.ink2} fontFamily="ui-monospace, monospace">ИСТОЧНИКИ</text>
        {sources.length === 0 ? (
          <text x="48" y="40" textAnchor="middle" fontSize="10" fill={LS_PALETTE.ink2} opacity="0.6"
                fontFamily="Newsreader, serif" fontStyle="italic">пусто</text>
        ) : (
          sources.slice(0, 6).map((s, i) => (
            <g key={s} transform={`translate(0,${15 + i*22})`}>
              <rect x="-2" y="0" width="100" height="16" fill={LS_PALETTE.land} stroke={LS_PALETTE.ink} strokeWidth="0.4"/>
              <circle cx="10" cy="8" r="4" fill={accent} opacity="0.7"/>
              <text x="22" y="11" fontSize="9.5" fill={LS_PALETTE.ink}
                    fontFamily="ui-monospace, monospace">{s}</text>
            </g>
          ))
        )}
        <g transform="translate(0,148)">
          <circle cx="10" cy="8" r="6" fill={dotColor}/>
          <text x="22" y="11" fontSize="9" fill={LS_PALETTE.ink2}>статус: {window.ARCH_STATUS[status].label}</text>
        </g>
      </g>
    </g>
  );
}

function Doors({ doors, onGoToConnected }){
  // doors — массив { block, dir:'out'/'in', type:'data'|'dep'|'path' }
  // Размещаем по 2 на левой/правой стенах внутри комнаты, остальные снизу.
  if (!doors || !doors.length) return null;
  const left  = doors.filter(d => d.dir==='in').slice(0, 3);
  const right = doors.filter(d => d.dir==='out').slice(0, 3);
  return (
    <g>
      {/* левая стена — входящие */}
      {left.map((d, i) => (
        <g key={'in'+i} transform={`translate(345,${260 + i*100})`}
           style={{cursor:'pointer'}}
           onClick={(e)=>{e.stopPropagation(); onGoToConnected(d.block);}}>
          <path d="M-22,-40 L-22,80 L22,80 L22,-40 Q0,-58 -22,-40 Z"
                fill={LS_PALETTE.ink2} stroke={LS_PALETTE.ink} strokeWidth="0.8"/>
          <path d="M-18,-37 L-18,76 L18,76 L18,-37 Q0,-50 -18,-37 Z"
                fill="#5A4F40" stroke={LS_PALETTE.ink} strokeWidth="0.4"/>
          <circle cx="13" cy="22" r="2.5" fill="#D4B05F"/>
          {/* подсказка-табличка */}
          <g transform="translate(0,-58)">
            <rect x="-65" y="-14" width="130" height="20" rx="2" fill={LS_PALETTE.land} stroke={LS_PALETTE.ink} strokeWidth="0.6"/>
            <text x="0" y="0" textAnchor="middle" fontSize="9" fill={LS_PALETTE.ink2} fontFamily="ui-monospace, monospace">
              ← {d.type}
            </text>
            <text x="0" y="-2" textAnchor="middle" fontSize="9" fill={LS_PALETTE.ink}
                  fontFamily="Newsreader, serif" dy="14">{d.block.title}</text>
          </g>
        </g>
      ))}
      {/* правая стена — исходящие */}
      {right.map((d, i) => (
        <g key={'out'+i} transform={`translate(855,${260 + i*100})`}
           style={{cursor:'pointer'}}
           onClick={(e)=>{e.stopPropagation(); onGoToConnected(d.block);}}>
          <path d="M-22,-40 L-22,80 L22,80 L22,-40 Q0,-58 -22,-40 Z"
                fill={LS_PALETTE.ink2} stroke={LS_PALETTE.ink} strokeWidth="0.8"/>
          <path d="M-18,-37 L-18,76 L18,76 L18,-37 Q0,-50 -18,-37 Z"
                fill="#5A4F40" stroke={LS_PALETTE.ink} strokeWidth="0.4"/>
          <circle cx="-13" cy="22" r="2.5" fill="#D4B05F"/>
          <g transform="translate(0,-58)">
            <rect x="-65" y="-14" width="130" height="20" rx="2" fill={LS_PALETTE.land} stroke={LS_PALETTE.ink} strokeWidth="0.6"/>
            <text x="0" y="0" textAnchor="middle" fontSize="9" fill={LS_PALETTE.ink2} fontFamily="ui-monospace, monospace">
              {d.type} →
            </text>
            <text x="0" y="-2" textAnchor="middle" fontSize="9" fill={LS_PALETTE.ink}
                  fontFamily="Newsreader, serif" dy="14">{d.block.title}</text>
          </g>
        </g>
      ))}
    </g>
  );
}

function DefectsPattern({ status }){
  return (
    <g opacity="0.55">
      {/* трещина в стене */}
      <path d="M180,180 L210,260 L185,320 L220,400 L195,480"
            fill="none" stroke="#5C544A" strokeWidth="1.4" strokeDasharray="3 2"/>
      {/* предупреждающий треугольник в углу */}
      <g transform="translate(1020,500)">
        <path d="M-14,12 L0,-12 L14,12 Z" fill="#E8C77A" stroke={LS_PALETTE.ink} strokeWidth="0.8"/>
        <text textAnchor="middle" y="9" fontSize="14" fill={LS_PALETTE.ink} fontWeight="700">!</text>
      </g>
      {/* протечка */}
      {status==='q' && (
        <g>
          <path d="M820,140 L820,200" stroke={LS_PALETTE.water} strokeWidth="2" opacity="0.8"/>
          <circle cx="820" cy="205" r="3" fill={LS_PALETTE.water}/>
        </g>
      )}
    </g>
  );
}

// ────────── Логика обхода (стрелка вперёд) ──────────
function chooseNext(level, currentBlock, arch){
  if (!currentBlock) return null;
  // ближайший связанный незаполненный
  const outLinks = arch.links.filter(l => l.from === currentBlock.id);
  for (const l of outLinks){
    const b = arch.blocks.find(b => b.id === l.to);
    if (b && b.status !== 'done') return b;
  }
  // или незаполненный в этом же слое
  const layerBlocks = arch.blocks.filter(b => b.layer === currentBlock.layer && b.id !== currentBlock.id);
  const wip = layerBlocks.find(b => b.status !== 'done');
  if (wip) return wip;
  return null;
}

// ────────── Главный компонент Landscape ──────────
function LandscapeView({ projectId, onSelectBlock, selectedBlockId, project }){
  const [arch, setArch] = useLSState(() => readArch(projectId));
  const [level, setLevel] = useLSState('valley'); // valley | settlement | building
  const [activeLayerId, setActiveLayerId] = useLSState(null);
  const [activeBlockId, setActiveBlockId] = useLSState(null);
  const [zoomKey, setZoomKey] = useLSState(0);

  // pull external selection (e.g. user clicked block in Arch view)
  useLSEffect(() => {
    if (selectedBlockId){
      const b = arch.blocks.find(x => x.id === selectedBlockId);
      if (b){
        setActiveLayerId(b.layer);
        setActiveBlockId(b.id);
      }
    }
  }, [selectedBlockId]);

  // refresh arch on project change / storage change
  useLSEffect(() => {
    setArch(readArch(projectId));
    setLevel('valley');
    setActiveLayerId(null);
    setActiveBlockId(null);
    const onStor = () => setArch(readArch(projectId));
    window.addEventListener('storage', onStor);
    return () => window.removeEventListener('storage', onStor);
  }, [projectId]);

  const layers = arch.layers.map(id => window.ARCH_LAYERS[id]);
  const settlementPositions = useLSMemo(() => SETTLEMENT_POS(layers.length), [layers.length]);

  const goToSettlement = (layerId) => {
    setActiveLayerId(layerId);
    setLevel('settlement');
    setZoomKey(k => k+1);
  };
  const goToBuilding = (block) => {
    setActiveBlockId(block.id);
    setLevel('building');
    setZoomKey(k => k+1);
    if (onSelectBlock) onSelectBlock(block.id);
  };
  const goToConnected = (block) => {
    if (block.layer !== activeLayerId){
      setActiveLayerId(block.layer);
    }
    setActiveBlockId(block.id);
    setZoomKey(k => k+1);
    if (onSelectBlock) onSelectBlock(block.id);
  };
  const upTo = (target) => {
    setLevel(target);
    setZoomKey(k => k+1);
    if (target === 'valley') { setActiveLayerId(null); setActiveBlockId(null); }
    if (target === 'settlement') setActiveBlockId(null);
  };

  // find current block + connections
  const currentBlock = activeBlockId ? arch.blocks.find(b => b.id === activeBlockId) : null;
  const connected = useLSMemo(() => {
    if (!currentBlock) return [];
    const out = arch.links.filter(l => l.from === currentBlock.id)
                  .map(l => ({ block: arch.blocks.find(b => b.id === l.to), type: l.type, dir:'out' }))
                  .filter(d => d.block);
    const inn = arch.links.filter(l => l.to === currentBlock.id)
                  .map(l => ({ block: arch.blocks.find(b => b.id === l.from), type: l.type, dir:'in' }))
                  .filter(d => d.block);
    return [...inn, ...out];
  }, [activeBlockId, arch]);

  const next = chooseNext(level, currentBlock, arch);

  // ─── Render ─────────────────────────────────────────────────────
  const valleyBlocks = arch.blocks;
  const layerToBlocks = {};
  layers.forEach(L => { layerToBlocks[L.id] = arch.blocks.filter(b => b.layer === L.id); });

  // Settlement layout
  const activeLayer = activeLayerId ? window.ARCH_LAYERS[activeLayerId] : null;
  const settlementBlocks = activeLayerId ? layerToBlocks[activeLayerId] : [];
  // for settlement we use ALL blocks (because connections cross layers) but render only this layer's
  const positions = useLSMemo(() => {
    if (!activeLayerId) return {};
    // лёгкая зональная укладка вокруг центра поселения
    const N = settlementBlocks.length;
    const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(N))));
    const positions = {};
    settlementBlocks.forEach((b, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const dx = (col - (cols-1)/2) * 280;
      const dy = (row - (Math.ceil(N/cols)-1)/2) * 200;
      positions[b.id] = { x: 600 + dx, y: 340 + dy, w: 220, h: 160 };
    });
    return positions;
  }, [activeLayerId, settlementBlocks]);

  // Связи в поселении: только те, у кого оба конца в этом слое
  const settlementLinks = activeLayerId ? arch.links.filter(l => {
    const a = arch.blocks.find(b => b.id === l.from);
    const b = arch.blocks.find(b => b.id === l.to);
    return a && b && a.layer === activeLayerId && b.layer === activeLayerId;
  }) : [];

  return (
    <div className="ls-root">
      {/* Хлебные крошки наверху */}
      <div className="ls-crumbs">
        <span className="ls-crumb root" onClick={()=>upTo('valley')}>
          {project.name} · ландшафт
        </span>
        {activeLayerId && (
          <>
            <span className="ls-sep">/</span>
            <span className="ls-crumb" onClick={()=>upTo('settlement')}>
              {window.ARCH_LAYERS[activeLayerId].name}
            </span>
          </>
        )}
        {activeBlockId && currentBlock && (
          <>
            <span className="ls-sep">/</span>
            <span className="ls-crumb on">{currentBlock.title}</span>
          </>
        )}
        <div className="ls-spacer"/>
        {next && (
          <button className="ls-next" onClick={()=>{
            if (level==='valley') goToSettlement(next.layer);
            else if (level==='settlement') goToBuilding(next);
            else goToConnected(next);
          }}>
            <span className="lbl">далее</span>
            <span className="title">{next.title}</span>
            <span className="arr">→</span>
          </button>
        )}
      </div>

      {/* SVG-сцена */}
      <div className="ls-stage">
        <svg viewBox="0 0 1200 620" preserveAspectRatio="xMidYMid meet" key={zoomKey} className="ls-svg">
          <defs>
            <linearGradient id="ls-sky" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={LS_PALETTE.skyTop}/>
              <stop offset="1" stopColor={LS_PALETTE.sky}/>
            </linearGradient>
            <radialGradient id="ls-fog" cx="0.7" cy="0.2" r="0.7">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5"/>
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0"/>
            </radialGradient>
            {/* паттерн дальнего рельефа */}
            <pattern id="ls-grass" width="14" height="8" patternUnits="userSpaceOnUse">
              <rect width="14" height="8" fill={LS_PALETTE.land}/>
              <path d="M3,8 L3,4 M9,8 L9,5" stroke={LS_PALETTE.grassDk} strokeWidth="0.4" opacity="0.4"/>
            </pattern>
          </defs>

          {/* небо + земля + горизонт */}
          {level !== 'building' && (
            <>
              <rect x="0" y="0" width="1200" height="280" fill="url(#ls-sky)"/>
              {/* далёкие горы */}
              <path d="M0,220 L120,165 L240,210 L360,150 L520,200 L680,140 L860,195 L1040,130 L1200,175 L1200,280 L0,280 Z"
                    fill="#D4C9B0" opacity="0.55"/>
              <path d="M0,250 L160,205 L320,240 L500,185 L700,230 L900,170 L1100,215 L1200,195 L1200,300 L0,300 Z"
                    fill="#BFB098" opacity="0.5"/>
              {/* земля */}
              <rect x="0" y="280" width="1200" height="340" fill="url(#ls-grass)"/>
              {/* дальний туман */}
              <rect x="0" y="100" width="1200" height="160" fill="url(#ls-fog)"/>
              {/* река — извилистая */}
              <path d="M-20,375 C200,355 400,410 620,385 C820,355 1000,420 1230,395 L1230,425 C1000,455 820,385 620,415 C400,445 200,385 -20,405 Z"
                    fill={LS_PALETTE.water} opacity="0.55"/>
            </>
          )}

          {/* ── Уровень: ДОЛИНА ─────────────────────────────────── */}
          {level === 'valley' && (
            <g className="ls-fade">
              {/* дороги-эволюции между поселениями */}
              {layers.map((L, i) => {
                if (i === 0) return null;
                const from = settlementPositions[i-1];
                const to = settlementPositions[i];
                return <Road key={'rd'+i} from={from} to={to} type="evolution"/>;
              })}
              {/* поселения */}
              {layers.map((L, i) => {
                const pos = settlementPositions[i];
                const blocks = layerToBlocks[L.id];
                return (
                  <Settlement key={L.id}
                    pos={pos} layer={L} blocks={blocks}
                    label={L.name}
                    onClick={()=>goToSettlement(L.id)}/>
                );
              })}
              {/* подсказка */}
              <text x="600" y="40" textAnchor="middle" fontSize="11"
                    fill={LS_PALETTE.ink2} fontFamily="Newsreader, serif" fontStyle="italic">
                клик по поселению — провал внутрь, к зданиям этого слоя
              </text>
            </g>
          )}

          {/* ── Уровень: ПОСЕЛЕНИЕ ──────────────────────────────── */}
          {level === 'settlement' && activeLayer && (
            <g className="ls-fade">
              {/* центральная площадь — фон */}
              <ellipse cx="600" cy="350" rx="580" ry="170"
                       fill={activeLayer.bg} stroke={LS_PALETTE.ink2} strokeWidth="0.6" opacity="0.85"/>
              {/* "улицы" — крестообразные оси */}
              <line x1="60" y1="350" x2="1140" y2="350" stroke={LS_PALETTE.earth} strokeWidth="14" opacity="0.5"/>
              <line x1="600" y1="100" x2="600" y2="600" stroke={LS_PALETTE.earth} strokeWidth="14" opacity="0.5"/>
              <line x1="60" y1="350" x2="1140" y2="350" stroke={LS_PALETTE.ink2} strokeWidth="0.4" strokeDasharray="3 5" opacity="0.6"/>
              <line x1="600" y1="100" x2="600" y2="600" stroke={LS_PALETTE.ink2} strokeWidth="0.4" strokeDasharray="3 5" opacity="0.6"/>

              {/* связи как трубы/опоры/тропы */}
              {settlementLinks.map((l, i) => {
                const a = positions[l.from], b = positions[l.to];
                if (!a || !b) return null;
                const d = buildingPath(a, b, l.type);
                return <Pipe key={'pp'+i} d={d} type={l.type}/>;
              })}

              {/* здания */}
              {settlementBlocks.map(b => {
                const p = positions[b.id];
                if (!p) return null;
                return (
                  <SettlementBuilding key={b.id} block={b} pos={p}
                    selected={b.id === selectedBlockId}
                    recommended={next && next.id === b.id}
                    onClick={(blk)=>goToBuilding(blk)}/>
                );
              })}

              {/* табличка названия слоя — большая */}
              <g transform="translate(600,80)">
                <rect x="-160" y="-22" width="320" height="38" rx="3"
                      fill={LS_PALETTE.land} stroke={LS_PALETTE.ink} strokeWidth="1"/>
                <text x="0" y="3" textAnchor="middle" fontSize="14"
                      fontFamily="Newsreader, serif"
                      fill={activeLayer.hue} fontWeight="500">{activeLayer.name}</text>
                <text x="0" y="20" textAnchor="middle" fontSize="9"
                      fill={LS_PALETTE.ink2} fontFamily="ui-monospace, monospace">
                  {settlementBlocks.length} зданий · {settlementLinks.length} внутренних связей
                </text>
              </g>
            </g>
          )}

          {/* ── Уровень: ЗДАНИЕ ─────────────────────────────────── */}
          {level === 'building' && currentBlock && (
            <g className="ls-fade">
              <BuildingInterior block={currentBlock} project={project}
                onClose={()=>upTo('settlement')}
                onGoToConnected={goToConnected}
                connected={connected}/>
            </g>
          )}
        </svg>

        {/* кнопка "наверх" */}
        {level !== 'valley' && (
          <button className="ls-up" onClick={()=>upTo(level==='building'?'settlement':'valley')}>
            <Icon name="arrow" size={11}/>
            наверх
          </button>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { LandscapeView });

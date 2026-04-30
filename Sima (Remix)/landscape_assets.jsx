// landscape_assets.jsx — визуальный язык Ландшафта (M-31).
// Палитра, маппинг слоёв→архетипов, SVG-примитивы зданий и связей.
// Не финальная иллюстрация — placeholder-ассеты в едином изометрическом стиле,
// как описано в спецификации, этап 2 «строить каркас на placeholder-ассетах».

const LS_PALETTE = {
  sky:     '#EFE6D2',  // тёплое небо
  skyTop:  '#E8DBBA',  // верх неба
  land:    '#F5F1E8',  // земля
  grass:   '#A8B998',  // растительность
  grassDk: '#7A8C6E',
  water:   '#9BB3C7',
  waterDk: '#6E8AA0',
  stone:   '#A8A39E',  // серый камень
  stoneDk: '#7A746E',
  earth:   '#C9B89A',  // земляные тропы
  ink:     '#29261B',  // линии
  ink2:    '#5C544A',
  shadow:  'rgba(41,38,27,0.18)',
};

// Архетип здания по слою архитектуры.
// (В спеке — по типу кубика; у нас «слой» — ближайший аналог группировки.)
const ARCHETYPE_BY_LAYER = {
  user:    'square',       // площадь, силуэты людей
  front:   'glassFront',   // здание со стеклянным фасадом (UI)
  logic:   'tower',        // каменная башня (core/логика)
  ai:      'workshop',     // мастерская с трубой (агенты)
  data:    'archive',      // длинный амбар
  ext:     'bridge',       // мост / причал (интеграции)
  content: 'archive',      // архив
  market:  'gates',        // ворота наружу
};

// Цвет акцента крыши/вывески по слою — берём из ARCH_LAYERS, мягко
function layerAccent(layerId){
  const L = window.ARCH_LAYERS[layerId];
  return L ? L.hue : LS_PALETTE.ink2;
}

// ─── СВ. примитивы — здания ────────────────────────────────────────────
// Все рисуются в bbox 220×160 (ширина × высота) в собственных координатах.
// Изометрический угол 30°. Возвращают <g> с children. Состояния:
//   filled (готов), wip (с дымом), idea (стройплощадка), q (расхождение).

function bldShadow(){
  return <ellipse cx="110" cy="148" rx="78" ry="9" fill={LS_PALETTE.shadow}/>;
}

// 1. Каменная башня (tower / core)
function BuildingTower({ accent, status }){
  const wireframe = status === 'idea';
  const dim = status === 'idea' ? 0.55 : 1;
  return (
    <g style={{opacity:dim}}>
      {bldShadow()}
      {/* base — изометрический квадрат */}
      <path d="M40,120 L110,140 L180,120 L110,100 Z"
            fill={LS_PALETTE.stone} stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      {/* tower body — три яруса */}
      <path d="M70,115 L110,127 L150,115 L150,55 L110,40 L70,55 Z"
            fill="#BAB5AE" stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      <line x1="70" y1="85" x2="150" y2="85" stroke={LS_PALETTE.ink} strokeWidth="0.6" strokeDasharray={wireframe?'3 2':null}/>
      {/* roof */}
      <path d="M70,55 L110,40 L150,55 L110,15 Z"
            fill={accent} stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      {/* flag */}
      {!wireframe && (
        <>
          <line x1="110" y1="15" x2="110" y2="0" stroke={LS_PALETTE.ink} strokeWidth="0.8"/>
          <path d="M110,2 L122,5 L110,9 Z" fill={accent}/>
        </>
      )}
      {/* windows */}
      {!wireframe && [70, 95].map(y => (
        <g key={y}>
          <rect x="92" y={y-6} width="8" height="10" fill={status==='wip'?'#F2DFB3':'#E8DBBA'} stroke={LS_PALETTE.ink} strokeWidth="0.5"/>
          <rect x="115" y={y-6} width="8" height="10" fill={status==='wip'?'#F2DFB3':'#E8DBBA'} stroke={LS_PALETTE.ink} strokeWidth="0.5"/>
        </g>
      ))}
    </g>
  );
}

// 2. Стеклянный фасад (glassFront / ui)
function BuildingGlass({ accent, status }){
  const wireframe = status === 'idea';
  return (
    <g style={{opacity: wireframe?0.55:1}}>
      {bldShadow()}
      {/* base */}
      <path d="M30,130 L110,150 L190,130 L110,108 Z"
            fill={LS_PALETTE.stone} stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      {/* body */}
      <path d="M50,125 L110,140 L170,125 L170,65 L110,48 L50,65 Z"
            fill="#E5DEC8" stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      {/* big windows — 3 panels на видимом фасаде */}
      {!wireframe && [0,1,2].map(i => (
        <rect key={i} x={60+i*30} y={75} width={22} height={48}
              fill="#C7D8E5" stroke={LS_PALETTE.ink} strokeWidth="0.6" opacity="0.85"/>
      ))}
      {/* awning — accent */}
      <path d="M50,65 L110,48 L170,65 L170,72 L110,55 L50,72 Z"
            fill={accent} stroke={LS_PALETTE.ink} strokeWidth="1"
            strokeDasharray={wireframe?'4 3':null}/>
      {/* roof flat */}
      <path d="M55,52 L110,38 L165,52 L110,30 Z"
            fill="#D6CDB8" stroke={LS_PALETTE.ink} strokeWidth="1"
            strokeDasharray={wireframe?'4 3':null}/>
    </g>
  );
}

// 3. Мастерская с трубой (workshop / agent)
function BuildingWorkshop({ accent, status }){
  const wireframe = status === 'idea';
  return (
    <g style={{opacity: wireframe?0.55:1}}>
      {bldShadow()}
      <path d="M35,128 L110,148 L185,128 L110,108 Z"
            fill={LS_PALETTE.stone} stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      <path d="M55,123 L110,138 L165,123 L165,75 L110,60 L55,75 Z"
            fill="#D8C8AC" stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      {/* roof — pitched */}
      <path d="M50,77 L110,60 L170,77 L110,40 Z"
            fill={accent || '#C89B7B'} stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      {/* chimney */}
      {!wireframe && (
        <>
          <rect x="135" y="40" width="10" height="22" fill={LS_PALETTE.stoneDk} stroke={LS_PALETTE.ink} strokeWidth="0.6"/>
          <rect x="133" y="38" width="14" height="4" fill={LS_PALETTE.stoneDk} stroke={LS_PALETTE.ink} strokeWidth="0.6"/>
          {/* smoke if wip — and yellow if расхождение */}
          {status==='wip' && (
            <g opacity="0.85">
              <circle cx="140" cy="30" r="6" fill={LS_PALETTE.stone}/>
              <circle cx="148" cy="20" r="7" fill={LS_PALETTE.stone}/>
              <circle cx="138" cy="14" r="5" fill={LS_PALETTE.stone}/>
            </g>
          )}
          {status==='q' && (
            <g opacity="0.9">
              <circle cx="140" cy="30" r="6" fill="#E8C77A"/>
              <circle cx="148" cy="20" r="7" fill="#E8C77A"/>
              <circle cx="138" cy="14" r="5" fill="#F2DFB3"/>
            </g>
          )}
        </>
      )}
      {/* door */}
      {!wireframe && <rect x="100" y="100" width="20" height="30" fill={LS_PALETTE.ink2} stroke={LS_PALETTE.ink} strokeWidth="0.6"/>}
      {/* window */}
      {!wireframe && <rect x="70" y="92" width="18" height="18" fill="#E8DBBA" stroke={LS_PALETTE.ink} strokeWidth="0.5"/>}
    </g>
  );
}

// 4. Архив / амбар (archive / content+data)
function BuildingArchive({ accent, status }){
  const wireframe = status === 'idea';
  return (
    <g style={{opacity: wireframe?0.55:1}}>
      {bldShadow()}
      <path d="M20,128 L110,148 L200,128 L110,108 Z"
            fill={LS_PALETTE.stone} stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      {/* long body */}
      <path d="M40,123 L110,138 L180,123 L180,80 L110,62 L40,80 Z"
            fill="#E0D2B0" stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      {/* repeating doors — мульти-двери как у амбара */}
      {!wireframe && [0,1,2,3,4].map(i => (
        <rect key={i} x={50+i*22} y="98" width={14} height={26}
              fill={LS_PALETTE.ink2} stroke={LS_PALETTE.ink} strokeWidth="0.4"/>
      ))}
      {/* roof — long pitched */}
      <path d="M35,82 L110,62 L185,82 L110,40 Z"
            fill={accent || '#A8835A'} stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      <line x1="110" y1="40" x2="110" y2="62" stroke={LS_PALETTE.ink} strokeWidth="0.5" strokeDasharray="2 2"/>
    </g>
  );
}

// 5. Мост / причал (bridge / integration)
function BuildingBridge({ accent, status }){
  const wireframe = status === 'idea';
  return (
    <g style={{opacity: wireframe?0.55:1}}>
      {bldShadow()}
      {/* water under */}
      <ellipse cx="110" cy="135" rx="90" ry="14" fill={LS_PALETTE.water} opacity="0.7"/>
      <path d="M30,135 Q110,148 190,135" fill="none" stroke={LS_PALETTE.waterDk} strokeWidth="0.6" opacity="0.6"/>
      {/* bridge deck */}
      <path d="M20,90 L200,90 L210,100 L10,100 Z"
            fill={LS_PALETTE.stone} stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      {/* arches */}
      {!wireframe && [0,1,2].map(i => (
        <path key={i} d={`M${30+i*60},100 Q${60+i*60},135 ${90+i*60},100`}
              fill="none" stroke={LS_PALETTE.ink} strokeWidth="1"/>
      ))}
      {/* rails */}
      {!wireframe && (
        <>
          <line x1="20" y1="90" x2="200" y2="90" stroke={LS_PALETTE.ink} strokeWidth="0.6"/>
          <line x1="20" y1="82" x2="200" y2="82" stroke={accent} strokeWidth="1.2"/>
          {[0,1,2,3,4,5].map(i => (
            <line key={i} x1={30+i*30} y1="82" x2={30+i*30} y2="90" stroke={LS_PALETTE.ink} strokeWidth="0.4"/>
          ))}
        </>
      )}
    </g>
  );
}

// 6. Обсерватория с куполом (research) — пока не используется в этом маппинге,
// но оставим для будущего расширения по типу кубика.
function BuildingDome({ accent, status }){
  const wireframe = status === 'idea';
  return (
    <g style={{opacity: wireframe?0.55:1}}>
      {bldShadow()}
      <path d="M40,128 L110,148 L180,128 L110,108 Z"
            fill={LS_PALETTE.stone} stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      <path d="M60,123 L110,138 L160,123 L160,75 L110,60 L60,75 Z"
            fill="#D8CFB8" stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      {/* dome */}
      <path d="M70,75 Q110,30 150,75 Z" fill={accent || '#B49A6F'} stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      {!wireframe && <line x1="110" y1="35" x2="110" y2="22" stroke={LS_PALETTE.ink} strokeWidth="0.8"/>}
      {!wireframe && <circle cx="110" cy="20" r="2.5" fill={LS_PALETTE.ink}/>}
    </g>
  );
}

// 7. Городские ворота / арка (gates / output, market)
function BuildingGates({ accent, status }){
  const wireframe = status === 'idea';
  return (
    <g style={{opacity: wireframe?0.55:1}}>
      {bldShadow()}
      <path d="M30,128 L110,148 L190,128 L110,108 Z"
            fill={LS_PALETTE.stone} stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      {/* two towers */}
      <path d="M45,123 L70,130 L70,55 L45,48 Z" fill="#BAB5AE" stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      <path d="M150,130 L175,123 L175,48 L150,55 Z" fill="#BAB5AE" stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      {/* arch beam */}
      <path d="M70,75 L150,75 L150,55 L70,55 Z" fill={accent || '#B07358'} stroke={LS_PALETTE.ink} strokeWidth="1.2"
            strokeDasharray={wireframe?'4 3':null}/>
      {/* gateway opening */}
      {!wireframe && (
        <path d="M85,140 L85,90 Q110,72 135,90 L135,140 Z"
              fill={LS_PALETTE.land} stroke={LS_PALETTE.ink} strokeWidth="1"/>
      )}
      {/* tower roofs */}
      {!wireframe && (
        <>
          <path d="M45,48 L57,38 L70,48 Z" fill={accent} stroke={LS_PALETTE.ink} strokeWidth="0.8"/>
          <path d="M150,48 L162,38 L175,48 Z" fill={accent} stroke={LS_PALETTE.ink} strokeWidth="0.8"/>
        </>
      )}
    </g>
  );
}

// Площадь / силуэты людей (для слоя user — не здание)
function BuildingSquare({ accent, status }){
  return (
    <g>
      {bldShadow()}
      {/* paved ground */}
      <path d="M30,128 L110,148 L190,128 L110,108 Z"
            fill="#E0D6BC" stroke={LS_PALETTE.ink} strokeWidth="1"/>
      {/* fountain */}
      <ellipse cx="110" cy="120" rx="22" ry="6" fill={LS_PALETTE.water} stroke={LS_PALETTE.ink} strokeWidth="0.6"/>
      <ellipse cx="110" cy="116" rx="6" ry="2" fill={LS_PALETTE.waterDk}/>
      {/* people silhouettes */}
      {[
        {x:60, y:120}, {x:78, y:130}, {x:148, y:128}, {x:165, y:118}
      ].map((p,i) => (
        <g key={i} transform={`translate(${p.x},${p.y})`}>
          <circle cx="0" cy="-12" r="3" fill={LS_PALETTE.ink2}/>
          <path d="M-4,-9 L-4,2 L4,2 L4,-9" fill={i%2?accent:LS_PALETTE.ink2}/>
        </g>
      ))}
    </g>
  );
}

// Map of archetype → component
const BUILDINGS = {
  tower:      BuildingTower,
  glassFront: BuildingGlass,
  workshop:   BuildingWorkshop,
  archive:    BuildingArchive,
  bridge:     BuildingBridge,
  dome:       BuildingDome,
  gates:      BuildingGates,
  square:     BuildingSquare,
};

function getBuildingComponent(layerId){
  const arche = ARCHETYPE_BY_LAYER[layerId] || 'tower';
  return BUILDINGS[arche] || BuildingTower;
}

// Маленькая иконка-силуэт здания для уровня «Долина» (упрощённый pictogram)
function BuildingPicto({ layerId, count, accent }){
  const arche = ARCHETYPE_BY_LAYER[layerId];
  // компактные силуэты 24×30
  const fill = LS_PALETTE.stone;
  const A = accent || layerAccent(layerId);
  switch(arche){
    case 'tower':
      return (<g><rect x="-6" y="-22" width="12" height="22" fill={fill} stroke={LS_PALETTE.ink} strokeWidth="0.6"/><path d="M-7,-22 L0,-30 L7,-22 Z" fill={A} stroke={LS_PALETTE.ink} strokeWidth="0.6"/></g>);
    case 'glassFront':
      return (<g><rect x="-9" y="-16" width="18" height="16" fill="#C7D8E5" stroke={LS_PALETTE.ink} strokeWidth="0.6"/><rect x="-9" y="-19" width="18" height="3" fill={A} stroke={LS_PALETTE.ink} strokeWidth="0.4"/></g>);
    case 'workshop':
      return (<g><rect x="-8" y="-16" width="16" height="16" fill={fill} stroke={LS_PALETTE.ink} strokeWidth="0.6"/><path d="M-9,-16 L0,-24 L9,-16 Z" fill={A} stroke={LS_PALETTE.ink} strokeWidth="0.6"/><rect x="3" y="-26" width="3" height="6" fill={LS_PALETTE.stoneDk}/></g>);
    case 'archive':
      return (<g><rect x="-12" y="-14" width="24" height="14" fill={fill} stroke={LS_PALETTE.ink} strokeWidth="0.6"/><path d="M-13,-14 L0,-22 L13,-14 Z" fill={A} stroke={LS_PALETTE.ink} strokeWidth="0.6"/></g>);
    case 'bridge':
      return (<g><path d="M-14,0 L14,0 L14,-4 L-14,-4 Z" fill={fill} stroke={LS_PALETTE.ink} strokeWidth="0.6"/><path d="M-12,0 Q0,-10 12,0" fill="none" stroke={LS_PALETTE.ink} strokeWidth="0.5"/></g>);
    case 'gates':
      return (<g><rect x="-10" y="-18" width="6" height="18" fill={fill} stroke={LS_PALETTE.ink} strokeWidth="0.6"/><rect x="4" y="-18" width="6" height="18" fill={fill} stroke={LS_PALETTE.ink} strokeWidth="0.6"/><rect x="-10" y="-22" width="20" height="6" fill={A} stroke={LS_PALETTE.ink} strokeWidth="0.6"/></g>);
    case 'square':
      return (<g><circle cx="0" cy="-6" r="6" fill={fill} stroke={LS_PALETTE.ink} strokeWidth="0.6"/><circle cx="0" cy="-6" r="2" fill={A}/></g>);
    default:
      return (<g><rect x="-6" y="-16" width="12" height="16" fill={fill} stroke={LS_PALETTE.ink} strokeWidth="0.6"/></g>);
  }
}

Object.assign(window, {
  LS_PALETTE, ARCHETYPE_BY_LAYER, layerAccent,
  BUILDINGS, getBuildingComponent, BuildingPicto,
});

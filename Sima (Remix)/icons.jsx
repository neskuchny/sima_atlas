// icons.jsx — simple stroke icon set
const Icon = ({ name, size = 14, stroke = 1.2, color = 'currentColor' }) => {
  const p = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: color, strokeWidth: stroke, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'schema': return <svg {...p}><rect x="1.5" y="2" width="13" height="3" rx="0.5"/><rect x="1.5" y="6.5" width="13" height="3" rx="0.5"/><rect x="1.5" y="11" width="13" height="3" rx="0.5"/></svg>;
    case 'graph': return <svg {...p}><circle cx="3" cy="8" r="2"/><circle cx="12" cy="3.5" r="1.6"/><circle cx="12" cy="12.5" r="1.6"/><line x1="4.8" y1="7" x2="10.4" y2="4.2"/><line x1="4.8" y1="9" x2="10.4" y2="11.8"/></svg>;
    case 'library': return <svg {...p}><rect x="1.5" y="2" width="3" height="12" rx="0.5"/><rect x="5.5" y="2" width="3" height="12" rx="0.5"/><rect x="9.8" y="3.2" width="3" height="10.8" rx="0.5" transform="rotate(-10 11.3 8.6)"/></svg>;
    case 'compose': return <svg {...p}><rect x="1.5" y="1.5" width="5" height="5" rx="0.5"/><rect x="9.5" y="1.5" width="5" height="5" rx="0.5"/><rect x="5.5" y="9.5" width="5" height="5" rx="0.5"/><line x1="4" y1="6.5" x2="7" y2="9.5"/><line x1="12" y1="6.5" x2="9" y2="9.5"/></svg>;
    case 'plus': return <svg {...p}><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>;
    case 'search': return <svg {...p}><circle cx="7" cy="7" r="4.5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/></svg>;
    case 'mic': return <svg {...p}><rect x="6" y="2" width="4" height="7" rx="2"/><path d="M3.5 8.5a4.5 4.5 0 0 0 9 0"/><line x1="8" y1="13" x2="8" y2="15"/></svg>;
    case 'upload': return <svg {...p}><path d="M8 10V2M5 5l3-3 3 3"/><path d="M2.5 12v1a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1v-1"/></svg>;
    case 'text': return <svg {...p}><path d="M3 4h10M8 4v10M5 14h6"/></svg>;
    case 'meet': return <svg {...p}><rect x="1.5" y="4" width="9" height="8" rx="1"/><path d="M10.5 7l4-2v6l-4-2"/></svg>;
    case 'link': return <svg {...p}><path d="M7 5H4a3 3 0 0 0 0 6h3M9 11h3a3 3 0 0 0 0-6H9M6 8h4"/></svg>;
    case 'sparkle': return <svg {...p}><path d="M8 2v4M8 10v4M2 8h4M10 8h4"/><path d="M4.5 4.5l1.5 1.5M10 10l1.5 1.5M4.5 11.5L6 10M10 6l1.5-1.5"/></svg>;
    case 'close': return <svg {...p}><line x1="3.5" y1="3.5" x2="12.5" y2="12.5"/><line x1="12.5" y1="3.5" x2="3.5" y2="12.5"/></svg>;
    case 'tweak': return <svg {...p}><circle cx="4" cy="4" r="1.5"/><line x1="5.5" y1="4" x2="14" y2="4"/><circle cx="11" cy="8" r="1.5"/><line x1="2" y1="8" x2="9.5" y2="8"/><circle cx="6" cy="12" r="1.5"/><line x1="7.5" y1="12" x2="14" y2="12"/></svg>;
    case 'dots': return <svg {...p}><circle cx="4" cy="8" r="0.8" fill="currentColor"/><circle cx="8" cy="8" r="0.8" fill="currentColor"/><circle cx="12" cy="8" r="0.8" fill="currentColor"/></svg>;
    case 'filter': return <svg {...p}><path d="M2 3h12l-4.5 6v4l-3 1.5V9L2 3z"/></svg>;
    case 'focus': return <svg {...p}><path d="M2 4V2h2M14 4V2h-2M2 12v2h2M14 12v2h-2"/><rect x="5" y="5" width="6" height="6" rx="0.5"/></svg>;
    case 'split': return <svg {...p}><rect x="1.5" y="2" width="13" height="12" rx="0.5"/><line x1="8" y1="2" x2="8" y2="14"/></svg>;
    case 'check': return <svg {...p}><path d="M3 8.5L6.5 12l7-8"/></svg>;
    case 'warn': return <svg {...p}><path d="M8 2l6.5 11h-13L8 2z"/><line x1="8" y1="6.5" x2="8" y2="9.5"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor"/></svg>;
    case 'arrow': return <svg {...p}><line x1="3" y1="8" x2="13" y2="8"/><path d="M10 5l3 3-3 3"/></svg>;
    case 'grid': return <svg {...p}><rect x="2.5" y="2.5" width="4.5" height="4.5"/><rect x="9" y="2.5" width="4.5" height="4.5"/><rect x="2.5" y="9" width="4.5" height="4.5"/><rect x="9" y="9" width="4.5" height="4.5"/></svg>;
    case 'expand': return <svg {...p}><path d="M3 3h4M3 3v4M13 13h-4M13 13v-4M3 13v-4M3 13h4M13 3h-4M13 3v4"/></svg>;
    case 'layers': return <svg {...p}><path d="M8 2L2 5l6 3 6-3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3"/></svg>;
    case 'cursor': return <svg {...p}><path d="M3 2l5 13 2-5 5-2L3 2z"/></svg>;
    case 'comment': return <svg {...p}><path d="M2 4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-3 3v-3H3a1 1 0 0 1-1-1V4z"/></svg>;
    case 'note': return <svg {...p}><rect x="2.5" y="3" width="11" height="10" rx="0.5"/><line x1="5" y1="6" x2="11" y2="6"/><line x1="5" y1="8.5" x2="11" y2="8.5"/><line x1="5" y1="11" x2="9" y2="11"/></svg>;
    case 'lasso': return <svg {...p}><rect x="2.5" y="3" width="11" height="10" rx="1" strokeDasharray="2 2"/></svg>;
    case 'pen': return <svg {...p}><path d="M3 13l8-8 2 2-8 8H3v-2z"/><path d="M9 5l2 2"/></svg>;
    case 'arrow-tool': return <svg {...p}><line x1="3" y1="13" x2="12" y2="4"/><path d="M7 4h5v5"/></svg>;
    case 'trash': return <svg {...p}><path d="M4 5h8M6 5V3h4v2M5 5v9a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1V5"/></svg>;
    case 'download': return <svg {...p}><path d="M8 2v9M4.5 7.5L8 11l3.5-3.5"/><line x1="3" y1="13.5" x2="13" y2="13.5"/></svg>;
    default: return null;
  }
};
window.Icon = Icon;

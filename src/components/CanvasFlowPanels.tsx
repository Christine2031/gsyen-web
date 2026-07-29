import { Panel, useReactFlow } from '@xyflow/react';

/* ── Zoom / fit controls (top-right) ── */
export function CanvasRightControls({ dark }: { dark: boolean }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const bg = dark ? 'rgba(32,34,38,0.94)' : '#F8FAFD';
  const hoverBg = dark ? 'rgba(38,41,46,0.96)' : '#FCFDFF';
  const activeBg = dark ? 'rgba(43,48,58,0.96)' : '#F2F5FA';
  const bdr = dark ? 'rgba(255,255,255,0.10)' : '#DCE3EE';
  const hoverBdr = dark ? 'rgba(255,255,255,0.14)' : '#D2DAE7';
  const activeBdr = dark ? 'rgba(136,152,190,0.34)' : '#B9C3D9';
  const ic = dark ? '#B6BEC9' : '#46515E';
  const shadow = dark
    ? '0 1px 2px rgba(0,0,0,0.22), 0 6px 13px rgba(0,0,0,0.16)'
    : '0 1px 2px rgba(43,52,66,0.06), 0 6px 13px rgba(107,118,137,0.08)';
  const activeShadow = dark
    ? '0 1px 2px rgba(0,0,0,0.18), 0 5px 10px rgba(0,0,0,0.14)'
    : '0 1px 1px rgba(79,95,138,0.06), 0 5px 10px rgba(112,130,180,0.09)';

  const setButtonLook = (el: HTMLButtonElement, state: 'idle' | 'hover' | 'active') => {
    el.style.background = state === 'active' ? activeBg : state === 'hover' ? hoverBg : bg;
    el.style.borderColor = state === 'active' ? activeBdr : state === 'hover' ? hoverBdr : bdr;
    el.style.boxShadow = state === 'active' ? activeShadow : shadow;
  };

  const btn = (onClick: () => void, title: string, svg: React.ReactNode) => (
    <button title={title} onClick={onClick}
      onMouseEnter={e => setButtonLook(e.currentTarget, document.activeElement === e.currentTarget ? 'active' : 'hover')}
      onMouseLeave={e => setButtonLook(e.currentTarget, document.activeElement === e.currentTarget ? 'active' : 'idle')}
      onFocus={e => setButtonLook(e.currentTarget, 'active')}
      onBlur={e => setButtonLook(e.currentTarget, 'idle')}
      style={{
        width: 38, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bg, border: `1px solid ${bdr}`, borderRadius: 7, cursor: 'pointer',
        boxShadow: shadow, color: ic, outline: 'none', position: 'relative', zIndex: 1,
        transition: 'background 0.12s ease, border-color 0.12s ease, box-shadow 0.12s ease, transform 0.08s ease',
      }}>{svg}</button>
  );

  return (
    <Panel position="top-right" style={{ margin: '52px 14px 0 0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            inset: '-8px -5px auto -5px',
            height: 144,
            borderRadius: 15,
            background: dark ? 'rgba(255,255,255,0.04)' : '#EEF1F7',
            opacity: dark ? 0.22 : 0.28,
            pointerEvents: 'none',
          }}
        />
        {btn(() => zoomIn({ duration: 200 }), 'Zoom In',
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="4.5" x2="12" y2="19.5" vectorEffect="non-scaling-stroke"/>
            <line x1="4.5" y1="12" x2="19.5" y2="12" vectorEffect="non-scaling-stroke"/>
          </svg>)}
        {btn(() => fitView({ duration: 300, padding: 0.15 }), 'Fit View',
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none">
            <path
              d="M4.5 10V4.5H10M14 4.5H19.5V10M19.5 14V19.5H14M10 19.5H4.5V14"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle cx="12" cy="12" r="1.35" fill="currentColor" opacity="0.78"/>
          </svg>)}
        {btn(() => zoomOut({ duration: 200 }), 'Zoom Out',
          <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4.5" y1="12" x2="19.5" y2="12" vectorEffect="non-scaling-stroke"/>
          </svg>)}
      </div>
    </Panel>
  );
}

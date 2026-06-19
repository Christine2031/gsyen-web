import { memo } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import type { BoxData, ModuleColor } from './CanvasCardData';
import { MODULE_COLORS } from './CanvasCardData';

const SIDES = [
  { pos: Position.Top, id: 't' }, { pos: Position.Right, id: 'r' },
  { pos: Position.Bottom, id: 'b' }, { pos: Position.Left, id: 'l' },
];

const MODULE_ICONS: Record<ModuleColor, React.ReactNode> = {
  purple: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2l1.5 1.5L4.5 10H3v-1.5L9.5 2z"/>
    </svg>
  ),
  blue: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 2.5h9a.5.5 0 01.5.5v5a.5.5 0 01-.5.5H7L4 11V8.5H2a.5.5 0 01-.5-.5V3a.5.5 0 01.5-.5z"/>
    </svg>
  ),
  green: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <circle cx="6.5" cy="4" r="2"/><path d="M2 11.5c0-2.5 2-4.5 4.5-4.5s4.5 2 4.5 4.5"/>
    </svg>
  ),
  amber: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="1.5" y="2" width="10" height="9.5" rx="1"/><line x1="1.5" y1="5.5" x2="11.5" y2="5.5"/><line x1="4.5" y1="1" x2="4.5" y2="3"/><line x1="8.5" y1="1" x2="8.5" y2="3"/>
    </svg>
  ),
  red: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <path d="M3 2h7a1 1 0 011 1v8.5a.5.5 0 01-.5.5H2.5a.5.5 0 01-.5-.5V3a1 1 0 011-1zm1.5 3.5h4m-4 2h4m-4 2h2"/>
    </svg>
  ),
  teal: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <rect x="1.5" y="2" width="10" height="3" rx="1"/><rect x="1.5" y="7" width="10" height="3" rx="1"/>
    </svg>
  ),
};

/* Resize grip dots */
function GripDots() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="rgba(0,0,0,0.2)" style={{ position: 'absolute', bottom: 4, right: 4, pointerEvents: 'none' }}>
      {[0, 4, 8].flatMap(x => [0, 4, 8].map(y => <circle key={`${x}${y}`} cx={x + 1} cy={y + 1} r="1" />))}
    </svg>
  );
}

export const CanvasBox = memo(({ id, data, selected }: NodeProps) => {
  const d = data as BoxData;
  const { updateNodeData } = useReactFlow();
  const mc = d.moduleColor ?? ('purple' as ModuleColor);
  const color = MODULE_COLORS[mc];
  const toggle = () => updateNodeData(id, { collapsed: !d.collapsed });

  const handles = (
    <>
      {SIDES.map(({ pos, id: hid }) => (
        <Handle key={hid} id={`src-${hid}`} type="source" position={pos}
          style={{ opacity: 0, width: 8, height: 8, background: '#4A9EFF', border: '1.5px solid #fff', transition: 'opacity 0.12s' }} />
      ))}
      {SIDES.map(({ pos, id: hid }) => (
        <Handle key={`t-${hid}`} id={`tgt-${hid}`} type="target" position={pos}
          style={{ opacity: 0, width: 14, height: 14 }} />
      ))}
    </>
  );

  /* ── Collapsed: L1 chip ── */
  if (d.collapsed) {
    return (
      <div style={{ position: 'relative', display: 'inline-flex' }}>
        <div className="nodrag" onClick={toggle} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          height: 30, padding: '0 10px 0 8px', borderRadius: 15,
          border: `1.5px solid ${color.border}`,
          background: color.chipBg,
          cursor: 'pointer',
          outline: selected ? '2px solid rgba(74,158,255,0.45)' : 'none',
          outlineOffset: 2,
        }}>
          <span style={{ color: color.fg, display: 'flex', alignItems: 'center' }}>
            {MODULE_ICONS[mc]}
          </span>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: color.fg, whiteSpace: 'nowrap' }}>
            {d.label}
          </span>
          {d.childCount != null && (
            <span style={{
              fontSize: 9, fontFamily: 'ui-monospace,monospace', fontWeight: 700,
              padding: '1px 5px', borderRadius: 3,
              background: color.countBg, color: color.fg,
            }}>
              {d.childCount}
            </span>
          )}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke={color.fg} strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.5 }}>
            <path d="M2 4l3 3 3-3"/>
          </svg>
        </div>
        {handles}
      </div>
    );
  }

  /* ── Expanded: spatial container ── */
  return (
    <div style={{ position: 'relative', minWidth: 260, minHeight: 170 }}>
      <div style={{
        border: `1.5px solid ${color.border}`,
        borderRadius: 8,
        background: color.bg,
        height: '100%',
        outline: selected ? '2px solid rgba(74,158,255,0.45)' : 'none',
        outlineOffset: 2,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div className="nodrag" onClick={toggle} style={{
          display: 'flex', alignItems: 'center', gap: 7,
          height: 36, padding: '0 11px',
          background: color.header,
          borderBottom: `1px solid ${color.border}`,
          cursor: 'pointer', userSelect: 'none',
        }}>
          <span style={{ color: color.fg, display: 'flex', alignItems: 'center' }}>
            {MODULE_ICONS[mc]}
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: color.fg, flex: 1 }}>
            {d.label}
          </span>
          {d.childCount != null && (
            <span style={{
              fontSize: 9, fontFamily: 'ui-monospace,monospace', fontWeight: 700,
              padding: '1px 6px', borderRadius: 3,
              background: color.countBg, color: color.fg,
            }}>
              {d.childCount}
            </span>
          )}
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke={color.fg} strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.5 }}>
            <path d="M2 4l3.5 3.5L9 4"/>
          </svg>
        </div>
        {/* Body: cards float freely inside this region */}
        <div style={{ minHeight: 130 }} />
      </div>
      <GripDots />
      {handles}
    </div>
  );
});

CanvasBox.displayName = 'CanvasBox';

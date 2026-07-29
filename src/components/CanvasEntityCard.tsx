import { memo } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { CardData, CardSize, EntityType, StatusColor } from './CanvasCardData';
import { STATUS_COLORS } from './CanvasCardData';

const SIZE_W: Record<CardSize, number> = { S: 200, M: 280, L: 360 };

const ENTITY_LABEL: Record<EntityType, string> = {
  contact: '联系人', order: '订单', task: '任务',
  schedule: '日程', file: '文件', custom: '自定义',
};

const STATUS_DOT: Record<StatusColor, string> = {
  green: '#22C55E', amber: '#F59E0B', yellow: '#EAB308', red: '#EF4444', gray: '#D1D5DB',
};

const ENTITY_PATH: Record<EntityType, string> = {
  contact:  'M6 2.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM2 12c0-2.2 1.8-4 4-4s4 1.8 4 4',
  order:    'M3 1.5h6a1 1 0 011 1v9a1 1 0 01-1 1H3a1 1 0 01-1-1v-9a1 1 0 011-1zm1.5 3h3M4.5 7h3M4.5 9.5h2',
  task:     'M2 2h8a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1zm1.5 5l1.5 1.5 3-3',
  schedule: 'M1.5 3h9a1 1 0 011 1v7a1 1 0 01-1 1h-9a1 1 0 01-1-1V4a1 1 0 011-1zm0 3h9M4 1.5v2M8 1.5v2',
  file:     'M3 1h5l3 3v8.5a.5.5 0 01-.5.5H3a.5.5 0 01-.5-.5V1.5A.5.5 0 013 1zm5 0v3h3',
  custom:   'M2 2h8a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1z',
};

function EntityIcon({ type }: { type: EntityType }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 14" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={ENTITY_PATH[type]} />
    </svg>
  );
}

const SIDES = [
  { pos: Position.Top, id: 't' }, { pos: Position.Right, id: 'r' },
  { pos: Position.Bottom, id: 'b' }, { pos: Position.Left, id: 'l' },
];

const tbBtn: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center',
  justifyContent: 'center', background: 'transparent', border: 'none',
  borderRadius: 6, cursor: 'pointer',
};

export interface EntityCardProps { id: string; data: CardData; selected: boolean }

export const CanvasEntityCard = memo(({ id, data: d, selected }: EntityCardProps) => {
  const { deleteElements, fitView } = useReactFlow();
  const sz: CardSize = d.cardSize ?? 'S';
  const sc  = (d.statusColor ?? 'gray') as StatusColor;
  const et  = (d.entityType  ?? 'custom') as EntityType;
  const bc  = selected ? '#4A9EFF' : 'rgba(0,0,0,0.09)';
  const bw  = selected ? '1.5px' : '1px';
  const sc2 = STATUS_COLORS[sc];

  return (
    <div style={{ position: 'relative' }}>

      {/* Toolbar */}
      {selected && (
        <div className="nodrag nopan" style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 2,
          background: 'var(--cn-bg)', borderRadius: 8, padding: '3px 5px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)', border: '0.5px solid var(--cn-border)',
          zIndex: 10,
        }}>
          <button style={tbBtn} title="Delete"
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => deleteElements({ nodes: [{ id }] })}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--cn-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h9M4.5 3V2a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M5 5.5v4M8 5.5v4M2.5 3l.65 7.5a.5.5 0 00.5.5h5.7a.5.5 0 00.5-.5L10.5 3"/>
            </svg>
          </button>
          <button style={tbBtn} title="Focus"
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => fitView({ nodes: [{ id }], duration: 350, padding: 0.35 })}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--cn-dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1.5 4.5V2h2.5M8.5 2H11v2.5M11 8.5V11H8.5M4 11H1.5V8.5"/>
            </svg>
          </button>
        </div>
      )}

      {/* Card */}
      <div style={{
        background: '#FFFFFF', color: 'var(--cn-fg)',
        border: `${bw} solid ${bc}`, borderRadius: 8,
        width: SIZE_W[sz],
        boxShadow: selected
          ? '0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.06)'
          : '0 1px 6px rgba(0,0,0,0.07), 0 0.5px 2px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.15s',
        overflow: 'hidden',
      }}>

        {/* ── HEAD ── type row + name + sub */}
        <div style={{ padding: '10px 13px 9px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 10, fontFamily: 'ui-monospace,monospace', fontWeight: 600,
              letterSpacing: '.05em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.36)',
            }}>
              <EntityIcon type={et} />
              {ENTITY_LABEL[et]}
            </div>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: STATUS_DOT[sc],
              boxShadow: `0 0 0 2px ${STATUS_DOT[sc]}30`,
            }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1A1A1A', lineHeight: 1.25, marginBottom: 2 }}>
            {d.entityName || '未命名'}
          </div>
          {d.entitySub && (
            <div style={{ fontSize: 11.5, color: 'rgba(0,0,0,0.42)', lineHeight: 1.4 }}>
              {d.entitySub}
            </div>
          )}
        </div>

        {/* ── BODY ── status + message */}
        {(d.status || d.statusNote || d.lastMessage) && (
          <div style={{ borderTop: '0.5px solid rgba(0,0,0,0.07)', padding: '8px 13px' }}>
            {(d.status || d.statusNote) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: d.lastMessage ? 7 : 0 }}>
                {d.status && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, fontFamily: 'ui-monospace,monospace',
                    letterSpacing: '.03em', padding: '2px 8px', borderRadius: 4,
                    background: sc2.bg, color: sc2.fg, whiteSpace: 'nowrap',
                  }}>
                    {d.status}
                  </span>
                )}
                {d.statusNote && (
                  <span style={{ fontSize: 11.5, color: 'rgba(0,0,0,0.45)' }}>
                    {d.statusNote}
                  </span>
                )}
              </div>
            )}
            {d.lastMessage && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5 }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="rgba(0,0,0,0.28)"
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: 1, flexShrink: 0 }}>
                  <path d="M1.5 2h9a.5.5 0 01.5.5v5.5a.5.5 0 01-.5.5H6.5L4 10.5V8.5H1.5a.5.5 0 01-.5-.5V2.5a.5.5 0 01.5-.5z"/>
                </svg>
                <span style={{
                  fontSize: 11.5, color: 'rgba(0,0,0,0.52)', lineHeight: 1.45,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220,
                }}>
                  "{d.lastMessage}"
                </span>
              </div>
            )}
          </div>
        )}

        {/* ── FOOT ── connections + timestamp */}
        <div style={{
          borderTop: '0.5px solid rgba(0,0,0,0.07)', padding: '6px 13px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontFamily: 'ui-monospace,monospace', color: 'rgba(0,0,0,0.35)' }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="3" cy="6" r="1.5"/><circle cx="9" cy="3" r="1.5"/><circle cx="9" cy="9" r="1.5"/>
              <path d="M4.5 5.3L7.5 3.7M4.5 6.7L7.5 8.3"/>
            </svg>
            {d.connectionCount ?? 0} 连接
          </div>
          {d.timestamp && (
            <div style={{ fontSize: 10, fontFamily: 'ui-monospace,monospace', color: 'rgba(0,0,0,0.22)' }}>
              {d.timestamp}
            </div>
          )}
        </div>
      </div>

      {/* Handles */}
      {SIDES.map(({ pos, id: hid }) => (
        <Handle key={hid} id={`src-${hid}`} type="source" position={pos}
          style={{ opacity: 0, width: 8, height: 8, background: '#4A9EFF', border: '1.5px solid #fff', transition: 'opacity 0.12s' }} />
      ))}
      {SIDES.map(({ pos, id: hid }) => (
        <Handle key={`t-${hid}`} id={`tgt-${hid}`} type="target" position={pos}
          style={{ opacity: 0, width: 14, height: 14 }} />
      ))}
    </div>
  );
});

CanvasEntityCard.displayName = 'CanvasEntityCard';

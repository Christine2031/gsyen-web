import { memo } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import type { CardData, EntityType, StatusColor } from './CanvasCardData';
import { STATUS_COLORS } from './CanvasCardData';

const ENTITY_LABEL: Record<EntityType, string> = {
  contact: '联系人', order: '订单', task: '任务',
  schedule: '日程', file: '文件', custom: '自定义',
};

const STATUS_DOT: Record<StatusColor, string> = {
  green: '#22C55E', amber: '#F59E0B', red: '#EF4444', gray: '#9CA3AF',
};

function EntityIcon({ type }: { type: EntityType }) {
  const d: Record<EntityType, string> = {
    contact:  'M6 3a2.5 2.5 0 100 5 2.5 2.5 0 000-5zM2 12.5c0-2.5 1.8-4 4-4s4 1.5 4 4',
    order:    'M3 2h6a1 1 0 011 1v8.5a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1zm1.5 3h3M4.5 7h3M4.5 9h2',
    task:     'M2 2h8a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1zm1.5 5l1.5 1.5 2.5-2.5',
    schedule: 'M1.5 3h9a1 1 0 011 1v7a1 1 0 01-1 1h-9a1 1 0 01-1-1V4a1 1 0 011-1zm0 3h9M4 1.5v2M8 1.5v2',
    file:     'M3 1h4.5l3 3v8.5a.5.5 0 01-.5.5H3a.5.5 0 01-.5-.5v-11A.5.5 0 013 1zm4.5 0v3h3',
    custom:   'M2 2h8a1 1 0 011 1v8a1 1 0 01-1 1H2a1 1 0 01-1-1V3a1 1 0 011-1z',
  };
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor"
      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d={d[type]} />
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
  const sc = (d.statusColor ?? 'gray') as StatusColor;
  const et = (d.entityType ?? 'custom') as EntityType;
  const bc = selected ? '#4A9EFF' : 'rgba(0,0,0,0.09)';
  const bw = selected ? '1.5px' : '1px';

  return (
    <div style={{ position: 'relative' }}>

      {/* Toolbar */}
      {selected && (
        <div className="nodrag nopan" style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 2,
          background: 'var(--cn-bg)', borderRadius: 8, padding: '3px 5px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12)', border: '0.5px solid var(--cn-border)',
          zIndex: 10, whiteSpace: 'nowrap',
        }}>
          <button style={tbBtn} title="Delete"
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => deleteElements({ nodes: [{ id }] })}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--cn-dim)" strokeWidth="1.4" strokeLinecap="round">
              <path d="M2 3h9M4.5 3V2a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M5 5.5v4M8 5.5v4M2.5 3l.65 7.5a.5.5 0 00.5.5h5.7a.5.5 0 00.5-.5L10.5 3"/>
            </svg>
          </button>
          <button style={tbBtn} title="Focus"
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => fitView({ nodes: [{ id }], duration: 350, padding: 0.35 })}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--cn-dim)" strokeWidth="1.4" strokeLinecap="round">
              <path d="M1.5 4.5V2h2.5M8.5 2H11v2.5M11 8.5V11H8.5M4 11H1.5V8.5"/>
            </svg>
          </button>
        </div>
      )}

      {/* Card */}
      <div style={{
        background: 'var(--cn-bg)', color: 'var(--cn-fg)',
        border: `${bw} solid ${bc}`, borderRadius: 5,
        minWidth: 200, maxWidth: 280,
        boxShadow: selected ? '0 2px 10px rgba(0,0,0,0.10)' : '0 1px 5px rgba(0,0,0,0.09)',
        transition: 'box-shadow 0.15s',
      }}>

        {/* Head */}
        <div style={{ padding: '9px 12px 8px', borderBottom: '0.5px solid rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 9.5, fontFamily: 'ui-monospace,monospace', fontWeight: 600,
              letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--cn-dim)',
            }}>
              <EntityIcon type={et} />
              {ENTITY_LABEL[et]}
            </div>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_DOT[sc] }} />
          </div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--cn-fg)', lineHeight: 1.3 }}>
            {d.entityName || '未命名'}
          </div>
          {d.entitySub && (
            <div style={{ fontSize: 11, color: 'var(--cn-dim)', marginTop: 2 }}>{d.entitySub}</div>
          )}
        </div>

        {/* Body */}
        <div style={{ padding: '7px 12px' }}>
          {d.status && (
            <span style={{
              fontSize: 9.5, fontWeight: 600, fontFamily: 'ui-monospace,monospace',
              letterSpacing: '.04em', padding: '2px 7px', borderRadius: 3,
              background: STATUS_COLORS[sc].bg, color: STATUS_COLORS[sc].fg,
            }}>
              {d.status}
            </span>
          )}
          {d.lastMessage && (
            <div style={{
              fontSize: 11, color: 'var(--cn-dim)', marginTop: 6, paddingTop: 6,
              borderTop: '0.5px solid rgba(0,0,0,0.05)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {d.lastMessage}
            </div>
          )}
        </div>

        {/* Foot */}
        <div style={{
          padding: '5px 12px 8px', borderTop: '0.5px solid rgba(0,0,0,0.05)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 9.5, fontFamily: 'ui-monospace,monospace', color: 'var(--cn-dim)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M6 1a5 5 0 100 10A5 5 0 006 1zm0 2.5v3l2 1.5"/>
            </svg>
            {d.connectionCount ?? 0} 连接
          </div>
          {d.timestamp && (
            <div style={{ fontSize: 9.5, fontFamily: 'ui-monospace,monospace', color: 'rgba(0,0,0,0.22)' }}>
              {d.timestamp}
            </div>
          )}
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
    </div>
  );
});

CanvasEntityCard.displayName = 'CanvasEntityCard';

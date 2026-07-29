import { memo } from 'react';
import { Handle, Position, useReactFlow } from '@xyflow/react';
import type { CardData, CardSize, ConnectorType } from './CanvasCardData';

const SIZE_W: Record<CardSize, number>      = { S: 200, M: 280, L: 360 };
const SIZE_BODY_H: Record<CardSize, number> = { S: 32,  M: 80,  L: 150 };

const CONN_LABEL: Record<ConnectorType, string> = {
  calls: 'CALLS', imports: 'IMPORTS', routes: 'ROUTES',
  references: 'REF', custom: 'FLOW',
};

const SIDES = [
  { pos: Position.Top, id: 't' }, { pos: Position.Right, id: 'r' },
  { pos: Position.Bottom, id: 'b' }, { pos: Position.Left, id: 'l' },
];

function FlowRow({ a, b }: { a: string; b: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 7,
      padding: '5px 10px', background: 'rgba(0,0,0,0.025)',
      borderRadius: 4, border: '0.5px solid rgba(0,0,0,0.07)',
    }}>
      <span style={{
        fontSize: 11, fontWeight: 500, color: 'rgba(0,0,0,0.62)',
        padding: '1px 6px', background: 'rgba(255,255,255,0.9)',
        border: '0.5px solid rgba(0,0,0,0.10)', borderRadius: 3,
        maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{a}</span>
      <svg width="16" height="10" viewBox="0 0 16 10" fill="none" stroke="rgba(0,0,0,0.22)"
        strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 5h14M11 2l3 3-3 3"/>
      </svg>
      <span style={{
        fontSize: 11, fontWeight: 500, color: 'rgba(0,0,0,0.62)',
        padding: '1px 6px', background: 'rgba(255,255,255,0.9)',
        border: '0.5px solid rgba(0,0,0,0.10)', borderRadius: 3,
        maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{b}</span>
    </div>
  );
}

const tbBtn: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center',
  justifyContent: 'center', background: 'transparent', border: 'none',
  borderRadius: 6, cursor: 'pointer',
};

export interface ConnectorCardProps { id: string; data: CardData; selected: boolean }

export const CanvasConnectorCard = memo(({ id, data: d, selected }: ConnectorCardProps) => {
  const { deleteElements } = useReactFlow();
  const sz: CardSize = d.cardSize ?? 'S';
  const ct          = (d.connectorType ?? 'custom') as ConnectorType;
  const borderColor = selected ? '#4A9EFF' : 'rgba(0,0,0,0.15)';
  const hasFlow1    = d.flowA || d.flowB;
  const hasFlow2    = d.flowA2 || d.flowB2;

  return (
    <div style={{ position: 'relative' }}>

      {/* Toolbar */}
      {selected && (
        <div className="nodrag nopan" style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)', display: 'flex', alignItems: 'center',
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
        </div>
      )}

      {/* Card */}
      <div style={{
        background: 'rgba(255,255,255,0.72)',
        border: `1.5px dashed ${borderColor}`,
        borderRadius: 8,
        width: SIZE_W[sz],
        backdropFilter: 'blur(4px)',
        overflow: 'hidden',
      }}>

        {/* HEAD */}
        <div style={{ padding: '10px 13px 9px', borderBottom: '1px dashed rgba(0,0,0,0.09)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3,
            fontSize: 10, fontFamily: 'ui-monospace,monospace', fontWeight: 600,
            letterSpacing: '.06em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.32)',
          }}>
            <svg width="12" height="10" viewBox="0 0 14 10" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 5h12M9 2l3 3-3 3M5 8L2 5l3-3"/>
            </svg>
            {d.connectorName ? (d.connectorType ? CONN_LABEL[ct] : '数据流') : '数据流'}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(0,0,0,0.78)', lineHeight: 1.25 }}>
            {d.connectorName || '未命名连接'}
          </div>
        </div>

        {/* BODY — flow rows */}
        <div style={{ padding: '9px 13px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: SIZE_BODY_H[sz] }}>
          {hasFlow1 && <FlowRow a={d.flowA || '?'} b={d.flowB || '?'} />}
          {hasFlow2 && <FlowRow a={d.flowA2 || '?'} b={d.flowB2 || '?'} />}
          {!hasFlow1 && !hasFlow2 && (
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.28)', fontStyle: 'italic' }}>
              设置连接端点…
            </div>
          )}
          {d.flowNote && (
            <div style={{ fontSize: 10.5, fontFamily: 'ui-monospace,monospace', color: 'rgba(0,0,0,0.32)', marginTop: 1 }}>
              {d.flowNote}
            </div>
          )}
        </div>

        {/* FOOT — badge + label */}
        <div style={{
          borderTop: '1px dashed rgba(0,0,0,0.09)', padding: '6px 13px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{
            fontSize: 9.5, fontFamily: 'ui-monospace,monospace', fontWeight: 700,
            letterSpacing: '.08em', padding: '2px 7px',
            border: '1px solid rgba(0,0,0,0.18)', borderRadius: 3,
            color: 'rgba(0,0,0,0.52)', background: 'transparent',
          }}>
            {CONN_LABEL[ct]}
          </span>
          {d.flowBidirectional && (
            <span style={{ fontSize: 10.5, color: 'rgba(0,0,0,0.36)', fontFamily: 'ui-monospace,monospace' }}>
              双向可见
            </span>
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

CanvasConnectorCard.displayName = 'CanvasConnectorCard';

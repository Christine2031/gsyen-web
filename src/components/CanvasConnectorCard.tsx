import { memo } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import type { CardData, ConnectorType } from './CanvasCardData';

const CONN_LABEL: Record<ConnectorType, string> = {
  calls: 'calls', imports: 'imports', routes: 'routes',
  references: 'ref', custom: 'flow',
};

const SIDES = [
  { pos: Position.Top, id: 't' }, { pos: Position.Right, id: 'r' },
  { pos: Position.Bottom, id: 'b' }, { pos: Position.Left, id: 'l' },
];

export interface ConnectorCardProps { id: string; data: CardData; selected: boolean }

export const CanvasConnectorCard = memo(({ id, data: d, selected }: ConnectorCardProps) => {
  const { deleteElements } = useReactFlow();
  const ct = (d.connectorType ?? 'custom') as ConnectorType;
  const borderColor = selected ? '#4A9EFF' : 'rgba(0,0,0,0.18)';

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
          <button style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => deleteElements({ nodes: [{ id }] })}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--cn-dim)" strokeWidth="1.4" strokeLinecap="round">
              <path d="M2 3h9M4.5 3V2a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M5 5.5v4M8 5.5v4M2.5 3l.65 7.5a.5.5 0 00.5.5h5.7a.5.5 0 00.5-.5L10.5 3"/>
            </svg>
          </button>
        </div>
      )}

      {/* Card */}
      <div style={{
        background: 'rgba(255,255,255,0.65)',
        border: `1.5px dashed ${borderColor}`,
        borderRadius: 5,
        minWidth: 190, maxWidth: 280,
      }}>

        {/* Head */}
        <div style={{ padding: '8px 12px 6px', borderBottom: '1px dashed rgba(0,0,0,0.10)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2,
            fontSize: 9.5, fontFamily: 'ui-monospace,monospace', fontWeight: 600,
            letterSpacing: '.07em', textTransform: 'uppercase', color: 'rgba(0,0,0,0.32)',
          }}>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 6h10M8 3l3 3-3 3"/>
            </svg>
            {CONN_LABEL[ct]}
          </div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(0,0,0,0.72)' }}>
            {d.connectorName || '数据流'}
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '8px 12px' }}>
          {(d.flowA || d.flowB) ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', background: 'rgba(0,0,0,0.03)', borderRadius: 3, marginBottom: d.flowLabel ? 5 : 0 }}>
              <span style={{ fontSize: 10.5, fontWeight: 500, color: 'rgba(0,0,0,0.58)', padding: '1px 5px', background: 'rgba(255,255,255,0.85)', border: '0.5px solid rgba(0,0,0,0.10)', borderRadius: 2, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.flowA || '?'}
              </span>
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 5h12M9 2l3 3-3 3"/>
              </svg>
              <span style={{ fontSize: 10.5, fontWeight: 500, color: 'rgba(0,0,0,0.58)', padding: '1px 5px', background: 'rgba(255,255,255,0.85)', border: '0.5px solid rgba(0,0,0,0.10)', borderRadius: 2, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {d.flowB || '?'}
              </span>
            </div>
          ) : (
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.30)', fontStyle: 'italic' }}>
              设置连接端点…
            </div>
          )}
          {d.flowLabel && (
            <div style={{ fontSize: 10, fontFamily: 'ui-monospace,monospace', color: 'rgba(0,0,0,0.35)', marginTop: 4 }}>
              {d.flowLabel}
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

CanvasConnectorCard.displayName = 'CanvasConnectorCard';

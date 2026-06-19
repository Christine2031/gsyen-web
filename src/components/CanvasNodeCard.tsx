import { memo, useState, useRef, useEffect } from 'react';
import { Handle, Position, type NodeProps, useReactFlow } from '@xyflow/react';
import type { CardData } from './CanvasCardData';
import { CanvasEntityCard } from './CanvasEntityCard';
import { CanvasConnectorCard } from './CanvasConnectorCard';

/* Re-export for backward-compat (CanvasNodeEditor imports CardData from here) */
export type { CardData } from './CanvasCardData';

/* Obsidian left-bar colours */
const BAR: Record<string, string> = {
  '1': '#F87171', '2': '#FB923C', '3': '#FBBF24',
  '4': '#4ADE80', '5': '#2DD4BF', '6': '#A78BFA',
};

const SIDES = [
  { pos: Position.Top,    id: 't' }, { pos: Position.Right,  id: 'r' },
  { pos: Position.Bottom, id: 'b' }, { pos: Position.Left,   id: 'l' },
];

const tbBtn: React.CSSProperties = {
  width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent', border: 'none', borderRadius: 6, cursor: 'pointer',
};

/* ── Inline markdown: **bold** *italic* ── */
function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/).map((p, i) => {
    if (p.startsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('*'))  return <em key={i}>{p.slice(1, -1)}</em>;
    return p;
  });
}

/* ── Block markdown renderer ── */
function MD({ text }: { text: string }) {
  if (!text) return <span style={{ color: 'var(--cn-dim)', fontStyle: 'italic' }}>双击编辑…</span>;
  return (
    <>
      {text.split('\n').map((line, i) => {
        if (line.startsWith('# '))
          return <div key={i} style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.4, marginBottom: 4 }}>{inline(line.slice(2))}</div>;
        if (line.startsWith('## '))
          return <div key={i} style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4, marginBottom: 3 }}>{inline(line.slice(3))}</div>;
        if (line.startsWith('### '))
          return <div key={i} style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4, marginBottom: 2 }}>{inline(line.slice(4))}</div>;
        if (line === '')
          return <div key={i} style={{ height: 6 }} />;
        return <div key={i} style={{ fontSize: 13, lineHeight: 1.65, opacity: 0.82 }}>{inline(line)}</div>;
      })}
    </>
  );
}

/* ── Text card (default / Obsidian-compatible) ── */
function TextCard({ id, data: d, selected }: { id: string; data: CardData; selected: boolean }) {
  const { updateNodeData, deleteElements, fitView } = useReactFlow();
  const [editing,    setEditing]    = useState(d.defaultEditing ?? false);
  const [draft,      setDraft]      = useState(d.text);
  const [showColors, setShowColors] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) taRef.current?.focus(); }, [editing]);
  useEffect(() => { if (editing) setDraft(d.text); }, [editing, d.text]);
  useEffect(() => { if (!selected) setShowColors(false); }, [selected]);

  const commit = () => {
    setEditing(false);
    if (draft !== d.text) updateNodeData(id, { text: draft, defaultEditing: false });
  };

  const barColor = BAR[d.color ?? ''];
  const sep: React.CSSProperties = { width: '0.5px', background: 'rgba(0,0,0,0.1)', margin: '3px 2px' };
  const bc = selected ? '#4A9EFF' : 'rgba(0,0,0,0.10)';
  const cardBorder = {
    borderTop:    `1px solid ${bc}`,
    borderRight:  `1px solid ${bc}`,
    borderBottom: `1px solid ${bc}`,
    borderLeft:   barColor && !selected ? `4px solid ${barColor}` : `1px solid ${bc}`,
  };

  return (
    <div style={{ position: 'relative' }}>
      {selected && !editing && (
        <div className="nodrag nopan" style={{
          position: 'absolute', bottom: 'calc(100% + 8px)', left: '50%',
          transform: 'translateX(-50%)', display: 'flex', alignItems: 'center', gap: 2,
          background: 'var(--cn-bg)', borderRadius: 8, padding: '3px 5px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)',
          border: '0.5px solid var(--cn-border)', zIndex: 10, whiteSpace: 'nowrap',
        }}>
          <button style={tbBtn} title="Delete"
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(239,68,68,0.08)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => deleteElements({ nodes: [{ id }] })}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--cn-dim)" strokeWidth="1.4" strokeLinecap="round">
              <path d="M2 3h9M4.5 3V2a.5.5 0 01.5-.5h3a.5.5 0 01.5.5v1M5 5.5v4M8 5.5v4M2.5 3l.65 7.5a.5.5 0 00.5.5h5.7a.5.5 0 00.5-.5L10.5 3"/>
            </svg>
          </button>
          <div style={sep} />
          <div style={{ position: 'relative' }}>
            <button style={tbBtn} title="Colour"
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              onClick={() => setShowColors(v => !v)}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--cn-dim)" strokeWidth="1.4" strokeLinecap="round">
                <circle cx="6.5" cy="6.5" r="5"/>
                <circle cx="4" cy="6.5" r="1.1" fill="#F87171" stroke="none"/>
                <circle cx="6.5" cy="4"  r="1.1" fill="#FBBF24" stroke="none"/>
                <circle cx="9"  cy="6.5" r="1.1" fill="#4ADE80" stroke="none"/>
                <circle cx="6.5" cy="9"  r="1.1" fill="#A78BFA" stroke="none"/>
              </svg>
            </button>
            {showColors && (
              <div className="nodrag nopan" style={{
                position: 'absolute', bottom: 'calc(100% + 6px)', left: '50%',
                transform: 'translateX(-50%)', display: 'flex', gap: 5, padding: '6px 8px',
                background: 'var(--cn-bg)', borderRadius: 8, zIndex: 20,
                boxShadow: '0 4px 12px rgba(0,0,0,0.12)', border: '0.5px solid var(--cn-border)',
              }}>
                <button onClick={() => { updateNodeData(id, { color: '' }); setShowColors(false); }}
                  style={{ width: 15, height: 15, borderRadius: '50%', border: '1.5px solid var(--cn-dim)', background: 'var(--cn-bg)', cursor: 'pointer', padding: 0 }} />
                {Object.entries(BAR).map(([k, c]) => (
                  <button key={k} onClick={() => { updateNodeData(id, { color: k }); setShowColors(false); }}
                    style={{ width: 15, height: 15, borderRadius: '50%', border: 'none', background: c, cursor: 'pointer', padding: 0,
                      outline: d.color === k ? `2px solid ${c}` : 'none', outlineOffset: 2 }} />
                ))}
              </div>
            )}
          </div>
          <div style={sep} />
          <button style={tbBtn} title="Focus"
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => fitView({ nodes: [{ id }], duration: 350, padding: 0.35 })}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--cn-dim)" strokeWidth="1.4" strokeLinecap="round">
              <path d="M1.5 4.5V2h2.5M8.5 2H11v2.5M11 8.5V11H8.5M4 11H1.5V8.5"/>
            </svg>
          </button>
          <button style={tbBtn} title="Edit"
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.05)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            onClick={() => setEditing(true)}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--cn-dim)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 2l2 2-6.5 6.5H2.5v-2L9 2z"/>
            </svg>
          </button>
        </div>
      )}

      <div onDoubleClick={e => { e.stopPropagation(); setEditing(true); }}
        style={{
          background: 'var(--cn-bg)', color: 'var(--cn-fg)',
          ...cardBorder,
          borderRadius: 4, padding: '12px 16px',
          minWidth: 200, minHeight: 72, maxWidth: 360,
          boxShadow: selected ? '0 2px 10px rgba(0,0,0,0.10)' : '0 1px 4px rgba(0,0,0,0.06)',
          fontFamily: 'inherit', position: 'relative', transition: 'box-shadow 0.15s',
        }}>
        {SIDES.map(({ pos, id: hid }) => (
          <Handle key={hid} id={`src-${hid}`} type="source" position={pos}
            style={{ opacity: 0, width: 8, height: 8, background: '#4A9EFF', border: '1.5px solid #fff', transition: 'opacity 0.12s' }} />
        ))}
        {SIDES.map(({ pos, id: hid }) => (
          <Handle key={`t-${hid}`} id={`tgt-${hid}`} type="target" position={pos}
            style={{ opacity: 0, width: 14, height: 14 }} />
        ))}
        {editing ? (
          <textarea ref={taRef} value={draft} className="nodrag nopan"
            onChange={e => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={e => { if (e.key === 'Escape') commit(); }}
            style={{
              width: '100%', minHeight: 56, background: 'transparent',
              border: 'none', outline: 'none', resize: 'none',
              color: 'var(--cn-fg)', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.65,
            }} />
        ) : (
          <div style={{ pointerEvents: 'none' }}><MD text={d.text} /></div>
        )}
      </div>
    </div>
  );
}

/* ── Router: dispatches to the correct card form ── */
export const CanvasNodeCard = memo(({ id, data, selected }: NodeProps) => {
  const d = data as CardData;
  if (d.cardType === 'entity')    return <CanvasEntityCard id={id} data={d} selected={selected ?? false} />;
  if (d.cardType === 'connector') return <CanvasConnectorCard id={id} data={d} selected={selected ?? false} />;
  return <TextCard id={id} data={d} selected={selected ?? false} />;
});

CanvasNodeCard.displayName = 'CanvasNodeCard';

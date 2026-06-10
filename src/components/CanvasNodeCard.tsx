import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

export interface CardData extends Record<string, unknown> {
  text:    string;
  color?:  string;
  dark?:   boolean;
  onChange?: (text: string) => void;
}

const ACCENT: Record<string, string> = {
  '1': '#eb3b5a', '2': '#fa8231', '3': '#f7b731',
  '4': '#20bf6b', '5': '#0fb9b1', '6': '#8854d0',
};

export const CanvasNodeCard = memo(({ data, selected }: NodeProps) => {
  const d = data as CardData;
  const [editing, setEditing] = useState(false);
  const [text,    setText]    = useState(d.text);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setText(d.text); }, [d.text]);
  useEffect(() => { if (editing) taRef.current?.focus(); }, [editing]);

  const commit = useCallback(() => {
    setEditing(false);
    d.onChange?.(text);
  }, [d, text]);

  const accent = ACCENT[d.color ?? ''];
  const bg     = d.dark ? '#242424' : '#ffffff';
  const fg     = d.dark ? '#cccccc' : '#1a1a1a';
  const dim    = d.dark ? '#666'    : '#aaa';
  const brd    = selected ? '#4488CC' : (d.dark ? '#383838' : '#e0e0e0');
  const leftBorder = `4px solid ${accent ?? brd}`;

  return (
    <div
      onDoubleClick={() => setEditing(true)}
      style={{
        background: bg, color: fg,
        border: `1.5px solid ${brd}`, borderLeft: leftBorder,
        borderRadius: 8, padding: '10px 14px',
        minWidth: 200, minHeight: 80, maxWidth: 340,
        boxShadow: selected ? `0 0 0 2px #4488CC44` : '0 2px 8px rgba(0,0,0,0.07)',
        cursor: editing ? 'text' : 'grab',
        fontFamily: 'inherit', fontSize: 13, lineHeight: 1.65,
      }}
    >
      <Handle type="target" position={Position.Top}   style={{ opacity: 0.35 }} />
      <Handle type="target" position={Position.Left}  style={{ opacity: 0.35 }} />

      {editing ? (
        <textarea
          ref={taRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Escape') commit(); }}
          style={{
            width: '100%', minHeight: 64, background: 'transparent',
            border: 'none', outline: 'none', resize: 'none',
            color: fg, fontFamily: 'inherit', fontSize: 13, lineHeight: 1.65,
          }}
        />
      ) : (
        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {text || <span style={{ color: dim, fontStyle: 'italic' }}>双击编辑…</span>}
        </div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ opacity: 0.35 }} />
      <Handle type="source" position={Position.Right}  style={{ opacity: 0.35 }} />
    </div>
  );
});

CanvasNodeCard.displayName = 'CanvasNodeCard';

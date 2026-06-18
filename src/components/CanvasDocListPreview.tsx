/**
 * CanvasDocListPreview — DocList 文件 hover 预览浮动面板
 */
import { createPortal } from 'react-dom';
import { SYS_FONT } from './CanvasEditorTypes';
import type { Palette } from './CanvasEditorTypes';

interface Props {
  pos: { x: number; y: number; text: string } | null;
  P: Palette;
  dark: boolean;
}

export function CanvasDocListPreview({ pos, P, dark }: Props) {
  if (!pos) return null;

  const lines = pos.text
    .split('\n')
    .filter(l => l.trim().length > 0)
    .slice(0, 18);

  const viewportH = window.innerHeight;
  const maxH      = 320;
  const top       = Math.min(Math.max(pos.y - 4, 8), viewportH - maxH - 8);

  return createPortal(
    <div style={{
      position: 'fixed', left: pos.x, top, zIndex: 8888,
      width: 272, maxHeight: maxH, overflow: 'hidden',
      background: P.chrome, borderRadius: 8,
      boxShadow: dark
        ? '0 4px 6px rgba(0,0,0,0.35), 0 12px 32px rgba(0,0,0,0.55)'
        : '0 4px 6px rgba(0,0,0,0.07), 0 12px 32px rgba(0,0,0,0.12)',
      border: `0.5px solid ${P.border}`,
      padding: '12px 14px', pointerEvents: 'none',
    }}>
      {lines.map((line, i) => {
        const isH   = /^#+\s/.test(line);
        const clean = line.replace(/^#+\s*/, '').replace(/\*\*(.*?)\*\*/g, '$1');
        return (
          <div key={i} style={{
            fontSize: isH ? 12 : 11.5,
            fontWeight: isH ? 600 : 400,
            color: i === 0 ? P.fg : P.menuFg,
            fontFamily: SYS_FONT,
            lineHeight: 1.65,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            paddingLeft: /^\s+/.test(line) ? 12 : 0,
          }}>
            {clean || ' '}
          </div>
        );
      })}
    </div>,
    document.body
  );
}

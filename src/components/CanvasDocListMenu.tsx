/**
 * CanvasDocListMenu — DocList 右键上下文菜单（iA Writer 精确对标）
 */
import { createPortal } from 'react-dom';
import type { FileEntry } from '../hooks/useFileSystem';
import { SYS_FONT } from './CanvasEditorTypes';
import type { Palette } from './CanvasEditorTypes';

interface Props {
  ctxMenu: { x: number; y: number; entry: FileEntry } | null;
  P: Palette;
  dark: boolean;
  onRename: (e: FileEntry) => void;
  onShowInExplorer: (e: FileEntry) => void;
  onDelete: (e: FileEntry) => void;
}

const SEP = ({ P }: { P: Palette }) => (
  <div style={{ height: '0.5px', background: P.border, margin: '3px 0' }} />
);

export function CanvasDocListMenu({ ctxMenu, P, dark, onRename, onShowInExplorer, onDelete }: Props) {
  if (!ctxMenu) return null;

  const base: React.CSSProperties = {
    width: '100%', padding: '10px 20px', textAlign: 'left',
    background: 'transparent', border: 'none', cursor: 'pointer',
    fontSize: 13, color: P.menuFg, fontFamily: SYS_FONT, whiteSpace: 'nowrap',
    display: 'block',
  };
  const dim: React.CSSProperties = { ...base, color: `${P.fg}30`, cursor: 'default', pointerEvents: 'none' };
  const hov = (e: React.MouseEvent) => (e.currentTarget as HTMLElement).style.background = `${P.fg}08`;
  const lea = (e: React.MouseEvent) => (e.currentTarget as HTMLElement).style.background = 'transparent';

  return createPortal(
    <div onMouseDown={e => e.stopPropagation()}
      style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999,
        background: P.chrome, borderRadius: 8, padding: '4px 0',
        boxShadow: dark
          ? '0 4px 6px rgba(0,0,0,0.35), 0 12px 32px rgba(0,0,0,0.55)'
          : '0 4px 6px rgba(0,0,0,0.07), 0 12px 32px rgba(0,0,0,0.12)',
        border: `0.5px solid ${P.border}`, minWidth: 220, fontFamily: SYS_FONT }}>
      <button style={base} onMouseEnter={hov} onMouseLeave={lea}
        onClick={() => onRename(ctxMenu.entry)}>Rename</button>
      <button style={base} onMouseEnter={hov} onMouseLeave={lea}
        onClick={() => onShowInExplorer(ctxMenu.entry)}>Show in Explorer</button>
      <button style={dim}>New Folder</button>
      <button style={dim}>Move</button>
      <SEP P={P} />
      <button style={base} onMouseEnter={hov} onMouseLeave={lea}
        onClick={() => onDelete(ctxMenu.entry)}>Move to Trash</button>
      <SEP P={P} />
      <button style={dim}>Browse Backups</button>
      <SEP P={P} />
      <button style={dim}>Sort ▶</button>
      <button style={dim}>Add to Library</button>
    </div>,
    document.body
  );
}

/**
 * CanvasDocListMenu — DocList 右键菜单（iA Writer 对标）
 * Sort ▶ 展开右侧子菜单，含完整排序逻辑（foldersOnTop / sortBy / newestOnTop）。
 */
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { FileEntry } from '../hooks/useFileSystem';
import { SYS_FONT } from './CanvasEditorTypes';
import type { Palette } from './CanvasEditorTypes';
import type { SortSettings } from '../stores/canvasLibraryStore';

interface Props {
  ctxMenu: { x: number; y: number; entry: FileEntry } | null;
  P: Palette;
  dark: boolean;
  sortSettings: SortSettings;
  onRename:          (e: FileEntry) => void;
  onShowInExplorer:  (e: FileEntry) => void;
  onDelete:          (e: FileEntry) => void;
  onSortChange:      (patch: Partial<SortSettings>) => void;
  onClose:           () => void;
}

const SEP = ({ P }: { P: Palette }) => (
  <div style={{ height: '0.5px', background: P.border, margin: '3px 0' }} />
);

const Tick = () => (
  <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, lineHeight: 1 }}>✓</span>
);

export function CanvasDocListMenu({
  ctxMenu, P, dark, sortSettings,
  onRename, onShowInExplorer, onDelete, onSortChange, onClose,
}: Props) {
  const [sortPos, setSortPos] = useState<{ x: number; y: number } | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 菜单消失时同时关闭子菜单
  useEffect(() => { if (!ctxMenu) setSortPos(null); }, [ctxMenu]);
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  if (!ctxMenu) return null;

  const shadow = dark
    ? '0 4px 6px rgba(0,0,0,0.35), 0 12px 32px rgba(0,0,0,0.55)'
    : '0 4px 6px rgba(0,0,0,0.07), 0 12px 32px rgba(0,0,0,0.12)';

  const menuBox: React.CSSProperties = {
    background: P.chrome, borderRadius: 8, padding: '4px 0',
    boxShadow: shadow, border: `0.5px solid ${P.border}`,
    fontFamily: SYS_FONT,
  };

  const base: React.CSSProperties = {
    position: 'relative', width: '100%',
    padding: '10px 20px 10px 28px', textAlign: 'left',
    background: 'transparent', border: 'none', cursor: 'pointer',
    fontSize: 13, color: P.menuFg, fontFamily: SYS_FONT,
    whiteSpace: 'nowrap', display: 'block',
  };
  const dim: React.CSSProperties = {
    ...base, color: `${P.fg}30`, cursor: 'default', pointerEvents: 'none',
  };
  const hov = (e: React.MouseEvent) =>
    (e.currentTarget as HTMLElement).style.background = `${P.fg}08`;
  const lea = (e: React.MouseEvent) =>
    (e.currentTarget as HTMLElement).style.background = 'transparent';

  const enterSort = (e: React.MouseEvent) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSortPos({ x: r.right - 4, y: r.top - 4 });
  };
  const leaveSort = () => {
    hideTimer.current = setTimeout(() => setSortPos(null), 120);
  };
  const staySort = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };

  const sortRow: React.CSSProperties = {
    ...base,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 14px 10px 28px',
    background: sortPos ? `${P.fg}08` : 'transparent',
  };

  return createPortal(
    <>
      {/* ── 主菜单 ── */}
      <div onMouseDown={e => e.stopPropagation()}
        style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999, minWidth: 220, ...menuBox }}>
        <button style={base} onMouseEnter={hov} onMouseLeave={lea}
          onClick={() => { onRename(ctxMenu.entry); onClose(); }}>
          Rename
        </button>
        <button style={base} onMouseEnter={hov} onMouseLeave={lea}
          onClick={() => { onShowInExplorer(ctxMenu.entry); onClose(); }}>
          Show in Explorer
        </button>
        <button style={dim}>New Folder</button>
        <button style={dim}>Move</button>
        <SEP P={P} />
        <button style={base} onMouseEnter={hov} onMouseLeave={lea}
          onClick={() => { onDelete(ctxMenu.entry); onClose(); }}>
          Move to Trash
        </button>
        <SEP P={P} />
        <button style={dim}>Browse Backups</button>
        <SEP P={P} />
        {/* Sort ▶ — active, hover 展开子菜单 */}
        <div style={sortRow} onMouseEnter={enterSort} onMouseLeave={leaveSort}>
          Sort
          <svg width="5" height="8" viewBox="0 0 5 8" fill="none" stroke={P.menuFg}
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 1L4 4L1 7"/>
          </svg>
        </div>
        <button style={dim}>Add to Library</button>
      </div>

      {/* ── Sort 子菜单 ── */}
      {sortPos && createPortal(
        <div onMouseDown={e => e.stopPropagation()}
          onMouseEnter={staySort} onMouseLeave={leaveSort}
          style={{ position: 'fixed', left: sortPos.x, top: sortPos.y, zIndex: 10000, minWidth: 200, ...menuBox }}>
          <button style={base} onMouseEnter={hov} onMouseLeave={lea}
            onClick={() => onSortChange({ foldersOnTop: !sortSettings.foldersOnTop })}>
            {sortSettings.foldersOnTop && <Tick />}
            Show Folders on Top
          </button>
          <SEP P={P} />
          <button style={base} onMouseEnter={hov} onMouseLeave={lea}
            onClick={() => onSortChange({ sortBy: 'date' })}>
            {sortSettings.sortBy === 'date' && <Tick />}
            Sort By Date
          </button>
          <button style={base} onMouseEnter={hov} onMouseLeave={lea}
            onClick={() => onSortChange({ sortBy: 'name' })}>
            {sortSettings.sortBy === 'name' && <Tick />}
            Sort By Name
          </button>
          <SEP P={P} />
          <button style={base} onMouseEnter={hov} onMouseLeave={lea}
            onClick={() => onSortChange({ newestOnTop: false })}>
            {!sortSettings.newestOnTop && <Tick />}
            Oldest On Top
          </button>
          <button style={base} onMouseEnter={hov} onMouseLeave={lea}
            onClick={() => onSortChange({ newestOnTop: true })}>
            {sortSettings.newestOnTop && <Tick />}
            Newest On Top
          </button>
        </div>,
        document.body
      )}
    </>,
    document.body
  );
}

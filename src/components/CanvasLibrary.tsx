/**
 * CanvasLibrary — 左栏文件夹列表（header 已移至 CanvasChrome）
 * 只负责：folder list + Add to Library popup + 底部按钮
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useLibraryStore, libraryStore } from '../stores/canvasLibraryStore';
import { SYS_FONT, TITLE_H } from './CanvasEditorTypes';
import type { Palette } from './CanvasEditorTypes';
import type { FolderSource } from '../hooks/useFileSystem';
import { useCanvasPanelWidths } from '../hooks/useCanvasPanelWidths';

interface Props { open: boolean; P: Palette; dark: boolean; onSettings: () => void; }

const CloudIcon = ({ color }: { color: string }) => (
  <svg width="14" height="10" viewBox="-0.5 3.5 25 17" fill="none" stroke={color}
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}>
    <path d="M19.453 9.95q.961.058 1.787.468.826.41 1.442 1.066.615.657.966 1.512.352.856.352 1.816 0 1.008-.387 1.893-.386.885-1.049 1.547-.662.662-1.546 1.049-.885.387-1.893.387H6q-1.242 0-2.332-.475-1.09-.475-1.904-1.29-.815-.814-1.29-1.903Q0 14.93 0 13.688q0-.985.31-1.887.311-.903.862-1.658.55-.756 1.324-1.325.774-.568 1.711-.861.434-.129.85-.187.416-.06.861-.082h.012q.515-.786 1.207-1.413.691-.627 1.5-1.066.808-.44 1.705-.668.896-.229 1.845-.229 1.278 0 2.456.417 1.177.416 2.144 1.16.967.744 1.658 1.78.692 1.038 1.008 2.28z"/>
  </svg>
);

async function pickFiles(): Promise<FolderSource[]> {
  const api = (window as any).electronAPI;
  if (api?.showOpenDialog) {
    const r = await api.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Documents', extensions: ['md', 'txt', 'canvas', 'excalidraw', 'docx', 'xlsx', 'pdf'] }],
    });
    if (r?.canceled || !r?.filePaths?.length) return [];
    const seen = new Set<string>();
    return (r.filePaths as string[])
      .map((p: string) => {
        const parts = p.split(/[\\/]/); parts.pop();
        const dir = parts.join('/') || p;
        const name = parts[parts.length - 1] ?? dir;
        return { id: dir, name, path: dir, env: 'electron' as const };
      })
      .filter(src => { if (seen.has(src.id)) return false; seen.add(src.id); return true; });
  }
  try {
    const handles: FileSystemFileHandle[] = await (window as any).showOpenFilePicker({ multiple: true });
    return handles.map(h => ({ id: h.name, name: h.name, env: 'web' as const, handle: undefined }));
  } catch { return []; }
}

const LIB_SKEL_WIDTHS = ['68%', '52%', '76%'];

export function CanvasLibrary({ open, P, dark, onSettings }: Props) {
  const { folders, selectedFolder, loading } = useLibraryStore();
  const { libW } = useCanvasPanelWidths();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // 只对「新出现」的 id 播入场动画，已存在的 id 不重建 DOM
  const knownIdsRef = useRef(new Set<string>());
  const newIds = new Set(folders.map(f => f.id).filter(id => !knownIdsRef.current.has(id)));
  folders.forEach(f => knownIdsRef.current.add(f.id));

  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; folder: FolderSource } | null>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctxMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, folder: FolderSource) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, folder });
  }, []);

  const handleRemove = useCallback((folder: FolderSource) => {
    setCtxMenu(null);
    libraryStore.removeFolder(folder.id);
  }, []);

  const [popupOpen, setPopupOpen] = useState(false);
  const [popupY, setPopupY] = useState(0);
  const [popupX, setPopupX] = useState(0);
  const popupRef   = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!popupOpen) return;
    const fn = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) setPopupOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [popupOpen]);

  const handleToggle = () => {
    if (!popupOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopupX(rect.left + 8);
      setPopupY(rect.top);
    }
    setPopupOpen(o => !o);
  };

  const handleAddFolder = () => { setPopupOpen(false); libraryStore.addFolder(); };
  const handleAddFiles  = async () => {
    setPopupOpen(false);
    const sources = await pickFiles();
    for (const src of sources) libraryStore.addFolderSource(src);
  };

  return (
    <>
    <div style={{ width: open ? libW : 0, overflow: 'hidden', flexShrink: 0,
      transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
      background: P.chrome, borderRight: `0.5px solid ${P.border}`,
      display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ width: libW, height: '100%', display: 'flex', flexDirection: 'column', position: 'relative' }}>

        {/* ─ Header ─ */}
        <div style={{ height: TITLE_H, flexShrink: 0, display: 'flex', alignItems: 'center',
          padding: '0 4px 0 10px' }}>
          <span style={{ flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: '0.09em',
            fontFamily: SYS_FONT, color: P.menuFg, textTransform: 'uppercase', userSelect: 'none' }}>
            Library
          </span>
          <button onClick={onSettings} title="Settings"
            style={{ padding: '6px 6px', background: 'transparent', border: 'none', cursor: 'pointer',
              color: P.menuFg, display: 'flex', alignItems: 'center', borderRadius: 4, flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = P.fg}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = P.menuFg}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3.5"/>
              <path d="M10.5 3.6L10.1 1.2L14.9 1.2L13.5 3.6L18.5 6.5L20.4 4.9L22.3 8.2L20 9.1L20 14.9L22.3 15.8L20.4 19.1L18.5 17.5L13.5 20.4L13.9 22.8L10.1 22.8L10.5 20.4L5.5 17.5L3.6 19.1L1.7 15.8L4 14.9L4 9.1L1.7 8.2L3.6 4.9L5.5 6.5Z"/>
            </svg>
          </button>
        </div>

        {/* ─ Folder list ─ */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {loading && folders.length === 0 && (
            <div style={{ padding: '4px 0' }}>
              {LIB_SKEL_WIDTHS.map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8,
                  height: 28, padding: '0 10px', margin: '0 4px' }}>
                  <div className="gs-skeleton"
                    style={{ width: 13, height: 13, flexShrink: 0, background: P.fg,
                      animationDelay: `${i * 150}ms` }} />
                  <div className="gs-skeleton"
                    style={{ height: 10, width: w, background: P.fg,
                      animationDelay: `${i * 150 + 75}ms` }} />
                </div>
              ))}
            </div>
          )}
          {folders.map((folder) => {
            const isActive  = selectedFolder?.id === folder.id;
            const isHovered = hoveredId === folder.id;
            const isNew     = newIds.has(folder.id);
            return (
              <div key={folder.id} className={isNew ? 'gs-list-item' : undefined}
                onClick={() => libraryStore.selectFolder(folder)}
                onContextMenu={(e) => handleContextMenu(e, folder)}
                onMouseEnter={() => setHoveredId(folder.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28,
                  padding: '0 10px', cursor: 'pointer', fontSize: 13, margin: '0 4px',
                  borderRadius: 4, fontFamily: SYS_FONT,
                  fontWeight: 500, color: isActive ? P.fg : P.menuFg,
                  background: isActive ? `${P.fg}12` : isHovered ? `${P.fg}06` : 'transparent',
                  transition: 'background 0.12s' }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5l1 1.5H10.5C11.33 3.5 12 4.17 12 5v5c0 .83-.67 1.5-1.5 1.5h-8C1.67 11.5 1 10.83 1 10V3.5z"/>
                </svg>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {folder.name}
                </span>
                {folder.env === 'web'
                  ? <CloudIcon color={isActive ? P.fg : P.menuFg} />
                  : <svg width="5" height="8" viewBox="0 0 5 8" fill="none" stroke="currentColor"
                      strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ color: P.dim, flexShrink: 0 }}>
                      <path d="M1 1L4 4L1 7"/>
                    </svg>
                }
              </div>
            );
          })}
        </div>

        {/* ─ Bottom trigger ─ */}
        <button ref={triggerRef} onClick={handleToggle}
          style={{ height: 36, display: 'flex', alignItems: 'center', gap: 5,
            padding: '0 8px', flexShrink: 0, width: '100%',
            background: 'transparent',
            border: 'none', cursor: 'pointer', fontFamily: SYS_FONT,
            fontSize: 13, fontWeight: 500, color: P.menuFg, whiteSpace: 'nowrap', overflow: 'hidden' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${P.fg}06`}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
          <span style={{ fontSize: 16, lineHeight: 1, marginTop: -1, flexShrink: 0 }}>+</span>
          <span>Add to Library</span>
        </button>

      </div>
    </div>

    {/* ─ Popup — portal 挂 body，彻底跳出 overflow:hidden 父容器 ─ */}
    {createPortal(
      <div ref={popupRef}
        style={{ position: 'fixed', left: popupX, top: popupY, width: 'max-content', zIndex: 9999,
          transform: popupOpen ? 'translateY(-100%) scale(1)' : 'translateY(calc(-100% + 6px)) scale(0.97)',
          background: P.chrome, borderRadius: 8,
          boxShadow: dark
            ? '0 4px 6px rgba(0,0,0,0.35), 0 12px 32px rgba(0,0,0,0.55)'
            : '0 4px 6px rgba(0,0,0,0.07), 0 12px 32px rgba(0,0,0,0.12)',
          border: `0.5px solid ${P.border}`,
          opacity: popupOpen ? 1 : 0, pointerEvents: popupOpen ? 'auto' : 'none',
          transition: 'opacity 0.15s ease, transform 0.15s ease',
          overflow: 'hidden', padding: '4px 0' }}>
        {[
          { label: 'Add files to the Library',  action: handleAddFiles  },
          { label: 'Add folder to the Library', action: handleAddFolder },
        ].map(({ label, action }) => (
          <button key={label} onClick={action}
            style={{ width: '100%', padding: '10px 20px', textAlign: 'left',
              background: 'transparent', border: 'none', cursor: 'pointer', display: 'block',
              fontSize: 13, fontFamily: SYS_FONT, color: P.menuFg,
              whiteSpace: 'nowrap' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${P.fg}08`}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
            {label}
          </button>
        ))}
      </div>,
      document.body
    )}

    {ctxMenu && createPortal(
      <div onMouseDown={e => e.stopPropagation()}
        style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999,
          background: P.chrome, borderRadius: 8, padding: '4px 0',
          boxShadow: dark
            ? '0 4px 6px rgba(0,0,0,0.35), 0 12px 32px rgba(0,0,0,0.55)'
            : '0 4px 6px rgba(0,0,0,0.07), 0 12px 32px rgba(0,0,0,0.12)',
          border: `0.5px solid ${P.border}`,
          minWidth: 180, fontFamily: SYS_FONT }}>
        <button onClick={() => handleRemove(ctxMenu.folder)}
          style={{ width: '100%', padding: '10px 20px', textAlign: 'left',
            background: 'transparent', border: 'none', cursor: 'pointer',
            fontSize: 13, color: P.menuFg, fontFamily: SYS_FONT, display: 'block', whiteSpace: 'nowrap' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${P.fg}08`}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
          Remove from Library
        </button>
        <button disabled
          style={{ width: '100%', padding: '10px 20px', textAlign: 'left',
            background: 'transparent', border: 'none', cursor: 'default',
            fontSize: 13, color: `${P.fg}30`, fontFamily: SYS_FONT, display: 'block', whiteSpace: 'nowrap',
            pointerEvents: 'none' }}>
          Browse Backups
        </button>
      </div>,
      document.body
    )}
    </>
  );
}

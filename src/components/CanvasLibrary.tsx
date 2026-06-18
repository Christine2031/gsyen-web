/**
 * CanvasLibrary — 左栏文件夹列表（header 已移至 CanvasChrome）
 * 只负责：folder list + Add to Library popup + 底部按钮
 */
import { useState, useEffect, useRef } from 'react';
import { useLibraryStore, libraryStore } from '../stores/canvasLibraryStore';
import { SYS_FONT, TITLE_H, isElectron } from './CanvasEditorTypes';
import type { Palette } from './CanvasEditorTypes';
import type { FolderSource } from '../hooks/useFileSystem';
import { useCanvasPanelWidths } from '../hooks/useCanvasPanelWidths';

interface Props { open: boolean; P: Palette; dark: boolean; }

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
      filters: [{ name: 'Documents', extensions: ['md', 'txt', 'canvas', 'excalidraw'] }],
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

export function CanvasLibrary({ open, P, dark }: Props) {
  const { folders, selectedFolder, loading } = useLibraryStore();
  const { libW } = useCanvasPanelWidths();
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupDir, setPopupDir] = useState<'up'|'down'>('up');
  const [popupAnchor, setPopupAnchor] = useState(0);
  const popupRef  = useRef<HTMLDivElement>(null);
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
    if (isElectron) {
      const api = (window as any).electronAPI;
      api.library.onMenuResult((action: string) => {
        if (action === 'files')  handleAddFiles();
        if (action === 'folder') handleAddFolder();
      });
      api.library.showMenu();
    } else {
      setPopupOpen(o => !o);
    }
  };

  const handleAddFolder = () => { setPopupOpen(false); libraryStore.addFolder(); };
  const handleAddFiles  = async () => {
    setPopupOpen(false);
    const sources = await pickFiles();
    for (const src of sources) libraryStore.addFolderSource(src);
  };

  return (
    <div style={{ width: open ? libW : 0, overflow: 'hidden', flexShrink: 0,
      transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
      background: P.chrome, borderRight: `0.5px solid ${P.border}`,
      display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <div style={{ width: libW, height: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* ─ Header ─ */}
        <div style={{ height: TITLE_H, flexShrink: 0, display: 'flex', alignItems: 'center',
          padding: '0 4px 0 10px' }}>
          <span style={{ flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: '0.09em',
            fontFamily: SYS_FONT, color: P.dim, textTransform: 'uppercase', userSelect: 'none' }}>
            Library
          </span>
          <button onClick={() => {}} title="Settings"
            style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer',
              color: P.menuFg, display: 'flex', alignItems: 'center' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18.6 9.6L20.9 10.4L20.9 13.6L18.6 14.4L17.4 16.5L17.8 18.9L15.1 20.5L13.2 18.9L10.8 18.9L8.9 20.5L6.2 18.9L6.6 16.5L5.4 14.4L3.1 13.6L3.1 10.4L5.4 9.6L6.6 7.5L6.2 5.1L8.9 3.5L10.8 5.1L13.2 5.1L15.1 3.5L17.8 5.1L17.4 7.5Z"/>
              <circle cx="12" cy="12" r="3.5"/>
            </svg>
          </button>
        </div>

        {/* ─ Folder list ─ */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>
          {folders.map(folder => {
            const isActive  = selectedFolder?.id === folder.id;
            const isHovered = hoveredId === folder.id;
            return (
              <div key={folder.id} onClick={() => libraryStore.selectFolder(folder)}
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
          {loading && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: P.dim, fontFamily: SYS_FONT }}>
              读取中...
            </div>
          )}
        </div>

        {/* ─ Popup ─ */}
        <div ref={popupRef}
          style={{ position: 'fixed', left: 0, width: libW, zIndex: 200,
            ...(popupDir === 'down' ? { top: popupAnchor } : { bottom: popupAnchor }),
            background: P.chrome, borderRadius: 8,
            boxShadow: `0 4px 24px rgba(0,0,0,${dark ? 0.45 : 0.14})`,
            maxHeight: popupOpen ? '200px' : '0px',
            opacity: popupOpen ? 1 : 0,
            pointerEvents: popupOpen ? 'auto' : 'none',
            transition: 'max-height 0.22s cubic-bezier(0.4,0,0.2,1), opacity 0.15s ease',
            overflow: 'hidden' }}>
            {[
              { label: 'Add files to the Library',  action: handleAddFiles  },
              { label: 'Add folder to the Library', action: handleAddFolder },
            ].map(({ label, action }) => (
              <button key={label} onClick={action}
                style={{ width: '100%', padding: '10px 14px', textAlign: 'left',
                  background: 'transparent', border: 'none', cursor: 'pointer', display: 'block',
                  fontSize: 13, fontFamily: SYS_FONT, color: P.fg, whiteSpace: 'nowrap' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = `${P.fg}09`}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                {label}
              </button>
            ))}
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
  );
}

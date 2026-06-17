/**
 * CanvasLibrary — 三栏布局左栏：文件夹树
 * 支持 Web (File System Access API) 和 Electron (fs IPC)。
 */
import { useState } from 'react';
import { useLibraryStore, libraryStore } from '../stores/canvasLibraryStore';
import { fsAdapter } from '../hooks/useFileSystem';
import { SYS_FONT } from './CanvasEditorTypes';
import type { Palette } from './CanvasEditorTypes';

interface Props { open: boolean; P: Palette; dark: boolean; }

const CloudIcon = ({ color }: { color: string }) => (
  <svg width="14" height="10" viewBox="-0.5 3.5 25 17" fill="none" stroke={color}
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }}>
    <path d="M19.453 9.95q.961.058 1.787.468.826.41 1.442 1.066.615.657.966 1.512.352.856.352 1.816 0 1.008-.387 1.893-.386.885-1.049 1.547-.662.662-1.546 1.049-.885.387-1.893.387H6q-1.242 0-2.332-.475-1.09-.475-1.904-1.29-.815-.814-1.29-1.903Q0 14.93 0 13.688q0-.985.31-1.887.311-.903.862-1.658.55-.756 1.324-1.325.774-.568 1.711-.861.434-.129.85-.187.416-.06.861-.082h.012q.515-.786 1.207-1.413.691-.627 1.5-1.066.808-.44 1.705-.668.896-.229 1.845-.229 1.278 0 2.456.417 1.177.416 2.144 1.16.967.744 1.658 1.78.692 1.038 1.008 2.28z"/>
  </svg>
);

const EmptyFolderIcon = ({ color }: { color: string }) => (
  <svg width="28" height="28" viewBox="0 0 13 13" fill="none" stroke={color}
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.35 }}>
    <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5l1 1.5H10.5C11.33 3.5 12 4.17 12 5v5c0 .83-.67 1.5-1.5 1.5h-8C1.67 11.5 1 10.83 1 10V3.5z"/>
  </svg>
);

export function CanvasLibrary({ open, P }: Props) {
  const { folders, selectedFolder, loading } = useLibraryStore();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div style={{ width: open ? 148 : 0, overflow: 'hidden', flexShrink: 0,
      transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
      background: P.chrome, borderRight: `0.5px solid ${P.border}`,
      display: 'flex', flexDirection: 'column' }}>
      <div style={{ width: 148, height: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ height: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 12px', borderBottom: `0.5px solid ${P.border}`, flexShrink: 0 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', fontFamily: SYS_FONT,
            color: P.fg, textTransform: 'uppercase' }}>Library</span>
          <button onClick={() => libraryStore.addFolder()} title="添加文件夹"
            style={{ fontSize: 18, lineHeight: 1, color: P.menuFg, background: 'transparent',
              border: 'none', cursor: 'pointer', padding: '0 2px', fontFamily: SYS_FONT }}>+</button>
        </div>

        {/* Folder list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '6px 0' }}>

          {folders.length === 0 && (
            <div style={{ padding: '24px 12px 16px', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: 8, textAlign: 'center',
              fontSize: 11, color: P.dim, lineHeight: 1.6, fontFamily: SYS_FONT }}>
              <EmptyFolderIcon color={P.menuFg} />
              <div>
                点击 + 添加文件夹
                {fsAdapter.env === 'web' && (
                  <div style={{ marginTop: 4, fontSize: 10 }}>Web 模式：刷新后需重新授权</div>
                )}
              </div>
            </div>
          )}

          {folders.map(folder => {
            const isActive  = selectedFolder?.id === folder.id;
            const isHovered = hoveredId === folder.id;
            return (
              <div key={folder.id}
                onClick={() => libraryStore.selectFolder(folder)}
                onMouseEnter={() => setHoveredId(folder.id)}
                onMouseLeave={() => setHoveredId(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28,
                  padding: '0 10px', cursor: 'pointer', fontSize: 12, margin: '0 4px',
                  borderRadius: 4, fontFamily: SYS_FONT,
                  color: isActive ? P.fg : P.menuFg,
                  background: isActive ? `${P.fg}12` : isHovered ? `${P.fg}06` : 'transparent',
                  transition: 'background 0.12s' }}>

                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5l1 1.5H10.5C11.33 3.5 12 4.17 12 5v5c0 .83-.67 1.5-1.5 1.5h-8C1.67 11.5 1 10.83 1 10V3.5z"/>
                </svg>

                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {folder.name}
                </span>

                {folder.env === 'web' && <CloudIcon color={isActive ? P.fg : P.menuFg} />}
              </div>
            );
          })}

          {loading && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: P.dim, fontFamily: SYS_FONT }}>
              读取中...
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

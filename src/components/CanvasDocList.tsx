/**
 * CanvasDocList — 中栏文件列表
 * 只负责：子文件夹 + 文件列表渲染，导航通过 libraryStore.pushNav
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { useLibraryStore, libraryStore } from '../stores/canvasLibraryStore';
import type { SortSettings } from '../stores/canvasLibraryStore';
import { fsAdapter } from '../hooks/useFileSystem';
import type { FileEntry } from '../hooks/useFileSystem';
import { SYS_FONT, TITLE_H, MENU_H } from './CanvasEditorTypes';
import type { Palette } from './CanvasEditorTypes';
import { DocIcon, DrawIcon, NodeIcon, ImageIcon } from '../gsyen-designer';
import { useCanvasPanelWidths } from '../hooks/useCanvasPanelWidths';
import { CanvasDocListMenu } from './CanvasDocListMenu';
import { CanvasDocListPreview } from './CanvasDocListPreview';

// ── 悬停预加载缓存（最多 40 条，LRU by insertion order）──────────────────────
const _MAX_CACHE = 40;
const _prefetchCache = new Map<string, string>();
const _MEDIA_RE = /\.(jpg|jpeg|png|gif|webp|bmp|svg|docx|xlsx|pptx)$/i;

function _prefetchFile(file: FileEntry) {
  if (!file.path || _prefetchCache.has(file.path) || _MEDIA_RE.test(file.name)) return;
  fsAdapter.readFile(file).then(text => {
    if (_prefetchCache.size >= _MAX_CACHE) _prefetchCache.delete(_prefetchCache.keys().next().value!);
    _prefetchCache.set(file.path!, text);
  }).catch(() => {});
}

export function invalidatePrefetch(path: string) { _prefetchCache.delete(path); }

function relativeDate(ts?: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  if (diff < 86_400_000)  return 'Today';
  if (diff < 172_800_000) return 'Yesterday';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const _IMG_RE = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i;
function fileIcon(name: string) {
  if (/\.excalidraw$/i.test(name)) return DrawIcon;
  if (/\.canvas$/i.test(name))     return NodeIcon;
  if (_IMG_RE.test(name))          return ImageIcon;
  return DocIcon;
}

const SKEL_WIDTHS = ['72%', '58%', '80%', '64%', '50%'];

interface Props {
  open:         boolean;
  onFileSelect: (e: FileEntry, c: string) => void;
  P:            Palette;
  dark:         boolean;
  onBack:       () => void;
  onNew:        () => void;
}

export function CanvasDocList({ open, onFileSelect, P, dark, onBack, onNew }: Props) {
  const { selectedFolder, files, navStack, navFiles, navLoading, loading, selectedFile, sortSettings } = useLibraryStore();
  const currentName = navStack.length > 0 ? navStack[navStack.length - 1].name : (selectedFolder?.name ?? '');
  const { doclistW } = useCanvasPanelWidths();
  const [hoveredPath,  setHoveredPath]  = useState<string | null>(null);
  const [ctxMenu,      setCtxMenu]      = useState<{ x: number; y: number; entry: FileEntry } | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [preview,      setPreview]      = useState<{ x: number; y: number; text: string } | null>(null);
  const pvTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctxMenu]);

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault(); e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, entry });
  }, []);

  const handleRename = useCallback((entry: FileEntry) => {
    setCtxMenu(null);
    setRenamingPath(entry.path);
  }, []);

  const handleConfirmRename = useCallback(async (entry: FileEntry, newBase: string) => {
    setRenamingPath(null);
    const base = newBase.trim();
    if (!base || !entry.path) return;
    const ext = entry.isDirectory ? '' : (entry.name.match(/\.[^.]+$/)?.[0] ?? '');
    const newName = (!entry.isDirectory && ext && !base.endsWith(ext)) ? base + ext : base;
    if (newName === entry.name) return;
    const result = await fsAdapter.renameFile(entry, newName);
    if (result.ok && result.newPath) {
      invalidatePrefetch(entry.path);
      libraryStore.optimisticRenameFile(entry.path, result.newPath, newName);
    }
  }, []);

  const handleShowInExplorer = useCallback((entry: FileEntry) => {
    setCtxMenu(null);
    fsAdapter.showInExplorer(entry);
  }, []);

  const handleSortChange = useCallback((patch: Partial<SortSettings>) => {
    libraryStore.setSortSettings(patch);
  }, []);

  const handleDelete = useCallback((entry: FileEntry) => {
    setCtxMenu(null);
    libraryStore.optimisticRemoveFile(entry.path);
    if (entry.path) invalidatePrefetch(entry.path);
    fsAdapter.deleteFile(entry);
  }, []);

  const inSub     = navStack.length > 0;
  const isLoading = inSub ? navLoading : loading;
  const displayFiles = inSub ? navFiles : files;

  const knownPathsRef = useRef(new Set<string>());

  // 文件夹切换 cross-fade：切换时 dim，新内容到达后恢复
  const [listOpacity, setListOpacity] = useState(1);
  const activeFolderPath = inSub ? (navStack[navStack.length - 1]?.path ?? '') : (selectedFolder?.path ?? '');
  const prevFolderPathRef = useRef(activeFolderPath);
  useEffect(() => {
    if (activeFolderPath === prevFolderPathRef.current) return;
    prevFolderPathRef.current = activeFolderPath;
    knownPathsRef.current = new Set();
    setListOpacity(0);
    const t = setTimeout(() => setListOpacity(1), 50);
    return () => clearTimeout(t);
  }, [activeFolderPath]);
  useEffect(() => { if (displayFiles.length > 0) setListOpacity(1); }, [displayFiles]);
  const newPaths = new Set(displayFiles.map(f => f.path).filter(p => !knownPathsRef.current.has(p)));
  displayFiles.forEach(f => knownPathsRef.current.add(f.path));

  const selectSeqRef = useRef(0);
  const handleSelect = useCallback(async (file: FileEntry) => {
    libraryStore.setSelectedFile(file);
    const seq = ++selectSeqRef.current;
    if (_MEDIA_RE.test(file.name)) { onFileSelect(file, ''); return; }
    const cached = file.path ? _prefetchCache.get(file.path) : undefined;
    const content = cached !== undefined ? cached : await fsAdapter.readFile(file);
    if (seq !== selectSeqRef.current) return; // 已有更新的点击，丢弃此次结果
    onFileSelect(file, content);
  }, [onFileSelect]);

  const handleDirClick = useCallback(async (entry: FileEntry) => {
    if (renamingPath === entry.path) return;
    const src = entry.dirHandle
      ? { id: entry.path, name: entry.name, handle: entry.dirHandle, env: 'web' as const }
      : { id: entry.path, name: entry.name, path: entry.path, env: 'electron' as const };
    await libraryStore.pushNav(src);
  }, [renamingPath]);

  const renameInput = (entry: FileEntry) => (
    <input autoFocus
      defaultValue={entry.isDirectory ? entry.name : entry.name.replace(/\.[^.]+$/, '')}
      style={{ flex: 1, fontSize: 13, fontFamily: SYS_FONT, background: 'transparent',
        border: 'none', borderBottom: `1px solid ${P.fg}40`, outline: 'none',
        color: P.fg, padding: 0, minWidth: 0, caretColor: '#55AAFF' }}
      onBlur={e => handleConfirmRename(entry, e.currentTarget.value)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenamingPath(null); }}
      onClick={e => e.stopPropagation()} />
  );

  return (
    <>
    <div style={{ width: open ? doclistW : 0, overflow: 'hidden', flexShrink: 0,
      transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
      borderRight: `0.5px solid ${P.border}`, display: 'flex', flexDirection: 'column',
      background: P.chrome }}>
      <div style={{ width: doclistW, height: '100%', display: 'flex', flexDirection: 'column' }}>

        {/* ─ Header ─ */}
        <div style={{ height: TITLE_H, flexShrink: 0, display: 'flex', alignItems: 'center', padding: '0 6px 0 4px' }}>
          <button onClick={onBack}
            style={{ padding: '6px 6px', background: 'transparent', border: 'none', cursor: 'pointer',
              color: P.menuFg, display: 'flex', alignItems: 'center' }}>
            <svg width="7" height="11" viewBox="0 0 7 11" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 1L1 5.5L6 10"/>
            </svg>
          </button>
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: P.menuFg, fontFamily: SYS_FONT,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>
            {currentName}
          </span>
          <button onClick={onNew}
            style={{ padding: '4px 6px', background: 'transparent', border: 'none', cursor: 'pointer',
              color: P.menuFg, display: 'flex', alignItems: 'center' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M6 1v10M1 6h10"/>
            </svg>
          </button>
        </div>

        {/* ─ Sort row ─ */}
        <div onClick={() => libraryStore.setSortSettings({ newestOnTop: !sortSettings.newestOnTop })}
          style={{ height: MENU_H, flexShrink: 0, display: 'flex', alignItems: 'center',
            gap: 4, padding: '0 12px', borderBottom: `0.5px solid ${P.border}`, cursor: 'pointer' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: P.menuFg, fontFamily: SYS_FONT, userSelect: 'none' }}>
            {sortSettings.sortBy === 'name' ? 'Sort By Name' : 'Sort By Date'}
          </span>
          <svg width="8" height="5" viewBox="0 0 8 5" fill="none" stroke={P.menuFg}
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: sortSettings.newestOnTop ? 'none' : 'rotate(180deg)', transition: 'transform 0.2s' }}>
            <path d="M1 1L4 4L7 1"/>
          </svg>
        </div>

        {/* ─ List ─ */}
        <div style={{ flex: 1, overflowY: 'auto', opacity: listOpacity,
          transition: listOpacity === 0 ? 'none' : 'opacity 0.5s ease' }}>
          {isLoading && displayFiles.length === 0 && (
            <div style={{ padding: '6px 0' }}>
              {SKEL_WIDTHS.map((w, i) => (
                <div key={i} style={{ padding: '9px 12px' }}>
                  <div className="gs-skeleton" style={{ height: 11, width: w, background: P.fg, animationDelay: `${i*120}ms`, marginBottom: 5 }} />
                  <div className="gs-skeleton" style={{ height: 9, width: '45%', background: P.fg, animationDelay: `${i*120+60}ms` }} />
                </div>
              ))}
            </div>
          )}

          {displayFiles.map((entry) => {
            const active   = !entry.isDirectory && selectedFile?.path === entry.path;
            const hovered  = hoveredPath === entry.path;
            const bg       = active ? `${P.fg}0A` : hovered ? `${P.fg}06` : 'transparent';
            const isNew    = newPaths.has(entry.path);
            const renaming = renamingPath === entry.path;

            if (entry.isDirectory) return (
              <div key={entry.path} className={isNew ? 'gs-list-item' : undefined}
                onClick={() => handleDirClick(entry)}
                onContextMenu={e => handleContextMenu(e, entry)}
                onMouseEnter={() => setHoveredPath(entry.path)}
                onMouseLeave={() => setHoveredPath(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 8,
                  padding: '0 10px 0 12px', height: 36, cursor: 'pointer',
                  borderBottom: '0.5px solid transparent', borderLeft: '2px solid transparent',
                  background: bg, transition: 'background 0.12s' }}>
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ color: P.menuFg, flexShrink: 0 }}>
                  <path d="M1 3.5C1 2.67 1.67 2 2.5 2H5l1 1.5H10.5C11.33 3.5 12 4.17 12 5v5c0 .83-.67 1.5-1.5 1.5h-8C1.67 11.5 1 10.83 1 10V3.5z"/>
                </svg>
                {renaming ? renameInput(entry) : (
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: P.menuFg, fontFamily: SYS_FONT,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {entry.name}
                  </span>
                )}
                {!renaming && (
                  <svg width="5" height="8" viewBox="0 0 5 8" fill="none" stroke={P.menuFg}
                    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M1 1L4 4L1 7"/>
                  </svg>
                )}
              </div>
            );

            const Icon = fileIcon(entry.name);
            return (
              <div key={entry.path} className={isNew ? 'gs-list-item' : undefined}
                onClick={() => !renaming && handleSelect(entry)}
                onContextMenu={e => handleContextMenu(e, entry)}
                onMouseEnter={(e) => {
                  setHoveredPath(entry.path); _prefetchFile(entry);
                  if (/\.(md|txt)$/i.test(entry.name)) {
                    pvTimer.current && clearTimeout(pvTimer.current);
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    pvTimer.current = setTimeout(() => { const t = _prefetchCache.get(entry.path!); if (t) setPreview({ x: r.right + 8, y: r.top, text: t }); }, 180);
                  }
                }}
                onMouseLeave={() => { pvTimer.current && clearTimeout(pvTimer.current); setPreview(null); setHoveredPath(null); }}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 8,
                  padding: '8px 10px 8px 12px', cursor: 'pointer',
                  borderLeft: active ? '3px solid #55AAFF' : '3px solid transparent',
                  background: bg, transition: 'background 0.12s', minHeight: 44 }}>
                <span style={{ color: active ? P.fg : P.menuFg, display: 'flex', flexShrink: 0, marginTop: 1 }}>
                  <Icon />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    {renaming ? renameInput(entry) : (
                      <span style={{ flex: 1, fontSize: 13, color: active ? P.fg : P.menuFg,
                        fontWeight: 500, fontFamily: SYS_FONT,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {entry.name.replace(/\.[^.]+$/, '')}
                      </span>
                    )}
                    {!renaming && (
                      <span style={{ fontSize: 10, color: P.dim, fontFamily: SYS_FONT, flexShrink: 0 }}>
                        {relativeDate(entry.lastModified)}
                      </span>
                    )}
                  </div>
                  {!renaming && entry.preview && (
                    <div style={{ fontSize: 11, color: P.dim, fontFamily: SYS_FONT,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      marginTop: 2, lineHeight: 1.4 }}>
                      {entry.preview}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>
    </div>

    <CanvasDocListPreview pos={preview} P={P} dark={dark} />
    <CanvasDocListMenu ctxMenu={ctxMenu} P={P} dark={dark}
      sortSettings={sortSettings}
      onRename={handleRename}
      onShowInExplorer={handleShowInExplorer}
      onDelete={handleDelete}
      onSortChange={handleSortChange}
      onClose={() => setCtxMenu(null)} />
    </>
  );
}

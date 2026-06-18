/**
 * canvasLibraryStore — Library + DocList 状态（包含子目录导航）
 * 单例 + pub/sub，与 useAuth 同一模式。
 * 预览由主进程 ipc-library-cache 负责，渲染层只订阅 cache-update 事件。
 */
import type { FolderSource, FileEntry } from '../hooks/useFileSystem';
import { fsAdapter, _entriesToFileEntries } from '../hooks/useFileSystem';
import { useState, useEffect } from 'react';

const EL_PATHS_KEY    = 'gsyen_library_paths';
const EL_SELECTED_KEY = 'gsyen_library_selected';

interface LibraryState {
  folders:        FolderSource[];
  selectedFolder: FolderSource | null;
  files:          FileEntry[];
  selectedFile:   FileEntry | null;
  loading:        boolean;
  navStack:       FolderSource[];
  navFiles:       FileEntry[];
  navLoading:     boolean;
}

let _s: LibraryState = {
  folders: [], selectedFolder: null, files: [], selectedFile: null, loading: false,
  navStack: [], navFiles: [], navLoading: false,
};

const _listeners = new Set<(s: LibraryState) => void>();
function _set(patch: Partial<LibraryState>) {
  _s = { ..._s, ...patch };
  _listeners.forEach(fn => fn(_s));
}

// ── 主进程缓存更新事件 ─────────────────────────────────────────────────────────
// 当 ipc-library-cache 扫描完一批预览，把最新 entries 推过来，渲染层直接更新 state
function _setupCacheListener() {
  const api = (window as any).electronAPI;
  if (!api?.library?.onCacheUpdate) return;
  api.library.onCacheUpdate(({ folderPath, entries }: { folderPath: string; entries: any[] }) => {
    const files = _entriesToFileEntries(folderPath, entries);
    // 更新选中文件夹的列表
    if (_s.selectedFolder?.path === folderPath) {
      _set({ files, loading: false });
    }
    // 更新子目录导航的列表
    const topNav = _s.navStack[_s.navStack.length - 1];
    if (topNav?.path === folderPath) {
      _set({ navFiles: files, navLoading: false });
    }
  });
}
_setupCacheListener();

function _savePaths(folders: FolderSource[]) {
  if (fsAdapter.env !== 'electron') return;
  localStorage.setItem(EL_PATHS_KEY, JSON.stringify(
    folders.map(f => ({ id: f.id, name: f.name, path: f.path ?? '' }))
  ));
}

function _restoreElectronPaths() {
  if (fsAdapter.env !== 'electron') return;
  try {
    const saved: { id: string; name: string; path: string }[] =
      JSON.parse(localStorage.getItem(EL_PATHS_KEY) ?? '[]');
    const folders: FolderSource[] = saved.map(p => ({ ...p, env: 'electron' as const }));
    const selectedId = localStorage.getItem(EL_SELECTED_KEY);
    const selectedFolder = selectedId ? (folders.find(f => f.id === selectedId) ?? null) : null;
    _set({ folders, selectedFolder });

    // 冷启动：把所有已存的文件夹路径交给主进程，后台扫描建缓存
    const paths = folders.map(f => f.path).filter(Boolean) as string[];
    if (paths.length > 0) {
      (window as any).electronAPI?.library?.scanAll?.(paths);
    }

    if (selectedFolder) libraryStore.selectFolder(selectedFolder);
  } catch {}
}
_restoreElectronPaths();

export const libraryStore = {
  get: () => _s,

  subscribe(fn: (s: LibraryState) => void) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },

  clearFolder() {
    if (fsAdapter.env === 'electron') localStorage.removeItem(EL_SELECTED_KEY);
    _set({ selectedFolder: null, files: [], selectedFile: null, navStack: [], navFiles: [], navLoading: false });
  },

  async addFolder() {
    const src = await fsAdapter.pickFolder();
    if (!src) return;
    libraryStore.addFolderSource(src);
  },

  addFolderSource(src: FolderSource) {
    const folders = [src, ..._s.folders.filter(f => f.id !== src.id)];
    _savePaths(folders);
    _set({ folders });
    // 新增文件夹也加入扫描
    if (src.path) (window as any).electronAPI?.library?.scanAll?.([src.path]);
    libraryStore.selectFolder(src);
  },

  removeFolder(id: string) {
    const folders = _s.folders.filter(f => f.id !== id);
    _savePaths(folders);
    const selectedFolder = _s.selectedFolder?.id === id ? null : _s.selectedFolder;
    _set({ folders, selectedFolder, files: selectedFolder ? _s.files : [], selectedFile: null });
  },

  async selectFolder(src: FolderSource) {
    if (fsAdapter.env === 'electron') localStorage.setItem(EL_SELECTED_KEY, src.id);
    _set({ selectedFolder: src, loading: true, files: [], selectedFile: null, navStack: [], navFiles: [] });
    try {
      const files = await fsAdapter.readDir(src);
      _set({ files, loading: false });
    } catch {
      _set({ loading: false });
    }
  },

  setSelectedFile(file: FileEntry | null) { _set({ selectedFile: file }); },

  // ── DocList 子目录导航 ──────────────────────────────────────────────────────

  async pushNav(src: FolderSource) {
    const navStack = [..._s.navStack, src];
    _set({ navStack, navLoading: true });
    try {
      const navFiles = await fsAdapter.readDir(src);
      _set({ navFiles, navLoading: false });
    } catch { _set({ navLoading: false }); }
  },

  async popNav() {
    if (_s.navStack.length === 0) { libraryStore.clearFolder(); return; }
    const navStack = _s.navStack.slice(0, -1);
    _set({ navStack, navLoading: true });
    if (navStack.length === 0) {
      _set({ navFiles: [], navLoading: false });
    } else {
      try {
        const navFiles = await fsAdapter.readDir(navStack[navStack.length - 1]);
        _set({ navFiles, navLoading: false });
      } catch { _set({ navLoading: false }); }
    }
  },

  async refreshCurrent() {
    if (_s.navStack.length > 0) {
      const navFiles = await fsAdapter.readDir(_s.navStack[_s.navStack.length - 1]);
      _set({ navFiles });
    } else if (_s.selectedFolder) {
      const files = await fsAdapter.readDir(_s.selectedFolder);
      _set({ files });
    }
  },
};

export function useLibraryStore() {
  const [state, setState] = useState(_s);
  useEffect(() => libraryStore.subscribe(setState), []);
  return state;
}

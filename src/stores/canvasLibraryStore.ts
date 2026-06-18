/**
 * canvasLibraryStore — Library + DocList 状态（包含子目录导航 + 排序设置）
 * 单例 + pub/sub，与 useAuth 同一模式。
 */
import type { FolderSource, FileEntry } from '../hooks/useFileSystem';
import { fsAdapter } from '../hooks/useFileSystem';
import { useState, useEffect } from 'react';

const EL_PATHS_KEY    = 'gsyen_library_paths';
const EL_SELECTED_KEY = 'gsyen_library_selected';
const SORT_KEY        = 'gsyen_library_sort';

export interface SortSettings {
  foldersOnTop: boolean;
  sortBy:       'date' | 'name';
  newestOnTop:  boolean;
}

const DEFAULT_SORT: SortSettings = { foldersOnTop: true, sortBy: 'date', newestOnTop: true };

function _loadSort(): SortSettings {
  try { return { ...DEFAULT_SORT, ...JSON.parse(localStorage.getItem(SORT_KEY) ?? '{}') }; }
  catch { return DEFAULT_SORT; }
}

function _sortFiles(files: FileEntry[], s: SortSettings): FileEntry[] {
  const sortFn = (a: FileEntry, b: FileEntry): number => {
    if (s.sortBy === 'name') {
      const na = a.name.replace(/\.[^.]+$/, '');
      const nb = b.name.replace(/\.[^.]+$/, '');
      const cmp = na.localeCompare(nb);
      return s.newestOnTop ? -cmp : cmp;
    }
    const diff = (b.lastModified ?? 0) - (a.lastModified ?? 0);
    return s.newestOnTop ? diff : -diff;
  };
  if (s.foldersOnTop) {
    const dirs = files.filter(f =>  f.isDirectory).sort((a, b) => a.name.localeCompare(b.name));
    const docs = files.filter(f => !f.isDirectory).sort(sortFn);
    return [...dirs, ...docs];
  }
  return [...files].sort(sortFn);
}

// readDir 原始结果缓存（未排序）：folderSource.id → FileEntry[]
const _dirCache = new Map<string, FileEntry[]>();

function _normPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/$/, '');
}

interface LibraryState {
  folders:        FolderSource[];
  selectedFolder: FolderSource | null;
  files:          FileEntry[];
  selectedFile:   FileEntry | null;
  loading:        boolean;
  navStack:       FolderSource[];
  navFiles:       FileEntry[];
  navLoading:     boolean;
  sortSettings:   SortSettings;
}

let _s: LibraryState = {
  folders: [], selectedFolder: null, files: [], selectedFile: null, loading: false,
  navStack: [], navFiles: [], navLoading: false,
  sortSettings: _loadSort(),
};

const _listeners = new Set<(s: LibraryState) => void>();
function _set(patch: Partial<LibraryState>) {
  _s = { ..._s, ...patch };
  _listeners.forEach(fn => fn(_s));
}

function _restoreElectronPaths() {
  if (fsAdapter.env !== 'electron') return;
  try {
    const saved: { id: string; name: string; path: string }[] =
      JSON.parse(localStorage.getItem(EL_PATHS_KEY) ?? '[]');
    const seen = new Set<string>();
    const folders: FolderSource[] = saved
      .filter(p => p.name?.trim() && p.path?.trim() && p.path.trim().length > 2)
      .map(p => ({ ...p, env: 'electron' as const }))
      .filter(f => {
        const key = _normPath(f.path!);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    const selectedId = localStorage.getItem(EL_SELECTED_KEY);
    const selectedFolder = selectedId ? (folders.find(f => f.id === selectedId) ?? null) : null;
    _set({ folders, selectedFolder });
    if (selectedFolder) libraryStore.selectFolder(selectedFolder);
  } catch {}
}
_restoreElectronPaths();

function _savePaths(folders: FolderSource[]) {
  if (fsAdapter.env !== 'electron') return;
  localStorage.setItem(EL_PATHS_KEY, JSON.stringify(
    folders
      .filter(f => f.name?.trim() && f.path?.trim() && f.path.trim().length > 2)
      .map(f => ({ id: f.id, name: f.name, path: f.path ?? '' }))
  ));
}

export const libraryStore = {
  get: () => _s,

  subscribe(fn: (s: LibraryState) => void) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },

  clearFolder() {
    if (fsAdapter.env === 'electron') {
      localStorage.removeItem(EL_SELECTED_KEY);
      (window as any).electronAPI?.library?.unwatchFolder?.();
    }
    _set({ selectedFolder: null, files: [], selectedFile: null, navStack: [], navFiles: [], navLoading: false });
  },

  async addFolder() {
    const src = await fsAdapter.pickFolder();
    if (!src) return;
    libraryStore.addFolderSource(src);
  },

  addFolderSource(src: FolderSource) {
    if (!src.name?.trim() || !src.path?.trim()) return;
    const normKey = src.path ? _normPath(src.path) : src.id;
    const folders = [src, ..._s.folders.filter(f => {
      const key = f.path ? _normPath(f.path) : f.id;
      return key !== normKey;
    })];
    _savePaths(folders);
    _set({ folders });
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
    const cached = _dirCache.get(src.id);
    if (cached) {
      _set({ selectedFolder: src, files: _sortFiles(cached, _s.sortSettings),
        loading: false, selectedFile: null, navStack: [], navFiles: [] });
      (window as any).electronAPI?.library?.watchFolder?.(src.path);
      return;
    }
    _set({ selectedFolder: src, loading: true, files: [], selectedFile: null, navStack: [], navFiles: [] });
    try {
      const raw = await fsAdapter.readDir(src);
      _dirCache.set(src.id, raw);
      _set({ files: _sortFiles(raw, _s.sortSettings), loading: false });
      (window as any).electronAPI?.library?.watchFolder?.(src.path);
    } catch { _set({ loading: false }); }
  },

  setSelectedFile(file: FileEntry | null) { _set({ selectedFile: file }); },

  optimisticRemoveFile(filePath: string) {
    const keep = (f: FileEntry) => f.path !== filePath;
    // 同步清理 _dirCache 原始数据
    for (const [k, v] of _dirCache) _dirCache.set(k, v.filter(keep));
    _set({
      files:    _s.files.filter(keep),
      navFiles: _s.navFiles.filter(keep),
      selectedFile: _s.selectedFile?.path === filePath ? null : _s.selectedFile,
    });
  },

  optimisticRenameFile(oldPath: string, newPath: string, newName: string) {
    const update = (f: FileEntry): FileEntry =>
      f.path === oldPath ? { ...f, path: newPath, name: newName } : f;
    for (const [k, v] of _dirCache) _dirCache.set(k, v.map(update));
    _set({
      files:        _s.files.map(update),
      navFiles:     _s.navFiles.map(update),
      selectedFile: _s.selectedFile?.path === oldPath ? update(_s.selectedFile) : _s.selectedFile,
    });
  },

  optimisticAddFile(entry: FileEntry) {
    if (_s.navStack.length > 0) {
      _set({ navFiles: [entry, ..._s.navFiles] });
    } else {
      _set({ files: [entry, ..._s.files] });
    }
  },

  setSortSettings(patch: Partial<SortSettings>) {
    const sortSettings = { ..._s.sortSettings, ...patch };
    try { localStorage.setItem(SORT_KEY, JSON.stringify(sortSettings)); } catch {}
    _set({
      sortSettings,
      files:    _sortFiles(_s.files,    sortSettings),
      navFiles: _sortFiles(_s.navFiles, sortSettings),
    });
  },

  // ── DocList 子目录导航 ────────────────────────────────────────────────────────

  async pushNav(src: FolderSource) {
    const navStack = [..._s.navStack, src];
    const cached = _dirCache.get(src.id);
    if (cached) {
      _set({ navStack, navFiles: _sortFiles(cached, _s.sortSettings), navLoading: false });
      return;
    }
    _set({ navStack, navLoading: true });
    try {
      const raw = await fsAdapter.readDir(src);
      _dirCache.set(src.id, raw);
      _set({ navFiles: _sortFiles(raw, _s.sortSettings), navLoading: false });
    } catch { _set({ navLoading: false }); }
  },

  async popNav() {
    if (_s.navStack.length === 0) { libraryStore.clearFolder(); return; }
    const navStack = _s.navStack.slice(0, -1);
    if (navStack.length === 0) {
      _set({ navStack, navFiles: [], navLoading: false });
      return;
    }
    const parent = navStack[navStack.length - 1];
    const cached = _dirCache.get(parent.id);
    if (cached) {
      _set({ navStack, navFiles: _sortFiles(cached, _s.sortSettings), navLoading: false });
      return;
    }
    _set({ navStack, navLoading: true });
    try {
      const raw = await fsAdapter.readDir(parent);
      _dirCache.set(parent.id, raw);
      _set({ navFiles: _sortFiles(raw, _s.sortSettings), navLoading: false });
    } catch { _set({ navLoading: false }); }
  },

  prefetchDir(entry: FileEntry) {
    if (!entry.path || _dirCache.has(entry.path)) return;
    if (_dirCache.size >= 40) _dirCache.delete(_dirCache.keys().next().value!);
    const src: FolderSource = entry.dirHandle ? { id: entry.path, name: entry.name, handle: entry.dirHandle, env: 'web' } : { id: entry.path, name: entry.name, path: entry.path, env: 'electron' };
    fsAdapter.readDir(src).then(raw => _dirCache.set(entry.path!, raw)).catch(() => {});
  },

  async refreshCurrent() {
    if (_s.navStack.length > 0) {
      const src = _s.navStack[_s.navStack.length - 1];
      const raw = await fsAdapter.readDir(src);
      _dirCache.set(src.id, raw);
      _set({ navFiles: _sortFiles(raw, _s.sortSettings) });
    } else if (_s.selectedFolder) {
      const raw = await fsAdapter.readDir(_s.selectedFolder);
      _dirCache.set(_s.selectedFolder.id, raw);
      _set({ files: _sortFiles(raw, _s.sortSettings) });
    }
  },
};

// fs.watch 事件订阅：文件夹有变化 → 失效缓存 → 自动刷新
function _initFsWatcher() {
  const api = (window as any).electronAPI;
  if (!api?.library?.onFolderChanged) return;
  api.library.onFolderChanged(() => {
    if (_s.selectedFolder) _dirCache.delete(_s.selectedFolder.id);
    libraryStore.refreshCurrent();
  });
}
if (typeof window !== 'undefined') setTimeout(_initFsWatcher, 0);

export function useLibraryStore() {
  const [state, setState] = useState(_s);
  useEffect(() => libraryStore.subscribe(setState), []);
  return state;
}

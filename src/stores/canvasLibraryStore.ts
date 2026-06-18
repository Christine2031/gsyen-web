/**
 * canvasLibraryStore — Library + DocList 状态（包含子目录导航）
 * 单例 + pub/sub，与 useAuth 同一模式。
 */
import type { FolderSource, FileEntry } from '../hooks/useFileSystem';
import { fsAdapter } from '../hooks/useFileSystem';
import { useState, useEffect } from 'react';

const EL_PATHS_KEY    = 'gsyen_library_paths';
const EL_SELECTED_KEY = 'gsyen_library_selected';

// readDir 结果缓存：folderSource.id → FileEntry[]
const _dirCache = new Map<string, FileEntry[]>();

// 路径归一化：统一正斜杠 + 去尾部斜杠（防止同一文件夹因路径格式不同被重复添加）
function _normPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/$/, '');
}

interface LibraryState {
  folders:        FolderSource[];
  selectedFolder: FolderSource | null;
  files:          FileEntry[];
  selectedFile:   FileEntry | null;
  loading:        boolean;
  // DocList 子目录导航
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

function _restoreElectronPaths() {
  if (fsAdapter.env !== 'electron') return;
  try {
    const saved: { id: string; name: string; path: string }[] =
      JSON.parse(localStorage.getItem(EL_PATHS_KEY) ?? '[]');
    const seen = new Set<string>();
    const folders: FolderSource[] = saved
      .filter(p => p.name?.trim() && p.path?.trim() && p.path.trim().length > 2)  // 过滤脏数据
      .map(p => ({ ...p, env: 'electron' as const }))      // 保留原始路径，不做修改
      .filter(f => {
        const key = _normPath(f.path!);                    // normalize 只用于去重比较
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
    // 缓存命中 → 立刻显示，不 loading
    const cached = _dirCache.get(src.id);
    if (cached) {
      _set({ selectedFolder: src, files: cached, loading: false, selectedFile: null, navStack: [], navFiles: [] });
      (window as any).electronAPI?.library?.watchFolder?.(src.path);
      return;
    }
    _set({ selectedFolder: src, loading: true, files: [], selectedFile: null, navStack: [], navFiles: [] });
    try {
      const files = await fsAdapter.readDir(src);
      _dirCache.set(src.id, files);
      _set({ files, loading: false });
      (window as any).electronAPI?.library?.watchFolder?.(src.path);
    } catch {
      _set({ loading: false });
    }
  },

  setSelectedFile(file: FileEntry | null) { _set({ selectedFile: file }); },

  /** 删除文件后立刻从列表移除，不等 readDir 重扫 */
  optimisticRemoveFile(filePath: string) {
    const keep = (f: FileEntry) => f.path !== filePath;
    _set({
      files:    _s.files.filter(keep),
      navFiles: _s.navFiles.filter(keep),
      selectedFile: _s.selectedFile?.path === filePath ? null : _s.selectedFile,
    });
  },

  /** 重命名后立刻更新列表，不等 readDir 重扫 */
  optimisticRenameFile(oldPath: string, newPath: string, newName: string) {
    const update = (f: FileEntry): FileEntry =>
      f.path === oldPath ? { ...f, path: newPath, name: newName } : f;
    _set({
      files:        _s.files.map(update),
      navFiles:     _s.navFiles.map(update),
      selectedFile: _s.selectedFile?.path === oldPath ? update(_s.selectedFile) : _s.selectedFile,
    });
  },

  /** 新建文件后立刻乐观插入列表顶部，不等 readDir 重扫 */
  optimisticAddFile(entry: FileEntry) {
    if (_s.navStack.length > 0) {
      _set({ navFiles: [entry, ..._s.navFiles] });
    } else {
      _set({ files: [entry, ..._s.files] });
    }
  },


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
      _dirCache.set(_s.selectedFolder.id, files); // 刷新缓存
      _set({ files });
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

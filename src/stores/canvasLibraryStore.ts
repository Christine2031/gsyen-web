/**
 * canvasLibraryStore — Library 面板状态（文件夹树 + 文档列表）
 * 单例 + 发布订阅，与 useAuth 同一模式。
 * Electron：文件夹路径存 localStorage 持久化。
 * Web：FileSystemDirectoryHandle 无法序列化，仅内存持久，刷新需重授权。
 */
import type { FolderSource, FileEntry } from '../hooks/useFileSystem';
import { fsAdapter } from '../hooks/useFileSystem';
import { useState, useEffect } from 'react';

const EL_PATHS_KEY = 'gsyen_library_paths';

interface LibraryState {
  folders:        FolderSource[];
  selectedFolder: FolderSource | null;
  files:          FileEntry[];
  selectedFile:   FileEntry | null;
  loading:        boolean;
}

let _s: LibraryState = {
  folders: [], selectedFolder: null, files: [], selectedFile: null, loading: false,
};

const _listeners = new Set<(s: LibraryState) => void>();

function _set(patch: Partial<LibraryState>) {
  _s = { ..._s, ...patch };
  _listeners.forEach(fn => fn(_s));
}

// Electron 启动时从 localStorage 恢复路径（不含 handle，Web 无法持久化）
function _restoreElectronPaths() {
  if (fsAdapter.env !== 'electron') return;
  try {
    const saved: { id: string; name: string; path: string }[] =
      JSON.parse(localStorage.getItem(EL_PATHS_KEY) ?? '[]');
    const folders: FolderSource[] = saved.map(p => ({ ...p, env: 'electron' as const }));
    _set({ folders });
  } catch {}
}
_restoreElectronPaths();

function _saveElectronPaths(folders: FolderSource[]) {
  if (fsAdapter.env !== 'electron') return;
  const toSave = folders.map(f => ({ id: f.id, name: f.name, path: f.path ?? '' }));
  localStorage.setItem(EL_PATHS_KEY, JSON.stringify(toSave));
}

export const libraryStore = {
  get: () => _s,

  subscribe(fn: (s: LibraryState) => void) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
  },

  async addFolder() {
    const src = await fsAdapter.pickFolder();
    if (!src) return;
    const folders = [src, ..._s.folders.filter(f => f.id !== src.id)];
    _saveElectronPaths(folders);
    _set({ folders });
    await libraryStore.selectFolder(src);
  },

  removeFolder(id: string) {
    const folders = _s.folders.filter(f => f.id !== id);
    _saveElectronPaths(folders);
    const selectedFolder = _s.selectedFolder?.id === id ? null : _s.selectedFolder;
    _set({ folders, selectedFolder, files: selectedFolder ? _s.files : [], selectedFile: null });
  },

  async selectFolder(src: FolderSource) {
    _set({ selectedFolder: src, loading: true, files: [], selectedFile: null });
    try {
      const files = await fsAdapter.readDir(src);
      _set({ files, loading: false });
    } catch {
      _set({ loading: false });
    }
  },

  setSelectedFile(file: FileEntry | null) {
    _set({ selectedFile: file });
  },
};

// ── React hook ────────────────────────────────────────────────────────────────

export function useLibraryStore() {
  const [state, setState] = useState(_s);
  useEffect(() => libraryStore.subscribe(setState), []);
  return state;
}

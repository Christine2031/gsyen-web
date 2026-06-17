/**
 * useFileSystem — Web (File System Access API) / Electron (fs IPC) 统一抽象层
 * 上层组件只调用 fsAdapter，平台差异完全隔离在此文件内。
 */

export interface FileEntry {
  name:         string;
  path:         string;
  handle?:      FileSystemFileHandle; // Web FSA
  isMarkdown:   boolean;
  lastModified?: number;
}

export interface FolderSource {
  id:      string;                        // Electron = path; Web = name+ts
  name:    string;
  path?:   string;                        // Electron 绝对路径
  handle?: FileSystemDirectoryHandle;     // Web FSA
  env:     'web' | 'electron';
}

const _isElectron = !!(window as any).electronAPI?.isElectron;

// ── Web: File System Access API ───────────────────────────────────────────────

async function _webPickFolder(): Promise<FolderSource | null> {
  if (!('showDirectoryPicker' in window)) {
    alert('此浏览器不支持 File System Access API，请改用 Chrome 或 Edge。');
    return null;
  }
  try {
    const h = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    return { id: `web_${h.name}_${Date.now()}`, name: h.name, handle: h, env: 'web' };
  } catch { return null; } // 用户取消
}

async function _webReadDir(src: FolderSource): Promise<FileEntry[]> {
  if (!src.handle) return [];
  const out: FileEntry[] = [];
  for await (const [name, h] of (src.handle as any).entries()) {
    if (h.kind !== 'file') continue;
    if (!name.endsWith('.md') && !name.endsWith('.txt')) continue;
    const f = await h.getFile();
    out.push({ name, path: name, handle: h, isMarkdown: name.endsWith('.md'), lastModified: f.lastModified });
  }
  return out.sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
}

async function _webReadFile(e: FileEntry): Promise<string> {
  if (!e.handle) return '';
  return (await (e.handle as FileSystemFileHandle).getFile()).text();
}

async function _webWriteFile(e: FileEntry, content: string): Promise<void> {
  if (!e.handle) return;
  const w = await (e.handle as any).createWritable();
  await w.write(content); await w.close();
}

// ── Electron: Node.js fs via IPC ──────────────────────────────────────────────
// Renderer 侧只调用 window.electronAPI.*，主进程 IPC handlers 见 electron/main.cjs

async function _elPickFolder(): Promise<FolderSource | null> {
  const api = (window as any).electronAPI;
  if (!api?.showOpenDialog) return null;
  const r = await api.showOpenDialog({ properties: ['openDirectory'] });
  if (r.canceled || !r.filePaths[0]) return null;
  const p = r.filePaths[0];
  return { id: p, name: p.split(/[\\/]/).pop() ?? p, path: p, env: 'electron' };
}

async function _elReadDir(src: FolderSource): Promise<FileEntry[]> {
  const api = (window as any).electronAPI;
  if (!api?.readDir || !src.path) return [];
  const entries: { name: string; lastModified: number; isDir: boolean }[] = await api.readDir(src.path);
  return entries
    .filter(e => !e.isDir && /\.(md|txt)$/i.test(e.name))
    .map(e => ({ name: e.name, path: `${src.path}/${e.name}`, isMarkdown: /\.md$/i.test(e.name), lastModified: e.lastModified }))
    .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
}

async function _elReadFile(e: FileEntry): Promise<string> {
  return (window as any).electronAPI?.readFile?.(e.path) ?? '';
}

async function _elWriteFile(e: FileEntry, content: string): Promise<void> {
  await (window as any).electronAPI?.writeFile?.(e.path, content);
}

// ── 统一接口 ──────────────────────────────────────────────────────────────────

export const fsAdapter = {
  env:        _isElectron ? 'electron' : 'web' as 'electron' | 'web',
  pickFolder: _isElectron ? _elPickFolder  : _webPickFolder,
  readDir:    _isElectron ? _elReadDir     : _webReadDir,
  readFile:   _isElectron ? _elReadFile    : _webReadFile,
  writeFile:  _isElectron ? _elWriteFile   : _webWriteFile,
};

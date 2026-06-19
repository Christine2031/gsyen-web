/**
 * useFileSystem — Web (File System Access API) / Electron (fs IPC) 统一抽象层
 * 上层组件只调用 fsAdapter，平台差异完全隔离在此文件内。
 */

export interface FileEntry {
  name:          string;
  path:          string;
  handle?:       FileSystemFileHandle;
  dirHandle?:    FileSystemDirectoryHandle; // Web FSA subdirectory handle
  isMarkdown:    boolean;
  isDirectory?:  boolean;
  lastModified?: number;
  preview?:      string;
}

export interface FolderSource {
  id:      string;
  name:    string;
  path?:   string;
  handle?: FileSystemDirectoryHandle;
  env:     'web' | 'electron';
}

const _isElectron = !!(window as any).electronAPI?.isElectron;

// ── Electron: preview first line, max 512 bytes ───────────────────────────────

async function _elReadPreview(path: string): Promise<string> {
  try {
    const url = 'file:///' + path.replace(/\\/g, '/');
    const response = await fetch(url);
    if (!response.ok || !response.body) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < 512) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      total += value.length;
    }
    reader.cancel().catch(() => {});
    const text = new TextDecoder().decode(
      chunks.reduce((a, b) => { const m = new Uint8Array(a.length + b.length); m.set(a); m.set(b, a.length); return m; }, new Uint8Array(0))
    );
    return text.split('\n')
      .map(l => l.replace(/^[#>\s*\-–—]+/, '').trim())
      .find(l => l.length > 2)
      ?.slice(0, 80) ?? '';
  } catch { return ''; }
}

// ── Web: File System Access API ───────────────────────────────────────────────

async function _webPickFolder(): Promise<FolderSource | null> {
  if (!('showDirectoryPicker' in window)) {
    alert('此浏览器不支持 File System Access API，请改用 Chrome 或 Edge。');
    return null;
  }
  try {
    const h = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
    return { id: `web_${h.name}_${Date.now()}`, name: h.name, handle: h, env: 'web' };
  } catch { return null; }
}

async function _webReadDir(src: FolderSource): Promise<FileEntry[]> {
  if (!src.handle) return [];
  const out: FileEntry[] = [];
  for await (const [name, h] of (src.handle as any).entries()) {
    if (h.kind === 'directory') {
      out.push({ name, path: name, isMarkdown: false, isDirectory: true, dirHandle: h });
      continue;
    }
    if (!/\.(md|txt|excalidraw|canvas|jpg|jpeg|png|gif|webp|bmp|svg|docx|xlsx|pptx)$/i.test(name)) continue;
    const f = await h.getFile();
    let preview = '';
    if (/\.(md|txt)$/i.test(name)) {
      const text = await f.slice(0, 512).text();
      preview = text.split('\n')
        .map((l: string) => l.replace(/^[#>\s*\-–—]+/, '').trim())
        .find((l: string) => l.length > 2)
        ?.slice(0, 80) ?? '';
    }
    out.push({ name, path: name, handle: h, isMarkdown: /\.md$/i.test(name), lastModified: f.lastModified, preview });
  }
  return out.sort((a, b) => {
    if (!!a.isDirectory !== !!b.isDirectory) return a.isDirectory ? -1 : 1;
    return (b.lastModified ?? 0) - (a.lastModified ?? 0);
  });
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

// ── Electron ──────────────────────────────────────────────────────────────────

async function _elPickFolderViaDialog(): Promise<FolderSource | null> {
  const api = (window as any).electronAPI;
  try {
    const r = await api?.showOpenDialog?.({ properties: ['openDirectory'] });
    if (!r || r.canceled || !r.filePaths?.[0]) return null;
    const p = r.filePaths[0].replace(/[\\/]+$/, ''); // 去掉末尾反斜杠（Windows 路径常见）
    const name = p.split(/[\\/]/).pop() || p;        // || 而非 ??，空字符串也回退到 p
    if (!name.trim()) return null;                   // 彻底兜底
    return { id: p, name, path: p, env: 'electron' };
  } catch (e) {
    console.error('[fsAdapter] showOpenDialog IPC error:', e);
    return null;
  }
}

type RawEntry = { name: string; lastModified: number; isDir: boolean; preview?: string };

function _entriesToFileEntries(basePath: string, entries: RawEntry[]): FileEntry[] {
  const dirs: FileEntry[] = entries
    .filter(e => e.isDir && !e.name.startsWith('.') && !e.name.startsWith('$'))
    .map(e => ({ name: e.name, path: `${basePath}/${e.name}`,
      isMarkdown: false, isDirectory: true, lastModified: e.lastModified, preview: '' }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const files: FileEntry[] = entries
    .filter(e => !e.isDir && /\.(md|txt|excalidraw|canvas|jpg|jpeg|png|gif|webp|bmp|svg|docx|xlsx|pptx)$/i.test(e.name))
    .map(e => ({ name: e.name, path: `${basePath}/${e.name}`,
      isMarkdown: /\.md$/i.test(e.name), lastModified: e.lastModified, preview: e.preview ?? '' }))
    .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));

  return [...dirs, ...files];
}

async function _elReadDir(src: FolderSource): Promise<FileEntry[]> {
  const api = (window as any).electronAPI;
  if (!src.path) return [];
  try {
    // 新缓存层（需重启 Electron 生效）
    if (api?.library?.readDir) {
      const entries: RawEntry[] | null = await api.library.readDir(src.path);
      if (entries) return _entriesToFileEntries(src.path, entries);
      // null = 缓存冷启动，用 fs:readDir 先拿到目录结构（无预览），preview 稍后 cache-update 补
    }
    const raw: RawEntry[] = await api?.readDir?.(src.path) ?? [];
    return _entriesToFileEntries(src.path, raw);
  } catch { return []; }
}

export { _entriesToFileEntries };

async function _elReadFile(e: FileEntry): Promise<string> {
  if (!e.path) return '';
  try {
    const url = 'file:///' + e.path.replace(/\\/g, '/');
    const r = await fetch(url);
    if (r.ok) return r.text();
  } catch {}
  return (window as any).electronAPI?.readFile?.(e.path) ?? '';
}

async function _elWriteFile(e: FileEntry, content: string): Promise<void> {
  if (!e.path) return;
  await (window as any).electronAPI?.writeFile?.(e.path, content);
}

async function _elDeleteFile(e: FileEntry): Promise<boolean> {
  if (!e.path) return false;
  const r = await (window as any).electronAPI?.library?.delete?.(e.path);
  return r?.ok ?? false;
}

function _elShowInExplorer(e: FileEntry): void {
  if (e.path) (window as any).electronAPI?.library?.showInExplorer?.(e.path);
}

async function _elRenameFile(e: FileEntry, newName: string): Promise<{ ok: boolean; newPath?: string }> {
  if (!e.path) return { ok: false };
  const r = await (window as any).electronAPI?.library?.rename?.(e.path, newName);
  return r ?? { ok: false };
}

// ── 统一接口 ──────────────────────────────────────────────────────────────────

async function _webReadPreview(e: FileEntry): Promise<string> {
  if (!e.handle) return '';
  try {
    const f = await (e.handle as FileSystemFileHandle).getFile();
    const text = await f.slice(0, 512).text();
    return text.split('\n')
      .map((l: string) => l.replace(/^[#>\s*\-–—]+/, '').trim())
      .find((l: string) => l.length > 2)
      ?.slice(0, 80) ?? '';
  } catch { return ''; }
}

async function _elReadPreviewEntry(e: FileEntry): Promise<string> {
  return e.path ? _elReadPreview(e.path) : '';
}

export const fsAdapter = {
  env:            _isElectron ? 'electron' : 'web' as 'electron' | 'web',
  pickFolder:     _isElectron ? _elPickFolderViaDialog : _webPickFolder,
  readDir:        _isElectron ? _elReadDir             : _webReadDir,
  readFile:       _isElectron ? _elReadFile            : _webReadFile,
  writeFile:      _isElectron ? _elWriteFile           : _webWriteFile,
  readPreview:    _isElectron ? _elReadPreviewEntry    : _webReadPreview,
  deleteFile:     _isElectron ? _elDeleteFile          : async () => false,
  showInExplorer: _isElectron ? _elShowInExplorer      : () => {},
  renameFile:     _isElectron ? _elRenameFile          : async () => ({ ok: false as const }),
};

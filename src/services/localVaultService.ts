import type { StoredSession } from '../types/chat';

const IDB_NAME  = 'gsyen_vault_db';
const IDB_STORE = 'handles';
const HANDLE_KEY = 'chat_dir';

// ── IndexedDB helpers ─────────────────────────────────────────────────────────

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess  = () => resolve(req.result);
    req.onerror    = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openIDB();
  return new Promise(resolve => {
    const req = db.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror   = () => resolve(null);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

async function idbDel(key: string): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => resolve();
  });
}

// ── Permission helpers ────────────────────────────────────────────────────────

async function verifyPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm === 'granted') return true;
  return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
}

// ── Markdown formatter ────────────────────────────────────────────────────────

function toMarkdown(session: StoredSession): string {
  const date = new Date(session.updatedAt).toLocaleDateString('zh-CN');
  const lines: string[] = [
    `# ${session.title}`,
    '',
    `> 模型: ${session.model.toUpperCase()} · 更新: ${date}`,
    '',
    '---',
    '',
  ];
  for (const msg of session.messages) {
    const speaker = msg.role === 'user' ? '**您**' : '**缈缈**';
    lines.push(`${speaker} · ${msg.timestamp}`, '', msg.content, '', '---', '');
  }
  return lines.join('\n');
}

function safeFilename(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) + '.md';
}

// ── Public API ────────────────────────────────────────────────────────────────

export type VaultStatus = 'granted' | 'denied' | 'none';

export const localVaultService = {
  isSupported(): boolean {
    return 'showDirectoryPicker' in window;
  },

  async getStatus(): Promise<VaultStatus> {
    const handle = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY);
    if (!handle) return 'none';
    try {
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      return perm === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'none';
    }
  },

  async requestAccess(): Promise<boolean> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      await idbSet(HANDLE_KEY, handle);
      return true;
    } catch {
      return false;
    }
  },

  async revokeAccess(): Promise<void> {
    await idbDel(HANDLE_KEY);
  },

  async saveSession(session: StoredSession): Promise<void> {
    const handle = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY);
    if (!handle) return;
    const granted = await verifyPermission(handle);
    if (!granted) return;
    try {
      const fileHandle = await handle.getFileHandle(safeFilename(session.title), { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(toMarkdown(session));
      await writable.close();
    } catch (e) {
      console.warn('[vault] saveSession error', e);
    }
  },
};

/**
 * canvasStore — CANVAS 文档/画板持久化
 * 每条记录 = 一个 MD 文档或画板，存 localStorage。
 */

const KEY = 'gsyen_canvas_docs';

export type CanvasType = 'doc' | 'canvas';

export interface CanvasDoc {
  id:        string;
  title:     string;
  content:   string;       // Markdown 文本（canvas 类型存 JSON 序列化数据）
  type:      CanvasType;
  scope:     'self' | 'shared';
  createdAt: string;
  updatedAt: string;
  tags?:     string[];
}

function load(): CanvasDoc[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}

function save(docs: CanvasDoc[]) {
  localStorage.setItem(KEY, JSON.stringify(docs));
  window.dispatchEvent(new Event('canvas-updated'));
}

export const canvasStore = {
  getAll:   (): CanvasDoc[] => load(),
  getById:  (id: string)    => load().find(d => d.id === id),
  getRecent: (n = 5)        => load().slice(0, n),

  add(doc: CanvasDoc) {
    save([doc, ...load()]);
  },

  update(id: string, patch: Partial<CanvasDoc>) {
    save(load().map(d => d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d));
  },

  remove(id: string) {
    save(load().filter(d => d.id !== id));
  },
};

// 动态看板列，按 boardId 隔离存储
export interface KanbanColumn {
  id: string;
  title: string;
}

const KEY     = (boardId: string) => `gsyen_kanban_cols_${boardId}`;
const NOTIFY  = () => window.dispatchEvent(new CustomEvent('kanban-columns-updated'));

const DEFAULTS: KanbanColumn[] = [
  { id: 'todo',     title: '待处理' },
  { id: 'progress', title: '进行中' },
  { id: 'review',   title: '评审中' },
  { id: 'done',     title: '已完成' },
];

function load(boardId: string): KanbanColumn[] {
  try {
    const raw = localStorage.getItem(KEY(boardId));
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULTS;
}

function persist(boardId: string, cols: KanbanColumn[]) {
  localStorage.setItem(KEY(boardId), JSON.stringify(cols));
  NOTIFY();
}

export const kanbanColumnStore = {
  getAll: (boardId: string): KanbanColumn[] => load(boardId),

  add: (boardId: string, title: string): KanbanColumn => {
    const col: KanbanColumn = { id: `col_${Date.now()}`, title };
    persist(boardId, [...load(boardId), col]);
    return col;
  },

  rename: (boardId: string, id: string, title: string) =>
    persist(boardId, load(boardId).map(c => c.id === id ? { ...c, title } : c)),

  remove: (boardId: string, id: string) =>
    persist(boardId, load(boardId).filter(c => c.id !== id)),
};

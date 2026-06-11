// 看板卡片，与日历 EventItem 完全分离，按 boardId 隔离存储
export interface KanbanCard {
  id: string;
  columnId: string;
  title: string;
  description: string;
  createdAt: string;
}

const KEY    = (boardId: string) => `gsyen_kanban_cards_${boardId}`;
const NOTIFY = () => window.dispatchEvent(new CustomEvent('kanban-cards-updated'));

function load(boardId: string): KanbanCard[] {
  try {
    const raw = localStorage.getItem(KEY(boardId));
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function persist(boardId: string, cards: KanbanCard[]) {
  localStorage.setItem(KEY(boardId), JSON.stringify(cards));
  NOTIFY();
}

export const kanbanCardStore = {
  getAll: (boardId: string): KanbanCard[] => load(boardId),

  add: (boardId: string, columnId: string, title: string, description = ''): KanbanCard => {
    const card: KanbanCard = { id: `card_${Date.now()}`, columnId, title, description, createdAt: new Date().toISOString() };
    persist(boardId, [...load(boardId), card]);
    return card;
  },

  update: (boardId: string, id: string, changes: Partial<KanbanCard>) =>
    persist(boardId, load(boardId).map(c => c.id === id ? { ...c, ...changes } : c)),

  remove: (boardId: string, id: string) =>
    persist(boardId, load(boardId).filter(c => c.id !== id)),

  move: (boardId: string, id: string, columnId: string) =>
    persist(boardId, load(boardId).map(c => c.id === id ? { ...c, columnId } : c)),
};

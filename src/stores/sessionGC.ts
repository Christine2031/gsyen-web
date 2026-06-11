/** sessionGC — 自动回收 24h 前创建且对话+看板均为空的 session */
import { chatSessionStore } from './chatSessionStore';
import { sessionKanbanStore } from './sessionKanbanStore';

const TTL_MS = 24 * 60 * 60 * 1000;

export function runSessionGC(): number {
  const now      = Date.now();
  const sessions = chatSessionStore.loadAll();
  let   purged   = 0;

  for (const s of sessions) {
    const age      = now - new Date(s.updatedAt).getTime();
    const chatEmpty = (s.messages ?? []).length === 0;
    const kbEmpty   = sessionKanbanStore.getCards(s.id).length === 0;

    if (age > TTL_MS && chatEmpty && kbEmpty) {
      chatSessionStore.delete(s.id);
      localStorage.removeItem(`gsyen_kanban_cols_${s.id}`);
      localStorage.removeItem(`gsyen_kanban_cards_${s.id}`);
      purged++;
    }
  }

  return purged;
}

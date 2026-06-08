export type ColumnId = 'todo' | 'progress' | 'review' | 'done';

export type EventCategory = 'creative' | 'finance' | 'secure' | 'strategy';

// 个人 / 团队——未手动设置时按内容语义自动判定（见 ActionCardView 的 isShared 算法），
// 一旦用户手动选择，scope 即被持久化，永久优先于算法判断。
export type EventScope = 'self' | 'shared';

export interface EventItem {
  id: string;
  title: string;
  subtitle: string;
  time: string;
  date: string;      // "YYYY-MM-DD"
  endDate?: string;  // "YYYY-MM-DD"
  category: EventCategory;
  location: string;
  completed: boolean;
  status: ColumnId;
  scope?: EventScope;
}

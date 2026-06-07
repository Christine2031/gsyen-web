export type ColumnId = 'todo' | 'progress' | 'review' | 'done';

export type EventCategory = 'creative' | 'finance' | 'secure' | 'strategy';

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
}

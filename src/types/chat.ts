export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
}

export interface StoredSession {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  updatedAt: string;
}

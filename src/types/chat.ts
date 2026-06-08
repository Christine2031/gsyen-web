export type ActionModule = 'CHRONOS' | 'LEDGER' | 'MAIL' | 'VAULT' | 'CANVAS';
export type ActionCardAction = 'create' | 'update' | 'delete' | 'query';

export interface ActionCard {
  module:  ActionModule;
  action:  ActionCardAction;
  title:   string;
  meta:    string[];   // ['2026-06-08 · 15:00', '创意设计', '海口总部']
}

export interface ChatMessage {
  id:        string;
  role:      'user' | 'model';
  content:   string;
  timestamp: string;
  card?:     ActionCard;   // 神机百炼操作卡片（可选）
}

export interface StoredSession {
  id:        string;
  title:     string;
  model:     string;
  messages:  ChatMessage[];
  updatedAt: string;
}

export type ActionModule = 'CHRONOS' | 'LEDGER' | 'PAYMENT' | 'MAIL' | 'VAULT' | 'CANVAS' | 'ORDER';
export type ActionCardAction = 'create' | 'update' | 'delete' | 'query';

export interface ActionCard {
  module:  ActionModule;
  action:  ActionCardAction;
  title:   string;
  meta:    string[];   // ['2026-06-08 · 15:00', '创意设计', '海口总部']
  id?:     string;     // 关联的真实记录 id（如 CHRONOS 卡片对应 scheduleStore 里的 EventItem.id）
                       // 有此字段才说明卡片背后有真实数据、可以点开查看/联动详情，
                       // 不是所有卡片都有——纯查询类（如"今日日程"汇总卡）就没有单一对应记录。
}

export interface ChatImageAttachment {
  id:       string;
  type:     'image';
  name:     string;
  mimeType: string;
  dataUrl:  string;
}

export type ChatDocumentKind = 'pdf' | 'word' | 'spreadsheet' | 'text';
export type ChatDocumentStatus = 'ready' | 'partial' | 'empty';

export interface ChatDocumentAttachment {
  id:             string;
  type:           'document';
  name:           string;
  mimeType:       string;
  documentKind:   ChatDocumentKind;
  status:         ChatDocumentStatus;
  size:           number;
  extractedChars: number;
  pageCount?:     number;
  sheetCount?:    number;
}

export interface ChatDocumentChunk {
  id:       string;
  location: string;
  text:     string;
}

/** Local-only parsed document source. Never add this to synced chat messages. */
export interface ChatDocumentSource extends ChatDocumentAttachment {
  chunks: ChatDocumentChunk[];
}

export type ChatAttachment = ChatImageAttachment | ChatDocumentAttachment;

export interface ChatQueuedPrompt {
  id:          string;
  text:        string;
  attachments: Array<ChatAttachment | ChatDocumentSource>;
  timestamp:   string;
}

export interface ChatMessage {
  id:        string;
  role:      'user' | 'model';
  content:   string;
  timestamp: string;
  card?:     ActionCard;   // 神机百炼操作卡片（可选）
  attachments?: ChatAttachment[];
  /** Request-only retrieved document excerpts. Not persisted with chat history. */
  documentContext?: string;
  streaming?: boolean;
}

export interface StoredSession {
  id:        string;
  title:     string;
  model:     string;
  messages:  ChatMessage[];
  updatedAt: string;
  teamId?:   string;
}

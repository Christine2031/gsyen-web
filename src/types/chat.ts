export type ActionModule = 'CHRONOS' | 'LEDGER' | 'PAYMENT' | 'MAIL' | 'VAULT' | 'CANVAS';
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

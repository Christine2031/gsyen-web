/**
 * CardRecord — 「卡片集」统一信封
 *
 * 设计原则（与 Ethan 讨论确立）：
 * 1. 卡片是整套生态的核心原子单位；chat / 日历看板 / 财务账簿 / 工作邮件……
 *    都只是「盒子」——卡片集的不同呈现切面，不是数据的归属方。
 * 2. 信封只统一「检索 + 展示 + 调度」所需的最小字段集，不强行统一业务结构——
 *    EventItem 和 Transaction 长得完全不同，硬塞一个模型只会变成四不像。
 *    真正的业务数据仍由各自的 store 管理，payload 只存引用。
 * 3. 登记点必须落在 store 层（add/update/remove 内部），不能落在 chat 的
 *    domain handler 里——这样无论卡片诞生在 chat、看板还是账簿，
 *    都会被同一处逻辑收编进卡片集，不会出现「单向投递、各玩各的」。
 * 4. color 由信封自带，"原地原色放大"才有依据——展开时复用同一套配色，
 *    不会出现「切到另一个东西」的割裂感。"安静的打开，安静的关上"。
 */

export type CardModule = 'CHRONOS' | 'LEDGER' | 'PAYMENT' | 'MAIL' | 'VAULT' | 'CANVAS';

export interface CardRecord {
  /** 全局唯一，建议加模块前缀避免碰撞，如 "chronos-ai-1234" */
  id:        string;
  module:    CardModule;
  /** 模块内的细分类型，如 EventCategory ('strategy') / Transaction.category ('royalty') */
  kind:      string;
  title:     string;
  subtitle?: string;
  /** 主题色——展开时原色延续，不另起配色体系 */
  color:     string;
  /** 排序/检索用的统一时间锚点，ISO 或 "YYYY-MM-DD[THH:mm]" */
  timestamp: string;
  /** 可选状态标注，如 'todo'/'done'、'pending'/'paid' */
  status?:   string;
  /** 拼接后的检索文本（标题 + 副标题 + 关键 payload 字段），供 chat 端模糊定位 */
  searchText: string;
  /** 真正的业务数据引用（EventItem / Transaction / PaymentOrder…）——只读引用，不拷贝 */
  payload:   unknown;
}

/** 广播事件名——任何模块的 store 登记/更新/移除卡片后触发，供卡片集消费方刷新 */
export const CARD_REGISTRY_EVENT = 'cardRegistry-updated';

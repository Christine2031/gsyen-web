/**
 * cardRegistry — 「卡片集」全局索引层
 *
 * 不是又一个数据库——是一个轻量的、内存中的检索/调度索引。
 * 各模块的 store（scheduleStore / ledgerStore / paymentStore …）在自己的
 * add/update/remove 内部调用 register/touch/unregister，把一条 CardRecord
 * 信封登记进来；payload 只存对真实记录的引用，不拷贝、不另存一份。
 *
 * 这样无论一张卡片诞生在 chat、看板还是账簿，登记动作都发生在同一处
 * （数据层），而不是「chat 单方面往各个盒子投递」——卡片集才名副其实。
 *
 * chat 作为「指挥中心」，通过 query() 检索任意卡片（不论诞生于何处），
 * 拉到对话语境里原地展示——拉取的是同一条记录的引用视图，不是复制品，
 * 在 chat 里编辑一样会写回原始 store，看板那边立刻同步。
 */
import { CardRecord, CardModule, CARD_REGISTRY_EVENT } from '../types/card';

const records = new Map<string, CardRecord>();

function broadcast(): void {
  window.dispatchEvent(new CustomEvent(CARD_REGISTRY_EVENT));
}

export const cardRegistry = {
  /** 登记一条卡片信封（已存在则整体替换） */
  register(record: CardRecord): void {
    records.set(record.id, record);
    broadcast();
  },

  /** 局部更新一条已登记的信封（标题/状态/payload 引用变化时调用） */
  touch(id: string, changes: Partial<CardRecord>): void {
    const existing = records.get(id);
    if (!existing) return;
    records.set(id, { ...existing, ...changes });
    broadcast();
  },

  /** 移除一条信封（对应记录被删除时调用） */
  unregister(id: string): void {
    if (!records.delete(id)) return;
    broadcast();
  },

  /** 取出全部信封，按时间锚点倒序（最新的在前） */
  getAll(): CardRecord[] {
    return [...records.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  },

  /** 按模块过滤 */
  getByModule(module: CardModule): CardRecord[] {
    return this.getAll().filter(r => r.module === module);
  },

  /** 按 id 直接定位 */
  getById(id: string): CardRecord | undefined {
    return records.get(id);
  },

  /**
   * 模糊检索——chat 作为指挥中心「主动调取」任意卡片的入口。
   * 极简实现：对 searchText（标题+副标题+关键字段拼接）做包含匹配，
   * 可选按模块收窄范围。后续若需要更聪明的排序/相关度，在这里加权即可，
   * 对外接口不变。
   */
  query(keyword: string, opts?: { module?: CardModule; limit?: number }): CardRecord[] {
    const kw = keyword.trim().toLowerCase();
    if (!kw) return [];
    let pool = this.getAll();
    if (opts?.module) pool = pool.filter(r => r.module === opts.module);
    const hits = pool.filter(r => r.searchText.toLowerCase().includes(kw));
    return opts?.limit ? hits.slice(0, opts.limit) : hits;
  },
};

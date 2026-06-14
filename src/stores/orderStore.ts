/**
 * orderStore — 订单数据层
 *
 * 核心规则（Ethan 2026-06-09）：
 *   有订单一定要记账 → add() 自动向 ledgerStore 写一笔 income 流水。
 *   记账不一定有订单 → ledgerStore 独立存在，不反向依赖 orderStore。
 */
import { cardRegistry } from './cardRegistry';
import { CardRecord } from '../types/card';
import { ledgerStore } from './ledgerStore';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type OrderStatus = 'pending' | 'partial' | 'active' | 'expired';

export interface Order {
  id:          string;
  service:     string;
  plan:        string;
  customer:    string;
  amount:      number;
  currency:    'CNY' | 'USD';
  paidAmount:  number;
  status:      OrderStatus;
  startDate:   string;
  expireDate?: string;
  notes?:      string;
}

// ─── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'gsyen_orders';
export const ORDER_EVENT = 'order-updated';

function readRaw(): Order[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); }
  catch { return []; }
}

function writeRaw(items: Order[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function broadcast(): void {
  window.dispatchEvent(new CustomEvent(ORDER_EVENT));
}

// ─── CardRegistry ─────────────────────────────────────────────────────────────

const STATUS_COLOR: Record<OrderStatus, string> = {
  active:  '#4F77AC',
  partial: '#7A6B4F',
  pending: '#9B8C7A',
  expired: '#6B6258',
};

function toCardRecord(o: Order): CardRecord {
  const symbol = o.currency === 'USD' ? '$' : '¥';
  return {
    id:         `order-${o.id}`,
    module:     'ORDER',
    kind:       o.status,
    title:      o.customer,
    subtitle:   `${o.service} · ${o.plan}`,
    color:      STATUS_COLOR[o.status],
    timestamp:  o.startDate,
    status:     o.status,
    searchText: [o.service, o.plan, o.customer, o.notes, `${symbol}${o.amount}`].filter(Boolean).join(' '),
    payload:    o,
  };
}

let knownIds = new Set<string>();
function syncRegistry(items: Order[]): void {
  const nextIds = new Set(items.map(o => `order-${o.id}`));
  for (const item of items) cardRegistry.register(toCardRecord(item));
  for (const id of knownIds) if (!nextIds.has(id)) cardRegistry.unregister(id);
  knownIds = nextIds;
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const orderStore = {
  getAll(): Order[] { return readRaw(); },

  add(order: Order): void {
    const updated = [order, ...readRaw()];
    writeRaw(updated);
    syncRegistry(updated);
    broadcast();
    void _upsert(order);
    if (order.paidAmount > 0) {
      ledgerStore.add({
        id:          `order-ledger-${order.id}`,
        description: `${order.customer} · ${order.service}${order.plan}`,
        amount:      order.paidAmount,
        currency:    order.currency,
        type:        'income',
        category:    'consultancy',
        date:        order.startDate,
        notes:       `订单 #${order.id.slice(-6)}`,
        scope:       'shared',
      });
    }
  },

  update(id: string, changes: Partial<Omit<Order, 'id'>>): void {
    const prev    = readRaw().find(o => o.id === id);
    const updated = readRaw().map(o => o.id === id ? { ...o, ...changes } : o);
    writeRaw(updated);
    syncRegistry(updated);
    broadcast();
    const item = updated.find(o => o.id === id);
    if (item) void _upsert(item);
    if (prev && changes.paidAmount !== undefined && changes.paidAmount > prev.paidAmount) {
      const delta = changes.paidAmount - prev.paidAmount;
      const order = item!;
      ledgerStore.add({
        id:          `order-ledger-${order.id}-${Date.now()}`,
        description: `${order.customer} · ${order.service}${order.plan}（补款）`,
        amount:      delta,
        currency:    order.currency,
        type:        'income',
        category:    'consultancy',
        date:        changes.startDate ?? order.startDate,
        notes:       `订单 #${id.slice(-6)}`,
        scope:       'shared',
      });
    }
  },

  remove(id: string): void {
    const updated = readRaw().filter(o => o.id !== id);
    writeRaw(updated);
    syncRegistry(updated);
    broadcast();
    void _remove(id);
  },

  getRecent(n = 5): Order[] { return readRaw().slice(0, n); },
};

// 启动即对账——把已存在的订单收编进卡片集
syncRegistry(readRaw());

// ── Supabase 双写同步 ─────────────────────────────────────────────────────────
let _uid: string | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _rt: any = null;

function _row(o: Order) {
  return {
    id: o.id, user_id: _uid!, service: o.service, plan: o.plan,
    customer: o.customer, amount: o.amount, currency: o.currency,
    paid_amount: o.paidAmount, status: o.status, start_date: o.startDate,
    expire_date: o.expireDate ?? null, notes: o.notes ?? null,
    updated_at: new Date().toISOString(),
  };
}

async function _upsert(o: Order) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_orders').upsert(_row(o));
}

async function _remove(id: string) {
  if (!supabase || !_uid) return;
  await supabase.from('gsyen_orders').delete().eq('id', id).eq('user_id', _uid);
}

async function _pull(userId: string) {
  if (!supabase) return;
  const { data } = await supabase.from('gsyen_orders').select('*').eq('user_id', userId);
  if (!data) return;
  const remote: Order[] = data.map((r: any) => ({
    id: r.id, service: r.service, plan: r.plan, customer: r.customer,
    amount: r.amount, currency: r.currency as 'CNY' | 'USD',
    paidAmount: r.paid_amount, status: r.status as OrderStatus,
    startDate: r.start_date, expireDate: r.expire_date ?? undefined,
    notes: r.notes ?? undefined,
  }));
  const local     = readRaw();
  const remIds    = new Set(remote.map(r => r.id));
  const localOnly = local.filter(o => !remIds.has(o.id));
  for (const o of localOnly) await _upsert(o);
  const merged = [...remote, ...localOnly];
  writeRaw(merged);
  syncRegistry(merged);
  broadcast();
}

function _subscribeRealtime(uid: string) {
  _rt?.unsubscribe();
  _rt = supabase!
    .channel(`gsyen_orders:${uid}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'gsyen_orders', filter: `user_id=eq.${uid}` },
      () => _pull(uid)
    )
    .subscribe();
}

supabase?.auth.onAuthStateChange((_ev, session) => {
  _uid = session?.user?.id ?? null;
  if (_uid) { _pull(_uid); _subscribeRealtime(_uid); }
  else { _rt?.unsubscribe(); _rt = null; }
});

/**
 * BrandOrders — Google-style 订单视图
 * 参考 Google Store / Workspace 订单历史页面风格
 */
import { useState, useEffect } from 'react';
import { Package } from 'lucide-react';
import { orderStore, Order, OrderStatus } from '../../stores/orderStore';

interface Props { lang: 'zh' | 'en' }

const DEMO_ORDERS: Order[] = [
  { id: 'd1', service: '散装鲜鱼', plan: '草鱼 36条',  customer: '李建军', amount: 1296,  currency: 'CNY', paidAmount: 1296,  status: 'active',  startDate: '2026-06-12', notes: '上海江桥批发市场 A3 档口' },
  { id: 'd2', service: '活鱼配送', plan: '鲈鱼 12条',  customer: '陈秋霞', amount: 840,   currency: 'CNY', paidAmount: 420,   status: 'partial', startDate: '2026-06-11', notes: '广州南沙渔港 码头 7 号' },
  { id: 'd3', service: '冷链运输', plan: '三文鱼 8条', customer: '王浩然', amount: 2400,  currency: 'CNY', paidAmount: 0,     status: 'pending', startDate: '2026-06-10', notes: '北京朝阳区三元桥市场' },
  { id: 'd4', service: '年度合约', plan: '综合鱼类',   customer: '赵云昌', amount: 18000, currency: 'CNY', paidAmount: 18000, status: 'expired', startDate: '2025-06-01', expireDate: '2026-05-31', notes: '成都锦里东路水产中心' },
];

const STATUS_CFG: Record<OrderStatus, { zh: string; en: string; cls: string }> = {
  active:  { zh: '已生效', en: 'Active',  cls: 'bg-[#E6F4EA] text-[#137333]' },
  partial: { zh: '部分付', en: 'Partial', cls: 'bg-[#FEF7E0] text-[#B05E00]' },
  pending: { zh: '待付款', en: 'Pending', cls: 'bg-[#E8F0FE] text-[#1A73E8]' },
  expired: { zh: '已到期', en: 'Expired', cls: 'bg-[#F1F3F4] text-[#5F6368]' },
};

const FILTERS: { key: OrderStatus | 'all'; zh: string; en: string }[] = [
  { key: 'all',     zh: '全部',   en: 'All'     },
  { key: 'active',  zh: '已生效', en: 'Active'  },
  { key: 'partial', zh: '部分',   en: 'Partial' },
  { key: 'pending', zh: '待付款', en: 'Pending' },
  { key: 'expired', zh: '已到期', en: 'Expired' },
];

const AVATAR_COLORS = [
  'bg-[#1A73E8]', 'bg-[#137333]', 'bg-[#B05E00]',
  'bg-[#9334E6]', 'bg-[#D93025]',
];

function avatarColor(name: string) {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex-1 bg-white rounded-lg border border-[#DADCE0] px-5 py-4 min-w-0">
      <p className="text-(--fs-md) text-[#5F6368] font-sans mb-1">{label}</p>
      <p className="text-[22px] font-bold text-[#202124] leading-none font-sans">{value}</p>
      {sub && <p className="text-(--fs-md) text-[#5F6368] mt-1">{sub}</p>}
    </div>
  );
}

function OrderRow({ order, lang }: { order: Order; lang: 'zh' | 'en' }) {
  const zh = lang === 'zh';
  const cfg = STATUS_CFG[order.status];
  const symbol = order.currency === 'USD' ? '$' : '¥';
  const balance = order.amount - order.paidAmount;
  const initial = order.customer.charAt(0);

  return (
    <tr className="border-b border-[#E8EAED] hover:bg-[#F8F9FA] transition-colors group">
      {/* 客户 avatar + 名称 */}
      <td className="py-3.5 pl-6 pr-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full ${avatarColor(order.customer)} flex items-center justify-center shrink-0`}>
            <span className="text-white text-(--fs-base) font-bold font-sans">{initial}</span>
          </div>
          <div>
            <p className="text-(--fs-body) font-medium text-[#202124] font-sans">{order.customer}</p>
            {order.notes && <p className="text-(--fs-md) text-[#5F6368] font-sans truncate max-w-[180px]">{order.notes}</p>}
          </div>
        </div>
      </td>

      {/* 服务 */}
      <td className="py-3.5 px-3">
        <p className="text-(--fs-body) text-[#202124] font-sans">{order.service}</p>
        <p className="text-(--fs-md) text-[#5F6368] font-sans">{order.plan}</p>
      </td>

      {/* 日期 */}
      <td className="py-3.5 px-3 whitespace-nowrap">
        <p className="text-(--fs-base) text-[#5F6368] font-sans">{order.startDate}</p>
        {order.expireDate && <p className="text-(--fs-md) text-[#9AA0A6] font-sans">→ {order.expireDate}</p>}
      </td>

      {/* 状态 chip */}
      <td className="py-3.5 px-3">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-(--fs-md) font-medium font-sans ${cfg.cls}`}>
          {zh ? cfg.zh : cfg.en}
        </span>
      </td>

      {/* 金额 */}
      <td className="py-3.5 pl-3 pr-6 text-right">
        <p className="text-(--fs-body) font-semibold text-[#202124] font-sans">{symbol}{order.amount.toLocaleString()}</p>
        {balance > 0 && order.amount > 0 && (
          <p className="text-(--fs-md) text-[#B05E00] font-sans">{zh ? '待收' : 'Due'} {symbol}{balance.toLocaleString()}</p>
        )}
      </td>
    </tr>
  );
}

export default function BrandOrders({ lang }: Props) {
  const zh = lang === 'zh';
  const [rawOrders, setRawOrders] = useState<Order[]>(() => orderStore.getAll());
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const orders = rawOrders.length > 0 ? rawOrders : DEMO_ORDERS;

  useEffect(() => {
    const sync = () => setRawOrders(orderStore.getAll());
    window.addEventListener('order-updated', sync);
    return () => window.removeEventListener('order-updated', sync);
  }, []);

  const filtered = filter === 'all' ? orders : orders.filter(o => o.status === filter);
  const totalPaid    = orders.filter(o => o.paidAmount > 0).reduce((s, o) => s + o.paidAmount, 0);
  const totalPending = orders.filter(o => o.status !== 'expired').reduce((s, o) => s + Math.max(0, o.amount - o.paidAmount), 0);

  if (orders.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 py-24 text-center">
        <Package className="w-10 h-10 text-[#DADCE0]" strokeWidth={1.2} />
        <p className="text-(--fs-lg) font-sans text-[#5F6368]">{zh ? '暂无订单' : 'No orders yet'}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#F8F9FA]">

      {/* 汇总卡片 */}
      <div className="flex gap-4 px-6 py-5 shrink-0">
        <StatCard label={zh ? '🐱 已收款' : '🐱 Collected'} value={`¥${totalPaid.toLocaleString()}`} sub={zh ? '生效 + 部分付款' : 'Active + Partial'} />
        <StatCard label={zh ? '待收款' : 'Outstanding'} value={`¥${totalPending.toLocaleString()}`} sub={zh ? '尚未结清' : 'Unpaid balance'} />
        <StatCard label={zh ? '订单总数' : 'Total Orders'} value={String(orders.length)} sub={zh ? `${filtered.length} 条结果` : `${filtered.length} results`} />
      </div>

      {/* 筛选 chips */}
      <div className="flex items-center gap-2 px-6 pb-4 shrink-0">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded-full text-(--fs-base) font-sans font-medium transition-all ${
              filter === f.key
                ? 'bg-[#1A73E8] text-white'
                : 'bg-white border border-[#DADCE0] text-[#5F6368] hover:bg-[#F1F3F4]'
            }`}>
            {zh ? f.zh : f.en}
          </button>
        ))}
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="bg-white rounded-lg border border-[#DADCE0] overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#E8EAED] bg-[#F8F9FA]">
                <th className="py-3 pl-6 pr-3 text-left text-(--fs-md) font-semibold text-[#5F6368] uppercase tracking-wider font-sans">{zh ? '客户' : 'Customer'}</th>
                <th className="py-3 px-3 text-left text-(--fs-md) font-semibold text-[#5F6368] uppercase tracking-wider font-sans">{zh ? '服务' : 'Service'}</th>
                <th className="py-3 px-3 text-left text-(--fs-md) font-semibold text-[#5F6368] uppercase tracking-wider font-sans">{zh ? '日期' : 'Date'}</th>
                <th className="py-3 px-3 text-left text-(--fs-md) font-semibold text-[#5F6368] uppercase tracking-wider font-sans">{zh ? '状态' : 'Status'}</th>
                <th className="py-3 pl-3 pr-6 text-right text-(--fs-md) font-semibold text-[#5F6368] uppercase tracking-wider font-sans">{zh ? '金额' : 'Amount'}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-(--fs-body) text-[#9AA0A6] font-sans">{zh ? '该分类暂无订单' : 'No orders in this category'}</td></tr>
              ) : (
                filtered.map(order => <OrderRow key={order.id} order={order} lang={lang} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

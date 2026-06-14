/**
 * OrderExpandContent — ORDER 卡片 L2 展开面板
 * 订单只有 L1 / L2，不需要 L3。
 */
import { useState, useEffect } from 'react';
import { Trash2, CheckCircle2, Clock, CircleDashed, XCircle, Pencil } from 'lucide-react';
import { CardColor } from './cardConstants';
import { orderStore, Order, OrderStatus } from '../stores/orderStore';

interface Props {
  lang:          'zh' | 'en';
  color:         CardColor;
  orderId:       string | undefined;
  expanded:      boolean;
  scope:         'self' | 'shared';
  onScopeChange: (s: 'self' | 'shared') => void;
  onCollapse:    () => void;
}

const STATUS_CONFIG: Record<OrderStatus, { zh: string; en: string; Icon: typeof Clock }> = {
  pending:  { zh: '待付款',   en: 'Pending',  Icon: CircleDashed },
  partial:  { zh: '部分付款', en: 'Partial',  Icon: Clock },
  active:   { zh: '已生效',   en: 'Active',   Icon: CheckCircle2 },
  expired:  { zh: '已到期',   en: 'Expired',  Icon: XCircle },
};
const ALL_STATUSES: OrderStatus[] = ['pending', 'partial', 'active', 'expired'];

interface EditState {
  customer: string; plan: string; service: string;
  amount: string; startDate: string; expireDate: string; notes: string;
}

export function OrderExpandContent({ lang, color: C, orderId, expanded, scope, onScopeChange, onCollapse }: Props) {
  const zh = lang === 'zh';
  const [order, setOrder] = useState<Order | null>(() =>
    orderId ? (orderStore.getAll().find(o => o.id === orderId) ?? null) : null
  );
  const [editing, setEditing] = useState(false);
  const [edit,    setEdit]    = useState<EditState>({
    customer: '', plan: '', service: '', amount: '', startDate: '', expireDate: '', notes: '',
  });

  useEffect(() => {
    const sync = () => {
      if (orderId) setOrder(orderStore.getAll().find(o => o.id === orderId) ?? null);
    };
    window.addEventListener('order-updated', sync);
    return () => window.removeEventListener('order-updated', sync);
  }, [orderId]);

  useEffect(() => {
    if (!expanded) setEditing(false);
  }, [expanded]);

  const symbol  = order?.currency === 'USD' ? '$' : '¥';
  const balance = Math.max(0, (order?.amount ?? 0) - (order?.paidAmount ?? 0));

  const handleStatusChange = (s: OrderStatus) => orderStore.update(order.id, { status: s });

  const startEdit = () => {
    setEdit({
      customer:   order.customer,
      plan:       order.plan,
      service:    order.service,
      amount:     String(order.amount || ''),
      startDate:  order.startDate,
      expireDate: order.expireDate ?? '',
      notes:      order.notes ?? '',
    });
    setEditing(true);
  };

  const saveEdit = () => {
    const amount = parseFloat(edit.amount);
    orderStore.update(order.id, {
      customer:   edit.customer  || order.customer,
      plan:       edit.plan      || order.plan,
      service:    edit.service   || order.service,
      amount:     isNaN(amount)  ? order.amount : amount,
      startDate:  edit.startDate || order.startDate,
      expireDate: edit.expireDate || undefined,
      notes:      edit.notes     || undefined,
    });
    setEditing(false);
  };

  const handleDelete = () => { orderStore.remove(order.id); onCollapse(); };

  const inputCls = `w-full px-2 py-1 rounded-[2px] border text-(--fs-md) font-sans outline-none ${C.panelInput}`;
  const labelCls = `font-mono text-(--fs-2xs) tracking-[0.15em] uppercase shrink-0 w-14 ${C.panelLabel}`;

  return (
    <div className={`grid transition-[grid-template-rows] duration-[360ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${expanded && order ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
      <div className="overflow-hidden">
      <div className={`border-t ${C.panelBorder} px-4 pt-3 pb-4 space-y-3`} onClick={e => e.stopPropagation()}>

        {/* 状态切换 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {ALL_STATUSES.map(s => {
            const { zh: label, en, Icon } = STATUS_CONFIG[s];
            return (
              <button key={s} onClick={() => handleStatusChange(s)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-[2px] font-mono text-(--fs-xs) tracking-wide transition-all duration-150 ${
                  order.status === s ? C.btnPrimary : C.btnGhost
                }`}>
                <Icon className="w-2.5 h-2.5" />{zh ? label : en}
              </button>
            );
          })}
        </div>

        {/* 商品信息 */}
        <div className={`rounded-[3px] border ${C.panelBorder} px-3 py-2.5 space-y-2`}>
          <span className={`font-mono text-(--fs-2xs) tracking-[0.18em] uppercase font-bold ${C.panelLabel}`}>
            {zh ? '商品信息' : 'Product'}
          </span>
          {editing ? (
            <div className="space-y-1.5 pt-1">
              {([
                { key: 'service' as const,  label: zh ? '服务' : 'Service' },
                { key: 'plan'    as const,  label: zh ? '套餐' : 'Plan' },
                { key: 'customer'as const,  label: zh ? '客户' : 'Customer' },
              ] as const).map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <span className={labelCls}>{label}</span>
                  <input value={edit[key]} onChange={e => setEdit(p => ({ ...p, [key]: e.target.value }))}
                    className={inputCls} />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5 pt-1">
              {[
                { label: zh ? '服务' : 'Service',  value: order.service },
                { label: zh ? '套餐' : 'Plan',     value: order.plan },
                { label: zh ? '客户' : 'Customer', value: order.customer },
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className={labelCls}>{label}</span>
                  <span className={`font-sans text-(--fs-md) ${C.panelText}`}>{value || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 时间 + 备注 */}
        <div className="space-y-1.5">
          {editing ? (
            <>
              {([
                { key: 'startDate'  as const, label: zh ? '开始' : 'Start' },
                { key: 'expireDate' as const, label: zh ? '到期' : 'Expire' },
                { key: 'notes'      as const, label: zh ? '备注' : 'Notes' },
              ] as const).map(({ key, label }) => (
                <div key={key} className="flex items-center gap-3">
                  <span className={labelCls}>{label}</span>
                  <input value={edit[key]} onChange={e => setEdit(p => ({ ...p, [key]: e.target.value }))}
                    className={inputCls} />
                </div>
              ))}
            </>
          ) : (
            <>
              {[
                { label: zh ? '开始' : 'Start',  value: order.startDate },
                ...(order.expireDate ? [{ label: zh ? '到期' : 'Expire', value: order.expireDate }] : []),
                ...(order.notes      ? [{ label: zh ? '备注' : 'Notes',  value: order.notes }]      : []),
              ].map(({ label, value }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className={labelCls}>{label}</span>
                  <span className={`font-sans text-(--fs-md) ${C.panelText}`}>{value}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* 金额 */}
        <div className={`rounded-[3px] border ${C.panelBorder} px-3 py-2.5 space-y-1.5`}>
          {editing ? (
            <div className="flex items-center gap-3">
              <span className={labelCls}>{zh ? '总额' : 'Total'}</span>
              <input value={edit.amount} onChange={e => setEdit(p => ({ ...p, amount: e.target.value }))}
                type="number" className={inputCls} placeholder={String(order.amount || '')} />
            </div>
          ) : (
            <>
              <div className="flex justify-between">
                <span className={`font-mono text-(--fs-2xs) tracking-widest uppercase ${C.panelLabel}`}>{zh ? '总额' : 'Total'}</span>
                <span className={`font-mono text-(--fs-base) font-bold ${C.panelText}`}>{order.amount ? `${symbol}${order.amount}` : '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className={`font-mono text-(--fs-2xs) tracking-widest uppercase ${C.panelLabel}`}>{zh ? '已付' : 'Paid'}</span>
                <span className={`font-mono text-(--fs-base) font-bold ${C.panelText}`}>{symbol}{order.paidAmount}</span>
              </div>
              {order.amount > 0 && (
                <div className="flex justify-between">
                  <span className={`font-mono text-(--fs-2xs) tracking-widest uppercase ${C.panelLabel}`}>{zh ? '待收' : 'Balance'}</span>
                  <span className={`font-mono text-(--fs-base) font-bold ${balance > 0 ? 'text-amber-400/80' : 'text-emerald-400/80'}`}>{symbol}{balance}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部操作 */}
        <div className="flex items-center justify-between pt-0.5">
          {/* 个人/团队 */}
          <div className="flex gap-1.5">
            {(['self', 'shared'] as const).map(s => (
              <button key={s} onClick={() => onScopeChange(s)}
                className={`px-3 py-1.5 rounded-md font-mono text-(--fs-xs) uppercase tracking-widest transition-all ${
                  scope === s ? C.btnPrimary : C.btnGhost
                }`}>
                {s === 'self' ? (zh ? '个人' : 'Personal') : (zh ? '团队' : 'Team')}
              </button>
            ))}
          </div>
          {/* 修改 / 确认 / 删除 */}
          <div className="flex gap-1.5">
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} className={`px-2.5 py-1 rounded-[2px] text-(--fs-xs) font-mono ${C.btnGhost}`}>
                  {zh ? '取消' : 'Cancel'}
                </button>
                <button onClick={saveEdit} className={`px-2.5 py-1 rounded-[2px] text-(--fs-xs) font-mono ${C.btnPrimary}`}>
                  {zh ? '确认修改' : 'Save'}
                </button>
              </>
            ) : (
              <>
                <button onClick={startEdit} className={`flex items-center gap-1 px-2.5 py-1 rounded-[2px] text-(--fs-xs) font-mono ${C.btnGhost}`}>
                  <Pencil className="w-2.5 h-2.5" />{zh ? '修改编纂' : 'Edit'}
                </button>
                <button onClick={handleDelete} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[2px] text-(--fs-xs) font-mono ${C.btnDanger}`}>
                  <Trash2 className="w-2.5 h-2.5" />{zh ? '删除订单' : 'Delete'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

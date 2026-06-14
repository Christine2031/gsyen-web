import React, { useState, useEffect } from 'react';
import { Monitor, Droplets, Shirt, Home, Package, Plus, Trash2, X } from 'lucide-react';
import { holdStore, HoldItem, HoldCategory, HoldStatus } from '../../stores/holdStore';

type FilterCat    = HoldCategory | 'all';
type FilterStatus = HoldStatus   | 'all';

const CATS = [
  { key: 'electronic' as HoldCategory, zh: '电子设备', en: 'Electronics', Icon: Monitor  },
  { key: 'consumable' as HoldCategory, zh: '消耗品',   en: 'Consumables', Icon: Droplets },
  { key: 'fashion'    as HoldCategory, zh: '穿戴',     en: 'Fashion',     Icon: Shirt    },
  { key: 'home'       as HoldCategory, zh: '家居',     en: 'Home',        Icon: Home     },
  { key: 'other'      as HoldCategory, zh: '其他',     en: 'Other',       Icon: Package  },
];

const STATUS_CFG: Record<HoldStatus, { zh: string; en: string; cls: string }> = {
  wishlist: { zh: '种草中', en: 'Wishlist', cls: 'bg-[#E8F0FE] text-[#1A73E8]' },
  owned:    { zh: '在库',   en: 'Owned',    cls: 'bg-[#E6F4EA] text-[#137333]' },
  retired:  { zh: '已退役', en: 'Retired',  cls: 'bg-[#F1F3F4] text-[#5F6368]' },
};

const DEMO: HoldItem[] = [
  { id: 'd1', name: 'MacBook Pro 16" M3', category: 'electronic', brand: 'Apple', price: 19999, quantity: 1, purchaseDate: '2024-11-01', status: 'owned',    notes: '512GB · 18GB RAM · 深空黑' },
  { id: 'd2', name: 'SK-II 面膜',          category: 'consumable', brand: 'SK-II', price: 1200,  quantity: 2, purchaseDate: '2026-06-10', expiryDate: '2027-06-01', status: 'owned' },
  { id: 'd3', name: 'Nike Air Max 90',      category: 'fashion',    brand: 'Nike',  price: 899,   quantity: 1, purchaseDate: '2025-03-15', status: 'owned'    },
  { id: 'd4', name: 'iPhone 16 Pro',        category: 'electronic', brand: 'Apple', price: 8999,  status: 'wishlist', notes: '等 618 大促'  },
  { id: 'd5', name: 'IKEA ALEX 书桌',       category: 'home',       brand: 'IKEA',  price: 599,   quantity: 1, purchaseDate: '2025-01-20', status: 'owned'    },
];

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex-1 bg-white rounded-lg border border-[#DADCE0] px-5 py-4 min-w-0">
      <p className="fs-md text-[#5F6368] font-sans mb-1">{label}</p>
      <p className="text-[22px] font-bold text-[#202124] leading-none font-sans">{value}</p>
      {sub && <p className="fs-md text-[#5F6368] mt-1">{sub}</p>}
    </div>
  );
}

function ItemRow({ item, lang, expanded, onToggle, onDelete }: {
  item: HoldItem; lang: 'zh' | 'en'; expanded: boolean;
  onToggle: () => void; onDelete: () => void;
}) {
  const zh   = lang === 'zh';
  const cat  = CATS.find(c => c.key === item.category);
  const st   = STATUS_CFG[item.status];
  const Icon = cat?.Icon ?? Package;

  return (
    <>
      <tr className="border-b border-[#E8EAED] hover:bg-[#F8F9FA] transition-colors cursor-pointer" onClick={onToggle}>
        <td className="py-3.5 pl-6 pr-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#F1F3F4] flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-[#5F6368]" strokeWidth={1.5} />
            </div>
            <div>
              <p className="fs-body font-medium text-[#202124] font-sans">{item.name}</p>
              {item.brand && <p className="fs-md text-[#5F6368] font-sans">{item.brand}</p>}
            </div>
          </div>
        </td>
        <td className="py-3.5 px-3">
          <span className="fs-md text-[#5F6368] font-sans">{zh ? cat?.zh : cat?.en}</span>
        </td>
        <td className="py-3.5 px-3 whitespace-nowrap">
          {item.purchaseDate && <p className="fs-base text-[#5F6368] font-sans">{item.purchaseDate}</p>}
          {item.expiryDate   && <p className="fs-md text-[#D93025] font-sans">{zh ? '到期' : 'Exp'} {item.expiryDate}</p>}
        </td>
        <td className="py-3.5 px-3">
          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full fs-md font-medium font-sans ${st.cls}`}>
            {zh ? st.zh : st.en}
          </span>
        </td>
        <td className="py-3.5 pl-3 pr-6 text-right">
          {item.price != null && (
            <p className="fs-body font-semibold text-[#202124] font-sans">
              ¥{item.price.toLocaleString()}
              {item.quantity && item.quantity > 1 && (
                <span className="fs-md text-[#5F6368] font-normal"> ×{item.quantity}</span>
              )}
            </p>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-[#F8F9FA] border-b border-[#E8EAED]">
          <td colSpan={5} className="px-6 py-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1 fs-base font-sans text-[#5F6368]">
                {item.notes    && <p><span className="text-[#9AA0A6]">{zh ? '备注：' : 'Notes: '}</span>{item.notes}</p>}
                {item.quantity && <p><span className="text-[#9AA0A6]">{zh ? '数量：' : 'Qty: '}</span>{item.quantity}</p>}
                {!item.notes && !item.quantity && (
                  <p className="italic text-[#9AA0A6]">{zh ? '暂无备注' : 'No notes'}</p>
                )}
              </div>
              <button onClick={e => { e.stopPropagation(); onDelete(); }}
                className="shrink-0 p-1.5 text-[#D93025] hover:bg-[#FCE8E6] rounded-lg transition"
                title={zh ? '删除' : 'Delete'}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AddModal({ lang, onClose, onSave }: {
  lang: 'zh' | 'en'; onClose: () => void; onSave: (item: HoldItem) => void;
}) {
  const zh = lang === 'zh';
  const [name,     setName]     = useState('');
  const [category, setCategory] = useState<HoldCategory>('electronic');
  const [status,   setStatus]   = useState<HoldStatus>('owned');
  const [brand,    setBrand]    = useState('');
  const [price,    setPrice]    = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes,    setNotes]    = useState('');

  const submit = () => {
    if (!name.trim()) return;
    onSave({
      id: crypto.randomUUID(), name: name.trim(), category, status,
      brand:    brand    || undefined,
      price:    price    ? Number(price)    : undefined,
      quantity: quantity ? Number(quantity) : undefined,
      notes:    notes    || undefined,
      purchaseDate: new Date().toISOString().split('T')[0],
    });
    onClose();
  };

  const chipCls = (active: boolean) =>
    `px-3 py-1 rounded-full fs-base font-sans font-medium transition-all ${
      active ? 'bg-[#1A73E8] text-white' : 'bg-[#F1F3F4] text-[#5F6368] hover:bg-[#E8EAED]'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-xl shadow-xl p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-sans font-semibold text-[#202124]">{zh ? '存入仓库' : 'Add to Hold'}</h3>
          <button onClick={onClose} className="text-[#5F6368] hover:text-[#202124] transition"><X className="w-4 h-4" /></button>
        </div>

        <input type="text" placeholder={zh ? '物品名称 *' : 'Item name *'}
          value={name} onChange={e => setName(e.target.value)}
          className="w-full px-3 py-2 border border-[#DADCE0] rounded-lg fs-body font-sans focus:outline-none focus:border-[#1A73E8]" />

        <div className="flex flex-wrap gap-1.5">
          {CATS.map(c => (
            <button key={c.key} type="button" onClick={() => setCategory(c.key)} className={chipCls(category === c.key)}>
              {zh ? c.zh : c.en}
            </button>
          ))}
        </div>

        <div className="flex gap-1.5">
          {(Object.keys(STATUS_CFG) as HoldStatus[]).map(k => (
            <button key={k} type="button" onClick={() => setStatus(k)} className={chipCls(status === k)}>
              {zh ? STATUS_CFG[k].zh : STATUS_CFG[k].en}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <input type="text"   placeholder={zh ? '品牌'  : 'Brand'} value={brand}    onChange={e => setBrand(e.target.value)}
            className="flex-1 px-3 py-2 border border-[#DADCE0] rounded-lg fs-base font-sans focus:outline-none focus:border-[#1A73E8]" />
          <input type="number" placeholder={zh ? '价格'  : 'Price'} value={price}    onChange={e => setPrice(e.target.value)}
            className="w-24 px-3 py-2 border border-[#DADCE0] rounded-lg fs-base font-sans focus:outline-none focus:border-[#1A73E8]" />
          <input type="number" placeholder={zh ? '数量'  : 'Qty'}   value={quantity} onChange={e => setQuantity(e.target.value)}
            className="w-16 px-3 py-2 border border-[#DADCE0] rounded-lg fs-base font-sans focus:outline-none focus:border-[#1A73E8]" />
        </div>

        <textarea placeholder={zh ? '备注（规格、来源等）' : 'Notes (specs, source...)'} rows={2}
          value={notes} onChange={e => setNotes(e.target.value)}
          className="w-full px-3 py-2 border border-[#DADCE0] rounded-lg fs-base font-sans resize-none focus:outline-none focus:border-[#1A73E8]" />

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose}
            className="px-4 py-2 fs-base font-sans text-[#5F6368] hover:bg-[#F1F3F4] rounded-lg transition">
            {zh ? '取消' : 'Cancel'}
          </button>
          <button onClick={submit} disabled={!name.trim()}
            className="px-4 py-2 fs-base font-sans bg-[#1A73E8] text-white rounded-lg hover:bg-[#1558B0] disabled:opacity-40 transition">
            {zh ? '存入' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BrandHold({ lang }: { lang: 'zh' | 'en' }) {
  const zh = lang === 'zh';
  const [rawItems,     setRawItems]     = useState<HoldItem[]>(() => holdStore.getAll());
  const [filterCat,    setFilterCat]    = useState<FilterCat>('all');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [expandedId,   setExpandedId]   = useState<string | null>(null);
  const [showAdd,      setShowAdd]      = useState(false);

  const items = rawItems.length > 0 ? rawItems : DEMO;

  useEffect(() => {
    const sync = () => setRawItems(holdStore.getAll());
    window.addEventListener('hold-updated', sync);
    return () => window.removeEventListener('hold-updated', sync);
  }, []);

  const filtered = items
    .filter(i => filterCat    === 'all' || i.category === filterCat)
    .filter(i => filterStatus === 'all' || i.status   === filterStatus);

  const owned      = items.filter(i => i.status === 'owned');
  const totalValue = owned.reduce((s, i) => s + (i.price ?? 0) * (i.quantity ?? 1), 0);
  const wishCount  = items.filter(i => i.status === 'wishlist').length;
  const expiring   = items.filter(i => i.expiryDate &&
    new Date(i.expiryDate) < new Date(Date.now() + 30 * 86400_000)).length;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#F8F9FA]">

      <div className="flex gap-4 px-6 py-5 shrink-0">
        <StatCard label={zh ? '在库物品' : 'In Hold'}    value={String(owned.length)}           sub={zh ? `共 ${items.length} 件` : `${items.length} total`} />
        <StatCard label={zh ? '总价值'   : 'Total Value'} value={`¥${totalValue.toLocaleString()}`} sub={zh ? '在库合计' : 'Owned items'} />
        <StatCard label={zh ? '种草清单' : 'Wishlist'}   value={String(wishCount)}
          sub={expiring > 0 ? (zh ? `${expiring} 件即将过期` : `${expiring} expiring`) : undefined} />
      </div>

      <div className="flex items-center gap-2 px-6 pb-4 shrink-0 flex-wrap">
        <button onClick={() => setShowAdd(true)}
          className="shrink-0 flex items-center gap-1 px-3 py-1 rounded-full fs-base font-sans font-medium bg-[#1A73E8] text-white hover:bg-[#1557B0] transition-all">
          <Plus className="w-3.5 h-3.5" />
          {zh ? '新增' : 'New'}
        </button>
        <div className="w-px h-4 bg-[#DADCE0] mx-1 shrink-0" />
        <button onClick={() => setFilterCat('all')}
          className={`px-3 py-1 rounded-full fs-base font-sans font-medium transition-all ${filterCat === 'all' && filterStatus === 'all' ? 'bg-[#1A73E8] text-white' : 'bg-white border border-[#DADCE0] text-[#5F6368] hover:bg-[#F1F3F4]'}`}>
          {zh ? '全部' : 'All'}
        </button>
        {CATS.map(c => (
          <button key={c.key} onClick={() => setFilterCat(filterCat === c.key ? 'all' : c.key)}
            className={`px-3 py-1 rounded-full fs-base font-sans font-medium transition-all ${filterCat === c.key ? 'bg-[#1A73E8] text-white' : 'bg-white border border-[#DADCE0] text-[#5F6368] hover:bg-[#F1F3F4]'}`}>
            {zh ? c.zh : c.en}
          </button>
        ))}
        <div className="w-px h-4 bg-[#DADCE0] shrink-0" />
        {(Object.keys(STATUS_CFG) as HoldStatus[]).map(s => (
          <button key={s} onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
            className={`px-3 py-1 rounded-full fs-base font-sans font-medium transition-all ${filterStatus === s ? STATUS_CFG[s].cls + ' font-semibold' : 'bg-white border border-[#DADCE0] text-[#5F6368] hover:bg-[#F1F3F4]'}`}>
            {zh ? STATUS_CFG[s].zh : STATUS_CFG[s].en}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="bg-white rounded-lg border border-[#DADCE0] overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#E8EAED] bg-[#F8F9FA]">
                <th className="py-3 pl-6 pr-3 text-left fs-md font-semibold text-[#5F6368] uppercase tracking-wider font-sans">{zh ? '物品' : 'Item'}</th>
                <th className="py-3 px-3 text-left fs-md font-semibold text-[#5F6368] uppercase tracking-wider font-sans">{zh ? '分类' : 'Category'}</th>
                <th className="py-3 px-3 text-left fs-md font-semibold text-[#5F6368] uppercase tracking-wider font-sans">{zh ? '日期' : 'Date'}</th>
                <th className="py-3 px-3 text-left fs-md font-semibold text-[#5F6368] uppercase tracking-wider font-sans">{zh ? '状态' : 'Status'}</th>
                <th className="py-3 pl-3 pr-6 text-right fs-md font-semibold text-[#5F6368] uppercase tracking-wider font-sans">{zh ? '价格' : 'Price'}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={5} className="py-12 text-center fs-body text-[#9AA0A6] font-sans">{zh ? '该分类暂无物品' : 'No items here'}</td></tr>
                : filtered.map(item => (
                    <ItemRow key={item.id} item={item} lang={lang}
                      expanded={expandedId === item.id}
                      onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
                      onDelete={() => { holdStore.remove(item.id); setExpandedId(null); }}
                    />
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {showAdd && <AddModal lang={lang} onClose={() => setShowAdd(false)} onSave={item => holdStore.add(item)} />}
    </div>
  );
}

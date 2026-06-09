import { Package } from 'lucide-react';

interface Props {
  lang: 'zh' | 'en';
}

/** 订单管理 — 品牌/服务订单列表（占位，待卡片系统接入） */
export default function BrandOrders({ lang }: Props) {
  const zh = lang === 'zh';
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 py-24 text-center">
      <Package className="w-8 h-8 text-[#1A1A1A]/20" strokeWidth={1.2} />
      <p className="text-xs font-mono tracking-widest uppercase text-[#1A1A1A]/40">
        {zh ? '订单模块即将上线' : 'Orders module coming soon'}
      </p>
      <p className="text-[11px] font-serif italic text-[#1A1A1A]/30 max-w-xs">
        {zh
          ? '通过 Chat 发起订单，卡片将自动汇聚至此'
          : 'Place orders via Chat — cards will appear here automatically'}
      </p>
    </div>
  );
}

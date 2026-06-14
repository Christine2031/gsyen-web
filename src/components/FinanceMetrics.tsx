import React from 'react';
import { TrendingUp, TrendingDown, ArrowUpRight } from 'lucide-react';
import { fmtAmount } from './financeLedger';

interface FinanceMetricsProps {
  lang: 'zh' | 'en';
  totalIncome: number;
  totalExpense: number;
  netMargin: number;
  incomeCount: number;
  expenseCount: number;
  showCny: boolean;
  usdToCny: number;
  onToggleCurrency: () => void;
}

/** 顶部三张汇总卡：累计收入 / 运营支出 / 税后纯利。收入卡点击可全站切换货币显示。 */
export default function FinanceMetrics({
  lang, totalIncome, totalExpense, netMargin,
  incomeCount, expenseCount, showCny, usdToCny, onToggleCurrency,
}: FinanceMetricsProps) {
  const fmt = (usd: number) => fmtAmount(usd, showCny, usdToCny);

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* 累计主营业务收入 */}
      <div className="bg-[#1A1A1A] text-[#F9F8F6] p-5 rounded-none border border-[#1A1A1A] space-y-1 relative overflow-hidden">
        <div className="absolute right-4 top-4 opacity-5 bg-white rounded-full p-2">
          <TrendingUp className="w-12 h-12 text-white" />
        </div>
        <p className="text-(--fs-xs) font-mono tracking-widest uppercase text-white/50">{lang === 'zh' ? '累计主营业务收入' : 'GROSS INCOME RECEIVED'}</p>
        <p
          onClick={onToggleCurrency}
          className="text-2xl font-serif font-bold tracking-tight text-[#E5C158] cursor-pointer hover:opacity-80 transition w-fit"
          title={lang === 'zh' ? '点击切换全站货币显示 ¥ / $' : 'Click to toggle currency display sitewide'}
        >
          {fmt(totalIncome)}
        </p>
        <div className="flex items-center gap-1.5 text-(--fs-xs) font-mono text-emerald-400 uppercase pt-2">
          <ArrowUpRight className="w-3 h-3" />
          <span>{incomeCount} {lang === 'zh' ? '笔已入账' : 'approved transactions'}</span>
        </div>
      </div>

      {/* 运营性费用支出 */}
      <div className="bg-white p-5 rounded-none border border-[#1A1A1A]/10 space-y-1 relative overflow-hidden">
        <div className="absolute right-4 top-4 opacity-5 bg-black rounded-full p-2">
          <TrendingDown className="w-12 h-12 text-[#1A1A1A]" />
        </div>
        <p className="text-(--fs-xs) font-mono tracking-widest uppercase text-[#1A1A1A]/50">{lang === 'zh' ? '运营性费用支出' : 'OPERATIONAL DEBITS'}</p>
        <p className="text-2xl font-serif font-bold tracking-tight text-[#1A1A1A] w-fit">{fmt(totalExpense)}</p>
        <div className="flex items-center gap-1.5 text-(--fs-xs) font-mono text-amber-700 uppercase pt-2">
          <TrendingDown className="w-3 h-3" />
          <span>{expenseCount} {lang === 'zh' ? '笔待报销/完成' : 'payments finalized'}</span>
        </div>
      </div>

      {/* 工作室税后纯利润 */}
      <div className="bg-[#F4F2EE] p-5 rounded-none border border-[#1A1A1A]/10 space-y-1 relative overflow-hidden">
        <p className="text-(--fs-xs) font-mono tracking-widest uppercase text-[#1A1A1A]/50">{lang === 'zh' ? '工作室税后纯利润' : 'NET OPERATIONAL MARGIN'}</p>
        <p className={`text-2xl font-serif font-bold tracking-tight w-fit ${netMargin >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
          {fmt(netMargin)}
        </p>
        <div className="text-(--fs-xs) font-mono text-[#1A1A1A]/60 uppercase pt-2 flex items-center justify-between">
          <span>{lang === 'zh' ? '盈利率:' : 'PROFIT RATIO:'}</span>
          <span className="font-bold text-[#1A1A1A]">{totalIncome > 0 ? Math.round((netMargin / totalIncome) * 100) : 0}%</span>
        </div>
      </div>
    </div>
  );
}

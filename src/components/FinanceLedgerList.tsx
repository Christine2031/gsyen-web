import React, { useState } from 'react';
import { Trash2, Calendar, Receipt, Sparkles } from 'lucide-react';
import { Transaction, itemCategoryTags, toUsd, fmtAmount } from './financeLedger';

interface FinanceLedgerListProps {
  lang: 'zh' | 'en';
  transactions: Transaction[];
  showCny: boolean;
  usdToCny: number;
  onDelete: (id: string) => void;
}

/** 右栏：复式平衡账目明细表（自管搜索筛选；金额按显示币种格式化） */
export default function FinanceLedgerList({ lang, transactions, showCny, usdToCny, onDelete }: FinanceLedgerListProps) {
  const [descFilter, setDescFilter] = useState('');
  const visible = transactions.filter(t => t.description.toLowerCase().includes(descFilter.toLowerCase()));

  return (
    <div className="bg-white border border-[#1A1A1A]/10 p-6 rounded-none min-h-[480px] flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#1A1A1A]/10 gap-3">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-[#1A1A1A]" />
            <span className="text-(--fs-sm) font-mono uppercase tracking-widest text-[#1A1A1A] font-bold">
              {lang === 'zh' ? '复式平衡账目明细表' : 'ATELIER DETAILED BUSINESS TRANSACTION STACKS'}
            </span>
          </div>
          <div>
            <input
              type="text"
              placeholder={lang === 'zh' ? '输入款项名称搜索...' : 'Filter ledger descriptions...'}
              value={descFilter}
              onChange={(e) => setDescFilter(e.target.value)}
              className="px-3 py-1 text-(--fs-md) font-mono border border-[#1A1A1A]/15 bg-transparent rounded-none focus:outline-none focus:border-[#1A1A1A]"
            />
          </div>
        </div>

        {visible.length === 0 ? (
          <div className="py-24 text-center space-y-2">
            <p className="text-xs font-serif italic text-zinc-400">
              {lang === 'zh' ? '无可计量的流水记录...' : 'All quiet on the fiscal registry front...'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#1A1A1A]/5 max-h-[480px] overflow-y-auto pr-2">
            {visible.map((item) => {
              const tagInfo = itemCategoryTags[item.category] || { labelZh: item.category, labelEn: item.category, color: 'text-zinc-800' };
              return (
                <div key={item.id} className="py-3.5 flex items-center justify-between gap-4 group transition-all hover:bg-[#F9F8F6]/40 px-2">
                  <div className="space-y-1 max-w-[70%]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-(--fs-xs) font-mono text-[#1A1A1A]/40 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {item.date}
                      </span>
                      <span className={`text-(--fs-2xs) font-mono tracking-widest px-1.5 py-0.5 border uppercase ${tagInfo.color}`}>
                        {lang === 'zh' ? tagInfo.labelZh : tagInfo.labelEn}
                      </span>
                      {item.notes && (
                        <span className="text-(--fs-2xs) text-zinc-400 font-mono italic max-w-[150px] truncate" title={item.notes}>
                          [{item.notes}]
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-sans font-bold text-[#1A1A1A] leading-normal truncate block">
                      {item.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-serif font-bold tracking-tight ${item.type === 'income' ? 'text-emerald-800' : 'text-[#1A1A1A]'}`}>
                      {item.type === 'income' ? '+' : '-'}{fmtAmount(toUsd(item.amount, item.currency, usdToCny), showCny, usdToCny, { decimals: 2 })}
                    </span>
                    <button
                      onClick={() => onDelete(item.id)}
                      className="p-1 text-red-700 opacity-0 group-hover:opacity-100 bg-red-50 hover:bg-red-100 transition-all border border-red-200"
                      title={lang === 'zh' ? '撤销该笔流水' : 'Void transaction'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-8 pt-4 border-t border-[#1A1A1A]/5 flex flex-col md:flex-row items-center justify-between text-(--fs-xs) font-mono text-[#1A1A1A]/40 uppercase tracking-widest gap-2">
        <span>{lang === 'zh' ? '账单认证编号: ISO-9003-FINE_ATELIER' : 'REGISTRY CODENAME: SILK_WEAVE_SYSTEM'}</span>
        <div className="flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-emerald-800" />
          <span>{lang === 'zh' ? '支持导出 PDF 与一键本地加密备份' : 'Certified Vector Double-Entry Platform'}</span>
        </div>
      </div>
    </div>
  );
}

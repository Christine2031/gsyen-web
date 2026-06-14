import React from 'react';
import { BarChart3 } from 'lucide-react';
import { itemCategoryTags, TxCategory } from './financeLedger';

interface FinanceCategoryBarsProps {
  lang: 'zh' | 'en';
  categorySummary: Record<string, number>;
  maxCategoryWeight: number;
}

/** 左栏上半：各分类资金占比的横向 spark bars（金额已统一换算到 USD 基准） */
export default function FinanceCategoryBars({ lang, categorySummary, maxCategoryWeight }: FinanceCategoryBarsProps) {
  const entries = Object.entries(categorySummary);

  return (
    <div className="bg-white border border-[#1A1A1A]/10 p-5 rounded-none space-y-4">
      <h3 className="text-(--fs-sm) font-mono tracking-[0.2em] text-[#1A1A1A] uppercase font-bold flex items-center justify-between pb-2 border-b border-[#1A1A1A]/5">
        <span>{lang === 'zh' ? '费用分布视觉占比' : 'CAPITAL CATEGORY METRICS'}</span>
        <BarChart3 className="w-3.5 h-3.5 text-[#1A1A1A]" />
      </h3>

      {entries.length === 0 ? (
        <p className="text-(--fs-sm) text-zinc-400 italic text-center font-mono py-6">EMPTY DATA GRID</p>
      ) : (
        <div className="space-y-3 pt-1">
          {entries.map(([key, value]) => {
            const tagInfo = itemCategoryTags[key as TxCategory] || { labelZh: key, labelEn: key, color: 'text-zinc-800' };
            const percentage = Math.round((value / maxCategoryWeight) * 100);
            return (
              <div key={key} className="space-y-1.5">
                <div className="flex justify-between text-(--fs-sm) font-mono uppercase text-[#1A1A1A]/70">
                  <span className="font-bold">{lang === 'zh' ? tagInfo.labelZh : tagInfo.labelEn}</span>
                  <span>${value.toLocaleString()}</span>
                </div>
                <div className="w-full h-2 bg-[#1A1A1A]/5 rounded-none overflow-hidden relative border border-[#1A1A1A]/5">
                  <div className="h-full bg-[#1A1A1A] transition-all duration-500" style={{ width: `${percentage}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { getCachedUsdToCnyRate, getUsdToCnyRate } from '../utils/exchangeRate';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';
import {
  Transaction, LOCAL_STORAGE_KEY, sanitizeTransactions, defaultTransactions, toUsd,
} from './financeLedger';
import FinanceMetrics from './FinanceMetrics';
import FinanceCategoryBars from './FinanceCategoryBars';
import FinanceEntryForm from './FinanceEntryForm';
import FinanceLedgerList from './FinanceLedgerList';

interface FinanceModuleProps {
  lang: 'zh' | 'en';
}

/**
 * Atelier Ledger — 复式记账账簿（编排层）
 * 拆分：financeLedger(类型/逻辑) + 指标卡 + 分类条 + 录入表单 + 流水表。
 * 本文件只持有账目状态、显示币种、实时汇率，并计算汇总口径（统一换算到 USD）。
 */
export default function FinanceModule({ lang }: FinanceModuleProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  // 全站联动的显示币种（聊天卡片与本页共用，见 useDisplayCurrency）
  const [displayCurrency, toggleDisplayCurrency] = useDisplayCurrency();
  const showCny = displayCurrency === 'CNY';

  const [usdToCny, setUsdToCny] = useState(getCachedUsdToCnyRate());
  useEffect(() => { void getUsdToCnyRate().then(setUsdToCny); }, []);

  // 初次加载：读本地存储（兼容旧记录），无则写入默认账目
  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        setTransactions(sanitizeTransactions(JSON.parse(saved)));
        return;
      } catch (e) {
        console.error(e);
      }
    }
    const seed = defaultTransactions(lang);
    setTransactions(seed);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(seed));
  }, [lang]);

  const handleAdd = useCallback((row: Transaction) => {
    setTransactions((prev) => {
      const updated = [row, ...prev].sort((a, b) => b.date.localeCompare(a.date));
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    setTransactions((prev) => {
      const updated = prev.filter((t) => t.id !== id);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
      return updated;
    });
  }, []);

  // 汇总口径：各笔先按原始币种换算到 USD 基准再求和，避免 ¥/$ 混算
  const { totalIncome, totalExpense, categorySummary } = useMemo(() => {
    let income = 0, expense = 0;
    const cats: Record<string, number> = {};
    for (const t of transactions) {
      const usd = toUsd(t.amount, t.currency, usdToCny);
      if (t.type === 'income') income += usd; else expense += usd;
      cats[t.category] = (cats[t.category] || 0) + usd;
    }
    return { totalIncome: income, totalExpense: expense, categorySummary: cats };
  }, [transactions, usdToCny]);

  const netMargin = totalIncome - totalExpense;
  const maxCategoryWeight = Math.max(...(Object.values(categorySummary) as number[]), 1);
  const incomeCount = transactions.filter((t) => t.type === 'income').length;
  const expenseCount = transactions.length - incomeCount;

  return (
    <div className="space-y-6">
      {/* 模块身份由顶栏 logo 区承担，此处不再重复标题 */}
      <FinanceMetrics
        lang={lang}
        totalIncome={totalIncome}
        totalExpense={totalExpense}
        netMargin={netMargin}
        incomeCount={incomeCount}
        expenseCount={expenseCount}
        showCny={showCny}
        usdToCny={usdToCny}
        onToggleCurrency={toggleDisplayCurrency}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-4">
          <FinanceCategoryBars lang={lang} categorySummary={categorySummary} maxCategoryWeight={maxCategoryWeight} />
          <FinanceEntryForm lang={lang} forceOpen={transactions.length === 0} onAdd={handleAdd} />
        </div>

        <div className="lg:col-span-8 space-y-4">
          <FinanceLedgerList
            lang={lang}
            transactions={transactions}
            showCny={showCny}
            usdToCny={usdToCny}
            onDelete={handleDelete}
          />
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { Currency } from '../utils/exchangeRate';
import { localDateStr } from '../utils/date';
import { Transaction, TxType, TxCategory } from './financeLedger';

interface FinanceEntryFormProps {
  lang: 'zh' | 'en';
  forceOpen: boolean;
  onAdd: (row: Transaction) => void;
}

/** 左栏下半：录入收支款项表单（自管字段，按用户实际币种入账） */
export default function FinanceEntryForm({ lang, forceOpen, onAdd }: FinanceEntryFormProps) {
  const [showForm, setShowForm] = useState(false);
  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCurrency, setNewCurrency] = useState<Currency>('CNY');
  const [newType, setNewType] = useState<TxType>('income');
  const [newCategory, setNewCategory] = useState<TxCategory>('commission');
  const [newDate, setNewDate] = useState(localDateStr(new Date()));
  const [newNotes, setNewNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDesc.trim() || !newAmount) return;
    const amountNum = parseFloat(newAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    onAdd({
      id: Date.now().toString(),
      description: newDesc,
      amount: amountNum,
      currency: newCurrency,
      type: newType,
      category: newCategory,
      date: newDate || localDateStr(new Date()),
      notes: newNotes,
    });

    setNewDesc('');
    setNewAmount('');
    setNewCurrency('CNY');
    setNewNotes('');
    setShowForm(false);
  };

  return (
    <div className="bg-white border border-[#1A1A1A]/10 p-5 rounded-none space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-(--fs-sm) font-mono tracking-widest text-[#1A1A1A] uppercase font-bold">
          {lang === 'zh' ? '录入收支款项' : 'ADD NEW ACCRUAL'}
        </h4>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-xs bg-[#1A1A1A] text-[#F9F8F6] px-2 py-1 font-mono hover:bg-[#1A1A1A]/90 transition-all font-bold uppercase text-(--fs-xs) tracking-wider"
        >
          {showForm ? (lang === 'zh' ? '关闭' : 'Close') : (lang === 'zh' ? '添加录入' : 'Open')}
        </button>
      </div>

      {(showForm || forceOpen) && (
        <form onSubmit={handleSubmit} className="space-y-3 pt-1">
          <div>
            <label className="block text-(--fs-xs) tracking-widest font-mono text-[#1A1A1A]/60 uppercase mb-1">
              {lang === 'zh' ? '交易款项描述' : 'LEGAL ROW DESCRIPTION'}
            </label>
            <input
              type="text"
              required
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder={lang === 'zh' ? '例如: 专属名片定制压印余款' : 'Atelier Logo Commission stage 2'}
              className="w-full px-3 py-2 text-xs border border-[#1A1A1A]/15 bg-white rounded-none focus:outline-none focus:border-[#1A1A1A]/50 text-[#1A1A1A]"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-(--fs-xs) tracking-widest font-mono text-[#1A1A1A]/60 uppercase mb-1">
                {lang === 'zh' ? '款项金额 · 币种' : 'AMOUNT · CURRENCY'}
              </label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  required
                  min="0.1"
                  step="0.01"
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="e.g. 500"
                  className="flex-1 min-w-0 px-3 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none text-[#1A1A1A]"
                />
                <select
                  value={newCurrency}
                  onChange={(e) => setNewCurrency(e.target.value as Currency)}
                  title={lang === 'zh' ? '该笔款项实际收付的币种' : 'Currency this amount was actually paid/received in'}
                  className="w-[72px] shrink-0 px-1.5 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none text-[#1A1A1A]"
                >
                  <option value="CNY">{lang === 'zh' ? '¥ 人民币' : 'CNY ¥'}</option>
                  <option value="USD">{lang === 'zh' ? '$ 美元' : 'USD $'}</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-(--fs-xs) tracking-widest font-mono text-[#1A1A1A]/60 uppercase mb-1">
                {lang === 'zh' ? '交易类型' : 'ENTRY FLOW TYPE'}
              </label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as TxType)}
                className="w-full px-2 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none text-[#1A1A1A]"
              >
                <option value="income">{lang === 'zh' ? '＋ 业务收入' : '＋ CR (Income)'}</option>
                <option value="expense">{lang === 'zh' ? '－ 资金流出' : '－ DR (Expense)'}</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-(--fs-xs) tracking-widest font-mono text-[#1A1A1A]/60 uppercase mb-1">
                {lang === 'zh' ? '分类性质' : 'CLASSIFICATION'}
              </label>
              <select
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value as TxCategory)}
                className="w-full px-2 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none text-[#1A1A1A]"
              >
                <option value="commission">{lang === 'zh' ? '品牌高定佣金' : 'Atelier Commission'}</option>
                <option value="royalty">{lang === 'zh' ? '产权版税/授权' : 'Ink Licensing'}</option>
                <option value="material">{lang === 'zh' ? '纸张耗材原浆' : 'Textured Materials'}</option>
                <option value="server">{lang === 'zh' ? '机密服务器安全' : 'Server Nodes'}</option>
                <option value="marketing">{lang === 'zh' ? '形象公关媒介' : 'Media PR Cost'}</option>
                <option value="consultancy">{lang === 'zh' ? '高端咨询服务' : 'Aesthetic Consultancy'}</option>
              </select>
            </div>
            <div>
              <label className="block text-(--fs-xs) tracking-widest font-mono text-[#1A1A1A]/60 uppercase mb-1">
                {lang === 'zh' ? '结账日期' : 'VALUE DATE'}
              </label>
              <input
                type="date"
                required
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="w-full px-2 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none text-[#1A1A1A]"
              />
            </div>
          </div>

          <div>
            <label className="block text-(--fs-xs) tracking-widest font-mono text-[#1A1A1A]/60 uppercase mb-1">
              {lang === 'zh' ? '内部注释 (选填)' : 'INTERNAL AUDIT NOTE'}
            </label>
            <input
              type="text"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="e.g. Cleared via instant bank wire."
              className="w-full px-3 py-2 text-xs border border-[#1A1A1A]/15 bg-white rounded-none text-[#1A1A1A]"
            />
          </div>

          <button
            type="submit"
            className="w-full py-2.5 bg-[#1A1A1A] hover:bg-[#1A1A1A]/95 text-white font-bold text-xs uppercase font-mono tracking-widest transition-all"
          >
            {lang === 'zh' ? '审计并载入账薄' : 'AUDIT & COMMIT LEDGER'}
          </button>
        </form>
      )}
    </div>
  );
}

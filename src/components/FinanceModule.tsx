import React, { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Plus, Trash2, Calendar, FileText, ArrowUpRight, BarChart3, Receipt, Eye, Sparkles } from 'lucide-react';
import { localDateStr } from '../utils/date';
import { Currency, getCachedUsdToCnyRate, getUsdToCnyRate, convertAmount } from '../utils/exchangeRate';
import { useDisplayCurrency } from '../hooks/useDisplayCurrency';

interface Transaction {
  id: string;
  description: string;
  amount: number;
  currency: Currency;          // 'CNY' | 'USD' —— 记录原始币种，汇总/展示时按实时汇率统一换算
  type: 'income' | 'expense';
  category: 'royalty' | 'commission' | 'material' | 'server' | 'marketing' | 'consultancy';
  date: string;
  notes?: string;
}

/** 旧记录没有 currency 字段——按本模块历史惯例（账面一律按 USD 存储）兜底，向后兼容 */
function sanitizeTransactions(raw: any[]): Transaction[] {
  return raw.map(item => ({ ...item, currency: item.currency === 'CNY' ? 'CNY' : 'USD' }));
}

interface FinanceModuleProps {
  lang: 'zh' | 'en';
}

export default function FinanceModule({ lang }: FinanceModuleProps) {
  const LOCAL_STORAGE_KEY = 'identity_lab_finance';

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [descFilter, setDescFilter] = useState('');
  
  // Forms
  const [newDesc, setNewDesc] = useState('');
  const [newAmount, setNewAmount] = useState('');
  // 录入金额的原始币种——之前固定按 USD 入账，但用户实际收付往往是人民币
  // （比如"我收到了500元备用金"），不该被强行当作美元记一笔。默认选 CNY
  // 更贴近本地工作室的真实场景，用户也可以按需切到 USD。
  const [newCurrency, setNewCurrency] = useState<Currency>('CNY');
  const [newType, setNewType] = useState<'income' | 'expense'>('income');
  const [newCategory, setNewCategory] = useState<'royalty' | 'commission' | 'material' | 'server' | 'marketing' | 'consultancy'>('commission');
  const [newDate, setNewDate] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [showForm, setShowForm] = useState(false);

  /**
   * 点击任意金额可在 $ / ¥ 之间切换——按实时汇率换算（与聊天卡片同款联动汇率）。
   *
   * 注意：这里特意不用一个全局开关统一切换所有金额——之前 showCNY 是单一布尔值，
   * 导致点击任意一处都会把页面里全部金额同时翻转，体验上跟"点哪个换哪个"的直觉
   * 不符（聊天 LEDGER 卡片就是各自独立切换的）。改成"每个数字各自记自己的状态"：
   * 三张汇总卡片各自一个布尔位，列表里每一行用 id 集合记录"已切换"的条目。
   * 这样点谁、谁变，互不影响——和聊天卡片的体验完全一致。
   */
  // 全局联动开关——和聊天 LEDGER/PAYMENT 卡片共用同一个状态（见 useDisplayCurrency）。
  // 产品里只留两个可点入口：聊天里任意一张带货币的卡片 + 这里左上角"累计主营业务收入"，
  // 点其中任何一个，全站所有金额一起切换 ¥ / $，并跨刷新/会话/标签页持久同步。
  const [displayCurrency, toggleDisplayCurrency] = useDisplayCurrency();
  const showCny = displayCurrency === 'CNY';

  const [usdToCny, setUsdToCny] = useState(getCachedUsdToCnyRate());
  useEffect(() => {
    void getUsdToCnyRate().then(setUsdToCny);
  }, []);
  /**
   * 账面金额一律按 USD 存储；展示时按需换算并加上对应符号。
   * 这里符号放在数字左侧（"${'$'} 1,000"）——大号衬线展示数字时，符号居左
   * 是财务报表的传统排法，视觉上比居右更稳重大方；聊天 LEDGER 卡片是
   * 小尺寸标签式排版，符号居右更紧凑——两处场景不同，各自取最好看的写法。
   * 数字与符号之间用窄不换行空格(U+202F)隔开，清楚分开又不破行。
   *
   * @param showCny 是否把这一笔按人民币显示——由调用方传入"这一处自己的"切换状态，
   *                而不是读取某个全局开关，从根源上避免互相耦合。
   */
  const fmtAmount = (usd: number, showCny: boolean, opts?: { decimals?: number }): string => {
    const decimals = opts?.decimals ?? 0;
    if (showCny) {
      const cny = convertAmount(usd, 'USD', 'CNY', usdToCny);
      return `¥ ${cny.toLocaleString(undefined, { maximumFractionDigits: decimals || 1 })}`;
    }
    return `${'$'} ${usd.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  };

  /**
   * 把"按交易原始币种记录的金额"统一换算成 USD 基准——
   * 汇总（累计收入/支出/利润/分类占比）和单条展示都先转成 USD 再喂给 fmtAmount，
   * 这样无论用户当时录入的是 ¥ 还是 $，报表口径都一致，不会因为币种没对齐而算错。
   */
  const toUsd = (amount: number, currency: Currency): number =>
    currency === 'USD' ? amount : convertAmount(amount, 'CNY', 'USD', usdToCny);

  useEffect(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      try {
        setTransactions(sanitizeTransactions(JSON.parse(saved)));
      } catch (e) {
        console.error(e);
      }
    } else {
      // Default exquisite data set
      const defaultData: Transaction[] = [
        {
          id: 't1',
          description: lang === 'zh' ? '皇家加冕珠宝商 (Royal Crown Jewelers) 矢量图标授权税收' : 'Royalty Licensing - Royal Crown Jewelers SVG',
          amount: 4500,
          currency: 'USD',
          type: 'income',
          category: 'royalty',
          date: '2026-05-20',
          notes: 'Standard vector brand licensing. Quarter 2 royalties.'
        },
        {
          id: 't2',
          description: lang === 'zh' ? '高科技半导体 Neural Processor 项目定制设顾问费完成' : 'Consultancy Commission: Neural Processor custom UI suite',
          amount: 18500,
          currency: 'USD',
          type: 'income',
          category: 'commission',
          date: '2026-05-24',
          notes: 'Aesthetic high-concept identity consultation premium milestone'
        },
        {
          id: 't3',
          description: lang === 'zh' ? '德国高纬哑光原棉纸与高纯度墨水测试介质采购' : 'Premium German Matte Cotton Card Stock Material Procurement',
          amount: 1250,
          currency: 'USD',
          type: 'expense',
          category: 'material',
          date: '2026-05-25',
          notes: 'Imported textured thick paper stocks for press test runs.'
        },
        {
          id: 't4',
          description: lang === 'zh' ? '机密军事级安全沙河服务器及分布式 K8s 节点安全代管' : 'Citadel SSL Security Vault Node & Cloud Managed VM Node',
          amount: 450,
          currency: 'USD',
          type: 'expense',
          category: 'server',
          date: '2026-05-25',
          notes: 'Automatic key rotating server maintenance.'
        }
      ];
      setTransactions(defaultData);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(defaultData));
    }
    setNewDate(localDateStr(new Date()));
  }, [lang]);

  const saveTransactions = (updated: Transaction[]) => {
    setTransactions(updated);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
  };

  const handleAddTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDesc.trim() || !newAmount) return;

    const amountNum = parseFloat(newAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    const row: Transaction = {
      id: Date.now().toString(),
      description: newDesc,
      amount: amountNum,
      currency: newCurrency,        // 按用户实际选择的币种入账——不再被强行当作美元记一笔
      type: newType,
      category: newCategory,
      date: newDate || localDateStr(new Date()),
      notes: newNotes
    };

    const updated = [row, ...transactions].sort((a, b) => b.date.localeCompare(a.date));
    saveTransactions(updated);

    setNewDesc('');
    setNewAmount('');
    setNewCurrency('CNY');
    setNewNotes('');
    setShowForm(false);
  };

  const handleDelete = (id: string) => {
    const updated = transactions.filter(t => t.id !== id);
    saveTransactions(updated);
  };

  // Math logic —— 各自按原始币种换算到 USD 基准后再求和，避免 ¥/$ 混算出错
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + toUsd(t.amount, t.currency), 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + toUsd(t.amount, t.currency), 0);
  const netMargin = totalIncome - totalExpense;

  // Custom localized Category labels
  const itemCategoryTags = {
    royalty: { labelZh: '授权税/版税', labelEn: 'Royalty Ink', color: 'text-indigo-800 bg-indigo-50 border-indigo-200' },
    commission: { labelZh: '品牌高定佣金', labelEn: 'Atelier Work', color: 'text-emerald-800 bg-emerald-50 border-emerald-200' },
    material: { labelZh: '高端物料介质', labelEn: 'Paper & Clay', color: 'text-amber-800 bg-amber-50 border-amber-200' },
    server: { labelZh: '云沙箱与密钥维护', labelEn: 'Citadel Node', color: 'text-zinc-800 bg-zinc-50 border-zinc-200' },
    marketing: { labelZh: '经典推广公关', labelEn: 'Atelier PR', color: 'text-rose-800 bg-rose-50 border-rose-200' },
    consultancy: { labelZh: '设计路线图顾问', labelEn: 'Strategy Guid', color: 'text-teal-800 bg-teal-50 border-teal-200' }
  };

  // Data processing for beautiful graphic bars (SVG representing relative category split)
  const categorySummary = transactions.reduce((acc, current) => {
    const cat = current.category;
    if (!acc[cat]) acc[cat] = 0;
    acc[cat] += toUsd(current.amount, current.currency);  // 同样换算到 USD 基准再累加，口径统一
    return acc;
  }, {} as Record<string, number>);

  const maxCategoryWeight = Math.max(...(Object.values(categorySummary) as number[]), 1);

  return (
    <div className="space-y-6">
      {/* Title block */}
      <div className="max-w-4xl">
        <h2 className="text-xl font-serif text-[#1A1A1A] font-bold tracking-tight">
          {lang === 'zh' ? 'Atelier Ledger 奢雅资产复式记账账簿' : 'Atelier Ledger & Capital Flow Tracker'}
        </h2>
        <p className="text-xs text-[#1A1A1A]/60 font-mono uppercase tracking-widest mt-1">
          {lang === 'zh' ? '面向创作者和精英工作室定制的印记账簿与开支分析器' : 'Aesthetic financial ledger optimized for premium design practices'}
        </p>
      </div>

      {/* Grid boxes for Financial Dashboard Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Metric 1 */}
        <div className="bg-[#1A1A1A] text-[#F9F8F6] p-5 rounded-none border border-[#1A1A1A] space-y-1 relative overflow-hidden">
          <div className="absolute right-4 top-4 opacity-5 bg-white rounded-full p-2">
            <TrendingUp className="w-12 h-12 text-white" />
          </div>
          <p className="text-[9px] font-mono tracking-widest uppercase text-white/50">{lang === 'zh' ? '累计主营业务收入' : 'GROSS INCOME RECEIVED'}</p>
          <p onClick={toggleDisplayCurrency} className="text-2xl font-serif font-bold tracking-tight text-[#E5C158] cursor-pointer hover:opacity-80 transition w-fit" title={lang === 'zh' ? '点击切换全站货币显示 ¥ / $' : 'Click to toggle currency display sitewide'}>{fmtAmount(totalIncome, showCny)}</p>
          <div className="flex items-center gap-1.5 text-[9px] font-mono text-emerald-400 uppercase pt-2">
            <ArrowUpRight className="w-3 h-3" />
            <span>{transactions.filter(t => t.type === 'income').length} {lang === 'zh' ? '笔已入账' : 'approved transactions'}</span>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-5 rounded-none border border-[#1A1A1A]/10 space-y-1 relative overflow-hidden">
          <div className="absolute right-4 top-4 opacity-5 bg-black rounded-full p-2">
            <TrendingDown className="w-12 h-12 text-[#1A1A1A]" />
          </div>
          <p className="text-[9px] font-mono tracking-widest uppercase text-[#1A1A1A]/50">{lang === 'zh' ? '运营性费用支出' : 'OPERATIONAL DEBITS'}</p>
          <p className="text-2xl font-serif font-bold tracking-tight text-[#1A1A1A] w-fit">{fmtAmount(totalExpense, showCny)}</p>
          <div className="flex items-center gap-1.5 text-[9px] font-mono text-amber-700 uppercase pt-2">
            <TrendingDown className="w-3 h-3" />
            <span>{transactions.filter(t => t.type === 'expense').length} {lang === 'zh' ? '笔待报销/完成' : 'payments finalized'}</span>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-[#F4F2EE] p-5 rounded-none border border-[#1A1A1A]/10 space-y-1 relative overflow-hidden">
          <p className="text-[9px] font-mono tracking-widest uppercase text-[#1A1A1A]/50">{lang === 'zh' ? '工作室税后纯利润' : 'NET OPERATIONAL MARGIN'}</p>
          <p className={`text-2xl font-serif font-bold tracking-tight w-fit ${netMargin >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
            {fmtAmount(netMargin, showCny)}
          </p>
          <div className="text-[9px] font-mono text-[#1A1A1A]/60 uppercase pt-2 flex items-center justify-between">
            <span>{lang === 'zh' ? '盈利率:' : 'PROFIT RATIO:'}</span>
            <span className="font-bold text-[#1A1A1A]">{totalIncome > 0 ? Math.round((netMargin / totalIncome) * 100) : 0}%</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Adding Ledger with Exquisite Form */}
        <div className="lg:col-span-4 space-y-4">
          {/* Section A: Visual Spark Bars */}
          <div className="bg-white border border-[#1A1A1A]/10 p-5 rounded-none space-y-4">
            <h3 className="text-[10px] font-mono tracking-[0.2em] text-[#1A1A1A] uppercase font-bold flex items-center justify-between pb-2 border-b border-[#1A1A1A]/5">
              <span>{lang === 'zh' ? '费用分布视觉占比' : 'CAPITAL CATEGORY METRICS'}</span>
              <BarChart3 className="w-3.5 h-3.5 text-[#1A1A1A]" />
            </h3>

            {transactions.length === 0 ? (
              <p className="text-[10px] text-zinc-400 italic text-center font-mono py-6">EMPTY DATA GRID</p>
            ) : (
              <div className="space-y-3 pt-1">
                {Object.entries(categorySummary).map(([key, val]) => {
                  const value = val as number;
                  const tagInfo = itemCategoryTags[key as keyof typeof itemCategoryTags] || { labelZh: key, labelEn: key, color: 'text-zinc-800' };
                  const percentage = Math.round((value / maxCategoryWeight) * 100);
                  return (
                    <div key={key} className="space-y-1.5">
                      <div className="flex justify-between text-[10px] font-mono uppercase text-[#1A1A1A]/70">
                        <span className="font-bold">{lang === 'zh' ? tagInfo.labelZh : tagInfo.labelEn}</span>
                        <span>${value.toLocaleString()}</span>
                      </div>
                      {/* Stylized high contrast horizontal bar */}
                      <div className="w-full h-2 bg-[#1A1A1A]/5 rounded-none overflow-hidden relative border border-[#1A1A1A]/5">
                        <div 
                          className="h-full bg-[#1A1A1A] transition-all duration-500" 
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section B: Create Entry Form */}
          <div className="bg-white border border-[#1A1A1A]/10 p-5 rounded-none space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-mono tracking-widest text-[#1A1A1A] uppercase font-bold">
                {lang === 'zh' ? '录入收支款项' : 'ADD NEW ACCRUAL'}
              </h4>
              <button 
                onClick={() => setShowForm(!showForm)}
                className="text-xs bg-[#1A1A1A] text-[#F9F8F6] px-2 py-1 font-mono hover:bg-[#1A1A1A]/90 transition-all font-bold uppercase text-[9px] tracking-wider"
              >
                {showForm ? (lang === 'zh' ? '关闭' : 'Close') : (lang === 'zh' ? '添加录入' : 'Open')}
              </button>
            </div>

            {(showForm || transactions.length === 0) && (
              <form onSubmit={handleAddTransaction} className="space-y-3 pt-1">
                <div>
                  <label className="block text-[9px] tracking-widest font-mono text-[#1A1A1A]/60 uppercase mb-1">
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
                    <label className="block text-[9px] tracking-widest font-mono text-[#1A1A1A]/60 uppercase mb-1">
                      {lang === 'zh' ? '款项金额 · 币种' : 'AMOUNT · CURRENCY'}
                    </label>
                    {/* 金额与币种选择并排——按用户实际收付的真实币种入账，
                        不再固定假设是美元（避免"收到500元人民币"被错记成 $500 这类错账） */}
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
                    <label className="block text-[9px] tracking-widest font-mono text-[#1A1A1A]/60 uppercase mb-1">
                      {lang === 'zh' ? '交易类型' : 'ENTRY FLOW TYPE'}
                    </label>
                    <select
                      value={newType}
                      onChange={(e) => setNewType(e.target.value as any)}
                      className="w-full px-2 py-1.5 text-xs border border-[#1A1A1A]/15 bg-white rounded-none text-[#1A1A1A]"
                    >
                      <option value="income">{lang === 'zh' ? '＋ 业务收入' : '＋ CR (Income)'}</option>
                      <option value="expense">{lang === 'zh' ? '－ 资金流出' : '－ DR (Expense)'}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[9px] tracking-widest font-mono text-[#1A1A1A]/60 uppercase mb-1">
                      {lang === 'zh' ? '分类性质' : 'CLASSIFICATION'}
                    </label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as any)}
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
                    <label className="block text-[9px] tracking-widest font-mono text-[#1A1A1A]/60 uppercase mb-1">
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
                  <label className="block text-[9px] tracking-widest font-mono text-[#1A1A1A]/60 uppercase mb-1">
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
        </div>

        {/* Right Side: Ledger Transactions list and Ledger simulation card */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white border border-[#1A1A1A]/10 p-6 rounded-none min-h-[480px] flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#1A1A1A]/10 gap-3">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-[#1A1A1A]" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#1A1A1A] font-bold">
                    {lang === 'zh' ? '复式平衡账目明细表' : 'ATELIER DETAILED BUSINESS TRANSACTION STACKS'}
                  </span>
                </div>
                
                {/* Micro Input search */}
                <div>
                  <input
                    type="text"
                    placeholder={lang === 'zh' ? '输入款项名称搜索...' : 'Filter ledger descriptions...'}
                    value={descFilter}
                    onChange={(e) => setDescFilter(e.target.value)}
                    className="px-3 py-1 text-[11px] font-mono border border-[#1A1A1A]/15 bg-transparent rounded-none focus:outline-none focus:border-[#1A1A1A]"
                  />
                </div>
              </div>

              {/* Transactions grid list */}
              {transactions.filter(t => t.description.toLowerCase().includes(descFilter.toLowerCase())).length === 0 ? (
                <div className="py-24 text-center space-y-2">
                  <p className="text-xs font-serif italic text-zinc-400">
                    {lang === 'zh' ? '无可计量的流水记录...' : 'All quiet on the fiscal registry front...'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#1A1A1A]/5 max-h-[480px] overflow-y-auto pr-2">
                  {transactions
                    .filter(t => t.description.toLowerCase().includes(descFilter.toLowerCase()))
                    .map((item) => {
                      const tagInfo = itemCategoryTags[item.category] || { labelZh: item.category, labelEn: item.category, color: 'text-zinc-800' };
                      return (
                        <div key={item.id} className="py-3.5 flex items-center justify-between gap-4 group transition-all hover:bg-[#F9F8F6]/40 px-2">
                          <div className="space-y-1 max-w-[70%]">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[9px] font-mono text-[#1A1A1A]/40 flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {item.date}
                              </span>
                              <span className={`text-[8px] font-mono tracking-widest px-1.5 py-0.5 border uppercase ${tagInfo.color}`}>
                                {lang === 'zh' ? tagInfo.labelZh : tagInfo.labelEn}
                              </span>
                              {item.notes && (
                                <span className="text-[8px] text-zinc-400 font-mono italic max-w-[150px] truncate" title={item.notes}>
                                  [{item.notes}]
                                </span>
                              )}
                            </div>

                            <p className="text-xs font-sans font-bold text-[#1A1A1A] leading-normal truncate block">
                              {item.description}
                            </p>
                          </div>

                          <div className="flex items-center gap-3">
                            <span
                              className={`text-xs font-serif font-bold tracking-tight ${
                                item.type === 'income'
                                  ? 'text-emerald-800'
                                  : 'text-[#1A1A1A]'
                              }`}
                            >
                              {item.type === 'income' ? '+' : '-'}{fmtAmount(toUsd(item.amount, item.currency), showCny, { decimals: 2 })}
                            </span>
                            <button
                              onClick={() => handleDelete(item.id)}
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

            {/* Quick footer with simulation ledger watermark */}
            <div className="mt-8 pt-4 border-t border-[#1A1A1A]/5 flex flex-col md:flex-row items-center justify-between text-[9px] font-mono text-[#1A1A1A]/40 uppercase tracking-widest gap-2">
              <span>{lang === 'zh' ? '账单认证编号: ISO-9003-FINE_ATELIER' : 'REGISTRY CODENAME: SILK_WEAVE_SYSTEM'}</span>
              <div className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-emerald-800" />
                <span>{lang === 'zh' ? '支持导出 PDF 与一键本地加密备份' : 'Certified Vector Double-Entry Platform'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

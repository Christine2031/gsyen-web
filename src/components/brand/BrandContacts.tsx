/**
 * BrandContacts — Google Contacts 风格联系人管理
 */
import { useState } from 'react';
import { Users, Phone, Mail } from 'lucide-react';

interface Props { lang: 'zh' | 'en' }

type ContactType = 'client' | 'supplier' | 'partner';
type ContactStatus = 'active' | 'inactive';

interface Contact {
  id: string;
  name: string;
  company: string;
  type: ContactType;
  status: ContactStatus;
  phone: string;
  email: string;
  location: string;
  notes?: string;
}

const DEMO_CONTACTS: Contact[] = [
  { id: 'c1', name: '李建军', company: '江桥水产批发',    type: 'client',   status: 'active',   phone: '138-0000-1234', email: 'lijj@jiangqiao.com',  location: '上海',   notes: '江桥批发市场 A3 档口' },
  { id: 'c2', name: '陈秋霞', company: '南沙渔港配送',    type: 'client',   status: 'active',   phone: '139-0000-5678', email: 'chenqx@nansha.com',  location: '广州',   notes: '码头 7 号长期客户' },
  { id: 'c3', name: '王浩然', company: '三元桥冷链物流',  type: 'supplier', status: 'active',   phone: '135-0000-9012', email: 'wanghr@sanyuan.com', location: '北京',   notes: '冷链运输主供应商' },
  { id: 'c4', name: '赵云昌', company: '锦里水产贸易',    type: 'client',   status: 'inactive', phone: '136-0000-3456', email: 'zhaoyc@jinli.com',   location: '成都',   notes: '年度合约已到期' },
  { id: 'c5', name: '孙晓峰', company: '东海渔业集团',    type: 'partner',  status: 'active',   phone: '137-0000-7890', email: 'sunxf@donghai.com',  location: '宁波',   notes: '战略合作伙伴' },
  { id: 'c6', name: '刘敏华', company: '珠江水产检疫站',  type: 'partner',  status: 'active',   phone: '132-0000-2345', email: 'liumh@zjcheck.com',  location: '广州',   notes: '检验检疫认证合作' },
];

const TYPE_CFG: Record<ContactType, { zh: string; en: string; cls: string }> = {
  client:   { zh: '客户',   en: 'Client',   cls: 'bg-[#E8F0FE] text-[#1A73E8]' },
  supplier: { zh: '供应商', en: 'Supplier', cls: 'bg-[#E6F4EA] text-[#137333]' },
  partner:  { zh: '合作方', en: 'Partner',  cls: 'bg-[#FEF7E0] text-[#B05E00]' },
};

const STATUS_CFG: Record<ContactStatus, { zh: string; en: string; cls: string }> = {
  active:   { zh: '活跃', en: 'Active',   cls: 'bg-[#E6F4EA] text-[#137333]' },
  inactive: { zh: '停用', en: 'Inactive', cls: 'bg-[#F1F3F4] text-[#5F6368]' },
};

const AVATAR_COLORS = [
  'bg-[#1A73E8]', 'bg-[#137333]', 'bg-[#B05E00]',
  'bg-[#9334E6]', 'bg-[#D93025]', 'bg-[#0097A7]',
];

type Filter = ContactType | 'all';
const FILTERS: { key: Filter; zh: string; en: string }[] = [
  { key: 'all',      zh: '全部',   en: 'All'      },
  { key: 'client',   zh: '客户',   en: 'Clients'  },
  { key: 'supplier', zh: '供应商', en: 'Suppliers' },
  { key: 'partner',  zh: '合作方', en: 'Partners' },
];

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="flex-1 bg-white rounded-lg border border-[#DADCE0] px-5 py-4 min-w-0 flex items-center gap-4">
      <div className="w-10 h-10 rounded-full bg-[#E8F0FE] flex items-center justify-center shrink-0">
        <Icon className="w-5 h-5 text-[#1A73E8]" strokeWidth={1.5} />
      </div>
      <div>
        <p className="text-[11px] text-[#5F6368] font-sans">{label}</p>
        <p className="text-[22px] font-bold text-[#202124] leading-none font-sans">{value}</p>
      </div>
    </div>
  );
}

function ContactRow({ c, lang }: { c: Contact; lang: 'zh' | 'en' }) {
  const zh = lang === 'zh';
  const avatarCls = AVATAR_COLORS[c.name.charCodeAt(0) % AVATAR_COLORS.length];
  const typeCfg   = TYPE_CFG[c.type];
  const statusCfg = STATUS_CFG[c.status];

  return (
    <tr className="border-b border-[#E8EAED] hover:bg-[#F8F9FA] transition-colors">
      <td className="py-3.5 pl-6 pr-3">
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full ${avatarCls} flex items-center justify-center shrink-0`}>
            <span className="text-white text-[12px] font-bold font-sans">{c.name.charAt(0)}</span>
          </div>
          <div>
            <p className="text-[13px] font-medium text-[#202124] font-sans">{c.name}</p>
            <p className="text-[11px] text-[#5F6368] font-sans">{c.company}</p>
          </div>
        </div>
      </td>
      <td className="py-3.5 px-3">
        <p className="text-[12px] text-[#5F6368] font-sans">{c.location}</p>
        {c.notes && <p className="text-[11px] text-[#9AA0A6] font-sans truncate max-w-[160px]">{c.notes}</p>}
      </td>
      <td className="py-3.5 px-3">
        <div className="flex items-center gap-1.5 text-[12px] text-[#5F6368] font-sans">
          <Phone className="w-3 h-3 text-[#9AA0A6]" strokeWidth={1.5} />
          {c.phone}
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-[#9AA0A6] font-sans mt-0.5">
          <Mail className="w-3 h-3" strokeWidth={1.5} />
          {c.email}
        </div>
      </td>
      <td className="py-3.5 px-3">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium font-sans ${typeCfg.cls}`}>
          {zh ? typeCfg.zh : typeCfg.en}
        </span>
      </td>
      <td className="py-3.5 pl-3 pr-6">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium font-sans ${statusCfg.cls}`}>
          {zh ? statusCfg.zh : statusCfg.en}
        </span>
      </td>
    </tr>
  );
}

export default function BrandContacts({ lang }: Props) {
  const zh = lang === 'zh';
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const filtered = DEMO_CONTACTS.filter(c => {
    const matchType = filter === 'all' || c.type === filter;
    const q = search.toLowerCase();
    const matchSearch = !q || c.name.includes(q) || c.company.includes(q) || c.location.includes(q);
    return matchType && matchSearch;
  });

  const clients   = DEMO_CONTACTS.filter(c => c.type === 'client').length;
  const suppliers = DEMO_CONTACTS.filter(c => c.type === 'supplier').length;
  const partners  = DEMO_CONTACTS.filter(c => c.type === 'partner').length;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#F8F9FA]">

      {/* 汇总卡片 */}
      <div className="flex gap-4 px-6 py-5 shrink-0">
        <StatCard label={zh ? '联系人总数' : 'Total Contacts'} value={String(DEMO_CONTACTS.length)} icon={Users} />
        <StatCard label={zh ? `客户 ${clients} · 供应商 ${suppliers}` : `${clients} Clients · ${suppliers} Suppliers`} value={String(clients + suppliers)} icon={Phone} />
        <StatCard label={zh ? '合作伙伴' : 'Partners'} value={String(partners)} icon={Mail} />
      </div>

      {/* 筛选 chips + 搜索 */}
      <div className="flex items-center gap-2 px-6 pb-4 shrink-0">
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded-full text-[12px] font-sans font-medium transition-all ${
              filter === f.key
                ? 'bg-[#1A73E8] text-white'
                : 'bg-white border border-[#DADCE0] text-[#5F6368] hover:bg-[#F1F3F4]'
            }`}>
            {zh ? f.zh : f.en}
          </button>
        ))}
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={zh ? '搜索联系人…' : 'Search contacts…'}
          className="ml-auto px-3 py-1 rounded-full text-[12px] font-sans border border-[#DADCE0] bg-white text-[#202124] placeholder-[#9AA0A6] focus:outline-none focus:border-[#1A73E8] w-44"
        />
      </div>

      {/* 表格 */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="bg-white rounded-lg border border-[#DADCE0] overflow-hidden">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#E8EAED] bg-[#F8F9FA]">
                <th className="py-3 pl-6 pr-3 text-left text-[11px] font-semibold text-[#5F6368] uppercase tracking-wider font-sans">{zh ? '联系人' : 'Contact'}</th>
                <th className="py-3 px-3 text-left text-[11px] font-semibold text-[#5F6368] uppercase tracking-wider font-sans">{zh ? '位置' : 'Location'}</th>
                <th className="py-3 px-3 text-left text-[11px] font-semibold text-[#5F6368] uppercase tracking-wider font-sans">{zh ? '联系方式' : 'Contact Info'}</th>
                <th className="py-3 px-3 text-left text-[11px] font-semibold text-[#5F6368] uppercase tracking-wider font-sans">{zh ? '类型' : 'Type'}</th>
                <th className="py-3 pl-3 pr-6 text-left text-[11px] font-semibold text-[#5F6368] uppercase tracking-wider font-sans">{zh ? '状态' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="py-12 text-center text-[13px] text-[#9AA0A6] font-sans">{zh ? '暂无联系人' : 'No contacts found'}</td></tr>
              ) : (
                filtered.map(c => <ContactRow key={c.id} c={c} lang={lang} />)
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

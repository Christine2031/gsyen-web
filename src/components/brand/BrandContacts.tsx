/**
 * BrandContacts — Google Contacts 风格联系人管理
 */
import { useState } from 'react';
import { Users, Phone } from 'lucide-react';
import { useAuth } from '../../auth/useAuth';
import { useBrandTeams } from '../../hooks/useBrandTeams';
import { createTeam } from '../../hooks/useTeams';
import BrandTeam from './BrandTeam';
import { ContactRow, Contact, TYPE_CFG, STATUS_CFG } from './BrandContactRow';
import { CreateTeamModal } from './CreateTeamModal';
import { CreateContactModal } from './CreateContactModal';

interface Props { lang: 'zh' | 'en' }

const DEMO_CONTACTS: Contact[] = [
  { id: 'c1', name: '李建军', company: '江桥水产批发',    type: 'client',   status: 'active',   phone: '138-0000-1234', email: 'lijj@jiangqiao.com',  location: '上海',   notes: '江桥批发市场 A3 档口' },
  { id: 'c2', name: '陈秋霞', company: '南沙渔港配送',    type: 'client',   status: 'active',   phone: '139-0000-5678', email: 'chenqx@nansha.com',  location: '广州',   notes: '码头 7 号长期客户' },
  { id: 'c3', name: '王浩然', company: '三元桥冷链物流',  type: 'supplier', status: 'active',   phone: '135-0000-9012', email: 'wanghr@sanyuan.com', location: '北京',   notes: '冷链运输主供应商' },
  { id: 'c4', name: '赵云昌', company: '锦里水产贸易',    type: 'client',   status: 'inactive', phone: '136-0000-3456', email: 'zhaoyc@jinli.com',   location: '成都',   notes: '年度合约已到期' },
  { id: 'c5', name: '孙晓峰', company: '东海渔业集团',    type: 'partner',  status: 'active',   phone: '137-0000-7890', email: 'sunxf@donghai.com',  location: '宁波',   notes: '战略合作伙伴' },
  { id: 'c6', name: '刘敏华', company: '珠江水产检疫站',  type: 'partner',  status: 'active',   phone: '132-0000-2345', email: 'liumh@zjcheck.com',  location: '广州',   notes: '检验检疫认证合作' },
];

type Filter = ContactType | 'all' | 'team';
const FILTERS: { key: Filter; zh: string; en: string }[] = [
  { key: 'all',      zh: '全部',   en: 'All'      },
  { key: 'client',   zh: '客户',   en: 'Clients'  },
  { key: 'supplier', zh: '供应商', en: 'Suppliers' },
  { key: 'partner',  zh: '合作方', en: 'Partners'  },
  { key: 'team',     zh: '团队',   en: 'Teams'    },
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

export default function BrandContacts({ lang }: Props) {
  const zh = lang === 'zh';
  const { user } = useAuth();
  const { teams, disband } = useBrandTeams(user);
  const [filter,        setFilter]        = useState<Filter>('all');
  const [search,        setSearch]        = useState('');
  const [pendingCreate, setPendingCreate] = useState(false);
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const [createType,    setCreateType]    = useState<'contact' | 'team' | null>(null);
  const [teamType,      setTeamType]      = useState<string>('');
  const [teamName,      setTeamName]      = useState('');
  const [contactEmail,  setContactEmail]  = useState('');
  const [contactName,   setContactName]   = useState('');

  const filtered = DEMO_CONTACTS.filter(c => {
    const matchType = filter === 'all' || filter === 'team' || c.type === filter;
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
        <StatCard label={zh ? '联系人总数' : 'Total Contacts'} value={String(DEMO_CONTACTS.length)} />
        <StatCard label={zh ? '客户 · 供应商' : 'Clients · Suppliers'} value={String(clients + suppliers)} sub={zh ? `客户 ${clients} · 供应商 ${suppliers}` : `${clients} clients · ${suppliers} suppliers`} />
        <StatCard label={zh ? '合作伙伴' : 'Partners'} value={String(partners)} />
        <StatCard label={zh ? '我的团队' : 'My Teams'} value={String(teams.length)} />
      </div>

      {/* 往来 + 筛选 chips + 搜索 */}
      <div className="flex items-center gap-2 px-6 pb-4 shrink-0 flex-wrap">
        <div className="relative">
          <button
            onClick={() => { setShowCreateMenu(!showCreateMenu); }}
            className="flex items-center gap-1 px-3 py-1 rounded-full fs-base font-sans font-medium bg-[#1A73E8] text-white hover:bg-[#1557B0] transition-all shrink-0">
            + {zh ? '往来' : 'New'}
          </button>
          {showCreateMenu && (
            <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/5" onClick={() => setShowCreateMenu(false)}>
              <div className="bg-white rounded-2xl shadow-xl p-10 max-w-2xl" onClick={e => e.stopPropagation()}>
                <div className="grid grid-cols-2 gap-8">
                  <button
                    onClick={() => { setCreateType('contact'); setShowCreateMenu(false); }}
                    className="flex flex-col items-center justify-center p-8 rounded-xl border border-[#E8EAED] hover:border-[#1A73E8] hover:bg-[#F8FBFF] transition-all group">
                    <div className="w-12 h-12 rounded-lg bg-[#E8F0FE] flex items-center justify-center mb-3 group-hover:bg-[#1A73E8] transition-all">
                      <Phone className="w-6 h-6 text-[#1A73E8] group-hover:text-white" strokeWidth={1.5} />
                    </div>
                    <p className="fs-lg font-medium text-[#202124] font-sans">{zh ? '联系人' : 'Contact'}</p>
                    <p className="fs-base text-[#9AA0A6] mt-1 font-sans">{zh ? '创建新联系人' : 'Create new contact'}</p>
                  </button>
                  <button
                    onClick={() => { setCreateType('team'); setShowCreateMenu(false); }}
                    className="flex flex-col items-center justify-center p-8 rounded-xl border border-[#E8EAED] hover:border-[#1A73E8] hover:bg-[#F8FBFF] transition-all group">
                    <div className="w-12 h-12 rounded-lg bg-[#E8F0FE] flex items-center justify-center mb-3 group-hover:bg-[#1A73E8] transition-all">
                      <Users className="w-6 h-6 text-[#1A73E8] group-hover:text-white" strokeWidth={1.5} />
                    </div>
                    <p className="fs-lg font-medium text-[#202124] font-sans">{zh ? '团队' : 'Team'}</p>
                    <p className="fs-base text-[#9AA0A6] mt-1 font-sans">{zh ? '创建新团队' : 'Create new team'}</p>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="w-px h-4 bg-[#DADCE0] mx-1 shrink-0" />
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded-full fs-base font-sans font-medium transition-all ${
              filter === f.key
                ? 'bg-[#1A73E8] text-white'
                : 'bg-white border border-[#DADCE0] text-[#5F6368] hover:bg-[#F1F3F4]'
            }`}>
            {zh ? f.zh : f.en}
          </button>
        ))}
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={zh ? (filter === 'team' ? '搜索团队…' : '搜索联系人…') : (filter === 'team' ? 'Search teams…' : 'Search contacts…')}
          className="ml-auto px-3 py-1 rounded-full fs-base font-sans border border-[#DADCE0] bg-white text-[#202124] placeholder-[#9AA0A6] focus:outline-none focus:border-[#1A73E8] w-44"
        />
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        <div className="bg-white rounded-lg border border-[#DADCE0] overflow-hidden">
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <thead>
              <tr className="border-b border-[#E8EAED] bg-[#F8F9FA]">
                {filter === 'team' ? (
                  <>
                    <th className="py-3 pl-6 pr-3 text-left fs-md font-semibold text-[#5F6368] uppercase tracking-wider font-sans w-[28%]">{zh ? '团队' : 'Team'}</th>
                    <th className="py-3 px-3 text-left fs-md font-semibold text-[#5F6368] uppercase tracking-wider font-sans w-[18%]">{zh ? '邀请码' : 'Invite Code'}</th>
                    <th className="py-3 px-3 text-left fs-md font-semibold text-[#5F6368] uppercase tracking-wider font-sans w-[18%]">{zh ? '座位数' : 'Seats'}</th>
                    <th className="py-3 px-3 text-left fs-md font-semibold text-[#5F6368] uppercase tracking-wider font-sans w-[18%]">{zh ? '我的角色' : 'My Role'}</th>
                    <th className="py-3 pl-3 pr-6 text-center fs-md font-semibold text-[#5F6368] uppercase tracking-wider font-sans w-[18%]">{zh ? '操作' : 'Action'}</th>
                  </>
                ) : (
                  <>
                    <th className="py-3 pl-6 pr-3 text-left fs-md font-semibold text-[#5F6368] uppercase tracking-wider font-sans w-[28%]">{zh ? '联系人' : 'Contact'}</th>
                    <th className="py-3 px-3 text-left fs-md font-semibold text-[#5F6368] uppercase tracking-wider font-sans w-[18%]">{zh ? '位置' : 'Location'}</th>
                    <th className="py-3 px-3 text-left fs-md font-semibold text-[#5F6368] uppercase tracking-wider font-sans w-[18%]">{zh ? '联系方式' : 'Contact Info'}</th>
                    <th className="py-3 px-3 text-left fs-md font-semibold text-[#5F6368] uppercase tracking-wider font-sans w-[18%]">{zh ? '类型' : 'Type'}</th>
                    <th className="py-3 pl-3 pr-6 text-left fs-md font-semibold text-[#5F6368] uppercase tracking-wider font-sans w-[18%]">{zh ? '状态' : 'Status'}</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filter === 'team' ? (
                teams.length === 0 ? (
                  <tr><td colSpan={5} className="py-12 text-center fs-body text-[#9AA0A6] font-sans">{zh ? '暂无团队' : 'No teams found'}</td></tr>
                ) : (
                  teams.map(t => {
                    const TEAM_COLORS = ['bg-[#1A73E8]', 'bg-[#137333]', 'bg-[#B05E00]', 'bg-[#9334E6]', 'bg-[#D93025]', 'bg-[#0097A7]'];
                    const color = TEAM_COLORS[t.name.charCodeAt(0) % TEAM_COLORS.length];
                    return (
                      <tr key={t.id} className="border-b border-[#E8EAED] hover:bg-[#F8F9FA] transition-colors">
                        <td className="py-3.5 pl-6 pr-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center shrink-0`}>
                              <span className="text-white fs-base font-bold font-sans">{t.name.charAt(0).toUpperCase()}</span>
                            </div>
                            <div>
                              <p className="fs-body font-medium text-[#202124] font-sans">{t.name}</p>
                              <p className="fs-md text-[#5F6368] font-sans">{t.type || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3"><p className="fs-base text-[#5F6368] font-sans">{t.invite_code}</p></td>
                        <td className="py-3.5 px-3"><p className="fs-base text-[#5F6368] font-sans">{t.seat_limit}</p></td>
                        <td className="py-3.5 px-3"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full fs-md font-medium font-sans bg-[#E8F0FE] text-[#1A73E8]">{t.role === 'owner' ? (zh ? '团长' : 'Owner') : (zh ? '成员' : 'Member')}</span></td>
                        <td className="py-3.5 pl-3 pr-6">
                          {t.role === 'owner' ? (
                            <button onClick={() => disband(t.id, zh)} className="inline-flex items-center px-2.5 py-0.5 rounded-full fs-md font-medium font-sans bg-[#FFEBEE] text-[#D93025] hover:bg-[#FFCDD2] transition-all cursor-pointer">{zh ? '解散' : 'Disband'}</button>
                          ) : (
                            <button onClick={() => {}} className="inline-flex items-center px-2.5 py-0.5 rounded-full fs-md font-medium font-sans bg-[#FFEBEE] text-[#D93025] hover:bg-[#FFCDD2] transition-all cursor-pointer">{zh ? '退出' : 'Leave'}</button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )
              ) : (
                <>
                  {filter === 'all' && teams.length > 0 && teams.map(t => {
                    const TEAM_COLORS = ['bg-[#1A73E8]', 'bg-[#137333]', 'bg-[#B05E00]', 'bg-[#9334E6]', 'bg-[#D93025]', 'bg-[#0097A7]'];
                    const color = TEAM_COLORS[t.name.charCodeAt(0) % TEAM_COLORS.length];
                    return (
                      <tr key={`team-${t.id}`} className="border-b border-[#E8EAED] hover:bg-[#F8F9FA] transition-colors">
                        <td className="py-3.5 pl-6 pr-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center shrink-0`}>
                              <span className="text-white fs-base font-bold font-sans">{t.name.charAt(0).toUpperCase()}</span>
                            </div>
                            <div>
                              <p className="fs-body font-medium text-[#202124] font-sans">{t.name}</p>
                              <p className="fs-md text-[#5F6368] font-sans">{t.type || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3"><p className="fs-base text-[#5F6368] font-sans">{t.invite_code}</p></td>
                        <td className="py-3.5 px-3"><p className="fs-base text-[#5F6368] font-sans">{t.seat_limit}</p></td>
                        <td className="py-3.5 px-3"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full fs-md font-medium font-sans bg-[#E8F0FE] text-[#1A73E8]">{t.role === 'owner' ? (zh ? '团长' : 'Owner') : (zh ? '成员' : 'Member')}</span></td>
                        <td className="py-3.5 pl-3 pr-6">
                          {t.role === 'owner' ? (
                            <button onClick={() => disband(t.id, zh)} className="inline-flex items-center px-2.5 py-0.5 rounded-full fs-md font-medium font-sans bg-[#FFEBEE] text-[#D93025] hover:bg-[#FFCDD2] transition-all cursor-pointer">{zh ? '解散' : 'Disband'}</button>
                          ) : (
                            <button onClick={() => {}} className="inline-flex items-center px-2.5 py-0.5 rounded-full fs-md font-medium font-sans bg-[#FFEBEE] text-[#D93025] hover:bg-[#FFCDD2] transition-all cursor-pointer">{zh ? '退出' : 'Leave'}</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && filter !== 'all' ? (
                    <tr><td colSpan={5} className="py-12 text-center fs-body text-[#9AA0A6] font-sans">{zh ? '暂无联系人' : 'No contacts found'}</td></tr>
                  ) : (
                    filtered.map(c => <ContactRow key={c.id} c={c} lang={lang} />)
                  )}
                  {filter === 'all' && filtered.length === 0 && teams.length === 0 && (
                    <tr><td colSpan={5} className="py-12 text-center fs-body text-[#9AA0A6] font-sans">{zh ? '暂无内容' : 'No content'}</td></tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <CreateContactModal
        zh={zh}
        createType={createType}
        contactEmail={contactEmail}
        contactName={contactName}
        onSetCreateType={setCreateType}
        onSetContactEmail={setContactEmail}
        onSetContactName={setContactName}
      />

      <CreateTeamModal
        zh={zh}
        createType={createType}
        teamType={teamType}
        teamName={teamName}
        onSetCreateType={setCreateType}
        onSetTeamType={setTeamType}
        onSetTeamName={setTeamName}
        onSubmit={async () => {
          if (!user || !teamType || !teamName.trim()) return;
          await createTeam(user.id, teamName.trim(), teamType);
        }}
      />
    </div>
  );
}

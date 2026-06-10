import React, { ComponentType, useState, useEffect } from 'react';
import { Sparkles, Mail, DollarSign, Lock, Globe } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import { translations } from '../translations';
import VintageCar from './VintageCar';
import { WinCtrlButton, KanbanIcon } from '../gsyen-designer';
import AboutDialog from './AboutDialog';
import AuthModal from '../auth/AuthModal';
import { useAuth, type UserTier } from '../auth/useAuth';

/** Google Calendar 风格：显示当天日期数字的动态日历 icon */
function CalendarDateIcon({ className }: { className?: string }) {
  const day = new Date().getDate();
  return (
    <svg viewBox="0 0 24 24" className={className}
      style={{ fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <text x="12" y="20" textAnchor="middle" fontSize="9.5" fontWeight="700"
        fill="currentColor" stroke="none" style={{ fontFamily: 'system-ui,sans-serif', fontVariantNumeric: 'tabular-nums' }}>
        {day}
      </text>
    </svg>
  );
}

export type ActiveSpace = 'chat' | 'mail' | 'schedule' | 'calendar' | 'finance' | 'password' | 'brand';

interface SpaceTab {
  value: ActiveSpace;
  Icon: ComponentType<any>;
  iconClass: string;
  zh: string; en: string;       // 完整标签
  shortZh: string; shortEn: string; // 压缩时两字短词
}

const SPACES: SpaceTab[] = [
  { value: 'chat',     Icon: Sparkles,   iconClass: 'text-amber-500 animate-pulse', zh: '疆域灵阁',     en: 'GSYEN Muse',      shortZh: '灵阁', shortEn: 'Muse'    },
  { value: 'mail',     Icon: Mail,       iconClass: '',                             zh: '工作邮件',     en: 'Mailbox',         shortZh: '邮件', shortEn: 'Mail'    },
  { value: 'schedule', Icon: KanbanIcon, iconClass: 'animate-pulse',               zh: '项目看板',     en: 'Kanban',          shortZh: '看板', shortEn: 'Kanban'  },
  { value: 'calendar', Icon: CalendarDateIcon, iconClass: '',                        zh: '日程日历',     en: 'Calendar',        shortZh: '日历', shortEn: 'Cal'     },
  { value: 'finance',  Icon: DollarSign, iconClass: '',                             zh: '复式财务账簿', en: 'Atelier Ledger',  shortZh: '财务', shortEn: 'Ledger'  },
  { value: 'password', Icon: Lock,       iconClass: '',                             zh: '军事级密钥库', en: 'Citadel Key',     shortZh: '密钥', shortEn: 'Keys'    },
  { value: 'brand',    Icon: Sparkles,   iconClass: '',                             zh: '品牌实验室',   en: 'Brand Lab',       shortZh: '品牌', shortEn: 'Brand'   },
];

interface AppHeaderProps {
  lang: 'zh' | 'en';
  setLang: (l: 'zh' | 'en') => void;
  activeSpace: ActiveSpace;
  setActiveSpace: (s: ActiveSpace) => void;
}

/** 顶部导航栏 + 移动端横向标签条 */
export default function AppHeader({ lang, setLang, activeSpace, setActiveSpace }: AppHeaderProps) {
  const t = translations[lang];
  const [compact, setCompact] = useState(window.innerWidth < 1100);
  const [showAbout, setShowAbout] = useState(false);
  const [authModal, setAuthModal] = useState<'login' | 'register' | null>(null);
  const { user, tier, emailVerified, signOut } = useAuth();
  const isElectron = !!(window as any).electronAPI?.isElectron;
  const isMac = (window as any).electronAPI?.platform === 'darwin';

  useEffect(() => {
    let raf = 0;
    const fn = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setCompact(window.innerWidth < 1100));
    };
    window.addEventListener('resize', fn);
    return () => { window.removeEventListener('resize', fn); cancelAnimationFrame(raf); };
  }, []);


  return (
    <>
      <header className={`relative border-b border-[#1A1A1A]/10 bg-[#F9F8F6]/90 backdrop-blur-md sticky top-0 z-40 py-6 flex items-start justify-between ${isMac ? 'pl-20 pr-8' : 'px-8'}`} id="app-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div
            className={`shrink-0 transition-transform duration-500 hover:rotate-6 -mt-1 ${isElectron ? 'cursor-pointer' : ''}`}
            onClick={() => isElectron && setShowAbout(true)}
            title={isElectron ? (lang === 'zh' ? '关于 GSYEN' : 'About GSYEN') : undefined}
          >
            <VintageCar size={44} className="text-[#1A1A1A]/95" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2.5 flex-nowrap whitespace-nowrap">
              <span className="text-xl md:text-2xl font-black font-serif-sc tracking-[0.12em] text-[#111111] leading-none select-none">疆域</span>
              <span className="font-cinzel text-xs md:text-[14px] font-bold tracking-[0.22em] text-[#111111]/85 uppercase leading-none select-none ml-0.5">GSYEN</span>
            </div>
            <p className="text-[7.5px] md:text-[8px] text-[#1A1A1A]/50 font-serif-sc tracking-[0.22em] font-medium leading-none uppercase mt-2.5">
              {t.headerSubtitle}
            </p>
          </div>
        </div>

        {/* 桌面标签栏 */}
        <div className="flex bg-[#1A1A1A]/5 p-1 rounded-none border border-[#1A1A1A]/10 gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {SPACES.map(({ value, Icon, iconClass, zh, en, shortZh, shortEn }) => (
            <button
              key={value}
              onClick={() => setActiveSpace(value)}
              className={`px-3.5 py-1.5 rounded-none text-[10px] font-bold tracking-widest uppercase transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeSpace === value ? 'bg-[#1A1A1A] text-[#F9F8F6] shadow-sm font-bold' : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
              }`}
            >
              <Icon className={`${compact ? 'w-4 h-4' : 'w-3.5 h-3.5'} ${iconClass}`} />
              <span>{lang === 'zh' ? (compact ? shortZh : zh) : (compact ? shortEn : en)}</span>
            </button>
          ))}
        </div>

        {/* 窗口控制：Windows 专属，Mac 用原生红绿灯 */}
        {(window as any).electronAPI?.platform === 'win32' && (
          <div style={{ position:'absolute', top:0, right:0, display:'flex', alignItems:'center',
            WebkitAppRegion:'no-drag' } as React.CSSProperties}>
            {(['minimize', 'maximize', 'close'] as const).map(action => (
              <WinCtrlButton key={action} action={action} redClose={action === 'close'}
                onClick={() => (window as any).electronAPI.window[action]()} />
            ))}
          </div>
        )}

        {/* 右侧：状态 + 语言 + 登录/注册 */}
        <div className="flex items-center gap-2 shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>

          {/* 地球仪 — 点击切换语言 */}
          <button
            onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
            className="flex items-center gap-1 px-2 py-1.5 border border-[#1A1A1A]/10 bg-[#1A1A1A]/5 text-[#1A1A1A]/55 hover:text-[#1A1A1A] transition-all shrink-0"
          >
            <Globe className="w-3 h-3" />
            <span className="text-[9px] font-bold tracking-wider uppercase">{lang === 'zh' ? '中文' : 'EN'}</span>
          </button>

          {/* 竖线 */}
          <div className="w-px h-3.5 bg-[#1A1A1A]/15 shrink-0" />

          {user ? (
            /* 已登录：邮箱缩写 + 等级徽章 + 登出 */
            <>
              <span className="px-2 py-1.5 text-[9px] font-bold tracking-wider uppercase text-[#1A1A1A]/50 whitespace-nowrap shrink-0 font-mono">
                {user.email?.split('@')[0]}
              </span>
              <TierBadge tier={tier} emailVerified={emailVerified} />
              <button
                onClick={signOut}
                className="flex items-center gap-1 px-3 py-1.5 border border-[#1A1A1A]/15 text-[#1A1A1A]/50 text-[9px] font-bold tracking-wider uppercase hover:text-[#1A1A1A] hover:border-[#1A1A1A]/30 transition-all whitespace-nowrap shrink-0"
              >
                {lang === 'zh' ? '登出' : 'SIGN OUT'}
              </button>
            </>
          ) : (
            /* 未登录：登录 + 注册 */
            <>
              <button
                onClick={() => setAuthModal('login')}
                className="px-2 py-1.5 text-[9px] font-bold tracking-wider uppercase text-[#1A1A1A]/50 hover:text-[#1A1A1A] transition-all whitespace-nowrap shrink-0"
              >
                {lang === 'zh' ? '登录' : 'LOGIN'}
              </button>
              <button
                onClick={() => setAuthModal('register')}
                className="flex items-center gap-1 px-3 py-1.5 bg-[#1A1A1A] text-[#F9F8F6] text-[9px] font-bold tracking-wider uppercase hover:bg-[#1A1A1A]/80 transition-all whitespace-nowrap shrink-0"
              >
                {lang === 'zh' ? '注册' : 'REGISTER'}
                <span className="text-[#F9F8F6]/50 ml-0.5">→</span>
              </button>
            </>
          )}

        </div>
      </header>

      {showAbout && <AboutDialog lang={lang} onClose={() => setShowAbout(false)} />}
      <AnimatePresence>
        {authModal && <AuthModal key="auth-modal" lang={lang} initialTab={authModal} onClose={() => setAuthModal(null)} />}
      </AnimatePresence>

      {/* 移动端横向标签条 — 已禁用（最小宽度 880px 桌面应用） */}
      <div className="hidden">
        {SPACES.map(({ value, mZh, mEn }) => (
          <button
            key={value}
            onClick={() => setActiveSpace(value)}
            className={`[scroll-snap-align:start] shrink-0 px-5 py-3 font-mono text-[10px] font-bold tracking-widest uppercase whitespace-nowrap transition-all border-b-2 ${
              activeSpace === value ? 'text-[#1A1A1A] border-[#1A1A1A]' : 'text-[#1A1A1A]/40 border-transparent hover:text-[#1A1A1A]/70'
            }`}
          >
            {lang === 'zh' ? mZh : mEn}
          </button>
        ))}
      </div>
    </>
  );
}

/* ── 会员等级徽章 ── */
const TIER_CFG: Record<string, { label: string; cls: string }> = {
  owner: { label: 'OWNER', cls: 'border-amber-400/60 text-amber-600 bg-amber-50'          },
  admin: { label: 'ADMIN', cls: 'border-[#1A1A1A]/30 text-[#1A1A1A]/70 bg-[#1A1A1A]/5'  },
  user:  { label: 'PRO',   cls: 'border-[#1A1A1A]/20 text-[#1A1A1A]/50 bg-transparent'   },
  guest: { label: 'GUEST', cls: 'border-[#1A1A1A]/10 text-[#1A1A1A]/30 bg-transparent'   },
};

function TierBadge({ tier, emailVerified }: { tier: UserTier | null; emailVerified: boolean }) {
  if (!tier) return null;

  // owner / admin — 固定徽章
  if (tier === 'owner') return (
    <span className="px-1.5 py-0.5 text-[7px] font-bold tracking-[0.22em] uppercase border font-mono shrink-0 border-amber-400/60 text-amber-600 bg-amber-50">
      OWNER
    </span>
  );
  if (tier === 'admin') return (
    <span className="px-1.5 py-0.5 text-[7px] font-bold tracking-[0.22em] uppercase border font-mono shrink-0 border-[#1A1A1A]/30 text-[#1A1A1A]/70 bg-[#1A1A1A]/5">
      ADMIN
    </span>
  );

  // 普通会员：已验证 vs 未验证
  return emailVerified ? (
    <span className="px-1.5 py-0.5 text-[7px] font-bold tracking-[0.22em] uppercase border font-mono shrink-0 border-[#1A1A1A]/25 text-[#1A1A1A]/60">
      MEMBER
    </span>
  ) : (
    <span className="px-1.5 py-0.5 text-[7px] font-bold tracking-[0.22em] uppercase border font-mono shrink-0 border-[#1A1A1A]/12 text-[#1A1A1A]/30">
      MEMBER · UNVERIFIED
    </span>
  );
}

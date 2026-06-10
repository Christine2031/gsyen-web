import React, { ComponentType, useState, useEffect } from 'react';
import { Sparkles, Mail, Calendar, DollarSign, Lock } from 'lucide-react';
import { translations } from '../translations';
import VintageCar from './VintageCar';
import { WinCtrlButton, KanbanIcon } from '../gsyen-designer';

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
  { value: 'calendar', Icon: Calendar,   iconClass: '',                             zh: '日程日历',     en: 'Calendar',        shortZh: '日历', shortEn: 'Cal'     },
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
      <header className="relative border-b border-[#1A1A1A]/10 bg-[#F9F8F6]/90 backdrop-blur-md sticky top-0 z-40 px-8 py-6 flex items-start justify-between" id="app-header" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <div className="p-2.5 bg-transparent rounded-none border border-[#1A1A1A]/15 shadow-[1px_1px_0px_rgba(26,26,26,0.06)] shrink-0 transition-transform duration-500 hover:rotate-6">
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

        {/* 窗口控制：absolute 挂在 header 上，top-0 right-0，与 Canvas WinCtrl 位置一致 */}
        {(window as any).electronAPI?.isElectron && (
          <div style={{ position:'absolute', top:0, right:0, display:'flex', alignItems:'center',
            WebkitAppRegion:'no-drag' } as React.CSSProperties}>
            {(['minimize', 'maximize', 'close'] as const).map(action => (
              <WinCtrlButton key={action} action={action} redClose={action === 'close'}
                onClick={() => (window as any).electronAPI.window[action]()} />
            ))}
          </div>
        )}

        {/* 右侧：语言 + 状态 */}
        <div className="flex items-center gap-3 text-[10px] shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>

          <div className="flex bg-[#1A1A1A]/5 p-0.5 rounded-none border border-[#1A1A1A]/10 shrink-0">
            <button
              onClick={() => setLang('en')}
              className={`px-2 py-1 rounded-none text-[9px] font-bold tracking-wider uppercase transition-all ${lang === 'en' ? 'bg-[#1A1A1A] text-[#F9F8F6]' : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'}`}
            >EN</button>
            <button
              onClick={() => setLang('zh')}
              className={`px-2 py-1 rounded-none text-[9px] font-bold tracking-wider uppercase transition-all ${lang === 'zh' ? 'bg-[#1A1A1A] text-[#F9F8F6]' : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'}`}
            >中文</button>
          </div>
          {!compact && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-[#1A1A1A]/5 border border-[#1A1A1A]/10 rounded-none shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1A1A1A] animate-pulse" />
              <span className="text-[#1A1A1A]/75 font-serif-sc text-[10px] tracking-[0.12em] font-medium uppercase whitespace-nowrap">{t.inkModeActive}</span>
            </div>
          )}
        </div>
      </header>

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

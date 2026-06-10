import React, { ComponentType } from 'react';
import { Sparkles, Mail, Calendar, DollarSign, Lock } from 'lucide-react';
import { translations } from '../translations';
import VintageCar from './VintageCar';
import { WinCtrlButton, KanbanIcon } from '../gsyen-designer';

export type ActiveSpace = 'chat' | 'mail' | 'schedule' | 'calendar' | 'finance' | 'password' | 'brand';

interface SpaceTab {
  value: ActiveSpace;
  Icon: ComponentType<any>;
  iconClass: string;
  zh: string; en: string;     // 桌面标签
  mZh: string; mEn: string;   // 移动标签
}

const SPACES: SpaceTab[] = [
  { value: 'chat',     Icon: Sparkles,   iconClass: 'w-3.5 h-3.5 text-amber-500 animate-pulse', zh: '疆域灵阁', en: 'GSYEN Muse',    mZh: '疆域灵阁',   mEn: 'MUSE' },
  { value: 'mail',     Icon: Mail,       iconClass: 'w-3.5 h-3.5',                                zh: '工作邮件', en: 'Mailbox',       mZh: '工作邮件',   mEn: 'MAIL' },
  { value: 'schedule', Icon: KanbanIcon,  iconClass: 'w-3.5 h-3.5 animate-pulse',                  zh: '项目看板', en: 'Kanban',        mZh: '项目看板',   mEn: 'KANBAN' },
  { value: 'calendar', Icon: Calendar,   iconClass: 'w-3.5 h-3.5',                                zh: '日程日历', en: 'Calendar',      mZh: '日程日历',   mEn: 'CALENDAR' },
  { value: 'finance',  Icon: DollarSign, iconClass: 'w-3.5 h-3.5',                                zh: '复式财务账簿', en: 'Atelier Ledger', mZh: '复式财务', mEn: 'LEDGER' },
  { value: 'password', Icon: Lock,       iconClass: 'w-3.5 h-3.5',                                zh: '军事级密钥库', en: 'Citadel Key',  mZh: '密钥库',    mEn: 'KEYS' },
  { value: 'brand',    Icon: Sparkles,   iconClass: 'w-3.5 h-3.5',                                zh: '品牌实验室', en: 'Brand Lab',    mZh: '品牌实验室', mEn: 'BRAND' },
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
          {SPACES.map(({ value, Icon, iconClass, zh, en }) => (
            <button
              key={value}
              onClick={() => setActiveSpace(value)}
              className={`px-3.5 py-1.5 rounded-none text-[10px] font-bold tracking-widest uppercase transition-all flex items-center gap-1.5 ${
                activeSpace === value ? 'bg-[#1A1A1A] text-[#F9F8F6] shadow-sm font-bold' : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
              }`}
            >
              <Icon className={iconClass} />
              <span>{lang === 'zh' ? zh : en}</span>
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
        <div className="flex items-center gap-3 text-[10px]"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>

          {/* 语言切换 + 状态 */}
          <div className="flex items-center gap-3 text-[10px]">
            <div className="flex bg-[#1A1A1A]/5 p-0.5 rounded-none border border-[#1A1A1A]/10">
              <button
                onClick={() => setLang('en')}
                className={`px-2 py-1 rounded-none text-[9px] font-bold tracking-wider uppercase transition-all ${lang === 'en' ? 'bg-[#1A1A1A] text-[#F9F8F6]' : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'}`}
              >EN</button>
              <button
                onClick={() => setLang('zh')}
                className={`px-2 py-1 rounded-none text-[9px] font-bold tracking-wider uppercase transition-all ${lang === 'zh' ? 'bg-[#1A1A1A] text-[#F9F8F6]' : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'}`}
              >中文</button>
            </div>
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#1A1A1A]/5 border border-[#1A1A1A]/10 rounded-none">
              <span className="w-1.5 h-1.5 rounded-full bg-[#1A1A1A] animate-pulse" />
              <span className="text-[#1A1A1A]/75 font-serif-sc text-[10px] tracking-[0.12em] font-medium uppercase">{t.inkModeActive}</span>
            </div>
          </div>
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

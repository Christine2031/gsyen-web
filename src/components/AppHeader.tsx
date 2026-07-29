import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { translations } from '../translations';
import VintageCar from './VintageCar';
import AppHeaderBrandWordmark from './AppHeaderBrandWordmark';
import { GlobeIcon, UserIcon, UsersIcon, WinCtrlButton } from '../gsyen-designer';
import AboutDialog from './AboutDialog';
import AuthModal from '../auth/AuthModal';
import ResetPasswordModal from '../auth/ResetPasswordModal';
import EmailVerifiedModal from '../auth/EmailVerifiedModal';
import { useAuth } from '../auth/useAuth';
import { useIsMaximized } from '../hooks/useIsMaximized';
import { HIDDEN_SHELL_DRAWER_SELECTOR, SHELL_NO_INTERACTION_TARGETS } from '../hooks/headerShellContract';
import { useHeaderVisibility } from '../hooks/useHeaderVisibility';
import { useHiddenShellDrag } from '../hooks/useHiddenShellDrag';
import { useShellPlatform } from '../hooks/useShellPlatform';
import { TierBadge } from './AppHeaderTierBadge';
import { SPACES, type ActiveSpace } from './AppHeaderSpaces';
import { version } from '../../package.json';

export type { ActiveSpace } from './AppHeaderSpaces';

interface AppHeaderProps {
  lang: 'zh' | 'en';
  setLang: (l: 'zh' | 'en') => void;
  activeSpace: ActiveSpace;
  setActiveSpace: (s: ActiveSpace) => void;
  onMemberClick?: () => void;
  activeTeam?: boolean;
}

/** 顶部导航栏 + 移动端横向标签条 */
export default function AppHeader({ lang, setLang, activeSpace, setActiveSpace, onMemberClick, activeTeam }: AppHeaderProps) {
  const t = translations[lang];
  const [compact, setCompact] = useState(window.innerWidth < 1100);
  const [laptopShell, setLaptopShell] = useState(window.innerWidth <= 1600 && window.innerHeight <= 900);
  const [showAbout, setShowAbout] = useState(false);
  const [authModal, setAuthModal] = useState<'login' | 'register' | null>(null);
  const spaceNavRef = useRef<HTMLDivElement>(null);
  const { user, tier, emailVerified, loading: authLoading, signOut, isPasswordRecovery, clearPasswordRecovery, justVerified, clearJustVerified } = useAuth();
  const { isElectron, isMac, isWindows, platform } = useShellPlatform();
  const maximized = useIsMaximized();
  const accountName = user?.email?.split('@')[0] ?? '';
  const { headerHidden, recallHeader } = useHeaderVisibility();
  useHiddenShellDrag(isElectron && headerHidden, {
    documentSelector: HIDDEN_SHELL_DRAWER_SELECTOR,
    ignoreSelector: SHELL_NO_INTERACTION_TARGETS,
  });

  useEffect(() => {
    let raf = 0;
    const fn = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setCompact(window.innerWidth < 1100);
        setLaptopShell(window.innerWidth <= 1600 && window.innerHeight <= 900);
      });
    };
    window.addEventListener('resize', fn);
    return () => { window.removeEventListener('resize', fn); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    if (spaceNavRef.current) {
      spaceNavRef.current.scrollLeft = 0;
    }
  }, [activeSpace, compact, laptopShell, lang]);

  return (
    <>
      {headerHidden && (
        <div
          className="gsyen-shell-reveal-hotzone"
          aria-label={lang === 'zh' ? '显示顶部栏' : 'Show header'}
          role="presentation"
          onDoubleClick={recallHeader}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        />
      )}
      <header
        className={`gsyen-app-header ${headerHidden ? 'is-header-hidden' : 'is-header-visible'} relative bg-[#F4F2EE] sticky top-0 z-40 py-6 grid items-center ${isMac ? 'pl-20 pr-8 is-mac' : isWindows ? 'pl-8 pr-32 is-windows' : 'px-8 is-browser'}`}
        id="app-header"
        data-shell-platform={platform}
        aria-hidden={headerHidden}
        data-header-motion={headerHidden ? 'hidden' : 'visible'}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div
          className="gsyen-shell-double-click-zone"
          aria-hidden="true"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        />

        <div className="gsyen-brand-lockup flex min-w-0 items-center gap-4 overflow-hidden" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          {(() => {
            const space = SPACES.find(s => s.value === activeSpace);
            const isHome = activeSpace === 'chat';
            const BrandIcon = space?.BrandIcon;
            const brandClass = isHome
              ? 'is-home-brand'
              : `is-module-brand is-${activeSpace === 'brand' ? 'prism' : activeSpace}-brand`;
            return (
              <>
                <div
                  className={`gsyen-brand-mark ${brandClass} shrink-0 -mt-1 transition-transform duration-500 ${isElectron ? 'cursor-pointer' : ''}`}
                  onClick={() => isElectron && setShowAbout(true)}
                  title={isElectron ? (lang === 'zh' ? '关于 GSYEN' : 'About GSYEN') : undefined}
                >
                  {isHome
                    ? <VintageCar size={44} className="text-[#1A1A1A]/95" />
                    : BrandIcon && <BrandIcon strokeWidth={1.14} className="gsyen-brand-module-icon w-10 h-10 text-[#1A1A1A]/90" />
                  }
                </div>
                <div className="gsyen-brand-copy flex min-w-0 flex-col">
                  <div className="gsyen-brand-title flex items-center flex-nowrap whitespace-nowrap">
                    <AppHeaderBrandWordmark />
                  </div>
                  <p className="gsyen-brand-subtitle flex min-w-0 items-center gap-2 text-[7.5px] md:fs-2xs text-[#1A1A1A]/50 font-serif-sc tracking-[0.22em] font-medium leading-none uppercase mt-2.5">
                    <span className="gsyen-brand-subtitle-text truncate">{isHome ? t.headerSubtitle : space?.subtitle}</span>
                    <span className="gsyen-header-version shrink-0 font-mono text-[7px] tracking-[0.16em] text-[#1A1A1A]/35">
                      V{version}
                    </span>
                  </p>
                </div>
              </>
            );
          })()}
        </div>

        {/* 桌面标签栏 */}
        <div
          ref={spaceNavRef}
          className="gsyen-space-nav flex bg-[#1A1A1A]/5 p-1 rounded-none border border-[#1A1A1A]/10 gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {SPACES.map(({ value, Icon, iconClass, zh, en, shortZh, shortEn }) => (
            <button
              key={value}
              data-space={value}
              onClick={() => setActiveSpace(value)}
              className={`gsyen-space-tab min-w-[80px] px-3 py-1.5 rounded-none fs-sm font-bold tracking-widest uppercase transition-all flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ${
                activeSpace === value ? 'is-active bg-[#1A1A1A] text-[#F9F8F6]' : 'text-[#1A1A1A]/60 hover:text-[#1A1A1A]'
              }`}
            >
              <Icon strokeWidth={1.5} className={`${compact ? 'w-4 h-4' : 'w-3.5 h-3.5'} ${iconClass}`} />
              <span>{value === 'brand' && isWindows && laptopShell && lang === 'zh' ? 'PRISM' : (lang === 'zh' ? (compact ? shortZh : zh) : (compact ? shortEn : en))}</span>
            </button>
          ))}
        </div>

        {/* 窗口控制：Windows 专属，Mac 用原生红绿灯 */}
        {isWindows && (
          <div className="gsyen-window-controls" style={{ position:'absolute', top:0, right:0, display:'flex', alignItems:'center',
            WebkitAppRegion:'no-drag' } as React.CSSProperties}>
            {(['minimize', 'maximize', 'close'] as const).map(action => (
              <WinCtrlButton key={action} action={action} redClose={action === 'close'}
                maximized={maximized}
                onClick={() => (window as any).electronAPI.window[action]()} />
            ))}
          </div>
        )}

        {/* 右侧：状态 + 语言 + 登录/注册 */}
        <div className={`gsyen-header-actions flex items-center gap-2 shrink-0 ${user ? 'has-account-user' : 'has-account-auth'}`}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>

          <div className="gsyen-account-tray flex items-center gap-2 shrink-0">
            {/* 地球仪 — 点击切换语言 */}
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="gsyen-account-segment gsyen-account-language flex items-center gap-1 px-2 py-1.5 border border-[#1A1A1A]/10 bg-[#1A1A1A]/5 text-[#1A1A1A]/55 hover:text-[#1A1A1A] transition-all shrink-0"
            >
              <GlobeIcon className="w-3 h-3" />
              <span className="gsyen-account-language-label fs-xs font-bold tracking-wider uppercase">
                {lang === 'zh' ? '中文' : 'EN'}
              </span>
            </button>

            <div className="gsyen-account-divider w-px h-3.5 bg-[#1A1A1A]/15 shrink-0" />

            {user ? (
              /* 已登录（含快照预渲染）：邮箱缩写 + 等级徽章 + 登出 */
              <>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent(activeTeam ? 'gsyen-toggle-team-panel' : 'gsyen-toggle-friends-panel'))}
                  className="gsyen-account-segment gsyen-account-user flex items-center gap-1.5 px-2 py-1.5 fs-xs font-bold tracking-wider uppercase text-[#1A1A1A]/50 hover:text-[#1A1A1A]/80 whitespace-nowrap shrink-0 font-mono transition-colors"
                  title={activeTeam ? '团队成员' : undefined}
                >
                  {activeTeam ? <UsersIcon className="w-3.5 h-3.5" /> : <UserIcon className="w-3.5 h-3.5" />}
                  <span className="gsyen-account-name truncate">{accountName}</span>
                </button>
                <div className="gsyen-account-segment gsyen-account-tier">
                  <TierBadge tier={tier} onClick={onMemberClick} />
                </div>
                <button
                  onClick={signOut}
                  className="gsyen-account-segment gsyen-account-signout flex items-center gap-1 px-3 py-1.5 border border-[#1A1A1A]/15 text-[#1A1A1A]/50 fs-xs font-bold tracking-wider uppercase hover:text-[#1A1A1A] hover:border-[#1A1A1A]/30 transition-all whitespace-nowrap shrink-0"
                  >
                  {lang === 'zh' ? '登出' : 'SIGN OUT'}
                </button>
              </>
            ) : authLoading ? (
              /* 快照不存在且仍在初始化：空占位防闪 */
              <div className="w-[120px] h-6" />
            ) : (
              /* 确认未登录：登录 + 注册 */
              <>
                <button
                  onClick={() => setAuthModal('login')}
                  className="gsyen-account-segment gsyen-auth-login px-2 py-1.5 fs-xs font-bold tracking-wider uppercase transition-all whitespace-nowrap shrink-0"
                >
                  {lang === 'zh' ? '登录' : 'LOGIN'}
                </button>
                <button
                  onClick={() => setAuthModal('register')}
                  className="gsyen-account-segment gsyen-auth-cta flex items-center gap-1 px-3 py-1.5 fs-xs font-bold tracking-wider uppercase transition-all whitespace-nowrap shrink-0"
                >
                  {lang === 'zh' ? '注册' : 'REGISTER'}
                  <span className="gsyen-auth-arrow ml-0.5">→</span>
                </button>
              </>
            )}
          </div>

        </div>
      </header>

      {showAbout && <AboutDialog lang={lang} onClose={() => setShowAbout(false)} />}
      <AnimatePresence>
        {authModal && <AuthModal key="auth-modal" lang={lang} initialTab={authModal} onClose={() => setAuthModal(null)} />}
        {isPasswordRecovery && <ResetPasswordModal key="reset-modal" lang={lang} onDone={clearPasswordRecovery} />}
        {justVerified && user && <EmailVerifiedModal key="verified-modal" email={user.email ?? ''} lang={lang} onDone={clearJustVerified} />}
      </AnimatePresence>

    </>
  );
}


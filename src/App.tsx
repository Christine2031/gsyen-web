/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'motion/react';

import ScheduleModule from './components/ScheduleModule';
import FinanceModule from './components/FinanceModule';
import PasswordModule from './components/PasswordModule';
import MailModule from './components/MailModule';
import ChatModule from './components/ChatModule';
import KanbanModule from './components/KanbanModule';
import LandingHero from './components/LandingHero';
import AppHeader, { ActiveSpace } from './components/AppHeader';
import BrandLab, { type BrandTab } from './components/brand/BrandLab';
import { FullscreenFade } from './components/FullscreenFade';
import { useAuth } from './auth/useAuth';
import { useTeams } from './hooks/useTeams';

/**
 * App — 工作坊外壳：语言/落地页/当前空间，外加顶栏导航与空间路由。
 * Brand Lab（标识设计器）已抽到 components/brand/BrandLab；各业务模块各自管自己的状态。
 */
export default function App() {
  useTeams(); // 登录后立即预取团队数据，所有子模块拿缓存秒出
  const { user } = useAuth();
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const isElectron = !!(window as any).electronAPI?.isElectron;
  // 直接读 localStorage：比走 React 状态更早，JS 执行即确定，无任何延迟
  const hadSession = !!localStorage.getItem('gsyen_user_snap');
  const [showLanding, setShowLanding] = useState(!isElectron && !hadSession);

  const [activeSpace, setActiveSpace] = useState<ActiveSpace>('chat');
  const [brandTab, setBrandTab] = useState<BrandTab | undefined>(undefined);
  const [activeTeam, setActiveTeam] = useState(false);
  const testInputRef = useRef<HTMLInputElement>(null);

  const handleMemberClick = () => {
    setActiveSpace('brand');
    setBrandTab('member');
  };

  const handleSpaceChange = (space: ActiveSpace) => {
    setActiveSpace(space);
    if (space === 'brand') setBrandTab('contacts');
  };

  // useAuth 已包含 onAuthStateChange 监听，此处只需跟随 user 变化
  useEffect(() => {
    setShowLanding(!isElectron && !user);
  }, [user, isElectron]);

  return (
    <div className="h-screen overflow-y-hidden overflow-x-visible bg-[#F9F8F6] text-[#1A1A1A] flex flex-col font-sans selection:bg-[#1A1A1A] selection:text-[#F9F8F6]" id="logo-designer-root">
      {/* 诊断：在 App 根节点（非 portal）测试 webkitdirectory — 确认后删 */}
      {isElectron && (
        <div style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 99999, display: 'flex', gap: 6, alignItems: 'center' }}>
          <input ref={testInputRef} type="file"
            // @ts-ignore
            webkitdirectory="" style={{ position: 'absolute', width: 0, height: 0, opacity: 0, overflow: 'hidden' }}
            onChange={e => { const f = e.target.files?.[0]; alert('文件夹测试成功: ' + ((f as any)?.path ?? f?.name ?? '无')); e.target.value = ''; }} />
          <button onClick={() => testInputRef.current?.click()}
            style={{ background: '#1A1A1A', color: '#fff', border: 'none', borderRadius: 4, padding: '6px 10px', fontSize: 11, fontFamily: 'monospace', cursor: 'pointer', letterSpacing: '0.08em' }}>
            TEST FOLDER
          </button>
        </div>
      )}
      <AnimatePresence>
        {showLanding && <LandingHero lang={lang} onEnter={() => setShowLanding(false)} />}
      </AnimatePresence>

      <AppHeader lang={lang} setLang={setLang} activeSpace={activeSpace} setActiveSpace={handleSpaceChange} onMemberClick={handleMemberClick} activeTeam={activeTeam} />
      <FullscreenFade />

      {activeSpace === 'brand' ? (
        <BrandLab lang={lang} requestedTab={brandTab} onTabConsumed={() => setBrandTab(undefined)} />
      ) : (
        <main className="flex-grow flex flex-col justify-between bg-[#F9F8F6] min-h-0">
          <div className="flex-grow flex flex-col min-h-0 overflow-hidden">
            {activeSpace === 'chat' && <ChatModule lang={lang} onTeamChange={setActiveTeam} />}
            {activeSpace === 'mail' && <div className="h-full overflow-hidden"><MailModule lang={lang} /></div>}
            {activeSpace === 'schedule' && <div className="h-full overflow-hidden"><KanbanModule lang={lang} /></div>}
            {activeSpace === 'calendar' && <div className="h-full overflow-hidden"><ScheduleModule lang={lang} /></div>}
            {activeSpace === 'finance' && <div className="h-full overflow-hidden"><FinanceModule lang={lang} /></div>}
            {activeSpace === 'password' && <div className="h-full overflow-hidden"><PasswordModule lang={lang} /></div>}
          </div>

          <footer className="mt-auto pt-2 pb-1 border-t border-[#1A1A1A]/10 text-[9px] text-[#1A1A1A]/40 font-mono uppercase tracking-widest flex flex-row items-center justify-between gap-4" id="app-footer-other">
            <p>
              {lang === 'zh'
                ? '© 2026 雅致全功能套件。高精密、本地沙盒保存、防泄露隔离运行。'
                : '© 2026 Atelier Suite. Fully integrated, high security standalone offline apps.'}
            </p>
            <div className="flex gap-4">
              <span className="hover:text-[#1A1A1A] cursor-pointer">Security Sandbox: OK</span>
              <span className="hover:text-[#1A1A1A] cursor-pointer">Data Isolated and Encrypted</span>
            </div>
          </footer>
        </main>
      )}
    </div>
  );
}

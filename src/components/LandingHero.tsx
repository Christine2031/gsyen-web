import { useState } from 'react';
import { useTypewriter } from '../hooks/useTypewriter';
import { motion, AnimatePresence } from 'motion/react';
import { Github } from 'lucide-react';
import VintageCar from './VintageCar';
import { version } from '../../package.json';
import AuthModal from '../auth/AuthModal';

const DiscordIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
  </svg>
);

const YoutubeIcon = () => (
  <svg width="13" height="10" viewBox="0 0 24 18" fill="currentColor">
    <path d="M23.495 2.913A2.998 2.998 0 0 0 21.38.798C19.505.25 12 .25 12 .25S4.495.25 2.62.798A2.998 2.998 0 0 0 .505 2.913C0 4.788 0 8.75 0 8.75s0 3.962.505 5.837a2.998 2.998 0 0 0 2.115 2.115C4.495 17.25 12 17.25 12 17.25s7.505 0 9.38-.548a2.998 2.998 0 0 0 2.115-2.115C24 12.712 24 8.75 24 8.75s0-3.962-.505-5.837zM9.75 12.25v-7l6.5 3.5-6.5 3.5z"/>
  </svg>
);

const WinIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor">
    <path d="M0 1.6L4.5.9v4H0V1.6Z"/>
    <path d="M5 .8L11 0v5H5V.8Z"/>
    <path d="M0 5.5h4.5v4L0 9.4V5.5Z"/>
    <path d="M5 5.5h6V11L5 10.2V5.5Z"/>
  </svg>
);

const AppleIcon = () => (
  <svg width="10" height="12" viewBox="0 0 14 17" fill="currentColor">
    <path d="M13.3 12.2c-.3.7-.6 1.3-1 1.9-.5.8-.9 1.3-1.3 1.6-.5.5-1 .7-1.6.7-.4 0-.9-.1-1.5-.4-.6-.2-1.1-.4-1.6-.4-.5 0-1 .1-1.6.4-.6.2-1 .4-1.4.4-.6 0-1.1-.2-1.6-.7-.4-.3-.9-.9-1.4-1.7C.8 13.2.4 12.2.1 11c-.3-1.2-.5-2.4-.5-3.5 0-1.3.3-2.4.8-3.3.4-.7 1-1.3 1.7-1.7.7-.4 1.4-.6 2.2-.6.4 0 1 .1 1.7.4.7.2 1.1.4 1.4.4.2 0 .7-.1 1.5-.4.8-.3 1.5-.4 2-.3 1.5.1 2.6.8 3.3 2-.6.4-1.1.9-1.4 1.5-.3.6-.5 1.3-.5 2 0 .8.2 1.5.6 2.1.4.6.9 1 1.4 1.3l-.1.3ZM9.8 1c0 .6-.2 1.2-.6 1.7-.5.6-1 .9-1.7.9H7.4c0-.6.2-1.2.6-1.8.2-.3.5-.5.9-.7.4-.2.7-.3 1.1-.3l-.2.2Z"/>
  </svg>
);

const AndroidIcon = () => (
  <svg width="11" height="12" viewBox="0 0 12 13" fill="currentColor">
    <path d="M1.5 4.5h9v6a1 1 0 01-1 1h-7a1 1 0 01-1-1v-6Z"/>
    <path d="M4 4.5V3a2 2 0 014 0v1.5"/>
    <circle cx="4" cy="7.5" r=".8"/>
    <circle cx="8" cy="7.5" r=".8"/>
    <line x1="3" y1="2" x2="1.5" y2="4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    <line x1="9" y1="2" x2="10.5" y2="4" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
    <rect x="0" y="5.5" width="1" height="3" rx=".5"/>
    <rect x="11" y="5.5" width="1" height="3" rx=".5"/>
    <rect x="3.5" y="11.5" width="1" height="1.5" rx=".5"/>
    <rect x="7.5" y="11.5" width="1" height="1.5" rx=".5"/>
  </svg>
);

const LinuxIcon = () => (
  <svg width="10" height="12" viewBox="0 0 24 28" fill="currentColor">
    <path d="M12 2C9 2 7 4 7 7c0 2 .5 3.5 1 5-.5 1-1.5 3-1.5 5 0 2 1 3.5 2 4.5-1 .5-3 1.5-3 3 0 1.5 1.5 2.5 6.5 2.5S18 26 18 24.5c0-1.5-2-2.5-3-3 1-1 2-2.5 2-4.5 0-2-1-4-1.5-5 .5-1.5 1-3 1-5 0-3-2-5-4.5-5Zm-2 16c-.5 0-1-.5-1-1s.5-1 1-1 1 .5 1 1-.5 1-1 1Zm4 0c-.5 0-1-.5-1-1s.5-1 1-1 1 .5 1 1-.5 1-1 1Z"/>
  </svg>
);

const IOSIcon = () => (
  <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
    <rect x="1" y="0" width="6" height="10" rx="1.5"/>
    <rect x="2.5" y="10.5" width="3" height="1.5" rx=".75" opacity=".5"/>
    <rect x="3" y="-1" width="2" height="1.5" rx=".75" opacity=".4"/>
  </svg>
);

const R2_BASE        = 'https://pub-e31e040936184655b82ef435a00e4676.r2.dev';
const WINDOWS_R2     = `${R2_BASE}/GSYEN-Setup-Windows.exe`;
const MAC_R2_ARM64   = `${R2_BASE}/GSYEN-Setup-Mac-arm64.dmg`;
const MAC_R2_X64     = `${R2_BASE}/GSYEN-Setup-Mac-x64.dmg`;
const WINDOWS_GITHUB = 'https://github.com/Christine2031/gsyen-web/releases/latest';
const GITHUB_URL     = 'https://github.com/Christine2031/gsyen-web';
const YOUTUBE_URL    = 'https://www.youtube.com/@iSgsyenTt';
const DISCORD_SERVER = 'https://discord.gg/338tsy2Dup';

const PLATFORMS = [
  { label: 'Windows',       icon: <WinIcon />,   available: true, soon: false, beta: false, href: WINDOWS_R2 },
  { label: 'macOS (M1/M2)', icon: <AppleIcon />, available: true, soon: false, beta: true,  href: MAC_R2_ARM64 },
  { label: 'macOS (Intel)', icon: <AppleIcon />, available: true, soon: false, beta: true,  href: MAC_R2_X64 },
  { label: 'Android', icon: <AndroidIcon />, available: false, soon: true,  beta: false, href: null },
  { label: 'Linux',   icon: <LinuxIcon />,   available: false, soon: true,  beta: false, href: null },
  { label: 'iOS',     icon: <IOSIcon />,     available: false, soon: true,  beta: false, href: null },
];

interface LandingHeroProps {
  lang: 'zh' | 'en';
  onEnter: () => void;
}

export default function LandingHero({ lang, onEnter }: LandingHeroProps) {
  const [authModal, setAuthModal] = useState<'login' | 'register' | null>(null);
  const zh = lang === 'zh';

  const { fullSlogan, displayed: displayedSlogan, showCursor } = useTypewriter(zh);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
      className="fixed inset-0 z-50 bg-[#111111] flex flex-col items-center justify-center select-none"
    >
      {/* Subtle grid texture */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#F9F8F608_1px,transparent_1px),linear-gradient(to_bottom,#F9F8F608_1px,transparent_1px)] bg-[size:60px_60px] pointer-events-none" />

      {/* 右上角：登录 / 注册 */}
      <div className="absolute top-6 right-8 z-20 flex items-center gap-2">
        <button
          onClick={() => setAuthModal('login')}
          className="px-2 py-1.5 text-[9px] font-bold tracking-wider uppercase text-[#F9F8F6]/45 hover:text-[#F9F8F6]/80 transition-all whitespace-nowrap font-mono"
        >
          {zh ? '登录' : 'LOGIN'}
        </button>
        <div className="w-px h-3.5 bg-[#F9F8F6]/15" />
        <button
          onClick={() => setAuthModal('register')}
          className="flex items-center gap-1 px-3 py-1.5 border border-[#F9F8F6]/20 text-[#F9F8F6]/55 text-[9px] font-bold tracking-wider uppercase hover:border-[#F9F8F6]/45 hover:text-[#F9F8F6]/85 transition-all whitespace-nowrap font-mono"
        >
          {zh ? '注册' : 'REGISTER'}
          <span className="opacity-50 ml-0.5">→</span>
        </button>
      </div>

      <AnimatePresence>
        {authModal && (
          <AuthModal key="auth" lang={lang} initialTab={authModal} onClose={() => setAuthModal(null)} />
        )}
      </AnimatePresence>

      {/* Center block */}
      <div className="relative z-10 flex flex-col items-center gap-10">

        {/* VintageCar logo */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.7, ease: 'easeOut' }}
        >
          <VintageCar
            size={120}
            strokeWidth={1}
            className="text-[#F9F8F6]/80"
          />
        </motion.div>

        {/* Brand name */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="flex items-baseline gap-4">
            <span className="font-serif-sc text-5xl font-black tracking-[0.15em] text-[#F9F8F6] leading-none">
              疆域
            </span>
            <span className="font-cinzel text-2xl font-bold tracking-[0.3em] text-[#F9F8F6]/70 uppercase leading-none">
              GSYEN
            </span>
            <span className="font-mono text-[9px] tracking-[0.2em] uppercase px-1.5 py-0.5 border border-[#4A90D9]/60 text-[#4A90D9] leading-none self-center">
              BETA · v{version}
            </span>
          </div>
          <p className="font-cinzel text-[11px] tracking-[0.35em] text-[#F9F8F6]/35 uppercase">
            {lang === 'zh' ? '星瀚矢量工作坊' : 'SIRIUS VECTOR ATELIER'}
          </p>
        </motion.div>

        {/* Divider line */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="w-24 h-px bg-[#F9F8F6]/15"
        />

        {/* Tagline — typewriter, ghost anchors first char */}
        <div className="flex justify-center">
          <style>{`.c-blink{animation:c-blink .85s step-end infinite}@keyframes c-blink{0%,100%{opacity:1}50%{opacity:0}}`}</style>
          <div className="relative inline-block">
            <span className="font-mono text-[18px] tracking-[0.28em] opacity-0 select-none pointer-events-none whitespace-nowrap">
              {fullSlogan}
            </span>
            <div className="absolute left-0 top-0 flex items-center whitespace-nowrap">
              <span className="font-mono text-[18px] tracking-[0.28em] text-[#F9F8F6]/90">
                {displayedSlogan}
              </span>
              {showCursor && (
                <span className="c-blink inline-block w-[2px] h-[1.1em] ml-[1px] align-middle bg-[#F9F8F6]/55" />
              )}
            </div>
          </div>
        </div>

        {/* Enter button */}
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.5 }}
          onClick={onEnter}
          className="mt-4 px-10 py-3 border border-[#F9F8F6]/25 text-[#F9F8F6]/60 font-mono text-[10px] tracking-[0.35em] uppercase hover:bg-[#F9F8F6]/8 hover:text-[#F9F8F6] hover:border-[#F9F8F6]/50 transition-all duration-300 rounded-none"
        >
          {lang === 'zh' ? '进入工作坊' : 'ENTER ATELIER'}
        </motion.button>

        {/* Platform badges */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.6 }}
          className="flex items-start gap-2 mt-1"
        >
          {/* Windows + GitHub stacked */}
          <div className="flex flex-col gap-1">
            <a
              href={WINDOWS_R2}
              download
              className="flex items-center gap-2 px-4 py-2.5 border transition-colors border-[#F9F8F6]/25 bg-[#F9F8F6]/6 cursor-pointer hover:border-[#F9F8F6]/45 hover:bg-[#F9F8F6]/10"
            >
              <span className="text-[#F9F8F6]/65"><WinIcon /></span>
              <span className="font-mono text-[10px] tracking-[0.2em] text-[#F9F8F6]/60">Windows</span>
            </a>
            <a
              href={WINDOWS_GITHUB}
              download
              className="flex items-center gap-2 px-4 py-2.5 border transition-colors border-[#F9F8F6]/25 bg-[#F9F8F6]/6 cursor-pointer hover:border-[#F9F8F6]/45 hover:bg-[#F9F8F6]/10"
            >
              <span className="text-[#F9F8F6]/65"><Github size={11} /></span>
              <span className="font-mono text-[10px] tracking-[0.2em] text-[#F9F8F6]/60">GitHub</span>
            </a>
          </div>
          {/* Other platforms */}
          {PLATFORMS.slice(1).map(({ label, icon, soon, beta, available, href }: any) => (
            available ? (
              <a key={label} href={href}
                className="flex items-center gap-2 px-4 py-2.5 border transition-colors border-[#F9F8F6]/20 bg-transparent hover:border-[#F9F8F6]/40 cursor-pointer">
                <span className="text-[#F9F8F6]/60">{icon}</span>
                <span className="font-mono text-[10px] tracking-[0.2em] text-[#F9F8F6]/60">{label}</span>
                {beta && (
                  <span className="font-mono text-[7px] tracking-[0.15em] text-amber-400/70 border border-amber-400/30 px-1 py-0.5 leading-none uppercase">beta</span>
                )}
              </a>
            ) : (
              <div key={label}
                className="flex items-center gap-2 px-4 py-2.5 border transition-colors border-[#F9F8F6]/8 bg-transparent cursor-default">
                <span className="text-[#F9F8F6]/18">{icon}</span>
                <span className="font-mono text-[10px] tracking-[0.2em] text-[#F9F8F6]/20">{label}</span>
                {soon && (
                  <span className="font-mono text-[8px] tracking-[0.1em] text-[#F9F8F6]/20 leading-none">soon</span>
                )}
              </div>
            )
          ))}
        </motion.div>
      </div>

      {/* Bottom micro label */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="absolute bottom-8 flex flex-col items-center gap-2"
      >
        {/* Social links */}
        <div className="flex items-center gap-4">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
            title="GitHub" className="text-[#F9F8F6]/25 hover:text-[#F9F8F6]/70 transition-colors">
            <Github size={13} />
          </a>
          <a href={YOUTUBE_URL} target="_blank" rel="noopener noreferrer"
            title="YouTube · @iSgsyenTt" className="text-[#F9F8F6]/25 hover:text-[#F9F8F6]/70 transition-colors">
            <YoutubeIcon />
          </a>
          <a href={DISCORD_SERVER} target="_blank" rel="noopener noreferrer"
            title="Discord 服务器" className="text-[#F9F8F6]/25 hover:text-[#F9F8F6]/70 transition-colors">
            <DiscordIcon />
          </a>
        </div>
        <p className="font-mono text-[8px] tracking-[0.3em] text-[#F9F8F6]/18 uppercase">
          GSYEN WORKSPACE SUITE · ATELIER EDITION
        </p>
        <p className="font-mono text-[7px] tracking-[0.25em] text-[#F9F8F6]/12 uppercase">
          © 2026 雍彻科技 · All rights reserved.
        </p>
      </motion.div>
    </motion.div>
  );
}

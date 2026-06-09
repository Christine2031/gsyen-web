import { motion } from 'motion/react';
import VintageCar from './VintageCar';

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

const iOSIcon = () => (
  <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor">
    <rect x="1" y="0" width="6" height="10" rx="1.5"/>
    <rect x="2.5" y="10.5" width="3" height="1.5" rx=".75" opacity=".5"/>
    <rect x="3" y="-1" width="2" height="1.5" rx=".75" opacity=".4"/>
  </svg>
);

const WINDOWS_DOWNLOAD = 'https://gsyen-releases.oss-cn-shenzhen.aliyuncs.com/GSYEN-Setup-Windows.exe';

const PLATFORMS = [
  { label: 'Windows', icon: <WinIcon />,     available: true,  soon: false, href: WINDOWS_DOWNLOAD },
  { label: 'macOS',   icon: <AppleIcon />,   available: false, soon: true,  href: null },
  { label: 'Android', icon: <AndroidIcon />, available: false, soon: true,  href: null },
  { label: 'Linux',   icon: <LinuxIcon />,   available: false, soon: true,  href: null },
  { label: 'iOS',     icon: <iOSIcon />,     available: false, soon: true,  href: null },
];

interface LandingHeroProps {
  lang: 'zh' | 'en';
  onEnter: () => void;
}

export default function LandingHero({ lang, onEnter }: LandingHeroProps) {
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

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.6 }}
          className="font-serif-sc text-base tracking-[0.18em] text-[#F9F8F6]/45 text-center"
        >
          {lang === 'zh' ? '洞见疆域 · 策谋未来' : 'SEE BEYOND · SHAPE AHEAD'}
        </motion.p>

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
          className="flex items-center gap-2 mt-1"
        >
          {PLATFORMS.map(({ label, icon, available, soon, href }: any) => {
            const cls = `flex items-center gap-2 px-4 py-2.5 border transition-colors ${
              available
                ? 'border-[#F9F8F6]/25 bg-[#F9F8F6]/6 cursor-pointer hover:border-[#F9F8F6]/45 hover:bg-[#F9F8F6]/10'
                : 'border-[#F9F8F6]/8 bg-transparent cursor-default'
            }`;
            const inner = (
              <>
                <span className={available ? 'text-[#F9F8F6]/65' : 'text-[#F9F8F6]/18'}>{icon}</span>
                <span className={`font-mono text-[10px] tracking-[0.2em] ${available ? 'text-[#F9F8F6]/60' : 'text-[#F9F8F6]/20'}`}>
                  {label}
                </span>
                {soon && (
                  <span className="font-mono text-[8px] tracking-[0.1em] text-[#F9F8F6]/20 leading-none">soon</span>
                )}
              </>
            );
            return href ? (
              <a key={label} href={href} download className={cls}>{inner}</a>
            ) : (
              <div key={label} className={cls}>{inner}</div>
            );
          })}
        </motion.div>
      </div>

      {/* Bottom micro label */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="absolute bottom-8 font-mono text-[8px] tracking-[0.3em] text-[#F9F8F6]/18 uppercase"
      >
        GSYEN WORKSPACE SUITE · ATELIER EDITION
      </motion.div>
    </motion.div>
  );
}

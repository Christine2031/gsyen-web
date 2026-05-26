import { motion } from 'motion/react';
import VintageCar from './VintageCar';

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

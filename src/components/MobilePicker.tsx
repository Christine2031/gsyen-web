import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface PickerOption {
  value: string;
  label: string;
}

interface MobilePickerProps {
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  lang: 'zh' | 'en';
}

const ITEM_H = 48;
const VISIBLE = 5; // odd number so center is clear

export default function MobilePicker({ options, value, onChange, onClose, lang }: MobilePickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const initIdx = Math.max(0, options.findIndex(o => o.value === value));
  const [selectedIdx, setSelectedIdx] = useState(initIdx);
  const ticking = useRef(false);

  // Initialise scroll position
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = initIdx * ITEM_H;
  }, []);

  const onScroll = () => {
    if (ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (el) {
        const idx = Math.round(el.scrollTop / ITEM_H);
        setSelectedIdx(Math.max(0, Math.min(idx, options.length - 1)));
      }
      ticking.current = false;
    });
  };

  const scrollTo = (idx: number) => {
    scrollRef.current?.scrollTo({ top: idx * ITEM_H, behavior: 'smooth' });
    setSelectedIdx(idx);
  };

  const confirm = () => { onChange(options[selectedIdx].value); onClose(); };

  const pad = ITEM_H * Math.floor(VISIBLE / 2); // top & bottom padding so edges can centre

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-[#111]/50 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        key="sheet"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 320 }}
        className="fixed bottom-0 left-0 right-0 z-50 bg-[#F9F8F6] border-t border-[#1A1A1A]/10"
        onClick={e => e.stopPropagation()}
      >
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-[#1A1A1A]/8">
          <button
            onClick={onClose}
            className="font-mono text-(--fs-md) tracking-widest uppercase text-[#1A1A1A]/40 hover:text-[#1A1A1A]/70 transition-colors"
          >
            {lang === 'zh' ? '取消' : 'Cancel'}
          </button>
          <span className="font-cinzel text-(--fs-xs) tracking-[0.3em] uppercase text-[#1A1A1A]/25">
            疆域 GSYEN
          </span>
          <button
            onClick={confirm}
            className="font-mono text-(--fs-md) tracking-widest uppercase font-bold text-[#1A1A1A] hover:text-[#1A1A1A]/70 transition-colors"
          >
            {lang === 'zh' ? '确定' : 'OK'}
          </button>
        </div>

        {/* Wheel */}
        <div className="relative overflow-hidden" style={{ height: ITEM_H * VISIBLE }}>

          {/* Top fade */}
          <div className="absolute inset-x-0 top-0 z-10 pointer-events-none"
            style={{ height: pad, background: 'linear-gradient(to bottom, #F9F8F6 10%, transparent)' }} />

          {/* Bottom fade */}
          <div className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
            style={{ height: pad, background: 'linear-gradient(to top, #F9F8F6 10%, transparent)' }} />

          {/* Selection band */}
          <div className="absolute inset-x-0 z-10 pointer-events-none border-t border-b border-[#1A1A1A]/12"
            style={{ top: pad, height: ITEM_H }} />

          {/* Scroll container */}
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="h-full overflow-y-scroll [scroll-snap-type:y_mandatory] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          >
            <div style={{ height: pad }} />

            {options.map((opt, idx) => {
              const dist = Math.abs(idx - selectedIdx);
              const opacity = dist === 0 ? 1 : dist === 1 ? 0.45 : 0.18;
              const scale = dist === 0 ? 1 : dist === 1 ? 0.88 : 0.78;
              const size = dist === 0 ? '14px' : dist === 1 ? '12px' : '11px';
              return (
                <div
                  key={opt.value}
                  onClick={() => scrollTo(idx)}
                  className="flex items-center justify-center cursor-pointer [scroll-snap-align:center]"
                  style={{ height: ITEM_H }}
                >
                  <span
                    className="font-mono tracking-widest uppercase font-bold transition-all duration-150 select-none"
                    style={{ opacity, transform: `scale(${scale})`, fontSize: size, color: '#1A1A1A' }}
                  >
                    {opt.label}
                  </span>
                </div>
              );
            })}

            <div style={{ height: pad }} />
          </div>
        </div>

        {/* Safe area */}
        <div className="h-safe-area-inset-bottom bg-[#F9F8F6]" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
      </motion.div>
    </AnimatePresence>
  );
}

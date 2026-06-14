import { motion } from 'motion/react';

interface MailSnoozePopoverProps {
  lang: 'zh' | 'en';
  position: { x: number; y: number };
  onClose: () => void;
  onSnooze: (preset: 'today' | 'tomorrow' | 'nextweek' | 'custom') => void;
}

export default function MailSnoozePopover({ lang, position, onClose, onSnooze }: MailSnoozePopoverProps) {
  const options: { key: 'today' | 'tomorrow' | 'nextweek' | 'custom'; emoji: string; label: string }[] = [
    { key: 'today',    emoji: '🌅', label: lang === 'zh' ? '今天晚些时候 (18:00)' : 'Later Today (18:00)' },
    { key: 'tomorrow', emoji: '☀',  label: lang === 'zh' ? '明天早上 (08:00)' : 'Tomorrow (08:00)' },
    { key: 'nextweek', emoji: '📅', label: lang === 'zh' ? '下周初开盘 (Mon 08:00)' : 'Next Week (Mon 08:00)' },
    { key: 'custom',   emoji: '⚙',  label: lang === 'zh' ? '高级定点周期' : 'Configure Custom...' },
  ];

  return (
    <>
      <div className="fixed inset-0 z-45" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        style={{ left: position.x, top: position.y }}
        className="absolute bg-white border border-[#1A1A1A] shadow-xl p-3 w-56 z-50 rounded-none font-sans"
      >
        <div className="font-mono text-(--fs-2xs) uppercase tracking-widest text-neutral-400 pb-1.5 border-b border-[#1A1A1A]/10 mb-2">
          {lang === 'zh' ? '指定延迟挂起周期' : 'SNOOZE CHRONOMETRY'}
        </div>
        <div className="space-y-1 text-xs">
          {options.map(({ key, emoji, label }) => (
            <button key={key} onClick={() => onSnooze(key)}
              className={`w-full text-left py-1.5 px-2 hover:bg-[#1A1A1A]/5 rounded-none ${key === 'custom' ? 'border-t border-[#1A1A1A]/5 text-neutral-400 italic' : ''}`}
            >
              {emoji} {label}
            </button>
          ))}
        </div>
      </motion.div>
    </>
  );
}

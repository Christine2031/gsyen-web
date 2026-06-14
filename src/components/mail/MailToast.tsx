import { motion } from 'motion/react';

interface MailToastProps {
  lang: 'zh' | 'en';
  message: string;
  hasUndo: boolean;
  onUndo: () => void;
}

export default function MailToast({ lang, message, hasUndo, onUndo }: MailToastProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-6 left-6 bg-[#1A1A1A] text-white p-3 px-5 z-50 text-xs flex items-center gap-4 border border-stone-800 rounded-none shadow-2xl font-mono"
    >
      <span>{message}</span>
      {hasUndo && (
        <button onClick={onUndo} className="text-amber-400 font-bold hover:text-amber-300 font-mono tracking-wider uppercase text-(--fs-sm) pl-3 border-l border-white/20">
          {lang === 'zh' ? '撤销 (UNDO)' : 'UNDO'}
        </button>
      )}
    </motion.div>
  );
}

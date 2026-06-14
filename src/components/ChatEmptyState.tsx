/**
 * ChatEmptyState — 空会话欢迎屏（品牌头图 + 输入框 + 预设问题）
 * 从 ChatModule.tsx 拆出（保持核心壳文件精简、稳定）。
 */
import { motion } from 'motion/react';
import { Sparkles, Send } from 'lucide-react';
import VintageCar from './VintageCar';
import { PRESET_QUERIES, PRESET_SHORT_LABELS } from '../config/presets';

interface ChatEmptyStateProps {
  lang: 'zh' | 'en';
  inputVal: string;
  setInputVal: (v: string) => void;
  onSend: (text: string) => void;
}

export function ChatEmptyState({ lang, inputVal, setInputVal, onSend }: ChatEmptyStateProps) {
  return (
    <motion.div key="empty" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
      className="h-full flex items-center justify-center px-6">
      <div className="flex flex-col items-center gap-7 w-full max-w-2xl">
        <div className="flex items-center gap-4">
          <div className="p-2.5 border border-[#1A1A1A]/15 bg-white shadow-sm shrink-0">
            <VintageCar size={36} strokeWidth={1.5} className="text-[#1A1A1A]/90" />
          </div>
          <div className="text-left space-y-1">
            <h2 className="font-serif-sc text-2xl font-black tracking-[0.12em] text-[#111111] leading-none">{lang === 'zh' ? '疆域灵阁' : 'GSYEN Muse'}</h2>
            <p className="font-cinzel text-(--fs-sm) tracking-[0.22em] text-[#1A1A1A]/45 uppercase">{lang === 'zh' ? '星瀚矢量工作坊' : 'SIRIUS VECTOR ATELIER'}</p>
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSend(inputVal); }} className="w-full border border-[#1A1A1A]/20 bg-white focus-within:border-[#1A1A1A]/50 transition-colors">
          <textarea autoFocus rows={4} value={inputVal} onChange={e => setInputVal(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(inputVal); } }}
            placeholder={lang === 'zh' ? '向 Atelier AI 咨询任何品牌策划、视觉创意、符号设计...' : 'Ask Atelier AI anything about brand, design, or strategy...'}
            className="w-full px-5 pt-5 pb-3 bg-transparent resize-none outline-none font-sans text-sm text-[#1A1A1A] placeholder:text-[#1A1A1A]/30 leading-relaxed" />
          <div className="px-4 pb-3 flex items-center justify-between">
            <span className="font-mono text-(--fs-2xs) tracking-widest uppercase text-[#1A1A1A]/25">{lang === 'zh' ? 'ENTER 发送 · SHIFT+ENTER 换行' : 'ENTER TO SEND · SHIFT+ENTER FOR NEW LINE'}</span>
            <button type="submit" disabled={!inputVal.trim()} className="p-2 bg-[#1A1A1A] text-[#F9F8F6] disabled:bg-[#1A1A1A]/10 disabled:text-[#1A1A1A]/30 transition-colors rounded-none border border-[#1A1A1A] disabled:border-[#1A1A1A]/10">
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
        </form>
        <div className="flex flex-wrap gap-2 justify-center">
          {PRESET_QUERIES.map((q, idx) => (
            <button key={idx} onClick={() => onSend(lang === 'zh' ? q.zh : q.en)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-[#1A1A1A]/12 bg-white/70 hover:bg-white hover:border-[#1A1A1A]/25 transition-all rounded-none group">
              <Sparkles className="w-2.5 h-2.5 text-amber-500/60 group-hover:text-amber-500 shrink-0" />
              <span className="font-mono text-(--fs-xs) tracking-widest uppercase text-[#1A1A1A]/55 group-hover:text-[#1A1A1A]">
                {lang === 'zh' ? PRESET_SHORT_LABELS[idx].zh : PRESET_SHORT_LABELS[idx].en}
              </span>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

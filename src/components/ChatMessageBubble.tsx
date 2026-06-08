import type { ReactElement } from 'react';
import { motion } from 'motion/react';
import { Sparkles, User, Copy, Check, Download } from 'lucide-react';
import { ChatMessage } from '../types/chat';
import { renderMessageContent } from '../utils/renderMessage';
import { exportQuoteCard } from '../utils/exportCard';
import { ActionCardView } from './ActionCardView';

interface ChatMessageBubbleProps {
  msg: ChatMessage;
  lang: 'zh' | 'en';
  isCopiedId: string | null;
  onCopy: (id: string, text: string) => void;
}

/** 单条聊天气泡：头像 + 内容 + 神机百炼卡片 + 复制/导出动作。 */
export function ChatMessageBubble({ msg, lang, isCopiedId, onCopy }: ChatMessageBubbleProps): ReactElement {
  const isAI = msg.role === 'model';
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 max-w-3xl ${isAI ? '' : 'ml-auto flex-row-reverse'}`}>
      {/* 头像 */}
      <div className={`w-7 h-7 flex items-center justify-center shrink-0 mt-1 ${isAI ? 'rounded-full bg-[#1A1A1A] text-[#F9F8F6]' : 'rounded-full bg-[#E8E6E1] text-[#1A1A1A]'}`}>
        {isAI ? <Sparkles className="w-3 h-3" /> : <User className="w-3 h-3" />}
      </div>
      <div className="space-y-1 max-w-[88%]">
        <div className={`flex items-center gap-1.5 text-[9px] font-mono tracking-wider uppercase text-neutral-400 ${!isAI ? 'justify-end' : ''}`}>
          <span className="font-bold text-[#1A1A1A]/50">{isAI ? (lang === 'zh' ? 'Atelier AI' : 'ATELIER AI') : (lang === 'zh' ? '您' : 'CLIENT')}</span>
          <span>·</span><span>{msg.timestamp}</span>
        </div>
        <div className={`text-left leading-relaxed ${isAI ? 'pt-0.5' : 'px-5 py-3.5 bg-[#1A1A1A] text-white rounded-2xl rounded-tr-none shadow-sm font-medium'}`}>
          <div className="space-y-1">{renderMessageContent(msg.content, isAI)}</div>
          {isAI && msg.card && <ActionCardView card={msg.card} lang={lang} />}
          {isAI && (
            <div className="mt-4 pt-3.5 border-t border-[#1A1A1A]/5 flex items-center justify-end gap-3.5">
              <button onClick={() => onCopy(msg.id, msg.content)} className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 hover:text-[#1A1A1A] transition-colors flex items-center gap-1">
                {isCopiedId === msg.id ? <><Check className="w-2.5 h-2.5 text-emerald-600" /><span className="text-emerald-600 font-bold">{lang === 'zh' ? '已复制' : 'COPIED'}</span></> : <><Copy className="w-2.5 h-2.5" /><span>{lang === 'zh' ? '复制' : 'COPY'}</span></>}
              </button>
              <button onClick={() => exportQuoteCard(msg, lang)} className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 hover:text-[#1A1A1A] transition-colors flex items-center gap-1">
                <Download className="w-2.5 h-2.5" /><span>{lang === 'zh' ? '灵感卡片' : 'CARD'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

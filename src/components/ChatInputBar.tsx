import React from 'react';
import { Send, Trash2 } from 'lucide-react';

interface ChatInputBarProps {
  lang: 'zh' | 'en';
  inputVal: string;
  hidden: boolean;
  onInputChange: React.Dispatch<React.SetStateAction<string>>;
  onSend: (text: string) => void;
  onClear: () => void;
}

export function ChatInputBar({ lang, inputVal, hidden, onInputChange, onSend, onClear }: ChatInputBarProps) {
  return (
    <div className={`shrink-0 p-4 border-t border-[#1A1A1A]/10 bg-white ${hidden ? 'hidden' : ''}`}>
      <form onSubmit={(e) => { e.preventDefault(); onSend(inputVal); }} className="flex items-center gap-2">
        <button type="button" onClick={onClear} aria-label={lang === 'zh' ? '清空对话' : 'Clear chat'}
          className="p-3 border border-[#1A1A1A]/15 hover:bg-[#1A1A1A] hover:text-white transition-colors text-neutral-500 rounded-none shrink-0">
          <Trash2 className="w-4 h-4" />
        </button>
        <input type="text"
          placeholder={lang === 'zh' ? '向 Atelier AI 咨询任何品牌策划、符号创意、日程安排吧...' : 'Ask Atelier AI anything about brand, design, or schedules...'}
          value={inputVal} onChange={e => onInputChange(e.target.value)}
          className="flex-grow p-3 bg-[#F9F8F6] border border-[#1A1A1A]/15 focus:border-[#1A1A1A] focus:bg-white rounded-none outline-none font-sans text-xs text-[#1A1A1A]" />
        <button type="submit" disabled={!inputVal.trim()} aria-label={lang === 'zh' ? '发送消息' : 'Send message'}
          className="p-3 bg-[#1A1A1A] text-white disabled:bg-[#1A1A1A]/10 disabled:text-neutral-300 transition-colors rounded-none shrink-0 border border-[#1A1A1A]">
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}

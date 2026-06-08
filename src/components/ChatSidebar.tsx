/**
 * ChatSidebar — 往来会话列表侧栏
 * 从 ChatModule.tsx 拆出（保持核心壳文件精简、稳定）。
 */
import { MessageSquare, Terminal, X } from 'lucide-react';
import { StoredSession } from '../types/chat';

interface ChatSidebarProps {
  lang: 'zh' | 'en';
  open: boolean;
  recentsOpen: boolean;
  setRecentsOpen: (fn: (o: boolean) => boolean) => void;
  sessions: StoredSession[];
  currentSessionId: string | null;
  loadSession: (s: StoredSession) => void;
  deleteSession: (id: string) => void;
}

export function ChatSidebar({
  lang, open, recentsOpen, setRecentsOpen,
  sessions, currentSessionId, loadSession, deleteSession,
}: ChatSidebarProps) {
  return (
    <aside className={`bg-[#F4F2EE] border-[#1A1A1A]/10 flex flex-col justify-between transition-all duration-300 overflow-hidden shrink-0 ${open ? 'w-full md:w-[320px] p-6 border-r opacity-100' : 'w-0 p-0 border-r-0 opacity-0 pointer-events-none'}`}>
      <div className="flex flex-col h-full min-w-[272px] gap-4">
        <button onClick={() => setRecentsOpen(o => !o)} className="flex items-center justify-between w-full group">
          <h2 className="text-[11px] font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/70 group-hover:text-[#1A1A1A] transition-colors">
            {lang === 'zh' ? '往来' : 'Recents'}
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-[8px] font-mono text-[#1A1A1A]/25">{sessions.length}</span>
            <span className={`text-[#1A1A1A]/30 text-[10px] transition-transform duration-200 ${recentsOpen ? 'rotate-90' : ''}`}>›</span>
          </div>
        </button>

        <div className={`overflow-y-auto space-y-1.5 pr-0.5 transition-all duration-200 ${recentsOpen ? 'flex-1' : 'hidden'}`}>
          {sessions.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <MessageSquare className="w-6 h-6 text-[#1A1A1A]/15 mx-auto" />
              <p className="text-[9px] font-mono text-[#1A1A1A]/30 uppercase tracking-widest">{lang === 'zh' ? '暂无记录' : 'No history yet'}</p>
            </div>
          ) : sessions.map(s => (
            <div key={s.id} onClick={() => loadSession(s)}
              className={`group relative flex items-start gap-2.5 p-3 border cursor-pointer transition-all ${currentSessionId === s.id ? 'border-[#1A1A1A]/30 bg-white shadow-xs' : 'border-transparent hover:border-[#1A1A1A]/10 hover:bg-white/60'}`}>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-[11px] font-sans text-[#1A1A1A]/80 leading-snug line-clamp-2">{s.title}</p>
                <div className="flex items-center gap-2">
                  <span className="text-[8px] font-mono text-[#1A1A1A]/30 uppercase">{new Date(s.updatedAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}</span>
                  <span className="text-[8px] font-mono text-[#1A1A1A]/25 uppercase">{s.model}</span>
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 hover:text-red-500 text-[#1A1A1A]/30 transition-all">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-1.5 bg-white p-3.5 border border-[#1A1A1A]/10 font-mono text-[9px] uppercase tracking-wider text-neutral-500 shadow-xs shrink-0">
          <div className="inline-flex items-center gap-1.5 text-[#1A1A1A]/60 font-bold">
            <Terminal className="w-3 h-3" />
            {lang === 'zh' ? '本地存储 · Supabase 就绪' : 'LOCAL · SUPABASE READY'}
          </div>
          <p className="text-[8px] text-[#1A1A1A]/40 leading-normal normal-case tracking-normal">
            {lang === 'zh' ? '记录保存于本设备。配置 Supabase 后自动云同步。' : 'Sessions stored locally. Cloud sync activates once Supabase is configured.'}
          </p>
        </div>
      </div>
    </aside>
  );
}

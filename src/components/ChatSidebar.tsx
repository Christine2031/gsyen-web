/**
 * ChatSidebar — 往来会话列表侧栏
 * 从 ChatModule.tsx 拆出（保持核心壳文件精简、稳定）。
 * 底部状态/更新卡逻辑见 ChatUpdaterCard.tsx。
 */
import { useState } from 'react';
import { StoredSession } from '../types/chat';
import { joinTeam, TeamItem } from '../hooks/useTeams';
import { useAuth } from '../auth/useAuth';
import { ChatUpdaterCard } from './ChatUpdaterCard';
import { ChatVaultCard } from './ChatVaultCard';
import { ArchiveIcon, CloseIcon, MessageIcon, PlusIcon, UserIcon, UsersIcon } from '../gsyen-designer';

interface ChatSidebarProps {
  lang: 'zh' | 'en';
  open: boolean;
  recentsOpen: boolean;
  setRecentsOpen: (fn: (o: boolean) => boolean) => void;
  sessions: StoredSession[];
  currentSessionId: string | null;
  loadSession: (s: StoredSession) => void;
  deleteSession: (id: string) => void;
  onNewChat: () => void;
  teams?: TeamItem[];
  selectedTeamId?: string;
  onSelectTeam?: (team: TeamItem) => void;
  onCreateTeam?: () => void;
}

export function ChatSidebar({
  lang, open, recentsOpen, setRecentsOpen,
  sessions, currentSessionId, loadSession, deleteSession,
  teams = [], selectedTeamId, onSelectTeam, onCreateTeam,
}: ChatSidebarProps) {
  const [teamsOpen, setTeamsOpen] = useState(false);
  const [joinOpen, setJoinOpen]   = useState(false);
  const [joinCode, setJoinCode]   = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining]     = useState(false);
  const { user } = useAuth();

  const handleJoin = async () => {
    if (!user?.id || joinCode.length !== 6) return;
    setJoining(true); setJoinError('');
    const { ok, error } = await joinTeam(user.id, joinCode);
    setJoining(false);
    if (ok) { setJoinOpen(false); setJoinCode(''); }
    else setJoinError(error ?? '加入失败');
  };

  return (
    <aside className={`gsyen-archive-sidebar flex flex-col justify-between transition-all duration-300 overflow-hidden shrink-0 ${open ? 'w-full md:w-[240px] 2xl:w-[320px] border-r opacity-100' : 'w-0 border-r-0 opacity-0 pointer-events-none'}`}>
      <div className="flex flex-col h-full min-w-[208px] 2xl:min-w-[272px]">
        <div className="gsyen-archive-header">
          <div>
            <p className="gsyen-archive-kicker">{lang === 'zh' ? 'MUSE ARCHIVE' : 'MUSE ARCHIVE'}</p>
            <p className="gsyen-archive-title">{lang === 'zh' ? '档案库' : 'Archive'}</p>
          </div>
          <div className="gsyen-archive-counter">
            <ArchiveIcon className="w-3 h-3" />
            <span>{sessions.length + teams.length}</span>
          </div>
        </div>

        <section className="gsyen-archive-section min-h-0 flex-1">
          <button onClick={() => setRecentsOpen(o => !o)} className="gsyen-archive-section-title group">
            <span>{lang === 'zh' ? '往来' : 'Recents'}</span>
            <span className="gsyen-archive-section-meta">
              <span>{sessions.length}</span>
              <span className={`gsyen-archive-chevron ${recentsOpen ? 'is-open' : ''}`}>›</span>
            </span>
          </button>

          <div className={`gsyen-archive-list transition-all duration-200 ${recentsOpen ? '' : 'hidden'}`}>
            {sessions.length === 0 ? (
              <div className="gsyen-archive-empty">
                <MessageIcon className="w-6 h-6 text-[#1A1A1A]/14 mx-auto" />
                <p>{lang === 'zh' ? '暂无记录' : 'No history yet'}</p>
                <span>{lang === 'zh' ? '等待第一条往来写入' : 'waiting for first thread'}</span>
              </div>
            ) : sessions.map(s => (
              <div key={s.id} onClick={() => loadSession(s)}
                className={`gsyen-archive-item group ${currentSessionId === s.id ? 'is-active' : ''}`}>
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="fs-md font-sans text-[#1A1A1A]/80 leading-snug line-clamp-2">{s.title}</p>
                  <div className="flex items-center gap-2">
                    <span className="fs-2xs font-mono text-[#1A1A1A]/30 uppercase">{new Date(s.updatedAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}</span>
                    {s.teamId
                      ? <span className="fs-2xs font-mono text-[#1A6ECC]/60 uppercase">· team</span>
                      : <span className="fs-2xs font-mono text-[#1A1A1A]/25 uppercase">{s.model}</span>
                    }
                  </div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 hover:text-red-500 text-[#1A1A1A]/30 transition-all">
                  <CloseIcon className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="gsyen-archive-section shrink-0">
          <button onClick={() => setTeamsOpen(o => !o)} className="gsyen-archive-section-title group">
            <span>{lang === 'zh' ? '我的团队' : 'Teams'} · {teams.length}</span>
            <span className={`gsyen-archive-chevron ${teamsOpen ? 'is-open' : ''}`}>›</span>
          </button>
          {teamsOpen && (
            <div className="gsyen-archive-team-list">
              {teams.map(t => {
                const active = selectedTeamId === t.id;
                return (
                  <button key={t.id} onClick={() => onSelectTeam?.(t)}
                    className={`gsyen-archive-team group ${active ? 'is-active' : ''}`}>
                    <UsersIcon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${active ? 'text-[#1A1A1A]/70' : 'text-[#1A1A1A]/25 group-hover:text-[#1A1A1A]/50'}`} />
                    <span className="fs-md font-sans text-[#1A1A1A]/80 leading-snug line-clamp-2 flex-1">{t.name}</span>
                  </button>
                );
              })}
              <div className="flex gap-1 mt-1">
                <button onClick={() => onCreateTeam?.()}
                  className="flex items-center gap-1.5 flex-1 px-3 py-2 fs-sm font-mono font-bold tracking-widest uppercase border border-[#1A1A1A]/12 hover:bg-[#1A1A1A] hover:text-[#F9F8F6] transition-all text-[#1A1A1A]/40 rounded-none">
                  <PlusIcon className="w-3 h-3" />
                  {lang === 'zh' ? '开团' : 'New'}
                </button>
                <button onClick={() => { setJoinOpen(true); setJoinCode(''); setJoinError(''); }}
                  disabled={!user}
                  className="flex items-center gap-1.5 flex-1 px-3 py-2 fs-sm font-mono font-bold tracking-widest uppercase border border-[#1A1A1A]/12 hover:bg-[#1A1A1A] hover:text-[#F9F8F6] transition-all text-[#1A1A1A]/40 rounded-none disabled:opacity-30 disabled:pointer-events-none">
                  <UserIcon className="w-3 h-3" />
                  {lang === 'zh' ? '加入' : 'Join'}
                </button>
              </div>
            </div>
          )}
        </section>

        <div className="gsyen-archive-bottom">
          <ChatVaultCard lang={lang} />
          <ChatUpdaterCard lang={lang} />
        </div>
      </div>

      {joinOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#1A1A1A]/40"
          onClick={() => setJoinOpen(false)}>
          <div className="bg-[#F9F8F6] border border-[#1A1A1A]/15 p-6 w-[280px] space-y-4"
            onClick={e => e.stopPropagation()}>
            <p className="fs-xs font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/60">
              {lang === 'zh' ? '加入团队' : 'Join Team'}
            </p>
            <input value={joinCode} maxLength={6}
              onChange={e => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder={lang === 'zh' ? '邀请码（6位）' : 'Invite code (6 chars)'}
              className="w-full p-3 bg-white border border-[#1A1A1A]/15 focus:border-[#1A1A1A] outline-none font-mono fs-xs tracking-widest uppercase text-[#1A1A1A] placeholder:normal-case placeholder:tracking-normal placeholder:text-[#1A1A1A]/30" />
            {joinError && <p className="fs-xs font-mono text-red-500">{joinError}</p>}
            <button onClick={handleJoin} disabled={joinCode.length !== 6 || joining || !user}
              className="w-full py-2.5 bg-[#1A1A1A] text-[#F9F8F6] fs-xs font-mono font-bold tracking-widest uppercase disabled:opacity-30 transition-opacity">
              {joining ? '···' : (lang === 'zh' ? '加入' : 'Join')}
            </button>
            {!user && <p className="fs-2xs font-mono text-[#1A1A1A]/40 text-center">{lang === 'zh' ? '请先登录' : 'Sign in required'}</p>}
          </div>
        </div>
      )}
    </aside>
  );
}


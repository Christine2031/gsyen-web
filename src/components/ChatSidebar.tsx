/**
 * ChatSidebar — 往来会话列表侧栏
 * 从 ChatModule.tsx 拆出（保持核心壳文件精简、稳定）。
 * 底部状态栏：平时显示存储状态，有更新时切换为更新提示。
 */
import { useState, useEffect } from 'react';
import { MessageSquare, Terminal, X, Plus, Users, User } from 'lucide-react';
import { StoredSession } from '../types/chat';

export interface Team {
  id: string;
  name: string;
}

// ── 模块级单例：状态在 React 组件 unmount 后仍存活 ──────────────────────────
// 解决：切换 Space 导致 ChatModule 卸载，下载状态丢失的问题
type Phase = 'idle' | 'downloading' | 'ready';
let _cache: { phase: Phase; version: string; pct: number } = { phase: 'idle', version: '', pct: 0 };
let _subs: Array<() => void> = [];
let _registered = false;

function _notify() { _subs.forEach(fn => fn()); }

function _initUpdater() {
  if (_registered) return;
  _registered = true;
  const api = (window as any).electronAPI?.updater;
  if (!api) return;
  // 两个平台都等 onDownloaded 才显示"重启"按钮（Mac autoDownload=true 同样异步）
  api.onAvailable((i: any) => {
    _cache = { ..._cache, version: i.version ?? '', phase: 'downloading' };
    _notify();
  });
  api.onProgress((p: any) => {
    _cache = { ..._cache, pct: Math.round(p.percent ?? 0) };
    _notify();
  });
  api.onDownloaded((i: any) => {
    _cache = { version: i.version ?? '', pct: 100, phase: 'ready' };
    _notify();
  });
}

function useUpdater() {
  const [, tick] = useState(0);
  useEffect(() => {
    _initUpdater();
    const rerender = () => tick(n => n + 1);
    _subs.push(rerender);
    return () => { _subs = _subs.filter(fn => fn !== rerender); };
  }, []);
  return { api: (window as any).electronAPI?.updater, ..._cache };
}

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
  teams?: Team[];
  selectedTeamId?: string;
  onSelectTeam?: (team: Team) => void;
  onCreateTeam?: () => void;
}

export function ChatSidebar({
  lang, open, recentsOpen, setRecentsOpen,
  sessions, currentSessionId, loadSession, deleteSession, onNewChat,
  teams = [], selectedTeamId, onSelectTeam, onCreateTeam,
}: ChatSidebarProps) {
  const { api, phase, version, pct } = useUpdater();

  return (
    <aside className={`bg-[#F4F2EE] border-[#1A1A1A]/10 flex flex-col justify-between transition-all duration-300 overflow-hidden shrink-0 ${open ? 'w-full md:w-[240px] 2xl:w-[320px] p-6 border-r opacity-100' : 'w-0 p-0 border-r-0 opacity-0 pointer-events-none'}`}>
      <div className="flex flex-col h-full min-w-[208px] 2xl:min-w-[272px] gap-4">
        <button onClick={() => setRecentsOpen(o => !o)} className="flex items-center justify-between w-full group">
          <h2 className="text-(--fs-md) font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/70 group-hover:text-[#1A1A1A] transition-colors">
            {lang === 'zh' ? '往来' : 'Recents'}
          </h2>
          <div className="flex items-center gap-2">
            <span className="text-(--fs-2xs) font-mono text-[#1A1A1A]/25">{sessions.length}</span>
            <span className={`text-[#1A1A1A]/30 text-(--fs-sm) transition-transform duration-200 ${recentsOpen ? 'rotate-90' : ''}`}>›</span>
          </div>
        </button>

        {/* Default Session — 永久置顶，对应 currentSessionId===null 态 */}
        <div onClick={onNewChat}
          className={`group flex items-start gap-2.5 p-3 border cursor-pointer transition-all ${currentSessionId === null ? 'border-[#1A1A1A]/30 bg-white shadow-xs' : 'border-transparent hover:border-[#1A1A1A]/10 hover:bg-white/60'}`}>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-(--fs-md) font-sans text-[#1A1A1A]/80 leading-snug">Default Message</p>
            <div className="flex items-center gap-2">
              <span className="text-(--fs-2xs) font-mono text-[#1A1A1A]/30 uppercase">{new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}</span>
              <span className="text-(--fs-2xs) font-mono text-[#1A1A1A]/25 uppercase">ETHAN</span>
            </div>
          </div>
        </div>

        <div className={`overflow-y-auto space-y-1.5 pr-0.5 transition-all duration-200 ${recentsOpen ? 'flex-1' : 'hidden'}`}>
          {sessions.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <MessageSquare className="w-6 h-6 text-[#1A1A1A]/15 mx-auto" />
              <p className="text-(--fs-xs) font-mono text-[#1A1A1A]/30 uppercase tracking-widest">{lang === 'zh' ? '暂无记录' : 'No history yet'}</p>
            </div>
          ) : sessions.map(s => (
            <div key={s.id} onClick={() => loadSession(s)}
              className={`group relative flex items-start gap-2.5 p-3 border cursor-pointer transition-all ${currentSessionId === s.id ? 'border-[#1A1A1A]/30 bg-white shadow-xs' : 'border-transparent hover:border-[#1A1A1A]/10 hover:bg-white/60'}`}>
              <div className="flex-1 min-w-0 space-y-1">
                <p className="text-(--fs-md) font-sans text-[#1A1A1A]/80 leading-snug line-clamp-2">{s.title}</p>
                <div className="flex items-center gap-2">
                  <span className="text-(--fs-2xs) font-mono text-[#1A1A1A]/30 uppercase">{new Date(s.updatedAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}</span>
                  <span className="text-(--fs-2xs) font-mono text-[#1A1A1A]/25 uppercase">{s.model}</span>
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }} className="opacity-0 group-hover:opacity-100 shrink-0 p-0.5 hover:text-red-500 text-[#1A1A1A]/30 transition-all">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>

        {/* 团队列表 */}
        {recentsOpen && (
          <div className="pt-2 border-t border-[#1A1A1A]/10 space-y-0.5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-(--fs-xs) font-mono font-bold tracking-widest uppercase text-[#1A1A1A]/40">
                {lang === 'zh' ? '我的团队' : 'Teams'} · {teams.length}
              </span>
            </div>
            {teams.map(t => {
              const active = selectedTeamId === t.id;
              return (
                <button key={t.id} onClick={() => onSelectTeam?.(t)}
                  className={`group flex items-start gap-2.5 p-3 w-full border cursor-pointer transition-all text-left ${active ? 'border-[#1A1A1A]/30 bg-white shadow-xs' : 'border-transparent hover:border-[#1A1A1A]/10 hover:bg-white/60'}`}>
                  <Users className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${active ? 'text-[#1A1A1A]/70' : 'text-[#1A1A1A]/25 group-hover:text-[#1A1A1A]/50'}`} strokeWidth={1.5} />
                  <span className="text-(--fs-md) font-sans text-[#1A1A1A]/80 leading-snug line-clamp-2 flex-1">{t.name}</span>
                </button>
              );
            })}
            <button onClick={() => onCreateTeam?.()}
              className="flex items-center gap-1.5 w-full px-3 py-2 mt-1 text-(--fs-sm) font-mono font-bold tracking-widest uppercase border border-[#1A1A1A]/12 hover:bg-[#1A1A1A] hover:text-[#F9F8F6] transition-all text-[#1A1A1A]/40 rounded-none">
              <Plus className="w-3 h-3" />
              {lang === 'zh' ? '开团' : 'New Team'}
            </button>
          </div>
        )}

        {/* 底部：有更新时显示更新卡，否则显示存储状态 */}
        {phase !== 'idle' && (
          <div className="shrink-0" style={{
            position: 'relative', width: '100%',
            background: '#070707',
            backgroundImage: 'linear-gradient(rgba(249,248,246,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(249,248,246,0.022) 1px, transparent 1px)',
            backgroundSize: '20px 20px',
            // 四向凹陷 — 完全无外阴影，全部向内
            boxShadow: [
              'inset 0 16px 40px rgba(0,0,0,1)',
              'inset 5px 0 14px rgba(0,0,0,0.75)',
              'inset -5px 0 14px rgba(0,0,0,0.75)',
              'inset 0 -4px 12px rgba(0,0,0,0.5)',
            ].join(', '),
          }}>
            {/* 顶部深渐变 — 模拟头顶光射进凹槽，越顶越黑 */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)',
              pointerEvents: 'none',
            }} />
            {/* L 形角标 — 2px，更建筑感 */}
            {(['tl','tr','bl','br'] as const).map(p => (
              <div key={p} style={{ position: 'absolute', width: 10, height: 10,
                ...(p.includes('t') ? { top: 6 } : { bottom: 6 }),
                ...(p.includes('l') ? { left: 6 } : { right: 6 }),
                borderTop:    p.includes('t') ? '2px solid rgba(249,248,246,0.3)' : undefined,
                borderBottom: p.includes('b') ? '2px solid rgba(249,248,246,0.3)' : undefined,
                borderLeft:   p.includes('l') ? '2px solid rgba(249,248,246,0.3)' : undefined,
                borderRight:  p.includes('r') ? '2px solid rgba(249,248,246,0.3)' : undefined,
              }} />
            ))}

            <div style={{ padding: '10px 14px 12px' }}>
              {/* 标签行 */}
              <div style={{
                fontFamily: '"Cinzel",Georgia,serif', fontSize: 6.5,
                letterSpacing: '0.5em', textTransform: 'uppercase',
                color: 'rgba(249,248,246,0.28)', marginBottom: 4,
              }}>
                {phase === 'downloading' ? 'Downloading Update' : 'Update Ready'}
              </div>
              {/* 版本号 */}
              <div style={{
                fontFamily: '"Cinzel",Georgia,serif', fontSize: 12, fontWeight: 700,
                color: 'rgba(249,248,246,0.78)', letterSpacing: '0.1em', marginBottom: 10,
              }}>
                GSYEN{version ? ` v${version}` : ''}
              </div>

              {phase === 'downloading' && (
                <div style={{ position: 'relative' }}>
                  {/* 轨道 */}
                  <div style={{
                    width: '100%', height: 3, background: 'rgba(249,248,246,0.08)',
                    position: 'relative', overflow: 'visible',
                  }}>
                    {/* 填充条 */}
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${pct}%`, transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)',
                      background: 'rgba(245,158,11,0.85)',
                    }} />
                    {/* 右侧发光点 */}
                    {pct > 2 && (
                      <div style={{
                        position: 'absolute', top: '50%', transform: 'translateY(-50%)',
                        left: `calc(${pct}% - 1px)`,
                        width: 6, height: 6, borderRadius: '50%',
                        background: 'rgba(245,158,11,1)',
                        boxShadow: '0 0 8px 3px rgba(245,158,11,0.6)',
                        transition: 'left 0.5s cubic-bezier(0.4,0,0.2,1)',
                      }} />
                    )}
                  </div>
                  {/* 百分比 */}
                  <div style={{
                    marginTop: 6,
                    fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.12em',
                    color: 'rgba(245,158,11,0.7)', textAlign: 'right',
                  }}>{pct}%</div>
                </div>
              )}

              {phase === 'ready' && (
                <button onClick={() => api?.install()} style={{
                  width: '100%', padding: '8px 0', background: 'transparent',
                  border: '1px solid rgba(245,158,11,0.35)', color: 'rgba(245,158,11,0.7)',
                  fontFamily: '"Cinzel",Georgia,serif', fontSize: 8, fontWeight: 700,
                  letterSpacing: '0.35em', textTransform: 'uppercase', cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}>
                  {lang === 'zh' ? 'Restart to Update' : 'Restart to Update'}
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'idle' && (
          <div className="space-y-1.5 bg-white p-3.5 border border-[#1A1A1A]/10 font-mono text-(--fs-xs) uppercase tracking-wider text-neutral-500 shadow-xs shrink-0">
            <div className="inline-flex items-center gap-1.5 text-[#1A1A1A]/60 font-bold">
              <Terminal className="w-3 h-3" />
              {lang === 'zh' ? '本地存储 · 云同步就绪' : 'LOCAL · CLOUD READY'}
            </div>
            <p className="text-(--fs-2xs) text-[#1A1A1A]/40 leading-normal normal-case tracking-normal">
              {lang === 'zh' ? '记录保存于本设备，登录后自动云同步。' : 'Sessions stored locally. Sign in to enable cloud sync.'}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

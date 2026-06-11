/**
 * ChatSidebar — 往来会话列表侧栏
 * 从 ChatModule.tsx 拆出（保持核心壳文件精简、稳定）。
 * 底部状态栏：平时显示存储状态，有更新时切换为更新提示。
 */
import { useState, useEffect } from 'react';
import { MessageSquare, Terminal, X } from 'lucide-react';
import { StoredSession } from '../types/chat';

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
}

export function ChatSidebar({
  lang, open, recentsOpen, setRecentsOpen,
  sessions, currentSessionId, loadSession, deleteSession, onNewChat,
}: ChatSidebarProps) {
  const { api, phase, version, pct } = useUpdater();

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

        {/* Default Session — 永久置顶，对应 currentSessionId===null 态 */}
        <div onClick={onNewChat}
          className={`group flex items-start gap-2.5 p-3 border cursor-pointer transition-all ${currentSessionId === null ? 'border-[#1A1A1A]/30 bg-white shadow-xs' : 'border-transparent hover:border-[#1A1A1A]/10 hover:bg-white/60'}`}>
          <div className="flex-1 min-w-0 space-y-1">
            <p className="text-[11px] font-sans text-[#1A1A1A]/80 leading-snug">Default Message</p>
            <div className="flex items-center gap-2">
              <span className="text-[8px] font-mono text-[#1A1A1A]/30 uppercase">{new Date().toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' })}</span>
              <span className="text-[8px] font-mono text-[#1A1A1A]/25 uppercase">ETHAN</span>
            </div>
          </div>
        </div>

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

        {/* 底部：有更新时显示 Art Deco 更新卡，否则显示存储状态 */}
        {phase !== 'idle' && (
          <div className="shrink-0" style={{
            position: 'relative', width: '100%',
            background: '#111111',
            backgroundImage: 'radial-gradient(rgba(249,248,246,0.07) 1px, transparent 1px)',
            backgroundSize: '8px 8px',
            border: '1px solid rgba(249,248,246,0.22)',
          }}>
            {/* amber 顶线 — 工业感 */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'rgba(245,158,11,0.72)' }} />
            {/* 四角装饰 — 加粗加亮 */}
            {(['tl','tr','bl','br'] as const).map(p => (
              <div key={p} style={{ position: 'absolute', width: 10, height: 10,
                ...(p.includes('t') ? { top: 5 } : { bottom: 5 }),
                ...(p.includes('l') ? { left: 5 } : { right: 5 }),
                borderTop:    p.includes('t') ? '1.5px solid rgba(249,248,246,0.55)' : undefined,
                borderBottom: p.includes('b') ? '1.5px solid rgba(249,248,246,0.55)' : undefined,
                borderLeft:   p.includes('l') ? '1.5px solid rgba(249,248,246,0.55)' : undefined,
                borderRight:  p.includes('r') ? '1.5px solid rgba(249,248,246,0.55)' : undefined,
              }} />
            ))}
            <div style={{ padding: '8px 12px' }}>
              <div style={{ fontFamily: '"Cinzel",Georgia,serif', fontSize: 6, letterSpacing: '0.35em', textTransform: 'uppercase', color: 'rgba(249,248,246,0.35)', marginBottom: 2 }}>
                {phase === 'downloading' ? 'Downloading Update' : 'Update Ready'}
              </div>
              <div style={{ fontFamily: '"Cinzel",Georgia,serif', fontSize: 11, fontWeight: 700, color: 'rgba(249,248,246,0.9)', letterSpacing: '0.08em', marginBottom: 6 }}>
                GSYEN{version ? ` v${version}` : ''}
              </div>
              {phase === 'downloading' && (
                <>
                  {/* 全轨道暗条纹，填充段亮条纹 — 施工警戒带感 */}
                  <div style={{
                    width: '100%', height: 16, position: 'relative', overflow: 'hidden', marginBottom: 0,
                    border: '1px solid rgba(249,248,246,0.14)',
                    background: 'repeating-linear-gradient(-45deg,rgba(245,158,11,0.14) 0px,rgba(245,158,11,0.14) 5px,rgba(0,0,0,0.22) 5px,rgba(0,0,0,0.22) 10px)',
                  }}>
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${pct}%`, transition: 'width 0.4s linear',
                      background: 'repeating-linear-gradient(-45deg,rgba(245,158,11,0.92) 0px,rgba(245,158,11,0.92) 5px,rgba(180,100,0,0.68) 5px,rgba(180,100,0,0.68) 10px)',
                    }} />
                    <span style={{
                      position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)',
                      fontFamily: 'monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                      color: 'rgba(249,248,246,0.9)',
                      textShadow: '0 1px 3px rgba(0,0,0,0.95)',
                    }}>{pct}%</span>
                  </div>
                </>
              )}
              {phase === 'ready' && (
                <button onClick={() => api?.install()} style={{ width: '100%', padding: '8px 0', background: 'transparent',
                  border: '1px solid rgba(249,248,246,0.25)', color: 'rgba(249,248,246,0.65)', fontFamily: '"Cinzel",Georgia,serif',
                  fontSize: 8, fontWeight: 700, letterSpacing: '0.3em', textTransform: 'uppercase', cursor: 'pointer' }}>
                  {lang === 'zh' ? '重启升级 →' : 'Restart →'}
                </button>
              )}
            </div>
          </div>
        )}

        {phase === 'idle' && (
          <div className="space-y-1.5 bg-white p-3.5 border border-[#1A1A1A]/10 font-mono text-[9px] uppercase tracking-wider text-neutral-500 shadow-xs shrink-0">
            <div className="inline-flex items-center gap-1.5 text-[#1A1A1A]/60 font-bold">
              <Terminal className="w-3 h-3" />
              {lang === 'zh' ? '本地存储 · 云同步就绪' : 'LOCAL · CLOUD READY'}
            </div>
            <p className="text-[8px] text-[#1A1A1A]/40 leading-normal normal-case tracking-normal">
              {lang === 'zh' ? '记录保存于本设备，登录后自动云同步。' : 'Sessions stored locally. Sign in to enable cloud sync.'}
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

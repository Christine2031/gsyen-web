/**
 * ChatUpdaterCard — Electron 自动更新状态卡（从 ChatSidebar 拆出）
 * 模块级单例保证切换 Space（ChatModule 卸载）时下载进度不丢失。
 */
import { useState, useEffect } from 'react';

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
  api.onAvailable((i: any) => { _cache = { ..._cache, version: i.version ?? '', phase: 'downloading' }; _notify(); });
  api.onProgress((p: any) => { _cache = { ..._cache, pct: Math.round(p.percent ?? 0) }; _notify(); });
  api.onDownloaded((i: any) => { _cache = { version: i.version ?? '', pct: 100, phase: 'ready' }; _notify(); });
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

interface Props { lang: 'zh' | 'en' }

export function ChatUpdaterCard({ lang }: Props) {
  const { api, phase, version, pct } = useUpdater();

  if (phase === 'idle') {
    return (
      <div className="space-y-1.5 bg-white p-3.5 border border-[#1A1A1A]/10 font-mono fs-xs uppercase tracking-wider text-neutral-500 shadow-xs shrink-0">
        <div className="inline-flex items-center gap-1.5 text-[#1A1A1A]/60 font-bold">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" />
          </svg>
          {lang === 'zh' ? '本地存储 · 云同步就绪' : 'LOCAL · CLOUD READY'}
        </div>
        <p className="fs-2xs text-[#1A1A1A]/40 leading-normal normal-case tracking-normal">
          {lang === 'zh' ? '记录保存于本设备，登录后自动云同步。' : 'Sessions stored locally. Sign in to enable cloud sync.'}
        </p>
      </div>
    );
  }

  const corners = ['tl', 'tr', 'bl', 'br'] as const;
  return (
    <div className="shrink-0" style={{
      position: 'relative', width: '100%', background: '#070707',
      backgroundImage: 'linear-gradient(rgba(249,248,246,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(249,248,246,0.022) 1px, transparent 1px)',
      backgroundSize: '20px 20px',
      boxShadow: 'inset 0 16px 40px rgba(0,0,0,1), inset 5px 0 14px rgba(0,0,0,0.75), inset -5px 0 14px rgba(0,0,0,0.75), inset 0 -4px 12px rgba(0,0,0,0.5)',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%)', pointerEvents: 'none' }} />
      {corners.map(p => (
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
        <div style={{ fontFamily: '"Cinzel",Georgia,serif', fontSize: 6.5, letterSpacing: '0.5em', textTransform: 'uppercase', color: 'rgba(249,248,246,0.28)', marginBottom: 4 }}>
          {phase === 'downloading' ? 'Downloading Update' : 'Update Ready'}
        </div>
        <div style={{ fontFamily: '"Cinzel",Georgia,serif', fontSize: 12, fontWeight: 700, color: 'rgba(249,248,246,0.78)', letterSpacing: '0.1em', marginBottom: 10 }}>
          GSYEN{version ? ` v${version}` : ''}
        </div>
        {phase === 'downloading' && (
          <div style={{ position: 'relative' }}>
            <div style={{ width: '100%', height: 3, background: 'rgba(249,248,246,0.08)', position: 'relative', overflow: 'visible' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, transition: 'width 0.5s cubic-bezier(0.4,0,0.2,1)', background: 'rgba(245,158,11,0.85)' }} />
              {pct > 2 && <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: `calc(${pct}% - 1px)`, width: 6, height: 6, borderRadius: '50%', background: 'rgba(245,158,11,1)', boxShadow: '0 0 8px 3px rgba(245,158,11,0.6)', transition: 'left 0.5s cubic-bezier(0.4,0,0.2,1)' }} />}
            </div>
            <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(245,158,11,0.7)', textAlign: 'right' }}>{pct}%</div>
          </div>
        )}
        {phase === 'ready' && (
          <button onClick={() => api?.install()} style={{ width: '100%', padding: '8px 0', background: 'transparent', border: '1px solid rgba(245,158,11,0.35)', color: 'rgba(245,158,11,0.7)', fontFamily: '"Cinzel",Georgia,serif', fontSize: 8, fontWeight: 700, letterSpacing: '0.35em', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s ease' }}>
            Restart to Update
          </button>
        )}
      </div>
    </div>
  );
}

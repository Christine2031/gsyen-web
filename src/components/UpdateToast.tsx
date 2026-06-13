import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const RELEASES_URL = 'https://github.com/Christine2031/gsyen-web/releases/latest';
const CINZEL = '"Cinzel", "Times New Roman", serif';
const MONO   = 'var(--font-mono, "SF Mono", "Cascadia Code", monospace)';

// gd-ad palette — mirrors LandingHero exactly, no blue
const IV  = (a: number) => `rgba(249,248,246,${a})`;   // ivory
const AMB = (a: number) => `rgba(245,158,11,${a})`;     // amber

interface ProgressInfo { percent: number; bytesPerSecond: number; }
type Phase = 'downloading' | 'ready';

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const s: React.CSSProperties = {
    position: 'absolute', width: 9, height: 9,
    ...(pos.includes('t') ? { top: 5 }    : { bottom: 5 }),
    ...(pos.includes('l') ? { left: 5 }   : { right: 5 }),
    borderTop:    pos.includes('t') ? `1px solid ${IV(0.35)}` : undefined,
    borderBottom: pos.includes('b') ? `1px solid ${IV(0.35)}` : undefined,
    borderLeft:   pos.includes('l') ? `1px solid ${IV(0.35)}` : undefined,
    borderRight:  pos.includes('r') ? `1px solid ${IV(0.35)}` : undefined,
  };
  return <div style={s} />;
}

export function UpdateToast() {
  const api      = (window as any).electronAPI?.updater;
  const platform = (window as any).electronAPI?.platform as string | undefined;
  const isMac    = platform === 'darwin';

  const [phase,     setPhase]     = useState<Phase | null>(null);
  const [version,   setVersion]   = useState('');
  const [progress,  setProgress]  = useState<ProgressInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!api) return;
    if (isMac) {
      api.onAvailable((info: any) => { setVersion(info.version ?? ''); setPhase('ready'); });
    } else {
      api.onAvailable((info: any) => { setVersion(info.version ?? ''); setPhase('downloading'); });
      api.onProgress((p: ProgressInfo) => setProgress(p));
      api.onDownloaded((info: any) => { setVersion(info.version ?? ''); setPhase('ready'); setProgress(null); });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pct      = Math.min(100, Math.round(progress?.percent ?? 0));
  const speed    = progress?.bytesPerSecond ?? 0;
  const speedStr = speed > 1_048_576
    ? `${(speed / 1_048_576).toFixed(1)} MB/s`
    : `${Math.round(speed / 1024)} KB/s`;

  return (
    <AnimatePresence>
      {api && phase && !dismissed && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{    opacity: 0, y: 10 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'fixed', bottom: 28, left: 28, zIndex: 9998,
            width: 300,
            background: '#111111',
            borderTop:    `1px solid rgba(0,0,0,0.55)`,
            borderLeft:   `1px solid rgba(0,0,0,0.35)`,
            borderRight:  `1px solid rgba(0,0,0,0.35)`,
            borderBottom: `1px solid ${IV(0.12)}`,
            boxShadow: `inset 0 2px 6px rgba(0,0,0,0.45), inset 0 1px 0 rgba(0,0,0,0.3), 0 1px 0 ${IV(0.06)}`,
          }}
        >
          <Corner pos="tl" /><Corner pos="tr" />
          <Corner pos="bl" /><Corner pos="br" />

          <div style={{ padding: '16px 18px 18px' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: CINZEL, fontSize: 8, letterSpacing: '0.35em',
                  textTransform: 'uppercase', color: IV(0.35), marginBottom: 5 }}>
                  {phase === 'downloading' ? 'Downloading Update' : (isMac ? 'New Release' : 'Update Ready')}
                </div>
                <div style={{ fontFamily: CINZEL, fontSize: 14, fontWeight: 700,
                  color: IV(0.9), letterSpacing: '0.08em' }}>
                  GSYEN{version ? ` v${version}` : ''}
                </div>
              </div>
              <button onClick={() => setDismissed(true)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: IV(0.2), fontSize: 18, lineHeight: 1,
                padding: '0 0 0 12px', flexShrink: 0, transition: 'color 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.color = IV(0.55))}
                onMouseLeave={e => (e.currentTarget.style.color = IV(0.2))}>
                ×
              </button>
            </div>

            {/* Downloading */}
            {phase === 'downloading' && (
              <>
                {/* Track */}
                <div style={{ width: '100%', height: 20, background: IV(0.07),
                  position: 'relative', overflow: 'hidden', marginBottom: 8 }}>
                  {/* Fill — diagonal stripe pattern */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%',
                    width: `${pct}%`,
                    background: `repeating-linear-gradient(
                      -45deg,
                      ${AMB(0.9)}        0px, ${AMB(0.9)}        5px,
                      rgba(0,0,0,0.75)   5px, rgba(0,0,0,0.75)  10px
                    )`,
                    transition: 'width 0.4s linear',
                  }} />
                  {/* Percentage inside bar */}
                  <span style={{
                    position: 'absolute', right: 8, top: '50%',
                    transform: 'translateY(-50%)',
                    fontFamily: MONO, fontSize: 10, fontWeight: 700,
                    color: pct > 80 ? '#111111' : AMB(0.9),
                    letterSpacing: '0.08em', lineHeight: 1,
                  }}>
                    {pct}%
                  </span>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 10, color: IV(0.32), letterSpacing: '0.05em' }}>
                  {speed > 0 ? speedStr : '—'}
                </span>
              </>
            )}

            {/* Ready */}
            {phase === 'ready' && (
              <>
                <p style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.6,
                  color: IV(0.35), margin: '0 0 14px', letterSpacing: '0.03em' }}>
                  {isMac ? '新版本已发布，下载 DMG 重新安装即可。' : '已在后台下载完成，重启后生效。'}
                </p>
                {isMac ? (
                  <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', textAlign: 'center', padding: '9px 0',
                      border: `1px solid ${IV(0.25)}`, color: IV(0.6),
                      fontFamily: CINZEL, fontSize: 8, fontWeight: 700,
                      letterSpacing: '0.3em', textTransform: 'uppercase',
                      textDecoration: 'none', transition: 'all 0.18s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = IV(0.5); (e.currentTarget as HTMLElement).style.color = IV(0.9); }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = IV(0.25); (e.currentTarget as HTMLElement).style.color = IV(0.6); }}>
                    Download  →
                  </a>
                ) : (
                  <button onClick={() => api.install()} style={{
                    width: '100%', padding: '9px 0',
                    background: 'transparent', border: `1px solid ${IV(0.25)}`,
                    color: IV(0.6),
                    fontFamily: CINZEL, fontSize: 8, fontWeight: 700,
                    letterSpacing: '0.3em', textTransform: 'uppercase',
                    cursor: 'pointer', transition: 'all 0.18s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = IV(0.06); e.currentTarget.style.borderColor = IV(0.5); e.currentTarget.style.color = IV(0.9); }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = IV(0.25); e.currentTarget.style.color = IV(0.6); }}>
                    Restart to Update
                  </button>
                )}
              </>
            )}

          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

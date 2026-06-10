import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

const RELEASES_URL = 'https://github.com/Christine2031/gsyen-web/releases/latest';
const CINZEL = '"Cinzel", "Times New Roman", serif';
const MONO   = 'var(--font-mono, "SF Mono", "Cascadia Code", monospace)';

interface ProgressInfo { percent: number; bytesPerSecond: number; }

type Phase = 'downloading' | 'ready';

function Corner({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const style: React.CSSProperties = {
    position: 'absolute', width: 9, height: 9,
    ...(pos.includes('t') ? { top: 5 }    : { bottom: 5 }),
    ...(pos.includes('l') ? { left: 5 }   : { right: 5 }),
    borderTop:    pos.includes('t') ? '1px solid rgba(249,248,246,0.38)' : undefined,
    borderBottom: pos.includes('b') ? '1px solid rgba(249,248,246,0.38)' : undefined,
    borderLeft:   pos.includes('l') ? '1px solid rgba(249,248,246,0.38)' : undefined,
    borderRight:  pos.includes('r') ? '1px solid rgba(249,248,246,0.38)' : undefined,
  };
  return <div style={style} />;
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

  const pct   = Math.min(100, Math.round(progress?.percent ?? 0));
  const speed = progress?.bytesPerSecond ?? 0;
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
            position: 'fixed', bottom: 28, right: 28, zIndex: 9998,
            width: 300,
            background: '#111111',
            border: '1px solid rgba(249,248,246,0.18)',
          }}
        >
          <Corner pos="tl" /><Corner pos="tr" />
          <Corner pos="bl" /><Corner pos="br" />

          <div style={{ padding: '16px 18px 18px' }}>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <div style={{ fontFamily: CINZEL, fontSize: 8, letterSpacing: '0.35em',
                  textTransform: 'uppercase', color: 'rgba(249,248,246,0.35)', marginBottom: 5 }}>
                  {phase === 'downloading' ? 'Downloading Update' : (isMac ? 'New Release' : 'Update Ready')}
                </div>
                <div style={{ fontFamily: CINZEL, fontSize: 14, fontWeight: 700,
                  color: 'rgba(249,248,246,0.9)', letterSpacing: '0.08em' }}>
                  GSYEN{version ? ` v${version}` : ''}
                </div>
              </div>
              <button onClick={() => setDismissed(true)} style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'rgba(249,248,246,0.2)', fontSize: 18, lineHeight: 1,
                padding: '0 0 0 12px', flexShrink: 0, transition: 'color 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(249,248,246,0.55)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(249,248,246,0.2)')}>
                ×
              </button>
            </div>

            {/* Downloading phase */}
            {phase === 'downloading' && (
              <>
                <div style={{ width: '100%', height: 1, background: 'rgba(249,248,246,0.1)',
                  marginBottom: 9, position: 'relative' }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, height: '100%',
                    width: `${pct}%`, background: '#4A90D9',
                    transition: 'width 0.35s linear',
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: 'rgba(249,248,246,0.38)', letterSpacing: '0.05em' }}>
                    {speed > 0 ? speedStr : '—'}
                  </span>
                  <span style={{ fontFamily: MONO, fontSize: 10, fontWeight: 600,
                    color: 'rgba(249,248,246,0.65)', letterSpacing: '0.08em' }}>
                    {pct}%
                  </span>
                </div>
              </>
            )}

            {/* Ready phase */}
            {phase === 'ready' && (
              <>
                <p style={{ fontFamily: MONO, fontSize: 10, lineHeight: 1.6,
                  color: 'rgba(249,248,246,0.35)', margin: '0 0 14px', letterSpacing: '0.03em' }}>
                  {isMac ? '新版本已发布，下载 DMG 重新安装即可。' : '已在后台下载完成，重启后生效。'}
                </p>
                {isMac ? (
                  <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer"
                    style={{ display: 'block', textAlign: 'center', padding: '9px 0',
                      border: '1px solid rgba(249,248,246,0.2)', color: 'rgba(249,248,246,0.65)',
                      fontFamily: CINZEL, fontSize: 8, fontWeight: 700,
                      letterSpacing: '0.3em', textTransform: 'uppercase',
                      textDecoration: 'none', transition: 'all 0.18s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(249,248,246,0.5)'; (e.currentTarget as HTMLElement).style.color = 'rgba(249,248,246,0.9)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(249,248,246,0.2)'; (e.currentTarget as HTMLElement).style.color = 'rgba(249,248,246,0.65)'; }}>
                    Download  →
                  </a>
                ) : (
                  <button onClick={() => api.install()} style={{
                    width: '100%', padding: '9px 0',
                    background: 'transparent', border: '1px solid rgba(74,144,217,0.55)',
                    color: '#4A90D9', fontFamily: CINZEL, fontSize: 8, fontWeight: 700,
                    letterSpacing: '0.3em', textTransform: 'uppercase',
                    cursor: 'pointer', transition: 'all 0.18s' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(74,144,217,0.1)'; e.currentTarget.style.borderColor = '#4A90D9'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(74,144,217,0.55)'; }}>
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

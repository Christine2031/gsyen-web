import { useState, useEffect } from 'react';

export function FullscreenFade() {
  const [visible, setVisible] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onFullscreenChange) return;
    api.onFullscreenChange(({ phase }: { phase: 'out' | 'in' }) => {
      if (phase === 'out') {
        setVisible(true);
        requestAnimationFrame(() => setDark(true));
      } else {
        setDark(false);
        setTimeout(() => setVisible(false), 220);
      }
    });
  }, []);

  if (!visible) return null;
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999,
      background: '#000',
      opacity: dark ? 1 : 0,
      transition: dark ? 'opacity 0.1s ease' : 'opacity 0.22s ease',
      pointerEvents: 'none',
    }} />
  );
}

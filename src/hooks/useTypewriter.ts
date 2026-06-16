import { useState, useEffect } from 'react';

const ZH_SLOGAN = '告诉我心中所想';
const EN_SLOGAN = 'TELL ME YOUR HEART';

// relative ms from typing start: 告(0) 诉(300) 我(600) ···pause··· 心(1900) 中(2200) 所(2500) 想(2800)
const ZH_OFFSETS = [0, 300, 600, 1900, 2200, 2500, 2800];
const EN_INTERVAL = 90;

// wait for all page motion animations to settle before typing begins (~1.5s)
const START_DELAY = 1500;

export function useTypewriter(zh: boolean) {
  const fullSlogan = zh ? ZH_SLOGAN : EN_SLOGAN;
  const [displayed, setDisplayed] = useState('');
  const [showCursor, setShowCursor] = useState(false);

  useEffect(() => {
    setDisplayed('');
    setShowCursor(false);

    const timers: ReturnType<typeof setTimeout>[] = [];

    // cursor blinks in just before typing
    timers.push(setTimeout(() => setShowCursor(true), START_DELAY - 120));

    fullSlogan.split('').forEach((_, i) => {
      const offset = zh ? ZH_OFFSETS[i] : i * EN_INTERVAL;
      timers.push(setTimeout(() => {
        setDisplayed(fullSlogan.slice(0, i + 1));
        if (i === fullSlogan.length - 1) {
          timers.push(setTimeout(() => setShowCursor(false), 900));
        }
      }, START_DELAY + offset));
    });

    return () => timers.forEach(clearTimeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { fullSlogan, displayed, showCursor };
}

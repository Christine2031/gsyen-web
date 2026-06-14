import { useState, useEffect } from 'react';

export type FontSize = 'compact' | 'normal' | 'large';
const KEY = 'gsyen_font_size';

export function useFontSize() {
  const [size, setSize] = useState<FontSize>(
    () => (localStorage.getItem(KEY) as FontSize | null) ?? 'normal'
  );

  useEffect(() => {
    const el = document.documentElement;
    if (size === 'normal') {
      el.removeAttribute('data-font');
    } else {
      el.setAttribute('data-font', size);
    }
    localStorage.setItem(KEY, size);
  }, [size]);

  return { size, setSize };
}

import { useRef, useEffect } from 'react';
import type { FontSize } from '../../hooks/useFontSize';

interface Props {
  value: FontSize;
  onChange: (v: FontSize) => void;
  zh: boolean;
  isShortScreen: boolean;
}

const OPTIONS: FontSize[] = ['compact', 'normal', 'large', 'ji'];

const ZH: Record<FontSize, string> = { compact: '紧凑', normal: '正常', large: '舒适', ji: '极' };
const EN: Record<FontSize, string> = { compact: 'Compact', normal: 'Normal', large: 'Comfort', ji: 'Ultra' };


export function FontSizePicker({ value, onChange, zh, isShortScreen }: Props) {
  const pickerRef  = useRef<HTMLDivElement>(null);
  const sliderRef  = useRef<HTMLDivElement>(null);
  const hoverRef   = useRef<HTMLDivElement>(null);
  const labels     = zh ? ZH : EN;

  // slider 跟随 committed value
  // 用 offsetLeft/offsetWidth（CSS 像素），不用 getBoundingClientRect（受 html zoom 缩放）
  function syncSlider(idx: number) {
    if (!pickerRef.current || !sliderRef.current) return;
    const btns = pickerRef.current.querySelectorAll<HTMLElement>('[data-pbtn]');
    const btn  = btns[idx];
    if (!btn) return;
    sliderRef.current.style.left  = `${btn.offsetLeft}px`;
    sliderRef.current.style.width = `${btn.offsetWidth}px`;
  }

  function syncHover(idx: number | null) {
    if (!hoverRef.current) return;
    if (idx === null) { hoverRef.current.style.opacity = '0'; return; }
    if (!pickerRef.current) return;
    const btns = pickerRef.current.querySelectorAll<HTMLElement>('[data-pbtn]');
    const btn  = btns[idx];
    if (!btn) return;
    hoverRef.current.style.left    = `${btn.offsetLeft}px`;
    hoverRef.current.style.width   = `${btn.offsetWidth}px`;
    hoverRef.current.style.opacity = '1';
  }

  useEffect(() => {
    const idx = OPTIONS.indexOf(value);
    const t = setTimeout(() => syncSlider(idx), 40);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const onResize = () => syncSlider(OPTIONS.indexOf(value));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [value]);

  const handleEnter = (i: number) => { syncHover(i); };
  const handleLeave = () => { syncHover(null); };
  const handleClick = (i: number) => { onChange(OPTIONS[i]); };

  return (
    <div className="flex flex-col gap-2">
      <div
        ref={pickerRef}
        className="relative inline-flex items-center border border-[#1A1A1A]/12 p-[3px] bg-[#F9F8F6]/50 w-fit"
        onMouseLeave={handleLeave}
      >
        {/* 滑动黑色 active 块 */}
        <div
          ref={sliderRef}
          className="absolute top-[3px] bottom-[3px] bg-[#1A1A1A] pointer-events-none"
          style={{ transition: 'left 240ms cubic-bezier(0.4,0,0.2,1), width 240ms cubic-bezier(0.4,0,0.2,1)' }}
        />
        {/* 悬停幽灵块 */}
        <div
          ref={hoverRef}
          className="absolute top-[3px] bottom-[3px] bg-[#1A1A1A]/6 pointer-events-none opacity-0"
          style={{ transition: 'left 160ms cubic-bezier(0.4,0,0.2,1), width 160ms cubic-bezier(0.4,0,0.2,1), opacity 120ms ease' }}
        />

        {OPTIONS.map((v, i) => {
          const isActive = v === value;
          const isWarn   = v === 'large' && isShortScreen;
          const title =
            v === 'ji'
              ? zh ? '极大字号，适合演示 / 辅助场景' : 'Maximum — great for large screens or presentations'
              : v === 'large' && isWarn
              ? zh ? '屏幕高度较短，内容区偏紧' : 'Short screen — content may be cramped'
              : undefined;

          return (
            <button
              key={v}
              data-pbtn
              onMouseEnter={() => handleEnter(i)}
              onClick={() => handleClick(i)}
              title={title}
              className={[
                'relative z-10 px-[18px] py-[7px]',
                'text-[10px] font-mono font-bold tracking-widest uppercase',
                'border-none bg-transparent rounded-none',
                'transition-colors duration-[180ms]',
                isActive ? 'text-[#F9F8F6] cursor-default'
                : isWarn ? 'text-amber-500/70 cursor-pointer'
                :           'text-[#1A1A1A]/45 cursor-pointer hover:text-[#1A1A1A]/75',
              ].join(' ')}
            >
              {labels[v]}
            </button>
          );
        })}
      </div>

      {value === 'ji' && (
        <p className="text-[9px] font-mono text-[#1A1A1A]/40 tracking-wide">
          {zh ? '极档放大 130%，适合大屏 / 演示 / 视力辅助' : 'Ultra scales to 130% — ideal for large displays or accessibility'}
        </p>
      )}
      {value === 'large' && isShortScreen && (
        <p className="text-[9px] font-mono text-amber-500/60 tracking-wide">
          {zh ? '当前屏幕高度较短，建议使用紧凑档' : 'Short screen — try compact for more content space'}
        </p>
      )}
    </div>
  );
}

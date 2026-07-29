import { useState } from 'react';
import { SYS_FONT, type Palette } from './CanvasEditorTypes';
import { CanvasStatsPanel, statButtonLabel, type StatKey } from './CanvasStatsPanel';

interface Props {
  words: number; chars: number; sentences: number; readSec: number;
  P: Palette; dark: boolean;
}

export function CanvasStatsPill({ words, chars, sentences, readSec, P, dark }: Props) {
  const [statsOpen,     setStatsOpen]     = useState(false);
  const [zoneHover,     setZoneHover]     = useState(false);
  const [pillHover,     setPillHover]     = useState(false);
  const [statsSelected, setStatsSelected] = useState<StatKey>('readtime');
  const [goal,          setGoal]          = useState(500);

  // 三层深度：靠近 → 浮现（浅），悬停 → 加深（中），点击 → 最深（实）
  const depth = statsOpen ? 'active' : pillHover ? 'hover' : zoneHover ? 'visible' : 'hidden';

  const pillStyle = (() => {
    const base = {
      position: 'absolute' as const, bottom: 10, right: 14,
      fontFamily: SYS_FONT, fontSize: 12,
      borderRadius: 7, padding: '4px 13px 4px 11px',
      display: 'flex', alignItems: 'center', gap: 6,
      cursor: 'pointer', userSelect: 'none' as const, letterSpacing: '-0.01em',
      transition: 'opacity 0.2s ease, transform 0.2s ease, background 0.15s ease, color 0.15s ease',
      pointerEvents: zoneHover ? 'auto' as const : 'none' as const,
    };

    if (dark) {
      const map = {
        hidden:  { opacity: 0,    transform: 'translateY(4px)', color: 'rgba(180,180,180,0.0)',  background: 'rgba(40,40,40,0.0)',  border: '0.5px solid transparent' },
        visible: { opacity: 1,    transform: 'translateY(0)',   color: 'rgba(180,180,180,0.45)', background: 'rgba(42,42,42,0.40)', border: '0.5px solid rgba(255,255,255,0.04)' },
        hover:   { opacity: 1,    transform: 'translateY(0)',   color: 'rgba(200,200,200,0.72)', background: 'rgba(50,50,50,0.70)', border: '0.5px solid rgba(255,255,255,0.07)' },
        active:  { opacity: 1,    transform: 'translateY(0)',   color: '#CCCCCC',                background: 'rgba(55,55,55,0.92)', border: '0.5px solid rgba(255,255,255,0.10)' },
      };
      return { ...base, ...map[depth] };
    } else {
      const map = {
        hidden:  { opacity: 0,    transform: 'translateY(4px)', color: 'rgba(60,60,60,0.0)',   background: 'rgba(210,210,210,0.0)',  border: '0.5px solid transparent' },
        visible: { opacity: 1,    transform: 'translateY(0)',   color: 'rgba(60,60,60,0.38)',  background: 'rgba(210,210,210,0.38)', border: '0.5px solid rgba(0,0,0,0.05)' },
        hover:   { opacity: 1,    transform: 'translateY(0)',   color: 'rgba(40,40,40,0.65)',  background: 'rgba(205,205,205,0.70)', border: '0.5px solid rgba(0,0,0,0.08)' },
        active:  { opacity: 1,    transform: 'translateY(0)',   color: 'rgba(25,25,25,0.90)',  background: 'rgba(190,190,190,0.90)', border: '0.5px solid rgba(0,0,0,0.13)' },
      };
      return { ...base, ...map[depth] };
    }
  })();

  return (
    <div
      onMouseEnter={e => { e.stopPropagation(); setZoneHover(true); }}
      onMouseLeave={() => { setZoneHover(false); setPillHover(false); setStatsOpen(false); }}
      style={{ position: 'absolute', bottom: 0, right: 0, width: 480, height: 96, zIndex: 15 }}>

      {statsOpen && (
        <CanvasStatsPanel
          words={words} chars={chars} sentences={sentences} readSec={readSec}
          goal={goal} setGoal={setGoal}
          selected={statsSelected} setSelected={setStatsSelected}
          P={P} dark={dark} />
      )}

      <div
        onMouseEnter={() => setPillHover(true)}
        onMouseLeave={() => setPillHover(false)}
        onClick={e => { e.stopPropagation(); setStatsOpen(o => !o); }}
        style={pillStyle}>
        {statButtonLabel(statsSelected, { words, chars, sentences, readSec, goal, selected: statsSelected })}
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none" style={{
          opacity: 0.6, flexShrink: 0,
          transform: statsOpen ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          <path d="M1 1L4 4L7 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
  );
}

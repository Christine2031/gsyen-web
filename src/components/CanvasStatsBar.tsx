/**
 * CanvasStatsBar — CANVAS 底部统计栏（弹窗 + 触发按钮）
 * open/closing 由父组件控制（父组件需要用于 ESC 拦截）。
 */
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

type StatMetric = 'chars' | 'words' | 'sentences' | 'reading';

interface Props {
  content:  string;
  dark:     boolean;
  fg:       string;
  dim:      string;
  bdr:      string;
  mono:     string;
  open:     boolean;
  closing:  boolean;
  onToggle: (e: React.MouseEvent) => void;
}

export function CanvasStatsBar({ content, dark, fg, dim, bdr, mono, open, closing, onToggle }: Props) {
  const [metric, setMetric] = useState<StatMetric>('words');

  const words     = content.trim().split(/\s+/).filter(Boolean).length;
  const chars     = content.length;
  const sentences = content.split(/[。！？\.\!\?]+/).filter(s => s.trim()).length;
  const totalSec  = Math.max(1, Math.round(chars / 5));
  const readMin   = Math.floor(totalSec / 60);
  const readSec   = totalSec % 60;

  const rows: { key: StatMetric; label: string }[] = [
    { key: 'chars',     label: `${chars} Chars` },
    { key: 'words',     label: `${words} Words` },
    { key: 'sentences', label: `${sentences} Sentences` },
    { key: 'reading',   label: `${readMin} min, ${readSec}sec Reading Time` },
  ];
  const label = rows.find(r => r.key === metric)?.label ?? `${words} Words`;

  return (
    <>
      {(open || closing) && (
        <div className="absolute bottom-10 right-4 z-20 rounded-xl overflow-hidden shadow-2xl"
          style={{
            background: dark ? '#242424' : '#F2F2F2',
            border: `1px solid ${bdr}`, minWidth: 260, fontFamily: mono,
            animation: closing
              ? 'statsSlideDown 0.20s cubic-bezier(0.4,0,1,1) forwards'
              : 'statsSlideUp 0.28s cubic-bezier(0.16,1,0.3,1)',
          }}>
          <style>{`
            @keyframes statsSlideUp   { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
            @keyframes statsSlideDown { from{opacity:1;transform:translateY(0)}    to{opacity:0;transform:translateY(16px)} }
          `}</style>
          {rows.map(({ key, label: rowLabel }) => {
            const checked = metric === key;
            return (
              <div key={key} onClick={() => setMetric(key)}
                className="flex items-center gap-3 px-5 py-3 cursor-pointer select-none"
                style={{ color: fg, fontSize: '14px', borderBottom: `1px solid ${bdr}`,
                  background: checked ? (dark ? '#303030' : '#E8E8E8') : 'transparent' }}
                onMouseEnter={e => { if (!checked) (e.currentTarget as HTMLElement).style.background = dark ? '#2C2C2C' : '#EBEBEB'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = checked ? (dark?'#303030':'#E8E8E8') : 'transparent'; }}>
                <span style={{ width:14, color:'#4488CC', fontSize:13, flexShrink:0 }}>{checked ? '✓' : ''}</span>
                {rowLabel}
              </div>
            );
          })}
          <div className="flex items-center gap-3 px-5 py-3 cursor-pointer select-none"
            style={{ color: dim, fontSize: '14px' }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = dark?'#2C2C2C':'#EBEBEB')}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}>
            <span style={{ width:14, color:'#4488CC', fontSize:13 }}>✓</span>
            Always Show
          </div>
        </div>
      )}
      <div className="absolute bottom-0 right-0 z-10 pb-2 pr-4">
        <button onClick={onToggle}
          className="flex items-center gap-1 px-3 py-1 rounded-full text-[13px]"
          style={{ fontFamily:mono, color:dim, background: open?(dark?'#2C2C2C':'#E8E8E8'):'transparent' }}
          onMouseEnter={e => (e.currentTarget.style.color = fg)}
          onMouseLeave={e => (e.currentTarget.style.color = dim)}>
          {label}
          <ChevronDown className="w-3 h-3"
            style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
      </div>
    </>
  );
}

import React, { useMemo } from 'react';

export interface RouteHealth {
  name:    string;
  region:  string;               // 地区标签，不暴露真实 IP
  active:  boolean;
  ping:    number | null;        // ms；null = 未配置
  uptime:  number;               // 0~100
  pattern: 'good' | 'wobble' | 'empty';
}

// 演示数据 — 等会员后台每 30s ping 写入 Supabase 后替换为真实读取
export const DEMO_HEALTH: RouteHealth[] = [
  { name: '穹弯·甲', region: 'US',   active: true,  ping: 38,  uptime: 99.8, pattern: 'good'   },
  { name: '穹弯·乙', region: 'US',   active: false, ping: 142, uptime: 97.2, pattern: 'wobble' },
  { name: '穹弯·丙', region: '待配置', active: false, ping: null, uptime: 0,   pattern: 'empty'  },
  { name: '穹弯·丁', region: '待配置', active: false, ping: null, uptime: 0,   pattern: 'empty'  },
];

const UP = '#1E9E5A', DEGRADE = '#E8A33D', DOWN = '#D93025', EMPTY = '#E4E6E9';
const BAR_COUNT = 60;

// 确定性伪随机，避免每次渲染重排（种子来自条索引 + 线路名）
function seeded(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function barColor(pattern: RouteHealth['pattern'], seed: number): string {
  if (pattern === 'empty') return EMPTY;
  const r = seeded(seed);
  if (pattern === 'good')   return r < 0.03 ? DEGRADE : UP;
  // wobble
  return r < 0.08 ? DOWN : r < 0.2 ? DEGRADE : UP;
}

interface RowProps {
  r:           RouteHealth;
  idx:         number;
  selectable?: boolean;           // 桌面端：可点击切换
  switching?:  boolean;           // 该条正在切换中
  onSelect?:   (idx: number) => void;
}

function HealthRow({ r, idx, selectable, switching, onSelect }: RowProps) {
  const bars = useMemo(
    () => Array.from({ length: BAR_COUNT }, (_, i) => barColor(r.pattern, idx * 1000 + i + 1)),
    [r.pattern, idx],
  );
  const dotColor = r.pattern === 'empty' ? '#9AA0A6' : UP;
  // 可点击：桌面端、非激活、已配置
  const clickable = !!selectable && !r.active && r.pattern !== 'empty' && !switching;

  return (
    <div
      role={clickable ? 'button' : undefined}
      onClick={clickable ? () => onSelect?.(idx) : undefined}
      className={`bg-white rounded-lg px-4 py-3.5 transition-all border ${
        r.active ? 'border-[#1A73E8] shadow-[inset_0_0_0_1px_#1A73E8]' : 'border-[#DADCE0]'
      } ${clickable ? 'cursor-pointer hover:border-[#1A73E8] hover:shadow-sm' : ''}`}
    >
      {/* 头行 */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2.5">
          <span className="w-2 h-2 rounded-full" style={{ background: dotColor }} />
          <span className="text-(--fs-lg) font-medium text-[#202124] font-sans">{r.name}</span>
          <span className="text-(--fs-md) font-mono text-[#9AA0A6]">{r.region}</span>
        </div>
        <div className="flex items-center gap-3.5 font-mono text-(--fs-md)">
          {r.ping !== null && <span className="text-[#5F6368]">{r.ping}ms</span>}
          {r.pattern !== 'empty'
            ? <span className="text-[#137333] font-bold">{r.uptime.toFixed(1)}%</span>
            : <span className="text-[#9AA0A6]">未配置</span>}
          {r.active && (
            <span className="bg-[#E6F4EA] text-[#137333] text-(--fs-xs) font-bold tracking-widest px-2 py-0.5 rounded-full">
              ACTIVE
            </span>
          )}
          {switching && (
            <span className="bg-[#FEF7E0] text-[#B05E00] text-(--fs-xs) font-bold tracking-widest px-2 py-0.5 rounded-full">
              切换中…
            </span>
          )}
          {clickable && (
            <span className="text-[#1A73E8] text-(--fs-xs) font-bold tracking-widest uppercase">切换 ›</span>
          )}
        </div>
      </div>

      {/* uptime 条 */}
      <div className="flex gap-[2px]">
        {bars.map((c, i) => (
          <div key={i} className="flex-1 h-[26px] rounded-[2px]" style={{ background: c }} />
        ))}
      </div>
    </div>
  );
}

interface Props {
  data?:      RouteHealth[];
  selectable?: boolean;          // 桌面端开启点击切换
  switching?:  number | null;    // 正在切换的索引
  onSelect?:   (idx: number) => void;
}

export default function PrismStability({ data = DEMO_HEALTH, selectable, switching, onSelect }: Props) {
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <span className="text-(--fs-sm) font-mono font-bold tracking-[0.18em] uppercase text-[#1A1A1A]/50">
          线路稳定性{selectable ? ' · 点击切换' : ' · 近 90 次心跳'}
        </span>
        <span className="text-(--fs-sm) font-mono tracking-[0.12em] text-[#1A1A1A]/40">每 30s 一次</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {data.map((r, i) => (
          <HealthRow
            key={r.name} r={r} idx={i}
            selectable={selectable}
            switching={switching === i}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

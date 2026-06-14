import React, { useMemo } from 'react';

export interface QuotaData {
  limitGB:    number;   // 月额度，默认 200
  tokenGB:    number;   // token 消耗折算 GB
  routeGB:    number;   // 线路流量 GB
  tokens:     number;   // 原始 token 数（展示用）
  resetLabel: string;   // 重置日，如 "7月1日"
  blocks:     number[]; // 当月每 5 小时一格 token 消耗等级 0~4，铺满整月
}

// 当月 5 小时格子数：天数 × 24 / 5
const _now = new Date();
const _daysInMonth = new Date(_now.getFullYear(), _now.getMonth() + 1, 0).getDate();
const TOTAL_BLOCKS = Math.round((_daysInMonth * 24) / 5);
// 已过去的格子数（到此刻为止）
const ELAPSED_BLOCKS = Math.floor(((_now.getDate() - 1) * 24 + _now.getHours()) / 5);

// 演示数据 — 等会员后台接真实计量后替换
export const DEMO_QUOTA: QuotaData = {
  limitGB: 200,
  tokenGB: 38.2,
  routeGB: 104.1,
  tokens: 2_400_000,
  resetLabel: '7月1日',
  // 每 5 小时一格，已过去的格子有用量（0~4），未到的留空
  blocks: Array.from({ length: TOTAL_BLOCKS }, (_, i) => {
    if (i >= ELAPSED_BLOCKS) return 0;
    const x = Math.sin((i + 1) * 12.9898) * 43758.5453;
    const r = x - Math.floor(x);
    return Math.floor(r * r * 5); // 平方偏向小值
  }),
};

const HEAT = ['#EBEDF0', '#D2E3FA', '#A8C7F0', '#5FA0EC', '#1A73E8'];

export default function PrismQuota({ data = DEMO_QUOTA }: { data?: QuotaData }) {
  const usedGB    = data.tokenGB + data.routeGB;
  const pct       = Math.min(100, (usedGB / data.limitGB) * 100);
  const tokenPct  = (data.tokenGB / data.limitGB) * 100;
  const routePct  = (data.routeGB / data.limitGB) * 100;
  const remainGB  = Math.max(0, data.limitGB - usedGB);
  const near      = pct >= 90;

  // 每 7 格一列纵向排布（密集方块）
  const columns = useMemo(() => {
    const cols: number[][] = [];
    for (let c = 0; c * 7 < data.blocks.length; c++) cols.push(data.blocks.slice(c * 7, c * 7 + 7));
    return cols;
  }, [data.blocks]);

  const tokensLabel = data.tokens >= 1_000_000
    ? `${(data.tokens / 1_000_000).toFixed(1)}M`
    : `${Math.round(data.tokens / 1000)}K`;

  return (
    <div className="flex flex-col gap-4">
      {/* 顶栏标题 */}
      <div className="flex items-center justify-between">
        <span className="text-(--fs-sm) font-mono font-bold tracking-[0.18em] uppercase text-[#1A1A1A]/50">
          穹弯算筹 · 本月配额
        </span>
        <span className="text-(--fs-sm) font-mono tracking-[0.12em] text-[#1A1A1A]/40">
          {data.resetLabel} 重置
        </span>
      </div>

      {/* 流量剩余进度条 */}
      <div className="bg-white rounded-xl border border-[#DADCE0] px-6 py-5">
        <div className="flex items-baseline gap-2 mb-4">
          <span className="text-[42px] font-medium leading-none tracking-tight text-[#202124] font-sans">
            {usedGB.toFixed(1)}
          </span>
          <span className="text-[16px] text-[#5F6368] font-sans">/ {data.limitGB} GB</span>
          <span className={`ml-auto font-mono text-(--fs-md) font-bold tracking-[0.1em] ${near ? 'text-[#D93025]' : 'text-[#1A73E8]'}`}>
            {Math.round(pct)}%
          </span>
        </div>

        <div className="h-2.5 rounded-full bg-[#EBEDF0] overflow-hidden flex">
          <div style={{ width: `${tokenPct}%`, background: '#1A73E8' }} />
          <div style={{ width: `${routePct}%`, background: '#5FA0EC' }} />
        </div>

        <div className="flex items-center justify-between mt-3.5">
          <div className="flex gap-[18px] text-(--fs-base)">
            <span className="flex items-center gap-1.5 text-[#5F6368]">
              <span className="w-2 h-2 rounded-sm" style={{ background: '#1A73E8' }} />Token 消耗
            </span>
            <span className="flex items-center gap-1.5 text-[#5F6368]">
              <span className="w-2 h-2 rounded-sm" style={{ background: '#5FA0EC' }} />线路流量
            </span>
          </div>
          <span className={`text-(--fs-base) font-medium ${near ? 'text-[#D93025]' : 'text-[#137333]'}`}>
            剩余 {remainGB.toFixed(1)} GB
          </span>
        </div>
      </div>

      {/* 明细：Token 热图 + 线路流量 */}
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        {/* Token 热图（Claude 格子） */}
        <div className="bg-white rounded-xl border border-[#DADCE0] px-5 py-4">
          <div className="flex items-center justify-between mb-4">
            <span className="text-(--fs-sm) font-mono font-bold tracking-[0.12em] uppercase text-[#5F6368]">
              Token 消耗 · 每 5 小时
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[18px] font-medium text-[#202124] font-sans">{data.tokenGB} GB</span>
              <span className="text-(--fs-md) text-[#5F6368] font-mono">{tokensLabel}</span>
            </div>
          </div>

          <div className="flex gap-[3px]">
            {columns.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[3px] flex-1">
                {col.map((lvl, ri) => (
                  <div key={ri} className="aspect-square rounded-[2px]" style={{ background: HEAT[lvl] }} />
                ))}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-1.5 mt-3 text-(--fs-sm) text-[#5F6368]">
            <span>少</span>
            {HEAT.map(c => <span key={c} className="w-[11px] h-[11px] rounded-[2px]" style={{ background: c }} />)}
            <span>多</span>
          </div>
        </div>

        {/* 线路流量 */}
        <div className="bg-white rounded-xl border border-[#DADCE0] px-5 py-4 flex flex-col">
          <div className="flex items-center gap-2.5 mb-3">
            <span className="text-(--fs-sm) font-mono font-bold tracking-[0.12em] uppercase text-[#5F6368]">
              线路流量
            </span>
          </div>
          <span className="text-[22px] font-medium text-[#202124] font-sans">{data.routeGB} GB</span>
          <span className="text-(--fs-base) text-[#5F6368] mt-1">穹弯代理 · 本月浏览</span>
        </div>
      </div>
    </div>
  );
}

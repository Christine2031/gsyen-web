import React, { useState, useEffect, useCallback } from 'react';
import PrismQuota from './PrismQuota';
import PrismStability, { RouteHealth, DEMO_HEALTH } from './PrismStability';
import PrismKeyInput from './PrismKeyInput';

interface NodeInfo {
  index:      number;
  name:       string;
  address:    string | null;
  active:     boolean;
  configured: boolean;
}

const api = (window as any).electronAPI?.v2ray as {
  getNodes:  () => Promise<NodeInfo[]>;
  getStatus: () => Promise<unknown>;
  switch:    (i: number) => Promise<{ ok: boolean; name?: string; error?: string }>;
} | undefined;

// 合并真实节点状态（active/configured）与演示心跳数据（ping/uptime/pattern）
function mergeHealth(nodes: NodeInfo[]): RouteHealth[] {
  return nodes.map((n, i) => {
    const demo = DEMO_HEALTH[i];
    return {
      name:    n.name,
      region:  n.configured ? 'US' : '待配置',
      active:  n.active,
      ping:    n.configured ? (demo?.ping ?? 38) : null,
      uptime:  n.configured ? (demo?.uptime ?? 99.5) : 0,
      pattern: n.configured ? (demo?.pattern ?? 'good') : 'empty',
    };
  });
}

export default function PrismRoutes() {
  const [health,    setHealth]    = useState<RouteHealth[]>(DEMO_HEALTH);
  const [switching, setSwitching] = useState<number | null>(null);
  const [realCount, setRealCount] = useState(0); // 真实已配置线路数（密钥激活后 > 0）

  const refresh = useCallback(async () => {
    if (!api) return;
    const nodes = await api.getNodes();
    setRealCount(nodes.filter(n => n.configured).length);
    // 真实节点为空（如未粘贴密钥）时，保留演示数据，面板不空
    if (nodes.length) setHealth(mergeHealth(nodes));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function handleSelect(index: number) {
    if (!api || switching !== null) return;
    setSwitching(index);
    await api.switch(index);
    await refresh();
    setSwitching(null);
  }

  const connected = realCount > 0;

  return (
    <div className="flex-1 overflow-y-auto pt-6 pb-8 min-h-0">
      <div className="flex flex-col gap-8 max-w-[760px]">
        {/* 军工密钥激活入口 — 仅 Electron 渲染；连接态变化时重挂以重置展开状态 */}
        <PrismKeyInput
          key={connected ? 'on' : 'off'}
          connected={connected}
          count={realCount}
          onActivated={refresh}
        />
        <PrismQuota />
        <PrismStability
          data={health}
          selectable={!!api}
          switching={switching}
          onSelect={handleSelect}
        />
      </div>
    </div>
  );
}

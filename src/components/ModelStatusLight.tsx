import { useModelHealth } from '../hooks/useModelHealth';
import { ModelId } from '../config/models';

export function ModelStatusLight({ selectedModel }: { selectedModel: ModelId }) {
  const health = useModelHealth(selectedModel);

  const statusText = health.status === 'online'
    ? 'SYSTEM GATEWAY IS ALIVE'
    : health.status === 'checking'
    ? 'SYSTEM GATEWAY IS CHECKING...'
    : `${health.error || 'GSYEN MODEL OFFLINE'}`;

  const lightStyle = {
    online: {
      background: 'radial-gradient(circle at 50% 50%, #86efac 40%, #16a34a 60%, #14532d)',
      boxShadow: 'inset -1px -1px 0px rgba(0,0,0,0.5), 0 0 8px rgba(74,222,128,0.9), 0 0 16px rgba(74,222,128,0.3)',
      border: '1px solid rgba(74,222,128,0.6)',
      animation: 'gsyen-breathe 2.4s ease-in-out infinite',
    },
    checking: {
      background: 'radial-gradient(circle at 50% 50%, #fbbf24 40%, #f59e0b 60%, #d97706)',
      boxShadow: 'inset -1px -1px 0px rgba(0,0,0,0.3), 0 0 8px rgba(245,158,11,0.7), 0 0 16px rgba(245,158,11,0.2)',
      border: '1px solid rgba(245,158,11,0.6)',
      animation: 'gsyen-breathe 2.4s ease-in-out infinite',
    },
    offline: {
      background: 'radial-gradient(circle at 38% 32%, #aaa 0%, #777 45%, #555 100%)',
      border: '2px solid rgba(255,255,255,0.7)',
      boxShadow: '0 0 6px rgba(255,255,255,0.2), 0 0 3px rgba(150,150,150,0.3), inset 0 1px 1px rgba(255,255,255,0.08)',
    },
  }[health.status];

  return (
    <span className="flex items-center gap-1">
      <span className="w-2 h-2 rounded-full transition-all" style={lightStyle as React.CSSProperties} />
      {statusText}
    </span>
  );
}

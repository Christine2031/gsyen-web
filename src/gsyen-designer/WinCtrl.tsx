/**
 * GSYEN Designer (gd) — WinCtrl
 * 窗口控制按钮，light/dark 两种配色，不依赖 Canvas Palette。
 */
import { MinIcon, MaxIcon, CloseIcon } from './icons';

interface WinCtrlButtonProps {
  action: 'minimize' | 'maximize' | 'close';
  dark?: boolean;
  /** true = 关窗语义（背景红，× 白）；false = 导航语义（普通灰）*/
  redClose?: boolean;
  onClick: () => void;
  title?: string;
}

const ICON = { minimize: MinIcon, maximize: MaxIcon, close: CloseIcon };

export function WinCtrlButton({ action, dark = false, redClose = false, onClick, title }: WinCtrlButtonProps) {
  const isRedClose = action === 'close' && redClose;
  const idle    = dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
  const hover   = isRedClose ? 'rgba(255,255,255,0.90)' : (dark ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.75)');
  const hoverBg = isRedClose ? '#C42B1C' : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)');
  const Icon = ICON[action];
  return (
    <button title={title} onClick={onClick}
      style={{ width:32, height:22, margin:'0 3px', display:'flex', alignItems:'center', justifyContent:'center',
        color:idle, background:'transparent', border:'none', borderRadius:4,
        cursor:'pointer', flexShrink:0, transition:'background 0.18s, color 0.18s', userSelect:'none' }}
      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background=hoverBg; el.style.color=hover; }}
      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background='transparent'; el.style.color=idle; }}>
      <Icon />
    </button>
  );
}

interface WinCtrlGroupProps {
  dark?: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose:    () => void;
  closeTitle?: string;
}

export function WinCtrlGroup({ dark = false, onMinimize, onMaximize, onClose, closeTitle = 'Close' }: WinCtrlGroupProps) {
  return (
    <div style={{ display:'flex', alignItems:'center' }}>
      <WinCtrlButton action="minimize" dark={dark} onClick={onMinimize} title="Minimize" />
      <WinCtrlButton action="maximize" dark={dark} onClick={onMaximize} title="Maximize" />
      <WinCtrlButton action="close"    dark={dark} onClick={onClose}    title={closeTitle} />
    </div>
  );
}

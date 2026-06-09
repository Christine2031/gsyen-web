/** CanvasEditorUI — Dropdown + WinCtrl（模块层定义，避免 render 时重建组件类型） */
import { Palette, MenuItem, SYS_FONT } from './CanvasEditorTypes';

interface DropdownProps {
  items: (MenuItem | '---')[];
  P: Palette; dark: boolean;
}
export function Dropdown({ items, P, dark }: DropdownProps) {
  return (
    <div style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 300,
      background: P.menuBg, border: `1px solid ${P.menuBorder}`,
      borderRadius: 4, minWidth: 240, padding: '3px 0', marginTop: 1,
      boxShadow: dark
        ? '0 4px 24px rgba(0,0,0,0.75),0 1px 4px rgba(0,0,0,0.5)'
        : '0 4px 24px rgba(0,0,0,0.14),0 1px 4px rgba(0,0,0,0.08)',
    }}>
      {items.map((item, i) =>
        item === '---'
          ? <div key={i} style={{ height: 1, background: P.menuSep, margin: '3px 0' }} />
          : (
            <div key={i}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '5px 16px 5px 36px', fontSize: 13, fontFamily: SYS_FONT,
                color: item.disabled ? P.dim : P.menuFgHover,
                cursor: item.disabled ? 'default' : 'pointer',
                userSelect: 'none', position: 'relative', gap: 24,
              }}
              onClick={e => { e.stopPropagation(); if (!item.disabled && item.action) item.action(); }}
              onMouseEnter={e => { if (!item.disabled) (e.currentTarget as HTMLElement).style.background = P.menuHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
              {item.checked !== undefined && (
                <span style={{ position: 'absolute', left: 14, color: P.accent, fontSize: 12, lineHeight: '1' }}>
                  {item.checked ? '✓' : ''}
                </span>
              )}
              <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{item.label}</span>
              {item.shortcut && (
                <span style={{ color: P.dim, fontSize: 12, whiteSpace: 'nowrap', flexShrink: 0 }}>
                  {item.shortcut}
                </span>
              )}
            </div>
          )
      )}
    </div>
  );
}

interface WinCtrlProps {
  sym: string; title?: string; onClick: () => void;
  danger?: boolean; P: Palette; dark: boolean;
}
export function WinCtrl({ sym, title: tip, onClick, danger, P, dark }: WinCtrlProps) {
  return (
    <button title={tip} onClick={onClick}
      style={{
        width: 46, height: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: SYS_FONT, fontSize: 14,
        color: P.menuFg, background: 'transparent', border: 'none',
        cursor: 'pointer', flexShrink: 0, transition: 'background 0.1s,color 0.1s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = danger ? '#C42B1C' : (dark ? '#3A3636' : '#D8D4CF');
        el.style.color = danger ? '#FFFFFF' : P.menuFgHover;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = 'transparent';
        el.style.color = P.menuFg;
      }}>
      {sym}
    </button>
  );
}

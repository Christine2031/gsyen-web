/** CanvasEditorUI — Dropdown + WinCtrl（模块层定义，避免 render 时重建组件类型） */
import React from 'react';
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
                padding: '5px 16px 5px 36px', fontSize: 14, fontWeight: 500, fontFamily: SYS_FONT,
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

const MinIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <line x1="2" y1="5.5" x2="9" y2="5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const MaxIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <rect x="1" y="1" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
  </svg>
);
const CloseIcon = () => (
  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
    <line x1="2" y1="2" x2="9" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="9" y1="2" x2="2" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);
const WIN_ICON: Record<string, React.FC> = { '–': MinIcon, '□': MaxIcon, '×': CloseIcon };

interface WinCtrlProps {
  sym: string; title?: string; onClick: () => void;
  danger?: boolean; P: Palette; dark: boolean;
}
export function WinCtrl({ sym, title: tip, onClick, danger, P, dark }: WinCtrlProps) {
  const idle = dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
  const Icon = WIN_ICON[sym] ?? (() => <span>{sym}</span>);
  return (
    <button title={tip} onClick={onClick}
      style={{
        width: 32, height: 22, margin: '0 3px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: idle, background: 'transparent', border: 'none', borderRadius: 4,
        cursor: 'pointer', flexShrink: 0, transition: 'background 0.18s, color 0.18s',
      }}
      onMouseEnter={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';
        el.style.color = P.menuFgHover;
      }}
      onMouseLeave={e => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = 'transparent';
        el.style.color = idle;
      }}>
      <Icon />
    </button>
  );
}

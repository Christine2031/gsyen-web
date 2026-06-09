/**
 * CanvasChrome — CANVAS 编辑器顶部 Chrome（标题栏 + 菜单栏）
 * 由 CanvasEditorContent 控制显隐动画，本组件只负责渲染。
 */
import { useRef } from 'react';
import { Dropdown, WinCtrl } from './CanvasEditorUI';
import {
  Palette, MenuSpec, MenuId, EditorMode,
  TITLE_H, MENU_H, SYS_FONT, isElectron,
} from './CanvasEditorTypes';

interface Props {
  /* title bar */
  title: string; titleEdit: boolean;
  onTitleChange: (v: string) => void;
  setTitleEdit:  (v: boolean) => void;
  titleInputRef: React.RefObject<HTMLInputElement>;
  /* menu bar */
  menus:       MenuSpec[];
  activeMenu:  MenuId;
  setActiveMenu: (v: MenuId | ((p: MenuId) => MenuId)) => void;
  mode:        EditorMode;
  setMode:     (m: EditorMode | ((p: EditorMode) => EditorMode)) => void;
  docType:     'doc' | 'canvas';
  /* style */
  P: Palette; dark: boolean;
  onMouseEnter: () => void;
  menuBarRef:  React.RefObject<HTMLDivElement>;
}

export function CanvasChrome({
  title, titleEdit, onTitleChange, setTitleEdit, titleInputRef,
  menus, activeMenu, setActiveMenu, mode, setMode, docType,
  P, dark, onMouseEnter, menuBarRef,
}: Props) {

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div onMouseEnter={onMouseEnter}>
      {/* ─ Title bar ─ */}
      <div style={{ height: TITLE_H, background: P.chrome, borderBottom: `1px solid ${P.border}`,
        display: 'flex', alignItems: 'center',
        ...(isElectron ? { WebkitAppRegion: 'drag' } as React.CSSProperties : {}) }}>

        {/* Sidebar icon */}
        <button onClick={stopProp}
          style={{ width: 42, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: P.menuFg, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0,
            ...(isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : {}) }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = P.menuFgHover}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = P.menuFg}>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
            <rect x="0.5" y="0.5" width="5"  height="11" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="7.5" y="0.5" width="8"  height="11" rx="1" stroke="currentColor" strokeWidth="1.2"/>
          </svg>
        </button>

        {/* Title */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }} onClick={stopProp}>
          {titleEdit ? (
            <input ref={titleInputRef} value={title} onChange={e => onTitleChange(e.target.value)}
              onBlur={() => setTitleEdit(false)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setTitleEdit(false); }}
              style={{ background: 'transparent', border: 'none', outline: 'none', fontFamily: SYS_FONT,
                fontSize: 13, color: P.fg, textAlign: 'center', width: '100%', maxWidth: 440,
                ...(isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : {}) }} />
          ) : (
            <span title="双击编辑标题" onDoubleClick={() => setTitleEdit(true)}
              style={{ fontFamily: SYS_FONT, fontSize: 13, color: P.menuFg, userSelect: 'none',
                letterSpacing: '0.01em', cursor: 'text', maxWidth: 440,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title || '无标题'}&nbsp;— CANVAS
            </span>
          )}
        </div>

        {/* Window controls */}
        <div className="flex items-stretch h-full"
          style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : {}}>
          {isElectron ? (
            <>
              <WinCtrl sym="–" title="Minimize" P={P} dark={dark} onClick={() => (window as any).electronAPI.window.minimize()} />
              <WinCtrl sym="□" title="Maximize" P={P} dark={dark} onClick={() => (window as any).electronAPI.window.maximize()} />
              <WinCtrl sym="×" title="Close"    P={P} dark={dark} onClick={() => (window as any).electronAPI.window.close()} danger />
            </>
          ) : (
            <WinCtrl sym="×" title="关闭 Esc" P={P} dark={dark}
              onClick={() => { setActiveMenu(null); /* onClose handled by parent Esc */ }} danger />
          )}
        </div>
      </div>

      {/* ─ Menu bar ─ */}
      {docType === 'doc' && (
        <div ref={menuBarRef} onClick={stopProp}
          style={{ height: MENU_H, background: P.chrome, borderBottom: `1px solid ${P.border}`,
            display: 'flex', alignItems: 'stretch' }}>
          <div className="flex items-stretch" style={{ flex: 1 }}>
            {menus.map(menu => (
              <div key={menu.id as string} style={{ position: 'relative' }}>
                <button style={{
                  height: '100%', padding: '0 11px', fontFamily: SYS_FONT, fontSize: 13,
                  color: activeMenu === menu.id ? P.menuFgHover : P.menuFg,
                  background: activeMenu === menu.id ? (dark ? '#2E2A2A' : '#E2DED8') : 'transparent',
                  border: 'none', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (activeMenu !== null) setActiveMenu(menu.id); (e.currentTarget as HTMLElement).style.color = P.menuFgHover; }}
                onMouseLeave={e => { if (activeMenu !== menu.id) (e.currentTarget as HTMLElement).style.color = P.menuFg; }}
                onClick={e => { e.stopPropagation(); setActiveMenu(a => a === menu.id ? null : menu.id); }}>
                  {menu.label}
                </button>
                {activeMenu === menu.id && <Dropdown items={menu.items} P={P} dark={dark} />}
              </div>
            ))}
          </div>

          {/* ▷ preview toggle */}
          <button title="Preview (Ctrl+P)" onClick={() => setMode(m => m === 'preview' ? 'write' : 'preview')}
            style={{ width: 40, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: mode !== 'write' ? P.accent : P.menuFg, background: 'transparent', border: 'none',
              cursor: 'pointer', borderLeft: `1px solid ${P.border}`, transition: 'color 0.1s' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = P.menuFgHover}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = mode !== 'write' ? P.accent : P.menuFg}>
            <svg width="9" height="11" viewBox="0 0 9 11" fill="currentColor"><path d="M0 0L9 5.5L0 11V0Z"/></svg>
          </button>
        </div>
      )}
    </div>
  );
}

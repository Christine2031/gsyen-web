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
  docType:     'doc' | 'canvas' | 'nodes';
  setDocType:  (t: 'doc' | 'canvas' | 'nodes') => void;
  onAddCard?:  () => void;
  onClose:     () => void;
  /* style */
  P: Palette; dark: boolean;
  onMouseEnter: () => void;
  menuBarRef:  React.RefObject<HTMLDivElement>;
}

// 模式图标 SVG
const DocIcon  = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="1" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><line x1="3.5" y1="4" x2="9.5" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="3.5" y1="6.5" x2="9.5" y2="6.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="3.5" y1="9" x2="7.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
const DrawIcon = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 10.5L4 6L8 8L10.5 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><circle cx="10.5" cy="2.5" r="1.2" stroke="currentColor" strokeWidth="1.5"/></svg>;
const NodeIcon = () => <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="1" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><rect x="8" y="1" width="4" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><rect x="4" y="9" width="5" height="3" rx="1" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><line x1="3" y1="4" x2="6.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1.5 1.5"/><line x1="10" y1="4" x2="6.5" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="1.5 1.5"/></svg>;

export function CanvasChrome({
  title, titleEdit, onTitleChange, setTitleEdit, titleInputRef,
  menus, activeMenu, setActiveMenu, mode, setMode, docType,
  setDocType, onAddCard, onClose,
  P, dark, onMouseEnter, menuBarRef,
}: Props) {

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div onMouseEnter={onMouseEnter}>
      {/* ─ Title bar ─ */}
      <div style={{ height: TITLE_H, background: P.chrome,
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
            <rect x="0.75" y="0.75" width="14.5" height="10.5" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
            <line x1="5.25" y1="0.75" x2="5.25" y2="11.25" stroke="currentColor" strokeWidth="1.5"/>
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
              style={{ fontFamily: SYS_FONT, fontSize: 14, fontWeight: 500, color: P.menuFg, userSelect: 'none',
                letterSpacing: '0.01em', cursor: 'text', maxWidth: 440,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title || '无标题'}.md&nbsp;— GSYEN Writer
            </span>
          )}
        </div>

        {/* Mode switcher — 3 icons always visible */}
        <div onClick={stopProp} style={{ display:'flex', alignItems:'center', gap:2, marginRight:6,
          ...(isElectron ? { WebkitAppRegion:'no-drag' } as React.CSSProperties : {}) }}>
          {(['doc','canvas','nodes'] as const).map(type => {
            const active = docType === type;
            const Icon = type === 'doc' ? DocIcon : type === 'canvas' ? DrawIcon : NodeIcon;
            const label = type === 'doc' ? 'Document' : type === 'canvas' ? 'Whiteboard' : 'Node Canvas';
            return (
              <button key={type} title={label}
                onClick={() => { if (!active) setDocType(type); }}
                style={{ width:26, height:22, display:'flex', alignItems:'center', justifyContent:'center',
                  border:'none', borderRadius:4, cursor: active ? 'default' : 'pointer',
                  background: active ? (dark ? '#3a3a3a' : '#E0E0E0') : 'transparent',
                  color: active ? P.accent : P.menuFg, transition:'all 0.15s' }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = P.menuFgHover; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = P.menuFg; }}>
                <Icon />
              </button>
            );
          })}
        </div>

        {/* Electron: – □ 管窗口，× 退回 Chat；web: 只有 × */}
        <div className="flex items-center"
          style={isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : {}}>
          {isElectron && (
            <>
              <WinCtrl sym="–" title="Minimize" P={P} dark={dark} onClick={() => (window as any).electronAPI.window.minimize()} />
              <WinCtrl sym="□" title="Maximize" P={P} dark={dark} onClick={() => (window as any).electronAPI.window.maximize()} />
            </>
          )}
          <WinCtrl sym="×" title="退回 Chat  Esc" P={P} dark={dark} onClick={onClose} danger />
        </div>
      </div>

      {/* ─ Menu/action bar ─ */}
      {docType === 'doc' && (
        <div ref={menuBarRef} onClick={stopProp}
          style={{ height: MENU_H, background: P.chrome, borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)'}`,
            display: 'flex', alignItems: 'stretch' }}>
          <div className="flex items-stretch" style={{ flex: 1 }}>
            {menus.map(menu => (
              <div key={menu.id as string} style={{ position: 'relative' }}>
                <button style={{
                  height: '100%', padding: '0 11px', fontFamily: SYS_FONT, fontSize: 14, fontWeight: 500,
                  color: activeMenu === menu.id ? P.menuFgHover : P.menuFg,
                  background: activeMenu === menu.id ? (dark ? '#2E2A2A' : '#E2E2E2') : 'transparent',
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
              cursor: 'pointer', transition: 'color 0.1s' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = P.menuFgHover}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = mode !== 'write' ? P.accent : P.menuFg}>
            <svg width="15" height="17" viewBox="0 0 15 17" fill="none"><path d="M2 1.5L12.5 7.5Q14 8.5 12.5 9.5L2 15.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/></svg>
          </button>
        </div>
      )}

      {/* ─ Non-doc action bar ─ */}
      {docType !== 'doc' && (
        <div onClick={stopProp}
          style={{ height: MENU_H, background: P.chrome,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px' }}>
          <span style={{ fontFamily: SYS_FONT, fontSize: 11, color: P.dim }}>
            {docType === 'canvas' ? 'Whiteboard · Excalidraw' : 'Node Canvas · 拖拽连线，双击编辑'}
          </span>
          {docType === 'nodes' && onAddCard && (
            <button onClick={onAddCard}
              style={{ background: P.accent, color: '#fff', border: 'none', borderRadius: 5,
                padding: '3px 12px', fontSize: 12, cursor: 'pointer',
                fontFamily: SYS_FONT, fontWeight: 500, letterSpacing: '0.01em' }}>
              + 卡片
            </button>
          )}
        </div>
      )}
    </div>
  );
}

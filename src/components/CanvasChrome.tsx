/**
 * CanvasChrome — 编辑区顶栏（iA Writer 精确复刻）
 * Library/DocList 头部已移入各自面板，Chrome 只负责编辑区
 */
import { useRef } from 'react';
import { Dropdown } from './CanvasEditorUI';
import { WinCtrlButton, SidebarIcon, PreviewIcon } from '../gsyen-designer';
import { useIsMaximized } from '../hooks/useIsMaximized';
import { useIsFullscreen } from '../hooks/useIsFullscreen';
import {
  Palette, MenuSpec, MenuId, EditorMode,
  TITLE_H, MENU_H, SYS_FONT, isElectron, isMac,
} from './CanvasEditorTypes';

interface Props {
  title: string; titleEdit: boolean;
  onTitleChange: (v: string) => void;
  setTitleEdit:  (v: boolean) => void;
  titleInputRef: React.RefObject<HTMLInputElement>;
  menus:         MenuSpec[];
  activeMenu:    MenuId;
  setActiveMenu: (v: MenuId | ((p: MenuId) => MenuId)) => void;
  mode:          EditorMode;
  setMode:       (m: EditorMode | ((p: EditorMode) => EditorMode)) => void;
  docType:       'doc' | 'canvas' | 'nodes' | 'image' | 'office';
  onAddCard?:    () => void;
  onClose:       () => void;
  sidebarOpen:    boolean;
  onSidebarToggle:() => void;
  P: Palette; dark: boolean;
  onMouseEnter: () => void;
  menuBarRef:   React.RefObject<HTMLDivElement>;
}

export function CanvasChrome({
  title, titleEdit, onTitleChange, setTitleEdit, titleInputRef,
  menus, activeMenu, setActiveMenu, mode, setMode, docType,
  onAddCard, onClose,
  sidebarOpen, onSidebarToggle,
  P, dark, onMouseEnter, menuBarRef,
}: Props) {
  const stopProp  = (e: React.MouseEvent) => e.stopPropagation();
  const maximized   = useIsMaximized();
  const fullscreen  = useIsFullscreen();

  const nodrag = isElectron ? { WebkitAppRegion: 'no-drag' } as React.CSSProperties : {};
  const drag   = isElectron ? { WebkitAppRegion: 'drag'    } as React.CSSProperties : {};

  const iconBtn: React.CSSProperties = {
    padding: 4, background: 'transparent', border: 'none', cursor: 'pointer',
    color: P.dim, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    ...nodrag,
  };

  return (
    <div onMouseEnter={onMouseEnter}>

      {/* ══ Row 1: Title bar ══════════════════════════════════════════════════ */}
      <div style={{ height: TITLE_H, background: P.chrome, display: 'flex', alignItems: 'center',
        paddingLeft: isMac && !maximized && !fullscreen && !sidebarOpen ? 70 : 0, ...drag }}>

        {/* [□] sidebar toggle */}
        <button onClick={e => { e.stopPropagation(); onSidebarToggle(); }}
          style={{ width: 42, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: sidebarOpen ? P.menuFgHover : P.menuFg,
            background: sidebarOpen ? `${P.fg}0A` : 'transparent',
            border: 'none', cursor: 'pointer', flexShrink: 0, ...nodrag }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = P.menuFgHover}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = sidebarOpen ? P.menuFgHover : P.menuFg}>
          <SidebarIcon />
        </button>

        {/* Title */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }} onClick={stopProp}>
          {titleEdit ? (
            <input ref={titleInputRef} value={title} onChange={e => onTitleChange(e.target.value)}
              onBlur={() => setTitleEdit(false)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setTitleEdit(false); }}
              style={{ background: 'transparent', border: 'none', outline: 'none', fontFamily: SYS_FONT,
                fontSize: 13, color: P.fg, textAlign: 'center', width: '100%', maxWidth: 440, ...nodrag }} />
          ) : (
            <span title="双击编辑标题" onDoubleClick={() => setTitleEdit(true)}
              style={{ fontFamily: SYS_FONT, fontSize: 14, fontWeight: 500, color: P.menuFg,
                userSelect: 'none', letterSpacing: '0.01em', cursor: 'text', maxWidth: 440,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {title || '无标题'}{docType === 'canvas' ? '.excalidraw' : docType === 'nodes' ? '.canvas' : (docType === 'image' || docType === 'office') ? '' : '.md'}&nbsp;— GSYEN Writer
            </span>
          )}
        </div>

        {/* Window controls */}
        <div className="flex items-center" style={nodrag}>
          {!isMac && <WinCtrlButton action="minimize" dark={dark} onClick={() => isElectron && (window as any).electronAPI.window.minimize()} title="Minimize" />}
          {!isMac && <WinCtrlButton action="maximize" dark={dark} maximized={maximized} onClick={() => isElectron && (window as any).electronAPI.window.maximize()} title={maximized ? 'Restore' : 'Maximize'} />}
          <WinCtrlButton action="close" dark={dark} onClick={onClose} title="退回 Chat  Esc" />
        </div>
      </div>

      {/* ══ Row 2: Menu bar ═══════════════════════════════════════════════════ */}
      {docType === 'doc' && (
        <div ref={menuBarRef} onClick={stopProp}
          style={{ height: MENU_H, background: P.chrome, display: 'flex', alignItems: 'stretch',
            borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)'}` }}>
          {menus.map(menu => (
            <div key={menu.id as string} style={{ position: 'relative' }}>
              <button style={{ height: '100%', padding: '0 11px', fontFamily: SYS_FONT, fontSize: 14,
                fontWeight: 500, color: activeMenu === menu.id ? P.menuFgHover : P.menuFg,
                background: activeMenu === menu.id ? (dark ? '#2E2A2A' : '#E2E2E2') : 'transparent',
                border: 'none', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                onMouseEnter={e => { if (activeMenu !== null) setActiveMenu(menu.id); (e.currentTarget as HTMLElement).style.color = P.menuFgHover; }}
                onMouseLeave={e => { if (activeMenu !== menu.id) (e.currentTarget as HTMLElement).style.color = P.menuFg; }}
                onClick={e => { e.stopPropagation(); setActiveMenu(a => a === menu.id ? null : menu.id); }}>
                {menu.label}
              </button>
              {activeMenu === menu.id && <Dropdown items={menu.items} P={P} dark={dark} />}
            </div>
          ))}
          {/* ▷ preview toggle */}
          <button title="Preview (Ctrl+P)" onClick={() => setMode(m => m === 'preview' ? 'write' : 'preview')}
            style={{ width: 40, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: mode !== 'write' ? P.accent : P.menuFg, background: 'transparent',
              border: 'none', cursor: 'pointer', transition: 'color 0.1s', marginLeft: 'auto' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = P.menuFgHover}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = mode !== 'write' ? P.accent : P.menuFg}>
            <PreviewIcon />
          </button>
        </div>
      )}

      {/* ══ Non-doc action bar ════════════════════════════════════════════════ */}
      {(docType === 'canvas' || docType === 'nodes') && (
        <div onClick={stopProp}
          style={{ height: MENU_H, background: P.chrome,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px',
            borderBottom: `1px solid ${dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)'}` }}>
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

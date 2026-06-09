/** CanvasEditorTypes — 类型、常量、调色板 */

export type EditorMode = 'write' | 'preview' | 'split';
export type FocusMode  = 'off'   | 'paragraph' | 'sentence';
export type MenuId     = 'file'  | 'edit' | 'format' | 'focus' | 'authors' | 'view' | 'help' | null;
export type LineLen    = 64 | 72 | 80;
export type FontChoice = 'mono' | 'quattro';

export type MenuItem = {
  label: string; shortcut?: string;
  action?: () => void; checked?: boolean; disabled?: boolean;
};
export type MenuSpec = { id: MenuId; label: string; items: (MenuItem | '---')[] };

export const DARK = {
  bg: '#1A1A1A', chrome: '#1E1C1C', fg: '#C8C4BC',
  menuFg: '#7A7570', menuFgHover: '#C8C4BC',
  menuBg: '#242020', menuHover: '#2E2A2A',
  menuBorder: '#353030', menuSep: '#2C2828',
  border: '#272323', accent: '#4A90D9', dim: '#484442',
};
export const LIGHT = {
  bg: '#F9F8F6', chrome: '#F2F0EC', fg: '#1A1A1A',
  menuFg: '#6A6865', menuFgHover: '#1A1A1A',
  menuBg: '#F5F3EF', menuHover: '#ECEAE6',
  menuBorder: '#D8D6D0', menuSep: '#DCD9D3',
  border: '#D8D5CF', accent: '#1A6ECC', dim: '#B0ADA8',
};
export type Palette = typeof DARK;

export const TITLE_H  = 32;
export const MENU_H   = 28;
export const CHROME_H = TITLE_H + MENU_H;
export const STATUS_H = 22;

/** 行宽三档 → 内容区最大宽度 px */
export const LINE_W: Record<LineLen, number> = { 64: 620, 72: 700, 80: 780 };

export const SYS_FONT =
  '-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif';

export const isElectron = !!(window as any).electronAPI?.isElectron;

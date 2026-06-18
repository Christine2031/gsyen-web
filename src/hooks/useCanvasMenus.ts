/** useCanvasMenus — Canvas 编辑器菜单数据 hook */
import { useMemo } from 'react';
import {
  EditorMode, FocusMode, MenuId, LineLen, FontChoice, MenuSpec,
} from '../components/CanvasEditorTypes';

interface Params {
  words: number; chars: number; readMin: number;
  mode: EditorMode; dark: boolean; tw: boolean;
  focusMode: FocusMode; lineLen: LineLen; font: FontChoice;
  docType: 'doc' | 'canvas' | 'nodes';
  setMode:      React.Dispatch<React.SetStateAction<EditorMode>>;
  setDark:      (v: (p: boolean) => boolean) => void;
  setTw:        (v: (p: boolean) => boolean) => void;
  setFocusMode: (m: FocusMode | ((p: FocusMode) => FocusMode)) => void;
  setLineLen:   (v: LineLen)    => void;
  setFontSize:  (v: (p: number) => number) => void;
  setFont:      (v: FontChoice) => void;
  setActiveMenu:(v: MenuId)     => void;
  wrap:         (b: string, a: string) => void;
  importFile:   () => void;
  exportMd:     () => void;
  printDoc:     () => void;
  createFile:   (type: 'doc' | 'canvas' | 'nodes') => void;
  onClose:      () => void;
}

export function useCanvasMenus(p: Params): MenuSpec[] {
  return useMemo<MenuSpec[]>(() => [
    { id: 'file', label: 'File', items: [
      { label: 'Import…',            shortcut: 'Ctrl+I', action: p.importFile },
      '---',
      { label: 'Export as Markdown', shortcut: 'Ctrl+E', action: p.exportMd },
      { label: 'Export as HTML',     disabled: true },
      '---',
      { label: 'Print…', shortcut: 'Ctrl+P', action: p.printDoc },
      '---',
      { label: 'Close', shortcut: 'Esc', action: () => { p.setActiveMenu(null); p.onClose(); } },
    ]},
    { id: 'edit', label: 'Edit', items: [
      { label: 'Undo',       shortcut: 'Ctrl+Z' },
      { label: 'Redo',       shortcut: 'Ctrl+Y' },
      '---',
      { label: 'Cut',        shortcut: 'Ctrl+X' },
      { label: 'Copy',       shortcut: 'Ctrl+C' },
      { label: 'Paste',      shortcut: 'Ctrl+V' },
      '---',
      { label: 'Select All', shortcut: 'Ctrl+A' },
    ]},
    { id: 'format', label: 'Format', items: [
      { label: 'Heading 1', shortcut: 'Ctrl+1', action: () => p.wrap('# ',   '') },
      { label: 'Heading 2', shortcut: 'Ctrl+2', action: () => p.wrap('## ',  '') },
      { label: 'Heading 3', shortcut: 'Ctrl+3', action: () => p.wrap('### ', '') },
      '---',
      { label: 'Bold',   shortcut: 'Ctrl+B', action: () => p.wrap('**', '**') },
      { label: 'Italic', shortcut: 'Ctrl+I', action: () => p.wrap('*',  '*')  },
      { label: 'Code',                        action: () => p.wrap('`',  '`')  },
      '---',
      { label: 'Blockquote',  action: () => p.wrap('> ', '') },
      { label: 'Bullet List', action: () => p.wrap('- ', '') },
    ]},
    { id: 'focus', label: 'Focus', items: [
      { label: 'Paragraph Focus', shortcut: 'Ctrl+Shift+F',
        checked: p.focusMode === 'paragraph',
        action: () => { p.setFocusMode(m => m === 'paragraph' ? 'off' : 'paragraph'); p.setActiveMenu(null); } },
      { label: 'Sentence Focus',
        checked: p.focusMode === 'sentence',
        action: () => { p.setFocusMode(m => m === 'sentence' ? 'off' : 'sentence'); p.setActiveMenu(null); } },
      { label: 'No Focus',
        checked: p.focusMode === 'off',
        action: () => { p.setFocusMode('off'); p.setActiveMenu(null); } },
      '---',
      { label: 'Typewriter Mode', shortcut: 'Ctrl+Shift+T',
        checked: p.tw,
        action: () => { p.setTw(v => !v); p.setActiveMenu(null); } },
      '---',
      { label: p.dark ? 'Day Mode' : 'Night Mode',
        action: () => { p.setDark(v => !v); p.setActiveMenu(null); } },
    ]},
    { id: 'authors', label: 'Authors', items: [
      { label: `${p.words} Words`,       disabled: true },
      { label: `${p.chars} Characters`,  disabled: true },
      { label: `~${p.readMin} min read`, disabled: true },
      '---',
      { label: 'Set Word Goal…', disabled: true },
    ]},
    { id: 'view', label: 'View', items: [
      { label: 'Writing',
        checked: p.mode === 'write',
        action: () => { p.setMode('write'); p.setActiveMenu(null); } },
      { label: 'Preview', shortcut: 'Ctrl+P',
        checked: p.mode === 'preview',
        action: () => { p.setMode(m => m === 'preview' ? 'write' : 'preview' as EditorMode); p.setActiveMenu(null); } },
      { label: 'Split View', shortcut: 'Ctrl+Shift+P',
        checked: p.mode === 'split',
        action: () => { p.setMode(m => m === 'split' ? 'write' : 'split' as EditorMode); p.setActiveMenu(null); } },
      '---',
      { label: '64 Characters', checked: p.lineLen === 64, action: () => { p.setLineLen(64); p.setActiveMenu(null); } },
      { label: '72 Characters', checked: p.lineLen === 72, action: () => { p.setLineLen(72); p.setActiveMenu(null); } },
      { label: '80 Characters', checked: p.lineLen === 80, action: () => { p.setLineLen(80); p.setActiveMenu(null); } },
      '---',
      { label: 'iA Writer Mono',    checked: p.font === 'mono',    action: () => { p.setFont('mono');    p.setActiveMenu(null); } },
      { label: 'iA Writer Quattro', checked: p.font === 'quattro', action: () => { p.setFont('quattro'); p.setActiveMenu(null); } },
      '---',
      { label: 'Larger Text',  shortcut: 'Ctrl++', action: () => { p.setFontSize(s => Math.min(24, s + 1)); p.setActiveMenu(null); } },
      { label: 'Smaller Text', shortcut: 'Ctrl+−', action: () => { p.setFontSize(s => Math.max(13, s - 1)); p.setActiveMenu(null); } },
      '---',
      { label: 'New Document',    action: () => p.createFile('doc')    },
      { label: 'New Whiteboard',  action: () => p.createFile('canvas') },
      { label: 'New Node Canvas', action: () => p.createFile('nodes')  },
    ]},
    { id: 'help', label: 'Help', items: [
      { label: 'Keyboard Shortcuts', disabled: true },
      '---',
      { label: 'About CANVAS', disabled: true },
    ]},
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [p.words, p.chars, p.readMin, p.mode, p.dark, p.tw, p.focusMode, p.lineLen, p.font]);
}

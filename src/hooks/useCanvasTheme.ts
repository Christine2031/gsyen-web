/**
 * useCanvasTheme — CodeMirror 6 iA Writer 风格主题 + 扩展集
 *
 * 导出：
 *  iaWriterTheme(dark, fontSize?, fontFamily?)
 *  focusModeExt()     段落聚焦
 *  sentenceFocusExt() 行级聚焦（比段落更紧）
 *  typewriterExt()    打字机模式
 *  baseExtensions()   markdown + lineWrapping
 */
import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet } from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';

export const PALETTE = {
  dark:  { bg: '#1A1A1A', fg: '#CCCCCC', dim: '#3A3A3A', muted: '#666666', sel: '#2D4F6C', caret: '#55AAFF' },
  light: { bg: '#FFFFFF', fg: '#1A1A1A', dim: '#C8C8C8', muted: '#999999', sel: '#C5DDF8', caret: '#55AAFF' },
};

export function iaWriterTheme(dark: boolean, fontSize = 17, fontFamily?: string) {
  injectFocusCSS();
  const P  = dark ? PALETTE.dark : PALETTE.light;
  const ff = fontFamily ?? '"iA Writer Mono","Courier New","Consolas",monospace';
  return EditorView.theme({
    '&': { background: P.bg, color: P.fg, fontSize: `${fontSize}px`, fontFamily: ff, height: '100%', border: 'none !important', outline: 'none !important', boxShadow: 'none !important' },
    '&.cm-focused':  { border: 'none !important', outline: 'none !important', boxShadow: 'none !important' },
    '.cm-scroller':  { overflow: 'auto', lineHeight: '1.9' },
    '.cm-content':   { padding: '0', caretColor: P.caret },
    '.cm-line':      { padding: '0' },
    '.cm-cursor':    { borderLeft: 'none', width: '2px', background: P.caret, borderRadius: '99px', height: '1.36em !important', marginLeft: '-1px', marginTop: '-0.18em' },
    '.cm-selectionBackground, ::selection': { background: P.sel + ' !important' },
    '.cm-focused .cm-selectionBackground':  { background: P.sel },
    '.cm-header, .tok-heading': { color: P.fg, fontWeight: 'bold' },
    '.tok-heading1':             { fontSize: '1.18em' },
    '.tok-heading2':             { fontSize: '1.07em' },
    '.tok-quote, .tok-meta':     { color: dark ? '#666666' : '#999999', fontStyle: 'italic' },
    '.tok-link, .tok-url':       { color: '#55AAFF', textDecoration: 'none' },
    '.tok-emphasis':             { fontStyle: 'italic', color: P.fg },
    '.tok-strong':               { fontWeight: 'bold',  color: P.fg },
    '.tok-strikethrough':        { textDecoration: 'line-through', color: dark ? '#666666' : '#999999' },
    '.tok-monospace, .tok-code': { fontFamily: 'inherit', background: dark ? '#252525' : '#F2F2F2', borderRadius: '2px', padding: '0 3px', color: P.fg },
    '.cm-activeLine':            { background: 'transparent' },
    '.cm-gutters':               { display: 'none' },
    '.cm-activeLineGutter':      { background: 'transparent' },
  }, { dark });
}

// ─── CSS 注入（仅一次）───────────────────────────────────────────────────────
let cssInjected = false;
function injectFocusCSS() {
  if (cssInjected) return; cssInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    .cm-focus-dim { opacity: 0.25; transition: opacity 0.22s ease; }
    .cm-editor, .cm-editor.cm-focused, .cm-editor:focus, .cm-editor:focus-within {
      border: none !important; outline: none !important; box-shadow: none !important;
    }
    .cm-scroller { background: transparent !important; }
  `;
  document.head.appendChild(s);
}

const dimLine = Decoration.line({ class: 'cm-focus-dim' });

function scrollToCursor(view: EditorView) {
  requestAnimationFrame(() => {
    const cursor = view.state.selection.main.head;
    const coords = view.coordsAtPos(cursor);
    if (!coords) return;
    let el: Element | null = view.dom.parentElement;
    while (el && el !== document.documentElement) {
      if (el.scrollHeight > el.clientHeight + 1) {
        const rect = el.getBoundingClientRect();
        const offset = coords.top - rect.top - rect.height * 0.42;
        if (Math.abs(offset) > 8) el.scrollBy({ top: offset, behavior: 'smooth' });
        return;
      }
      el = el.parentElement;
    }
  });
}

// ─── 段落聚焦：当前段落外全暗 ───────────────────────────────────────────────
export function focusModeExt() {
  injectFocusCSS();
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet = Decoration.none;
    constructor(view: EditorView) { this.decorations = this.build(view); }
    update(u: ViewUpdate) { if (u.selectionSet || u.docChanged) { this.decorations = this.build(u.view); if (u.selectionSet) scrollToCursor(u.view); } }
    build(view: EditorView): DecorationSet {
      const cursor = view.state.selection.main.head; const doc = view.state.doc;
      const cur = doc.lineAt(cursor).number; let s = cur, e = cur;
      while (s > 1         && doc.line(s - 1).text.trim() !== '') s--;
      while (e < doc.lines && doc.line(e + 1).text.trim() !== '') e++;
      const builder = new RangeSetBuilder<Decoration>();
      for (let i = 1; i <= doc.lines; i++) if ((i < s || i > e) && doc.line(i).text.trim() !== '') builder.add(doc.line(i).from, doc.line(i).from, dimLine);
      return builder.finish();
    }
  }, { decorations: v => v.decorations });
}

// ─── 行级聚焦（Sentence）：仅当前行亮 ───────────────────────────────────────
export function sentenceFocusExt() {
  injectFocusCSS();
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet = Decoration.none;
    constructor(view: EditorView) { this.decorations = this.build(view); }
    update(u: ViewUpdate) { if (u.selectionSet || u.docChanged) this.decorations = this.build(u.view); }
    build(view: EditorView): DecorationSet {
      const cursor = view.state.selection.main.head; const doc = view.state.doc;
      const curLine = doc.lineAt(cursor).number;
      const builder = new RangeSetBuilder<Decoration>();
      for (let i = 1; i <= doc.lines; i++) if (i !== curLine && doc.line(i).text.trim() !== '') builder.add(doc.line(i).from, doc.line(i).from, dimLine);
      return builder.finish();
    }
  }, { decorations: v => v.decorations });
}

// ─── 打字机模式：光标始终停在视口 42% 处 ────────────────────────────────────
export function typewriterExt() {
  return ViewPlugin.fromClass(class {
    update(u: ViewUpdate) {
      if (!u.selectionSet && !u.docChanged) return;
      requestAnimationFrame(() => {
        const cursor = u.view.state.selection.main.head;
        const coords = u.view.coordsAtPos(cursor);
        if (!coords) return;
        let el: Element | null = u.view.dom.parentElement;
        while (el && el !== document.documentElement) {
          if (el.scrollHeight > el.clientHeight + 1) {
            const rect = el.getBoundingClientRect();
            const offset = coords.top - rect.top - rect.height * 0.42;
            if (Math.abs(offset) > 1) el.scrollBy({ top: offset, behavior: 'instant' });
            return;
          }
          el = el.parentElement;
        }
      });
    }
  });
}

// ─── 基础扩展 ────────────────────────────────────────────────────────────────
export function baseExtensions() {
  return [markdown(), EditorView.lineWrapping, EditorView.contentAttributes.of({ spellcheck: 'false' })];
}

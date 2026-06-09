/**
 * useCanvasTheme — CodeMirror 6 的 iA Writer 风格主题 + 扩展集
 *
 * 提供：
 *  - iaWriterTheme(dark)  自定义编辑器主题
 *  - focusModeExt()       段落聚焦：当前段落亮，其余暗（iA Writer Focus Mode）
 *  - baseExtensions       markdown 语言 + 基础编辑器行为
 */
import { useMemo } from 'react';
import { EditorView, ViewPlugin, ViewUpdate, Decoration, DecorationSet } from '@codemirror/view';
import { StateField, StateEffect, RangeSetBuilder } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';

// ─── iA Writer 主题 ────────────────────────────────────────────────────────────

// iA Writer 原版调色板 —— 照抄，不改
// Night 参考：https://ia.net / macOS Night Mode
// Day 参考：iA Writer macOS default
export const PALETTE = {
  dark: {
    bg:    '#1A1A1A',   // iA Writer Night 原版
    fg:    '#CCCCCC',   // iA Writer Night 正文
    dim:   '#3A3A3A',
    muted: '#666666',
    sel:   '#2D4F6C',
    caret: '#55AAFF',
    code:  '#242424',
  },
  light: {
    bg:    '#FFFFFF',   // iA Writer Day 背景（纯白，原版如此）
    fg:    '#1A1A1A',   // iA Writer Day 正文
    dim:   '#C8C8C8',
    muted: '#999999',
    sel:   '#C5DDF8',   // 选区浅蓝
    caret: '#55AAFF',   // 同款蓝色光标
    code:  '#F2F2F2',   // 行内代码背景
  },
};

export function iaWriterTheme(dark: boolean) {
  injectFocusCSS();   // 确保全局 CSS 已注入（边框清零）
  const P    = dark ? PALETTE.dark : PALETTE.light;
  const bg   = P.bg;
  const fg   = P.fg;
  const dim  = P.dim;
  const sel  = P.sel;
  const caret = P.caret;

  return EditorView.theme({
    // 根元素：无边框，无轮廓，无阴影 —— 完全透明壳
    '&': {
      background:  bg,
      color:       fg,
      fontSize:    '17px',
      fontFamily:  '"iA Writer Mono","Courier New","Consolas",monospace',
      height:      '100%',
      border:      'none !important',
      outline:     'none !important',
      boxShadow:   'none !important',
    },
    '&.cm-focused': {
      border:    'none !important',
      outline:   'none !important',
      boxShadow: 'none !important',
    },
    '.cm-scroller': { overflow: 'auto', lineHeight: '1.9' },
    '.cm-content': { padding: '0', caretColor: caret, maxWidth: '680px', margin: '0 auto', paddingLeft: '40px', paddingRight: '40px' },
    '.cm-line':    { padding: '0' },
    '.cm-cursor':  { borderLeft: 'none', width: '2px', background: caret,
                     borderRadius: '99px', height: '1.36em !important',
                     marginLeft: '-1px', marginTop: '-0.18em' },
    '.cm-selectionBackground, ::selection': { background: sel + ' !important' },
    '.cm-focused .cm-selectionBackground': { background: sel },
    // Markdown 语法高亮 —— iA Writer 原版极简配色
    // iA Writer 不做彩色高亮；heading = 纯粗体同色，emphasis/strong 同色
    // 唯一彩色：链接用 accent 蓝，blockquote 用 muted
    '.cm-header, .tok-heading':    { color: fg, fontWeight: 'bold' },
    '.tok-heading1':               { fontSize: '1.18em' },
    '.tok-heading2':               { fontSize: '1.07em' },
    '.tok-quote, .tok-meta':       { color: dark ? '#666666' : '#999999', fontStyle: 'italic' },
    '.tok-link, .tok-url':         { color: '#55AAFF', textDecoration: 'none' },
    '.tok-emphasis':               { fontStyle: 'italic',  color: fg },
    '.tok-strong':                 { fontWeight: 'bold',   color: fg },
    '.tok-strikethrough':          { textDecoration: 'line-through', color: dark ? '#666666' : '#999999' },
    '.tok-monospace, .tok-code':   { fontFamily: 'inherit',
                                     background: dark ? '#252525' : '#F2F2F2',
                                     borderRadius: '2px', padding: '0 3px',
                                     color: fg },
    '.cm-activeLine':              { background: 'transparent' },
    '.cm-gutters':                 { display: 'none' },
    '.cm-activeLineGutter':        { background: 'transparent' },
  }, { dark });
}

// ─── Focus Mode（段落聚焦）─────────────────────────────────────────────────────

const dimLine = Decoration.line({ class: 'cm-focus-dim' });

// CSS 注入（只注入一次）
let cssInjected = false;
function injectFocusCSS() {
  if (cssInjected) return;
  cssInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    .cm-focus-dim { opacity: 0.35; transition: opacity 0.22s ease; }
    .cm-editor,
    .cm-editor.cm-focused,
    .cm-editor:focus,
    .cm-editor:focus-within {
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
    }
    .cm-scroller { background: transparent !important; }
  `;
  document.head.appendChild(s);
}

export function focusModeExt() {
  injectFocusCSS();

  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet = Decoration.none;

      constructor(view: EditorView) { this.decorations = this.build(view); }

      update(u: ViewUpdate) {
        if (u.selectionSet || u.docChanged) {
          this.decorations = this.build(u.view);
          // 点击/键盘移动光标后，滚动让光标可见（居中在视口 42%）
          if (u.selectionSet) requestAnimationFrame(() => {
            const view   = u.view;
            const cursor = view.state.selection.main.head;
            const coords = view.coordsAtPos(cursor);
            if (!coords) return;
            let el: Element | null = view.dom.parentElement;
            while (el && el !== document.documentElement) {
              if (el.scrollHeight > el.clientHeight + 1) {
                const rect   = el.getBoundingClientRect();
                const offset = coords.top - rect.top - rect.height * 0.42;
                if (Math.abs(offset) > 8) el.scrollBy({ top: offset, behavior: 'smooth' });
                return;
              }
              el = el.parentElement;
            }
          });
        }
      }

      build(view: EditorView): DecorationSet {
        const cursor = view.state.selection.main.head;
        const doc    = view.state.doc;
        const curLine = doc.lineAt(cursor).number;

        // 找当前段落（连续非空行）
        let paraStart = curLine;
        let paraEnd   = curLine;
        while (paraStart > 1 && doc.line(paraStart - 1).text.trim() !== '') paraStart--;
        while (paraEnd < doc.lines && doc.line(paraEnd + 1).text.trim() !== '') paraEnd++;

        const builder = new RangeSetBuilder<Decoration>();
        for (let i = 1; i <= doc.lines; i++) {
          if (i < paraStart || i > paraEnd) {
            const line = doc.line(i);
            if (line.text.trim() !== '') builder.add(line.from, line.from, dimLine);
          }
        }
        return builder.finish();
      }
    },
    { decorations: v => v.decorations }
  );
}

// ─── 打字机模式（光标始终停在视口 42% 处）─────────────────────────────────────

export function typewriterExt() {
  return ViewPlugin.fromClass(
    class {
      update(u: ViewUpdate) {
        if (!u.selectionSet && !u.docChanged) return;
        const view = u.view;
        requestAnimationFrame(() => {
          const cursor = view.state.selection.main.head;
          const coords = view.coordsAtPos(cursor);
          if (!coords) return;
          // cm-scroller 无固定高度时不滚动，向上找真正的滚动容器
          let el: Element | null = view.dom.parentElement;
          while (el && el !== document.documentElement) {
            if (el.scrollHeight > el.clientHeight + 1) {
              const rect   = el.getBoundingClientRect();
              const offset = coords.top - rect.top - rect.height * 0.42;
              // 'instant' 避免多次 smooth 叠加导致下方文字抖动
              if (Math.abs(offset) > 1) el.scrollBy({ top: offset, behavior: 'instant' });
              return;
            }
            el = el.parentElement;
          }
        });
      }
    }
  );
}

// ─── 基础扩展 ──────────────────────────────────────────────────────────────────

export function baseExtensions() {
  return [
    markdown(),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ spellcheck: 'false' }),
  ];
}

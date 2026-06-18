/**
 * CanvasWriterPane — 三模式写作区（edit / preview / split）
 */
import type { CSSProperties, RefObject } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import type { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import ReactMarkdown from 'react-markdown';
import { MermaidBlock } from './MermaidBlock';
import { CHROME_H, LINE_W } from './CanvasEditorTypes';
import type { Palette, EditorMode, LineLen } from './CanvasEditorTypes';

interface Props {
  content:    string;
  onContent:  (v: string) => void;
  extensions: Extension[];
  P:          Palette;
  mode:       EditorMode;
  fontFamily: string;
  fontSize:   number;
  dark:       boolean;
  lineLen:    LineLen;
  editorFade: number;
  editorRef:  RefObject<{ view: EditorView } | null>;
}

export function CanvasWriterPane({
  content, onContent, extensions, P, mode,
  fontFamily, fontSize, dark, lineLen, editorFade, editorRef,
}: Props) {
  const pad: CSSProperties = {
    maxWidth: LINE_W[lineLen], width: '100%', margin: '0 auto', padding: '48px 32px 128px',
  };

  const editor = (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden" style={{ background: P.bg }}>
      <div className="flex-1 overflow-y-auto" style={{ background: P.bg }}>
        <div style={pad}>
          <CodeMirror value={content} onChange={onContent} extensions={extensions} theme="none"
            basicSetup={{
              lineNumbers: false, foldGutter: false, highlightActiveLine: false,
              dropCursor: false, allowMultipleSelections: false, highlightSelectionMatches: false,
              bracketMatching: false, closeBrackets: false, autocompletion: false,
              rectangularSelection: false, crosshairCursor: false, indentOnInput: false,
            }}
            style={{ background: 'transparent' }} ref={editorRef as any} />
        </div>
      </div>
    </div>
  );

  const preview = (
    <div className="flex-1 min-w-0 overflow-y-auto"
      style={{ borderLeft: mode === 'split' ? `1px solid ${P.border}` : 'none' }}>
      <div style={pad}>
        {content
          ? <div className="prose prose-lg max-w-none"
              style={{ '--tw-prose-body': P.fg, '--tw-prose-headings': P.fg,
                '--tw-prose-links': P.accent, '--tw-prose-hr': P.border,
                '--tw-prose-bullets': P.dim, '--tw-prose-counters': P.dim,
                fontFamily, fontSize: `${fontSize}px`, lineHeight: '1.9', color: P.fg,
              } as CSSProperties}>
              <ReactMarkdown components={{ code({ className, children }) {
                const lang = (className ?? '').replace('language-', '');
                const code = String(children).replace(/\n$/, '');
                if (lang === 'mermaid') return <MermaidBlock code={code} dark={dark} />;
                return <code className={className}>{children}</code>;
              }}}>{content}</ReactMarkdown>
            </div>
          : <p style={{ color: P.dim, fontStyle: 'italic', fontSize: 15, fontFamily }}>暂无内容</p>}
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, display: 'flex', minWidth: 0, paddingTop: CHROME_H + 1,
      opacity: editorFade, transition: 'opacity 0.13s ease' }}>
      {mode === 'split' ? <>{editor}{preview}</> : mode === 'preview' ? preview : editor}
    </div>
  );
}

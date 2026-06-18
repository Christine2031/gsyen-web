/**
 * DocxEditor — TipTap 富文本编辑器
 * 读：mammoth HTML → TipTap
 * 写：TipTap HTML → turndown → .md → fs:writeFile（同目录）
 */
import { useState, useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TurndownService from 'turndown';
import type { Palette } from './CanvasEditorTypes';
import { SYS_FONT } from './CanvasEditorTypes';

interface Props { html: string; filePath: string; P: Palette; dark: boolean; onExit: () => void; }

const td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });

const editorCss = (fg: string, bg: string, accent: string) => `
  .gw-tiptap { height: 100%; overflow-y: auto; }
  .gw-tiptap .tiptap { min-height: 100%; outline: none; cursor: text;
    font-family: Georgia, 'Times New Roman', serif; font-size: 15px;
    line-height: 1.8; color: ${fg}; max-width: 680px; margin: 0 auto; padding: 48px 32px 80px; }
  .gw-tiptap .tiptap h1,.gw-tiptap .tiptap h2,.gw-tiptap .tiptap h3 {
    font-family: ${SYS_FONT}; font-weight: 600; line-height: 1.3; margin: 1.6em 0 0.4em; }
  .gw-tiptap .tiptap h1{font-size:1.6em} .gw-tiptap .tiptap h2{font-size:1.25em} .gw-tiptap .tiptap h3{font-size:1.05em}
  .gw-tiptap .tiptap p { margin: 0 0 0.9em; }
  .gw-tiptap .tiptap ul,.gw-tiptap .tiptap ol { padding-left: 1.6em; margin: 0 0 0.9em; }
  .gw-tiptap .tiptap li { margin-bottom: 0.3em; }
  .gw-tiptap .tiptap strong { font-weight: 700; }
  .gw-tiptap .tiptap em { font-style: italic; }
  .gw-tiptap .tiptap blockquote { border-left: 3px solid ${accent}; margin: 1em 0;
    padding: 0.2em 1em; opacity: 0.75; font-style: italic; }
  .gw-tiptap .tiptap code { font-family: 'SF Mono',Consolas,monospace; font-size: 13px;
    background: ${fg}15; border-radius: 3px; padding: 1px 4px; }
  .gw-tiptap .tiptap pre { background: ${fg}12; border-radius: 6px; padding: 12px 16px;
    overflow-x: auto; }
  .gw-tiptap .tiptap pre code { background: none; padding: 0; }
  .gw-tiptap .tiptap hr { border: none; border-top: 1px solid ${fg}20; margin: 2em 0; }
  .gw-tiptap .tiptap ::selection { background: ${accent}30; }
`;

export function DocxEditor({ html, filePath, P, dark, onExit }: Props) {
  const [saved, setSaved] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit],
    content: html,
    editorProps: { attributes: { spellcheck: 'false' } },
  });

  useEffect(() => () => { editor?.destroy(); }, [editor]);

  const handleSave = useCallback(async () => {
    if (!editor) return;
    const markdown = td.turndown(editor.getHTML());
    const mdPath   = filePath.replace(/\.docx?$/i, '.md');
    await (window as any).electronAPI?.writeFile?.(mdPath, markdown);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [editor, filePath]);

  const btn: React.CSSProperties = { padding: '4px 14px', fontFamily: SYS_FONT,
    fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    border: 'none', borderRadius: 0, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: P.bg }}>
      <style>{editorCss(P.fg, P.bg, P.accent)}</style>

      {/* ── Toolbar ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 8px',
        height: 36, flexShrink: 0, borderBottom: `0.5px solid ${P.border}`, background: P.chrome }}>
        <button onClick={onExit}
          style={{ ...btn, background: 'transparent', color: P.menuFg, border: `0.5px solid ${P.border}` }}>
          ← View
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={handleSave}
          style={{ ...btn, background: P.fg, color: P.bg, opacity: saved ? 0.6 : 1, transition: 'opacity 0.15s' }}>
          {saved ? 'Saved ✓' : 'Save .md'}
        </button>
      </div>

      {/* ── TipTap ── */}
      <div className="gw-tiptap" style={{ flex: 1 }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

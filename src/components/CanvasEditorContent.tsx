/**
 * CanvasEditorContent — iA Writer 精确复刻
 * 行宽三档、字号调节、三级 Focus、字体切换、Chrome auto-hide
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CanvasDrawEditor } from './CanvasDrawEditor';
import { CanvasChrome } from './CanvasChrome';
import {
  DARK, LIGHT, CHROME_H, STATUS_H, LINE_W, SYS_FONT,
  EditorMode, FocusMode, MenuId, LineLen, FontChoice,
} from './CanvasEditorTypes';
import { useCanvasMenus } from '../hooks/useCanvasMenus';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { canvasStore } from '../stores/canvasStore';
import { iaWriterTheme, focusModeExt, sentenceFocusExt, typewriterExt, baseExtensions } from '../hooks/useCanvasTheme';
import ReactMarkdown from 'react-markdown';

interface Props { docId: string | undefined; onClose: () => void; }

export function CanvasEditorContent({ docId, onClose }: Props) {
  const stored = docId ? canvasStore.getById(docId) : null;

  const [title,         setTitle]         = useState(stored?.title   ?? '');
  const [content,       setContent]       = useState(stored?.content ?? '');
  const [mode,          setMode]          = useState<EditorMode>('write');
  const [dark,          setDark]          = useState(true);
  const [tw,            setTw]            = useState(false);
  const [focusMode,     setFocusMode]     = useState<FocusMode>('off');
  const [docType,       setDocType]       = useState<'doc'|'canvas'>(stored?.type ?? 'doc');
  const [chromeVisible, setChromeVisible] = useState(true);
  const [lineLen,       setLineLen]       = useState<LineLen>(72);
  const [fontSize,      setFontSize]      = useState(17);
  const [font,          setFont]          = useState<FontChoice>('mono');
  const [titleEdit,     setTitleEdit]     = useState(false);

  const [activeMenu, _setActiveMenu] = useState<MenuId>(null);
  const activeMenuRef  = useRef<MenuId>(null);
  const editorRef      = useRef<{ view: EditorView } | null>(null);
  const saveRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuBarRef     = useRef<HTMLDivElement>(null);
  const hideTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef  = useRef<HTMLInputElement>(null);

  const P          = dark ? DARK : LIGHT;
  const fontFamily = font === 'mono'
    ? '"iA Writer Mono","Courier New",monospace'
    : '"iA Writer Quattro","Georgia","Times New Roman",serif';

  const words   = content.trim().split(/\s+/).filter(Boolean).length;
  const chars   = content.length;
  const readMin = Math.max(1, Math.round(words / 200));

  /* ── chrome auto-hide ── */
  const showChrome = useCallback(() => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    setChromeVisible(true);
  }, []);

  const setActiveMenu = useCallback((v: MenuId | ((p: MenuId) => MenuId)) => {
    const next = typeof v === 'function' ? v(activeMenuRef.current) : v;
    activeMenuRef.current = next; _setActiveMenu(next);
    if (next !== null) showChrome();
  }, [showChrome]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (e.clientY <= 40) { showChrome(); return; }
    if (activeMenuRef.current) return;
    if (!hideTimerRef.current) {
      hideTimerRef.current = setTimeout(() => {
        if (!activeMenuRef.current) setChromeVisible(false);
        hideTimerRef.current = null;
      }, 1000);
    }
  }, [showChrome]);

  useEffect(() => { document.addEventListener('mouseleave', showChrome); return () => document.removeEventListener('mouseleave', showChrome); }, [showChrome]);
  useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }, []);

  /* ── save ── */
  const save = useCallback((t: string, c: string) => {
    if (!docId) return;
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => canvasStore.update(docId, { title: t, content: c }), 600);
  }, [docId]);

  const onTitleChange = useCallback((v: string) => { setTitle(v); save(v, content); }, [content, save]);
  const onContent     = useCallback((v: string) => { setContent(v); save(title, v); }, [title, save]);

  /* ── extensions ── */
  const extensions = useMemo(() => [
    ...baseExtensions(),
    iaWriterTheme(dark, fontSize, fontFamily),
    ...(focusMode === 'paragraph' ? [focusModeExt()]     : []),
    ...(focusMode === 'sentence'  ? [sentenceFocusExt()] : []),
    ...(tw ? [typewriterExt()] : []),
  ], [dark, focusMode, tw, fontSize, fontFamily]);

  /* ── sync + keyboard ── */
  useEffect(() => {
    const sync = () => { const d = docId ? canvasStore.getById(docId) : null; if (d) { setTitle(d.title); setContent(d.content); } };
    window.addEventListener('canvas-updated', sync);
    return () => window.removeEventListener('canvas-updated', sync);
  }, [docId]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (titleEdit) { setTitleEdit(false); return; } if (activeMenuRef.current) { setActiveMenu(null); return; } onClose(); return; }
      const mod = e.metaKey || e.ctrlKey; if (!mod) return;
      if (!e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setMode(m => m === 'preview' ? 'write' : 'preview'); }
      if ( e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setMode(m => m === 'split'   ? 'write' : 'split');   }
      if ( e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); setTw(v => !v); }
      if ( e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setFocusMode(m => m === 'off' ? 'paragraph' : m === 'paragraph' ? 'sentence' : 'off'); }
      if (e.key === '=' || e.key === '+') { e.preventDefault(); setFontSize(s => Math.min(24, s + 1)); }
      if (e.key === '-')                  { e.preventDefault(); setFontSize(s => Math.max(13, s - 1)); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose, setActiveMenu, titleEdit]);

  useEffect(() => {
    if (!activeMenu) return;
    const fn = (e: MouseEvent) => { if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) setActiveMenu(null); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [activeMenu, setActiveMenu]);

  useEffect(() => { if (titleEdit) titleInputRef.current?.select(); }, [titleEdit]);

  /* ── helpers ── */
  const wrap = useCallback((b: string, a: string) => {
    const view = editorRef.current?.view; if (!view) return;
    const { from, to } = view.state.selection.main; const sel = view.state.sliceDoc(from, to);
    view.dispatch({ changes: { from, to, insert: b + sel + a }, selection: { anchor: from + b.length, head: from + b.length + sel.length } });
    view.focus(); setActiveMenu(null);
  }, [setActiveMenu]);

  const exportMd = useCallback(() => {
    const blob = new Blob([`# ${title}\n\n${content}`], { type: 'text/markdown' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${title || 'untitled'}.md` });
    a.click(); URL.revokeObjectURL(a.href); setActiveMenu(null);
  }, [title, content, setActiveMenu]);

  const importFile = useCallback(() => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.md,.txt';
    inp.onchange = (ev) => {
      const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return;
      const r = new FileReader();
      r.onload = (e) => { const txt = e.target?.result as string; const lines = txt.split('\n'); const h1 = lines[0].replace(/^#+\s*/, '').trim(); if (h1) onTitleChange(h1); onContent(lines.slice(1).join('\n').trimStart()); };
      r.readAsText(f);
    };
    inp.click(); setActiveMenu(null);
  }, [onTitleChange, onContent, setActiveMenu]);

  const toggleDocType = useCallback(() => {
    const next: 'doc'|'canvas' = docType === 'doc' ? 'canvas' : 'doc';
    setDocType(next); if (docId) canvasStore.update(docId, { type: next }); setActiveMenu(null);
  }, [docType, docId, setActiveMenu]);

  /* ── menus ── */
  const menus = useCanvasMenus({ words, chars, readMin, mode, dark, tw, focusMode, lineLen, font, docType, setMode, setDark, setTw, setFocusMode, setLineLen, setFontSize, setFont, setActiveMenu, wrap, importFile, exportMd, toggleDocType, onClose });

  /* ── panes ── */
  const padStyle = { maxWidth: LINE_W[lineLen], width: '100%', margin: '0 auto', padding: '48px 32px 128px' };

  const EditorPane = (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden"><div className="flex-1 overflow-y-auto"><div style={padStyle}>
      <CodeMirror value={content} onChange={onContent} extensions={extensions} theme="none"
        basicSetup={{ lineNumbers:false, foldGutter:false, highlightActiveLine:false, dropCursor:false, allowMultipleSelections:false, highlightSelectionMatches:false, bracketMatching:false, closeBrackets:false, autocompletion:false, rectangularSelection:false, crosshairCursor:false, indentOnInput:false }}
        style={{ background:'transparent' }} ref={editorRef as any} />
    </div></div></div>
  );

  const PreviewPane = (
    <div className="flex-1 min-w-0 overflow-y-auto" style={{ borderLeft: mode === 'split' ? `1px solid ${P.border}` : 'none' }}>
      <div style={padStyle}>
        {content
          ? <div className="prose prose-lg max-w-none" style={{ '--tw-prose-body':P.fg, '--tw-prose-headings':P.fg, '--tw-prose-links':P.accent, '--tw-prose-hr':P.border, '--tw-prose-bullets':P.dim, '--tw-prose-counters':P.dim, fontFamily, fontSize:`${fontSize}px`, lineHeight:'1.9', color:P.fg } as React.CSSProperties}><ReactMarkdown>{content}</ReactMarkdown></div>
          : <p style={{ color:P.dim, fontStyle:'italic', fontSize:15, fontFamily }}>暂无内容</p>}
      </div>
    </div>
  );

  const chromeStyle: React.CSSProperties = {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    transform: chromeVisible ? 'translateY(0)' : `translateY(-${CHROME_H + 4}px)`,
    opacity:   chromeVisible ? 1 : 0,
    transition: chromeVisible
      ? 'transform 0.24s cubic-bezier(0.16,1,0.3,1),opacity 0.18s ease'
      : 'transform 0.3s cubic-bezier(0.55,0,1,0.45),opacity 0.22s ease',
    pointerEvents: chromeVisible ? 'auto' : 'none',
  };

  return createPortal(
    <div className="fixed inset-0 z-50" style={{ background:P.bg, color:P.fg }}
      onClick={() => setActiveMenu(null)} onMouseMove={handleMouseMove}>

      {/* Content */}
      <div style={{ position:'absolute', inset:0, paddingTop:CHROME_H, paddingBottom:STATUS_H, display:'flex', overflow:'hidden' }}>
        {docType === 'canvas' ? <CanvasDrawEditor docId={docId!} dark={dark} />
          : mode === 'write'   ? EditorPane
          : mode === 'preview' ? PreviewPane
          : <>{EditorPane}{PreviewPane}</>}
      </div>

      {/* Chrome overlay */}
      <div style={chromeStyle}>
        <CanvasChrome title={title} titleEdit={titleEdit} onTitleChange={onTitleChange}
          setTitleEdit={setTitleEdit} titleInputRef={titleInputRef}
          menus={menus} activeMenu={activeMenu} setActiveMenu={setActiveMenu}
          mode={mode} setMode={setMode} docType={docType}
          P={P} dark={dark} onMouseEnter={showChrome} menuBarRef={menuBarRef} />
      </div>

      {/* Hot zone */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:8, zIndex:30, pointerEvents: chromeVisible ? 'none' : 'auto' }} onMouseEnter={showChrome} />

      {/* Status bar */}
      {docType === 'doc' && (
        <div style={{ position:'absolute', bottom:0, left:0, right:0, height:STATUS_H, zIndex:10, background:P.chrome, borderTop:`1px solid ${P.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 12px' }}>
          <div style={{ fontFamily:SYS_FONT, fontSize:11, color:P.dim, display:'flex', gap:10 }}>
            {focusMode !== 'off' && <span style={{ color:P.accent }}>{focusMode === 'paragraph' ? 'Paragraph' : 'Sentence'} Focus</span>}
            {tw && <span style={{ color:P.accent }}>Typewriter</span>}
            {mode !== 'write' && <span style={{ color:P.accent }}>{mode === 'split' ? 'Split' : 'Preview'}</span>}
            <span>{lineLen} chars · {fontSize}px · {font === 'mono' ? 'Mono' : 'Quattro'}</span>
          </div>
          <div style={{ fontFamily:SYS_FONT, fontSize:11, color:P.dim }}>{words} words · {chars} chars · ~{readMin} min</div>
        </div>
      )}
    </div>,
    document.body
  );
}

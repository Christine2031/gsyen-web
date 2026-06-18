/**
 * CanvasEditorContent — iA Writer 精确复刻
 * 行宽三档、字号调节、三级 Focus、字体切换、Chrome auto-hide
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CanvasDrawEditor } from './CanvasDrawEditor';
import { CanvasNodeEditor, type CanvasNodeEditorRef } from './CanvasNodeEditor';
import { CanvasChrome } from './CanvasChrome';
import {
  DARK, LIGHT, CHROME_H, STATUS_H, LINE_W, SYS_FONT, TITLE_H, isElectron,
  EditorMode, FocusMode, MenuId, LineLen, FontChoice,
} from './CanvasEditorTypes';
import { useCanvasMenus } from '../hooks/useCanvasMenus';
import { useCanvasFileOps } from '../hooks/useCanvasFileOps';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { canvasStore } from '../stores/canvasStore';
import { iaWriterTheme, focusModeExt, sentenceFocusExt, typewriterExt, baseExtensions } from '../hooks/useCanvasTheme';
import ReactMarkdown from 'react-markdown';
import { MermaidBlock } from './MermaidBlock';
import { CanvasStatsPill } from './CanvasStatsPill';
import { CanvasLibrary } from './CanvasLibrary';
import { CanvasDocList, invalidatePrefetch } from './CanvasDocList';
import type { FileEntry } from '../hooks/useFileSystem';
import { fsAdapter } from '../hooks/useFileSystem';
import { libraryStore, useLibraryStore } from '../stores/canvasLibraryStore';
import { useCanvasPanelWidths } from '../hooks/useCanvasPanelWidths';

interface Props { docId: string | undefined; onClose: () => void; }

export function CanvasEditorContent({ docId, onClose }: Props) {
  const stored = docId ? canvasStore.getById(docId) : null;

  const [title,         setTitle]         = useState(stored?.title   ?? '');
  const [content,       setContent]       = useState(stored?.content ?? '');
  const [mode,          setMode]          = useState<EditorMode>('write');
  const [dark,          setDark]          = useState(false);
  const [tw,            setTw]            = useState(false);
  const [focusMode,     setFocusMode]     = useState<FocusMode>('off');
  const [docType,       setDocType]       = useState<'doc'|'canvas'|'nodes'>(stored?.type ?? 'doc');
  const [chromeVisible, setChromeVisible] = useState(true);
  const [lineLen,       setLineLen]       = useState<LineLen>(72);
  const [fontSize,      setFontSize]      = useState(17);
  const [font,          setFont]          = useState<FontChoice>('mono');
  const [titleEdit,     setTitleEdit]     = useState(false);
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [activeFsFile,  setActiveFsFile]  = useState<FileEntry | null>(null);
  const [editorFade,    setEditorFade]    = useState(1);

  const [activeMenu, _setActiveMenu] = useState<MenuId>(null);
  const activeMenuRef  = useRef<MenuId>(null);
  const editorRef      = useRef<{ view: EditorView } | null>(null);
  const saveRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodeEditorRef  = useRef<CanvasNodeEditorRef>(null);
  const menuBarRef     = useRef<HTMLDivElement>(null);
  const creatingRef    = useRef(false);
  const hideTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef  = useRef<HTMLInputElement>(null);

  const { libW, doclistW } = useCanvasPanelWidths();
  const { selectedFolder } = useLibraryStore();
  const panelLeft = docType === 'doc' && sidebarOpen ? libW + doclistW : 0;

  const P          = dark ? DARK : LIGHT;
  const fontFamily = font === 'mono'
    ? '"iA Writer Mono","Courier New",monospace'
    : '"iA Writer Quattro","Georgia","Times New Roman",serif';

  const words     = content.trim().split(/\s+/).filter(Boolean).length;
  const chars     = content.length;
  const sentences = content.trim() ? (content.match(/[.!?。！？]+/g) ?? []).length : 0;
  const readSec   = Math.round((words / 200) * 60);
  const readMin   = Math.max(1, Math.ceil(readSec / 60));


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
  const onContent     = useCallback((v: string) => {
    setContent(v); save(title, v);
    if (activeFsFile) { fsAdapter.writeFile(activeFsFile, v).catch(() => {}); if (activeFsFile.path) invalidatePrefetch(activeFsFile.path); }
  }, [title, save, activeFsFile]);

  const onFsFileSelect = useCallback((entry: FileEntry, text: string) => {
    setEditorFade(0);
    setTimeout(() => {
      setActiveFsFile(entry);
      setContent(text);
      setTitle(entry.name.replace(/\.(md|txt|excalidraw|canvas)$/i, ''));
      if (/\.excalidraw$/i.test(entry.name))   setDocType('canvas');
      else if (/\.canvas$/i.test(entry.name))  setDocType('nodes');
      else                                     setDocType('doc');
      if (docId) canvasStore.update(docId, { content: text });
      setEditorFade(1);
    }, 80);
  }, [docId]);

  const handleCreateFile = useCallback(async (type: 'doc' | 'canvas' | 'nodes') => {
    if (creatingRef.current) return;          // 防连点
    creatingRef.current = true;
    try {
      const { selectedFolder, navStack } = libraryStore.get();
      const folder = navStack.length > 0 ? navStack[navStack.length - 1] : selectedFolder;
      if (!folder) return;
      const ext = type === 'doc' ? '.md' : type === 'canvas' ? '.excalidraw' : '.canvas';
      const name = `Untitled-${Date.now()}${ext}`;
      const filePath = `${folder.path ?? folder.name}/${name}`;
      const content = type === 'doc' ? ''
        : type === 'canvas'
          ? JSON.stringify({ type: 'excalidraw', version: 2, source: 'gsyen', elements: [], appState: { viewBackgroundColor: '#ffffff' }, files: {} })
          : JSON.stringify({ nodes: [], edges: [] });
      const entry: FileEntry = { name, path: filePath, isMarkdown: /\.md$/i.test(name), lastModified: Date.now() };
      await fsAdapter.writeFile(entry, content);
      // 乐观插入：立刻显示新文件，不等 readDir 重扫（fs.watch 600ms 后自动跟上）
      libraryStore.optimisticAddFile(entry);
      setDocType(type === 'canvas' ? 'canvas' : type === 'nodes' ? 'nodes' : 'doc');
      setActiveFsFile(entry);
      setContent(content);
      setTitle('Untitled');
    } finally {
      creatingRef.current = false;
    }
  }, []);

  const handleDocListBack = useCallback(async () => {
    const { navStack } = libraryStore.get();
    if (navStack.length > 0) await libraryStore.popNav();
    else libraryStore.clearFolder();
  }, []);

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

  /* ── auto-focus editor on mount ── */
  useEffect(() => {
    const t = setTimeout(() => editorRef.current?.view?.focus(), 80);
    return () => clearTimeout(t);
  }, []);

  /* ── helpers ── */
  const wrap = useCallback((b: string, a: string) => {
    const view = editorRef.current?.view; if (!view) return;
    const { from, to } = view.state.selection.main; const sel = view.state.sliceDoc(from, to);
    view.dispatch({ changes: { from, to, insert: b + sel + a }, selection: { anchor: from + b.length, head: from + b.length + sel.length } });
    view.focus(); setActiveMenu(null);
  }, [setActiveMenu]);

  const { exportMd, importFile, printDoc } = useCanvasFileOps({ title, content, onTitleChange, onContent, setActiveMenu });

  /* ── menus ── */
  const menus = useCanvasMenus({ words, chars, readMin, mode, dark, tw, focusMode, lineLen, font, docType, setMode, setDark, setTw, setFocusMode, setLineLen, setFontSize, setFont, setActiveMenu, wrap, importFile, exportMd, printDoc, createFile: handleCreateFile, onClose });

  /* ── panes ── */
  const padStyle = { maxWidth: LINE_W[lineLen], width: '100%', margin: '0 auto', padding: '48px 32px 128px' };

  const EditorPane = (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden" style={{ background: P.bg }}><div className="flex-1 overflow-y-auto" style={{ background: P.bg }}><div style={padStyle}>
      <CodeMirror value={content} onChange={onContent} extensions={extensions} theme="none"
        basicSetup={{ lineNumbers:false, foldGutter:false, highlightActiveLine:false, dropCursor:false, allowMultipleSelections:false, highlightSelectionMatches:false, bracketMatching:false, closeBrackets:false, autocompletion:false, rectangularSelection:false, crosshairCursor:false, indentOnInput:false }}
        style={{ background:'transparent' }} ref={editorRef as any} />
    </div></div></div>
  );

  const PreviewPane = (
    <div className="flex-1 min-w-0 overflow-y-auto" style={{ borderLeft: mode === 'split' ? `1px solid ${P.border}` : 'none' }}>
      <div style={padStyle}>
        {content
          ? <div className="prose prose-lg max-w-none" style={{ '--tw-prose-body':P.fg, '--tw-prose-headings':P.fg, '--tw-prose-links':P.accent, '--tw-prose-hr':P.border, '--tw-prose-bullets':P.dim, '--tw-prose-counters':P.dim, fontFamily, fontSize:`${fontSize}px`, lineHeight:'1.9', color:P.fg } as React.CSSProperties}><ReactMarkdown
                    components={{
                      code({ className, children }) {
                        const lang = (className ?? '').replace('language-', '');
                        const code = String(children).replace(/\n$/, '');
                        if (lang === 'mermaid') return <MermaidBlock code={code} dark={dark} />;
                        return <code className={className}>{children}</code>;
                      }
                    }}
                  >{content}</ReactMarkdown></div>
          : <p style={{ color:P.dim, fontStyle:'italic', fontSize:15, fontFamily }}>暂无内容</p>}
      </div>
    </div>
  );

  const chromeStyle: React.CSSProperties = {
    position: 'absolute', top: 0, left: panelLeft, right: 0, zIndex: 20,
    transform: chromeVisible ? 'translateY(0)' : `translateY(-${CHROME_H + 4}px)`,
    opacity:   chromeVisible ? 1 : 0,
    transition: chromeVisible
      ? 'transform 0.24s cubic-bezier(0.16,1,0.3,1),opacity 0.18s ease'
      : 'transform 0.3s cubic-bezier(0.55,0,1,0.45),opacity 0.22s ease',
    pointerEvents: chromeVisible ? 'auto' : 'none',
  };

  return createPortal(
    <div className="fixed inset-0 z-50"
      style={{ background:P.bg, color:P.fg, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onClick={() => setActiveMenu(null)} onMouseMove={handleMouseMove}>

      {/* Content — 三个面板常驻 DOM，display 切换避免重复挂载卸载 */}
      <div style={{ position:'absolute', inset:0, overflow:'hidden' }}>
        {/* Doc — three-pane: Library | DocList | Editor */}
        <div style={{ display: docType === 'doc' ? 'flex' : 'none', width:'100%', height:'100%' }}>
          <CanvasLibrary open={sidebarOpen} P={P} dark={dark} />
          <CanvasDocList open={sidebarOpen} onFileSelect={onFsFileSelect} P={P}
            onBack={handleDocListBack} onNew={() => handleCreateFile('doc')} />
          <div style={{ flex: 1, display: 'flex', minWidth: 0, paddingTop: CHROME_H + 1,
            opacity: editorFade, transition: 'opacity 0.13s ease' }}>
            {mode === 'split' ? <>{EditorPane}{PreviewPane}</> : mode === 'preview' ? PreviewPane : EditorPane}
          </div>
        </div>
        {/* Whiteboard */}
        {docId && (
          <div style={{ display: docType === 'canvas' ? 'block' : 'none', width:'100%', height:'100%', paddingTop: CHROME_H + 1 }}>
            <CanvasDrawEditor docId={docId} dark={dark} />
          </div>
        )}
        {/* Node Canvas */}
        {docId && (
          <div style={{ display: docType === 'nodes' ? 'flex' : 'none', width:'100%', height:'100%', paddingTop: CHROME_H + 1 }}>
            <CanvasNodeEditor ref={nodeEditorRef} docId={docId} dark={dark} />
          </div>
        )}
      </div>

      {/* 持久拖拽条 — Chrome 自动隐藏后仍允许移动窗口
          z-index 低于 Chrome(20)，Chrome 可见时被覆盖；Chrome 隐藏后此条成为唯一 drag 区域 */}
      {isElectron && (
        <div style={{ position: 'absolute', top: 0, left: panelLeft, right: 0,
          height: TITLE_H, zIndex: 5,
          WebkitAppRegion: 'drag', pointerEvents: 'none' } as React.CSSProperties} />
      )}

      {/* Chrome overlay */}
      <div style={chromeStyle}>
        <CanvasChrome title={title} titleEdit={titleEdit} onTitleChange={onTitleChange}
          setTitleEdit={setTitleEdit} titleInputRef={titleInputRef}
          menus={menus} activeMenu={activeMenu} setActiveMenu={setActiveMenu}
          mode={mode} setMode={setMode} docType={docType}
          onAddCard={() => nodeEditorRef.current?.addCard()}
          onClose={onClose}
          sidebarOpen={sidebarOpen} onSidebarToggle={() => setSidebarOpen(o => !o)}
          P={P} dark={dark} onMouseEnter={showChrome} menuBarRef={menuBarRef} />
      </div>

      {/* Hot zone */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:8, zIndex:30, pointerEvents: chromeVisible ? 'none' : 'auto' }} onMouseEnter={showChrome} />

      {docType === 'doc' && <CanvasStatsPill words={words} chars={chars} sentences={sentences} readSec={readSec} P={P} dark={dark} />}
    </div>,
    document.body
  );
}

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
import type { EditorView } from '@codemirror/view';
import { canvasStore } from '../stores/canvasStore';
import { iaWriterTheme, focusModeExt, sentenceFocusExt, typewriterExt, baseExtensions } from '../hooks/useCanvasTheme';
import { CanvasWriterPane } from './CanvasWriterPane';
import { CanvasStatsPill } from './CanvasStatsPill';
import { CanvasLibrary } from './CanvasLibrary';
import { CanvasDocList, invalidatePrefetch } from './CanvasDocList';
import type { FileEntry } from '../hooks/useFileSystem';
import { fsAdapter } from '../hooks/useFileSystem';
import { libraryStore } from '../stores/canvasLibraryStore';
import { useCanvasPanelWidths } from '../hooks/useCanvasPanelWidths';
import { ImageViewer } from './ImageViewer';
import { OfficeViewer } from './OfficeViewer';
import { canvasPrefsStore } from '../stores/canvasPrefsStore';
import type { CanvasPrefs } from '../stores/canvasPrefsStore';
import { CanvasSettings } from './CanvasSettings';
import { useCanvasCreateFile } from '../hooks/useCanvasCreateFile';

interface Props { docId: string | undefined; onClose: () => void; }

const _infer = (d: {type?:string;content?:string}|null|undefined): 'doc'|'canvas'|'nodes'|'image'|'office' => {
  if (d?.type && d.type !== 'doc') return d.type as any;
  try { const p=JSON.parse(d?.content?.trim()??''); if('elements'in p||p.type==='excalidraw') return 'canvas'; if('nodes'in p&&'edges'in p) return 'nodes'; } catch {} return 'doc';
};

export function CanvasEditorContent({ docId, onClose }: Props) {
  const stored = docId ? canvasStore.getById(docId) : null;

  const [title,         setTitle]         = useState(stored?.title   ?? '');
  const [content,       setContent]       = useState(stored?.content ?? '');
  const [mode,          setMode]          = useState<EditorMode>('write');
  const [dark,          setDark]          = useState(canvasPrefsStore.get().dark);
  const [tw,            setTw]            = useState(canvasPrefsStore.get().tw);
  const [focusMode,     setFocusMode]     = useState<FocusMode>(canvasPrefsStore.get().focusMode);
  const [docType,       setDocType]       = useState<'doc'|'canvas'|'nodes'|'image'|'office'>(() => _infer(stored));
  const [chromeVisible, setChromeVisible] = useState(true);
  const [lineLen,       setLineLen]       = useState<LineLen>(canvasPrefsStore.get().lineLen);
  const [fontSize,      setFontSize]      = useState(canvasPrefsStore.get().fontSize);
  const [font,          setFont]          = useState<FontChoice>(canvasPrefsStore.get().font);
  const [titleEdit,     setTitleEdit]     = useState(false);
  const [sidebarOpen,   setSidebarOpen]   = useState(false);
  const [settingsOpen,  setSettingsOpen]  = useState(false);
  const [activeFsFile,  setActiveFsFile]  = useState<FileEntry | null>(null);
  const [editorFade,       setEditorFade]       = useState(1);
  const [canvasEverActive, setCanvasEverActive] = useState(docType === 'canvas');
  const [nodesEverActive,  setNodesEverActive]  = useState(docType === 'nodes');

  const [activeMenu, _setActiveMenu] = useState<MenuId>(null);
  const activeMenuRef  = useRef<MenuId>(null);
  const editorRef      = useRef<{ view: EditorView } | null>(null);
  const saveRef        = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fsSelectTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nodeEditorRef  = useRef<CanvasNodeEditorRef>(null);
  const menuBarRef     = useRef<HTMLDivElement>(null);
  const hideTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleInputRef  = useRef<HTMLInputElement>(null);

  const { libW, doclistW } = useCanvasPanelWidths();
  const SIDEBAR_EASE = '0.22s cubic-bezier(0.4,0,0.2,1)';
  const panelLeft = sidebarOpen ? libW + doclistW : 0;

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
    if (fsSelectTimer.current) clearTimeout(fsSelectTimer.current);
    setEditorFade(0);
    fsSelectTimer.current = setTimeout(() => {
      fsSelectTimer.current = null;
      setActiveFsFile(entry); setContent(text); setTitle(entry.name.replace(/\.[^.]+$/, ''));
      const t = /\.excalidraw$/i.test(entry.name)?'canvas':/\.canvas$/i.test(entry.name)?'nodes':/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(entry.name)?'image':/\.(docx|xlsx|pptx|pdf)$/i.test(entry.name)?'office':'doc';
      setDocType(t); if(t==='canvas') setCanvasEverActive(true); if(t==='nodes') setNodesEverActive(true);
      if (docId && /\.(md|txt)$/i.test(entry.name)) canvasStore.update(docId, { content: text });
      setEditorFade(1);
    }, 80);
  }, [docId]);

  const handleCreateFile = useCanvasCreateFile({
    setDocType, setCanvasEverActive, setNodesEverActive,
    setActiveFsFile, setContent, setTitle, onFsFileSelect,
  });

  const handleDocListBack = useCallback(async () => {
    const { navStack } = libraryStore.get();
    if (navStack.length > 0) await libraryStore.popNav(); else libraryStore.clearFolder();
  }, []);

  const handlePrefsChange = useCallback((p: Partial<CanvasPrefs>) => {
    canvasPrefsStore.set(p); if(p.dark!==undefined)setDark(p.dark); if(p.font!==undefined)setFont(p.font as FontChoice); if(p.fontSize!==undefined)setFontSize(p.fontSize); if(p.lineLen!==undefined)setLineLen(p.lineLen as LineLen); if(p.focusMode!==undefined)setFocusMode(p.focusMode as FocusMode); if(p.tw!==undefined)setTw(p.tw);
  }, []);

  /* ── extensions ── */
  const extensions = useMemo(() => [
    ...baseExtensions(),
    iaWriterTheme(dark, fontSize, fontFamily),
    ...(focusMode === 'paragraph' ? [focusModeExt()]     : []),
    ...(focusMode === 'sentence'  ? [sentenceFocusExt()] : []),
    ...(tw ? [typewriterExt()] : []),
  ], [dark, focusMode, tw, fontSize, fontFamily]);

  useEffect(() => { if (docId && docType !== (stored?.type ?? 'doc')) canvasStore.update(docId, { type: docType }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sync = () => {
      const d = docId ? canvasStore.getById(docId) : null; if (!d) return;
      setTitle(d.title); setContent(d.content); const t = _infer(d); setDocType(t); if (t !== (d.type ?? 'doc')) canvasStore.update(d.id, { type: t });
    };
    window.addEventListener('canvas-updated', sync); return () => window.removeEventListener('canvas-updated', sync);
  }, [docId]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (titleEdit) { setTitleEdit(false); return; } if (activeMenuRef.current) { setActiveMenu(null); return; } onClose(); return; }
      const mod = e.metaKey || e.ctrlKey; if (!mod) return;
      if (!e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setMode(m => m === 'preview' ? 'write' : 'preview'); }
      if (e.shiftKey && e.key.toLowerCase() === 'p') { e.preventDefault(); setMode(m => m === 'split' ? 'write' : 'split'); }
      if (e.shiftKey && e.key.toLowerCase() === 't') { e.preventDefault(); setTw(v => !v); }
      if (e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); setFocusMode(m => m === 'off' ? 'paragraph' : m === 'paragraph' ? 'sentence' : 'off'); }
      if (e.key === '=' || e.key === '+') { e.preventDefault(); setFontSize(s => Math.min(24, s + 1)); } if (e.key === '-') { e.preventDefault(); setFontSize(s => Math.max(13, s - 1)); }
    };
    window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn);
  }, [onClose, setActiveMenu, titleEdit]);

  useEffect(() => {
    if (!activeMenu) return;
    const fn = (e: MouseEvent) => { if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) setActiveMenu(null); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [activeMenu, setActiveMenu]);

  useEffect(() => { if (titleEdit) titleInputRef.current?.select(); }, [titleEdit]);

  useEffect(() => { const t = setTimeout(() => editorRef.current?.view?.focus(), 80); return () => clearTimeout(t); }, []);
  useEffect(() => { if (docType === 'canvas') setCanvasEverActive(true); if (docType === 'nodes') setNodesEverActive(true); }, [docType]);

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

  const chromeStyle: React.CSSProperties = {
    position: 'absolute', top: 0, left: panelLeft, right: 0, zIndex: 20,
    transform: chromeVisible ? 'translateY(0)' : `translateY(-${CHROME_H + 4}px)`,
    opacity:   chromeVisible ? 1 : 0,
    transition: `left ${SIDEBAR_EASE},${chromeVisible ? 'transform 0.24s cubic-bezier(0.16,1,0.3,1),opacity 0.18s ease' : 'transform 0.3s cubic-bezier(0.55,0,1,0.45),opacity 0.22s ease'}`,
    pointerEvents: chromeVisible ? 'auto' : 'none',
  };

  return createPortal(
    <div className="fixed inset-0 z-50" style={{ background:P.bg, color:P.fg, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      onClick={() => setActiveMenu(null)} onMouseMove={handleMouseMove}>

      <div style={{ position:'absolute', inset:0, overflow:'hidden', display:'flex' }}>
        {/* Sidebar — all modes */}
        <CanvasLibrary open={sidebarOpen} P={P} dark={dark} onSettings={() => setSettingsOpen(true)} />
        <CanvasDocList open={sidebarOpen} onFileSelect={onFsFileSelect} P={P} dark={dark}
          onBack={handleDocListBack} onNew={() => handleCreateFile('doc')} />

        {/* Main area */}
        <div style={{ flex:1, position:'relative', overflow:'hidden', height:'100%' }}>
          <div style={{ display: docType === 'doc' ? 'flex' : 'none', width:'100%', height:'100%' }}>
            <CanvasWriterPane content={content} onContent={onContent} extensions={extensions}
              P={P} mode={mode} fontFamily={fontFamily} fontSize={fontSize} dark={dark}
              lineLen={lineLen} editorFade={editorFade} editorRef={editorRef} />
          </div>
          {docId && canvasEverActive && (
            <div style={{ visibility: docType === 'canvas' ? 'visible' : 'hidden', pointerEvents: docType === 'canvas' ? 'auto' : 'none', position: 'absolute', inset: 0, paddingTop: CHROME_H + 1 }}>
              <CanvasDrawEditor docId={docId} dark={dark} />
            </div>
          )}
          {docId && nodesEverActive && (
            <div style={{ visibility: docType === 'nodes' ? 'visible' : 'hidden', pointerEvents: docType === 'nodes' ? 'auto' : 'none', position: 'absolute', inset: 0, paddingTop: CHROME_H + 1, display: 'flex' }}>
              <CanvasNodeEditor ref={nodeEditorRef} docId={docId} dark={dark} />
            </div>
          )}
          <div style={{ display: docType === 'image' ? 'flex' : 'none', width:'100%', height:'100%', paddingTop: CHROME_H }}>
            {activeFsFile && <ImageViewer entry={activeFsFile} P={P} />}
          </div>
          <div style={{ display: docType === 'office' ? 'flex' : 'none', width:'100%', height:'100%', paddingTop: CHROME_H }}>
            {activeFsFile && <OfficeViewer entry={activeFsFile} P={P} dark={dark} />}
          </div>
          {docType === 'nodes' && (
            <button onClick={() => nodeEditorRef.current?.addCard()}
              style={{ position:'absolute', top: CHROME_H + 10, right: 12, zIndex: 15,
                background: P.accent, color:'#fff', border:'none', borderRadius: 6,
                padding:'5px 14px', fontSize: 12, fontFamily: SYS_FONT, fontWeight: 500,
                cursor:'pointer', letterSpacing:'0.01em', boxShadow:'0 2px 8px rgba(0,0,0,0.18)' }}>
              + Card
            </button>
          )}
        </div>
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
          onClose={onClose}
          sidebarOpen={sidebarOpen} onSidebarToggle={() => setSidebarOpen(o => !o)}
          P={P} dark={dark} onMouseEnter={showChrome} menuBarRef={menuBarRef} />
      </div>

      {/* Hot zone */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:8, zIndex:30, pointerEvents: chromeVisible ? 'none' : 'auto' }} onMouseEnter={showChrome} />

      {docType === 'doc' && <CanvasStatsPill words={words} chars={chars} sentences={sentences} readSec={readSec} P={P} dark={dark} />}
      {settingsOpen && <CanvasSettings prefs={canvasPrefsStore.get()} onChange={handlePrefsChange} onClose={() => setSettingsOpen(false)} P={P} dark={dark} />}
    </div>,
    document.body
  );
}

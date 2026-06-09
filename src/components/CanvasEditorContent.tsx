/**
 * CanvasEditorContent — CANVAS 全屏编辑器，iA Writer 体验。
 * 快捷键：Esc关闭  Ctrl+P预览  Ctrl+Shift+P分屏  Ctrl+Shift+T打字机  Ctrl+Shift+F专注
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Upload, Moon, Sun, Play, FileText, Shapes } from 'lucide-react';
import { CanvasFormatMenu } from './CanvasFormatMenu';
import { CanvasStatsBar } from './CanvasStatsBar';
import { CanvasDrawEditor } from './CanvasDrawEditor';
import CodeMirror from '@uiw/react-codemirror';
import { EditorView } from '@codemirror/view';
import { canvasStore } from '../stores/canvasStore';
import { iaWriterTheme, focusModeExt, typewriterExt, baseExtensions, PALETTE } from '../hooks/useCanvasTheme';
import ReactMarkdown from 'react-markdown';

type EditorMode = 'write' | 'preview' | 'split';
interface Props { docId: string | undefined; onClose: () => void; }

export function CanvasEditorContent({ docId, onClose }: Props) {
  const stored = docId ? canvasStore.getById(docId) : null;
  const [title,  setTitle]  = useState(stored?.title   ?? '');
  const [content,setContent]= useState(stored?.content ?? '');
  const [mode,   setMode]   = useState<EditorMode>('write');
  const [dark,   setDark]   = useState(true);
  const [tw,     setTw]     = useState(false);
  const [focus,  setFocus]  = useState(false);
  const [statsOpen,    setStatsOpen]    = useState(false);
  const [statsClosing, setStatsClosing] = useState(false);
  const [formatOpen,   setFormatOpen]   = useState(false);
  const [docType, setDocType] = useState<'doc'|'canvas'>(stored?.type ?? 'doc');
  const editorRef = useRef<{ view: EditorView } | null>(null);
  const saveRef   = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openStats  = () => { setStatsClosing(false); setStatsOpen(true); };
  const closeStats = () => {
    setStatsClosing(true);
    setTimeout(() => { setStatsOpen(false); setStatsClosing(false); }, 220);
  };
  const toggleStats = (e: React.MouseEvent) => { e.stopPropagation(); statsOpen ? closeStats() : openStats(); };
  const toggleDocType = () => {
    const next: 'doc'|'canvas' = docType === 'doc' ? 'canvas' : 'doc';
    setDocType(next);
    if (docId) canvasStore.update(docId, { type: next });
  };

  const extensions = useMemo(() => [
    ...baseExtensions(),
    iaWriterTheme(dark),
    ...(focus ? [focusModeExt()] : []),
    ...(tw    ? [typewriterExt()] : []),
  ], [dark, focus, tw]);

  const save = useCallback((t: string, c: string) => {
    if (!docId) return;
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => canvasStore.update(docId, { title: t, content: c }), 600);
  }, [docId]);

  const onTitle   = (v: string) => { setTitle(v); save(v, content); };
  const onContent = useCallback((v: string) => { setContent(v); save(title, v); }, [title, save]);

  useEffect(() => {
    const sync = () => {
      const d = docId ? canvasStore.getById(docId) : null;
      if (d) { setTitle(d.title); setContent(d.content); }
    };
    window.addEventListener('canvas-updated', sync);
    return () => window.removeEventListener('canvas-updated', sync);
  }, [docId]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { if (statsOpen) { closeStats(); return; } onClose(); return; }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && !e.shiftKey && e.key === 'p') { e.preventDefault(); setMode(m => m === 'preview' ? 'write' : 'preview'); }
      if (mod && e.shiftKey  && e.key === 'P') { e.preventDefault(); setMode(m => m === 'split'   ? 'write' : 'split');   }
      if (mod && e.shiftKey  && e.key === 'T') { e.preventDefault(); setTw(t => !t); }
      if (mod && e.shiftKey  && e.key === 'F') { e.preventDefault(); setFocus(f => !f); }
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose, statsOpen]);

  const wrap = (b: string, a: string) => {
    const view = editorRef.current?.view; if (!view) return;
    const { from, to } = view.state.selection.main;
    const sel = view.state.sliceDoc(from, to);
    view.dispatch({ changes: { from, to, insert: b + sel + a },
      selection: { anchor: from + b.length, head: from + b.length + sel.length } });
    view.focus();
  };

  const exportMd = () => {
    const blob = new Blob([`# ${title}\n\n${content}`], { type: 'text/markdown' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${title||'untitled'}.md` });
    a.click(); URL.revokeObjectURL(a.href);
  };
  const importFile = () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.md,.txt';
    inp.onchange = (ev) => {
      const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return;
      const r = new FileReader(); r.onload = (e) => {
        const txt = e.target?.result as string; const lines = txt.split('\n');
        const h1 = lines[0].replace(/^#+\s*/, '').trim(); const body = lines.slice(1).join('\n').trimStart();
        if (h1) onTitle(h1); onContent(body);
      }; r.readAsText(f);
    }; inp.click();
  };

  const P   = dark ? PALETTE.dark : PALETTE.light;
  const bg  = P.bg;  const fg  = P.fg;  const dim = P.muted;
  const bdr = dark ? '#2A2A2A' : '#D8D8D8';
  const barBg = dark ? bg : '#EBEBEB';
  const mono  = '"iA Writer Mono","Courier New","Consolas",monospace';

  const EditorCol = (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[680px] w-full mx-auto px-10 pt-12 pb-32">
          <CodeMirror value={content} onChange={onContent} extensions={extensions} theme="none"
            basicSetup={{ lineNumbers:false, foldGutter:false, highlightActiveLine:false,
              dropCursor:false, allowMultipleSelections:false, highlightSelectionMatches:false,
              bracketMatching:false, closeBrackets:false, autocompletion:false,
              rectangularSelection:false, crosshairCursor:false, indentOnInput:false }}
            style={{ background:'transparent' }} ref={editorRef as any} />
        </div>
      </div>
    </div>
  );

  const PreviewCol = (
    <div className="flex-1 min-w-0 overflow-y-auto" style={{ borderLeft: mode==='split' ? `1px solid ${bdr}` : 'none' }}>
      <div className="max-w-[680px] w-full mx-auto px-10 pt-12 pb-32">
        {content
          ? <div className="prose prose-lg max-w-none" style={{ '--tw-prose-body':fg, '--tw-prose-headings':fg,
              '--tw-prose-links':'#4488CC', '--tw-prose-hr':bdr, '--tw-prose-bullets':dim, '--tw-prose-counters':dim,
              fontFamily:mono, fontSize:'17px', lineHeight:'1.9', color:fg } as React.CSSProperties}>
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          : <p style={{ color:dim, fontStyle:'italic', fontSize:'15px', fontFamily:mono }}>暂无内容</p>}
      </div>
    </div>
  );

  const el = (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background:bg, color:fg }}
      onClick={() => statsOpen && closeStats()}>

      {/* ── Title bar ── */}
      <div className="flex items-center shrink-0 relative select-none"
        style={{ height:40, background:barBg, borderBottom:`1px solid ${bdr}` }}>
        <div className="flex items-center pl-4 gap-0 relative">
          {docType === 'doc' && <>
            <div style={{ position:'relative' }}>
              <button onClick={() => setFormatOpen(o=>!o)} className="px-3 py-1 text-[13px] rounded"
                style={{ fontFamily:mono, color: formatOpen ? fg : dim, background: formatOpen ? (dark?'#333':'#E0E0E0') : 'transparent' }}
                onMouseEnter={e=>(e.currentTarget.style.color=fg)}
                onMouseLeave={e=>(e.currentTarget.style.color=formatOpen?fg:dim)}>
                Format
              </button>
              <CanvasFormatMenu open={formatOpen} onClose={() => setFormatOpen(false)} onWrap={wrap} dark={dark} />
            </div>
            {[
              { label:'Focus',      on:focus, act:()=>setFocus(f=>!f) },
              { label:'Typewriter', on:tw,    act:()=>setTw(t=>!t)    },
            ].map(({ label, on, act }) => (
              <button key={label} onClick={act} className="px-3 py-1 text-[13px]"
                style={{ fontFamily:mono, color: on ? fg : dim }}
                onMouseEnter={e=>(e.currentTarget.style.color=fg)}
                onMouseLeave={e=>(e.currentTarget.style.color=on?fg:dim)}>
                {label}
              </button>
            ))}
          </>}
        </div>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <input value={title} onChange={e => onTitle(e.target.value)} placeholder="无标题" maxLength={80}
            className="pointer-events-auto bg-transparent outline-none border-none text-center"
            style={{ color:fg, fontFamily:mono, fontSize:'13px', width:'280px' }} />
          <span style={{ color:dim, fontFamily:mono, fontSize:'13px', marginLeft:4 }}>— CANVAS</span>
        </div>
        <div className="ml-auto flex items-center pr-3 gap-0.5">
          {([
            ...(docType==='doc' ? [
              { icon:<Upload   className="w-3.5 h-3.5"/>, act:importFile,                                    tip:'导入' },
              { icon:<Download className="w-3.5 h-3.5"/>, act:exportMd,                                      tip:'导出' },
              { icon:<Play className="w-4 h-4"/>,         act:()=>setMode(m=>m==='split'?'write':'split'),   tip:'分屏' },
            ] : []),
            { icon:dark?<Sun className="w-3.5 h-3.5"/>:<Moon className="w-3.5 h-3.5"/>, act:()=>setDark(d=>!d), tip:'明暗' },
            { icon: docType==='doc' ? <Shapes className="w-3.5 h-3.5"/> : <FileText className="w-3.5 h-3.5"/>,
              act: toggleDocType, tip: docType==='doc' ? '切换到白板' : '切换到文档' },
            { icon:<X    className="w-3.5 h-3.5"/>, act:onClose, tip:'关闭 Esc' },
          ] as const).map(({ icon, act, tip }, i) => (
            <button key={i} onClick={act} title={tip} className="p-1.5 rounded"
              style={{ color:dim }}
              onMouseEnter={e=>(e.currentTarget.style.color=fg)}
              onMouseLeave={e=>(e.currentTarget.style.color=dim)}>
              {icon}
            </button>
          ))}
        </div>
      </div>

      {/* 主体 */}
      <div className="flex flex-1 min-h-0">
        {docType === 'canvas'
          ? <CanvasDrawEditor docId={docId!} dark={dark} />
          : mode==='write'   ? EditorCol
          : mode==='preview' ? PreviewCol
          : <>{EditorCol}{PreviewCol}</>}
      </div>

      {docType === 'doc' && (
        <CanvasStatsBar content={content} dark={dark} fg={fg} dim={dim} bdr={bdr} mono={mono}
          open={statsOpen} closing={statsClosing} onToggle={toggleStats} />
      )}
    </div>
  );

  return createPortal(el, document.body);
}

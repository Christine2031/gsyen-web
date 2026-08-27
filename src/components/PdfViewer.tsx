import { useState, useEffect, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import type { FileEntry } from '../hooks/useFileSystem';
import type { Palette } from './CanvasEditorTypes';
import { SYS_FONT } from './CanvasEditorTypes';
import { checkedPdfViewportSize, pdfDocumentOptions } from '../utils/pdfSecurity';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.mjs',
  import.meta.url
).href;

interface Props { entry: FileEntry; P: Palette; dark: boolean; }

const SCALES = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
const PDF_PAGE_BATCH_SIZE = 20;

function PdfPage({ doc, pageNum, scale }: {
  doc: PDFDocumentProxy; pageNum: number; scale: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let cancelled = false;
    let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;
    (async () => {
      try {
        const page = await doc.getPage(pageNum);
        if (cancelled || !canvasRef.current) return;
        const viewport = page.getViewport({ scale });
        const canvasSize = checkedPdfViewportSize(viewport);
        const canvas = canvasRef.current;
        canvas.width = canvasSize.width;
        canvas.height = canvasSize.height;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        renderTask = page.render({ canvas, canvasContext: ctx, viewport });
        await renderTask.promise;
      } catch (e) {
        if (!cancelled) console.warn('[pdf] render failed', e);
      }
    })();
    return () => { cancelled = true; renderTask?.cancel(); };
  }, [doc, pageNum, scale]);

  return (
    <div style={{ marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.3)', lineHeight: 0 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}

export function PdfViewer({ entry, P, dark }: Props) {
  const [doc,      setDoc]      = useState<PDFDocumentProxy | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [scaleIdx, setScaleIdx] = useState(2); // default 1.0×
  const [pageLimit, setPageLimit] = useState(PDF_PAGE_BATCH_SIZE);

  useEffect(() => {
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let cancelled = false;
    setDoc(null); setError(''); setLoading(true); setPageLimit(PDF_PAGE_BATCH_SIZE);
    (async () => {
      try {
        const b64: string = await (window as any).electronAPI?.readFileBuffer?.(entry.path) ?? '';
        if (!b64) {
          if (!cancelled) { setError('无法读取文件'); setLoading(false); }
          return;
        }
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        loadingTask = pdfjsLib.getDocument(pdfDocumentOptions(arr));
        const loadedDoc = await loadingTask.promise;
        if (cancelled) { void loadingTask.destroy(); return; }
        setDoc(loadedDoc);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? '解析失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; void loadingTask?.destroy(); };
  }, [entry.path]);

  const scale = SCALES[scaleIdx];

  const center: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    height: '100%', fontFamily: SYS_FONT, fontSize: 13, color: P.dim,
  };

  if (loading) return <div style={center}>Loading PDF…</div>;
  if (error || !doc) return <div style={center}>{error || '未知错误'}</div>;

  const iconBtn: React.CSSProperties = {
    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent', border: `0.5px solid ${P.border}`, color: P.menuFg,
    cursor: 'pointer', fontFamily: SYS_FONT, fontSize: 15, borderRadius: 0, flexShrink: 0,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Zoom bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        height: 36, flexShrink: 0, borderBottom: `0.5px solid ${P.border}`, background: P.chrome,
      }}>
        <button style={iconBtn} onClick={() => setScaleIdx(i => Math.max(0, i - 1))}>−</button>
        <span style={{ fontFamily: SYS_FONT, fontSize: 11, color: P.menuFg, minWidth: 38, textAlign: 'center' }}>
          {Math.round(scale * 100)}%
        </span>
        <button style={iconBtn} onClick={() => setScaleIdx(i => Math.min(SCALES.length - 1, i + 1))}>+</button>
        <span style={{ fontFamily: SYS_FONT, fontSize: 11, color: P.dim, marginLeft: 8 }}>
          {doc.numPages} {doc.numPages === 1 ? 'page' : 'pages'}
        </span>
      </div>

      {/* ── Pages ── */}
      <div style={{
        flex: 1, overflow: 'auto',
        background: dark ? '#141414' : '#787878',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '24px 16px',
      }}>
        {Array.from({ length: Math.min(doc.numPages, pageLimit) }, (_, i) => (
          <PdfPage key={i} doc={doc} pageNum={i + 1} scale={scale} />
        ))}
        {pageLimit < doc.numPages && (
          <button
            style={{ ...iconBtn, width: 'auto', minWidth: 120, padding: '0 12px', marginBottom: 16 }}
            onClick={() => setPageLimit(limit => Math.min(doc.numPages, limit + PDF_PAGE_BATCH_SIZE))}
          >
            加载后续页面
          </button>
        )}
      </div>

    </div>
  );
}

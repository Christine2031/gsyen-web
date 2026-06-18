import { useState, useEffect } from 'react';
import type { FileEntry } from '../hooks/useFileSystem';
import type { Palette } from './CanvasEditorTypes';
import { SYS_FONT } from './CanvasEditorTypes';

interface Props { entry: FileEntry; P: Palette; }

export function OfficeViewer({ entry, P }: Props) {
  const [htmlPath, setHtmlPath] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    if (!entry.path) return;
    setLoading(true); setHtmlPath(null); setError(null);
    (window as any).electronAPI?.docviewer?.convert?.(entry.path)
      .then((r: { ok: boolean; htmlPath?: string; error?: string }) => {
        if (r.ok && r.htmlPath) setHtmlPath(r.htmlPath);
        else setError(r.error ?? '转换失败');
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [entry.path]);

  const center: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    height: '100%', gap: 10, color: P.dim, fontFamily: SYS_FONT, fontSize: 14,
  };

  if (loading) return <div style={center}>正在转换文档，请稍候…</div>;

  if (error) return (
    <div style={center}>
      <div>无法预览此文件</div>
      {error.includes('未安装') && (
        <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 300, lineHeight: 1.7, color: P.dim }}>
          请安装 <strong style={{ color: P.fg }}>LibreOffice</strong> 以预览 Word / Excel 文件
        </div>
      )}
      <div style={{ fontSize: 11, color: P.dim, maxWidth: 340, textAlign: 'center' }}>{error}</div>
    </div>
  );

  const src = `file:///${(htmlPath ?? '').replace(/\\/g, '/')}`;
  return <iframe src={src} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />;
}

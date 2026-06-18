import { useState, useEffect } from 'react';
import * as mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import type { FileEntry } from '../hooks/useFileSystem';
import type { Palette } from './CanvasEditorTypes';
import { SYS_FONT } from './CanvasEditorTypes';

interface Props { entry: FileEntry; P: Palette; }

async function readArrayBuffer(entry: FileEntry): Promise<ArrayBuffer> {
  if (entry.path && (window as any).electronAPI?.readFileBuffer) {
    const buf: Uint8Array | null = await (window as any).electronAPI.readFileBuffer(entry.path);
    if (!buf) throw new Error('读取文件失败');
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  }
  if (entry.handle) {
    const file = await (entry.handle as FileSystemFileHandle).getFile();
    return file.arrayBuffer();
  }
  throw new Error('无法读取文件');
}

export function OfficeViewer({ entry, P }: Props) {
  const [html,    setHtml]    = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true); setHtml(null); setError(null);
    (async () => {
      try {
        const buf = await readArrayBuffer(entry);
        if (/\.docx$/i.test(entry.name)) {
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          setHtml(result.value);
        } else if (/\.xlsx$/i.test(entry.name)) {
          const wb = XLSX.read(buf, { type: 'array' });
          const tables = wb.SheetNames.map(name => {
            const sheet = wb.Sheets[name];
            return `<h3>${name}</h3>${XLSX.utils.sheet_to_html(sheet)}`;
          });
          setHtml(tables.join('<hr/>'));
        } else {
          setError('暂不支持 .pptx 预览');
        }
      } catch (e) {
        setError((e as Error).message ?? '解析失败');
      } finally {
        setLoading(false);
      }
    })();
  }, [entry.path]);

  const center: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    height: '100%', gap: 10, color: P.dim, fontFamily: SYS_FONT, fontSize: 14,
  };

  if (loading) return <div style={center}>正在解析文档，请稍候…</div>;

  if (error) return (
    <div style={center}>
      <div>无法预览此文件</div>
      <div style={{ fontSize: 11, color: P.dim, maxWidth: 340, textAlign: 'center' }}>{error}</div>
    </div>
  );

  return (
    <div style={{ width: '100%', height: '100%', overflow: 'auto', background: '#fff',
      padding: '32px 40px', boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', color: '#1a1a1a',
        fontFamily: '"iA Writer Quattro","Georgia",serif', fontSize: 15, lineHeight: 1.7 }}
        dangerouslySetInnerHTML={{ __html: html ?? '' }} />
    </div>
  );
}

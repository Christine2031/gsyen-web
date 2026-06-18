/**
 * ExcelEditor — Fortune Sheet 全功能电子表格编辑器
 * 读：base64 binary → transformExcelToFortune → Sheet[]
 * 写：workbookRef → transformFortuneToExcel(download=false) → Blob → base64 → fs:writeFileBuffer
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Workbook } from '@fortune-sheet/react';
import type { WorkbookInstance } from '@fortune-sheet/react';
import type { Sheet } from '@fortune-sheet/core';
import '@fortune-sheet/react/dist/index.css';
import { transformExcelToFortune, transformFortuneToExcel } from '@corbe30/fortune-excel';
import type { Palette } from './CanvasEditorTypes';
import { SYS_FONT } from './CanvasEditorTypes';

interface Props { filePath: string; P: Palette; dark: boolean; onExit: () => void; }

function b64ToFile(b64: string, name: string): File {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new File([arr], name,
    { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

async function blobToB64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const arr = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function ExcelEditor({ filePath, P, dark, onExit }: Props) {
  const [data,    setData]    = useState<Sheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [saved,   setSaved]   = useState(false);
  const workbookRef = useRef<WorkbookInstance>(null);

  useEffect(() => {
    (async () => {
      try {
        const b64: string = await (window as any).electronAPI?.readFileBuffer?.(filePath) ?? '';
        if (!b64) { setError('无法读取文件'); setLoading(false); return; }
        const name = filePath.split(/[\\/]/).pop() ?? 'file.xlsx';
        await transformExcelToFortune(b64ToFile(b64, name), (sheets: Sheet[]) => {
          setData(sheets);
          setLoading(false);
        });
      } catch (e: any) {
        setError(e?.message ?? '解析失败');
        setLoading(false);
      }
    })();
  }, [filePath]);

  const handleSave = useCallback(async () => {
    try {
      const blob = await transformFortuneToExcel(workbookRef, 'xlsx', false) as Blob;
      const b64  = await blobToB64(blob);
      await (window as any).electronAPI?.writeFileBuffer?.(filePath, b64);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e: any) {
      console.error('Save failed:', e?.message);
    }
  }, [filePath]);

  const center: React.CSSProperties = { display: 'flex', alignItems: 'center',
    justifyContent: 'center', height: '100%', fontFamily: SYS_FONT, fontSize: 13, color: P.dim };

  if (loading) return <div style={center}>Loading spreadsheet…</div>;
  if (error)   return <div style={center}>{error}</div>;

  const btn: React.CSSProperties = { padding: '4px 14px', fontFamily: SYS_FONT, fontSize: 11,
    fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
    border: 'none', borderRadius: 0, cursor: 'pointer' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

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
          {saved ? 'Saved ✓' : 'Save .xlsx'}
        </button>
      </div>

      {/* ── Fortune Sheet ── */}
      <div style={{ flex: 1, overflow: 'hidden',
        filter: dark ? 'invert(1) hue-rotate(180deg)' : 'none' }}>
        <Workbook
          ref={workbookRef}
          data={data}
          onChange={setData}
          showToolbar
          showFormulaBar
          showSheetTabs
          lang="zh"
        />
      </div>

    </div>
  );
}

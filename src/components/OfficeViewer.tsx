import { useState, useEffect, useCallback } from 'react';
import type { FileEntry } from '../hooks/useFileSystem';
import type { Palette } from './CanvasEditorTypes';
import { SYS_FONT } from './CanvasEditorTypes';
import { ExcelEditor } from './ExcelEditor';
import { DocxEditor } from './DocxEditor';

interface Props { entry: FileEntry; P: Palette; dark: boolean; }

type DocxResult  = { ok: true; ext: '.docx'; html: string; markdown: string };
type XlsxResult  = { ok: true; ext: '.xlsx' | '.xls'; sheets: { name: string; html: string }[] };
type ErrResult   = { ok: false; error: string };
type ParseResult = DocxResult | XlsxResult | ErrResult;

/* ── DocxView ── */
function DocxView({ html, markdown, filePath, P, dark }: {
  html: string; markdown: string; filePath: string; P: Palette; dark: boolean;
}) {
  const [exported,  setExported]  = useState(false);
  const [editMode,  setEditMode]  = useState(false);

  if (editMode) return <DocxEditor html={html} filePath={filePath} P={P} dark={dark} onExit={() => setEditMode(false)} />;

  const handleExport = useCallback(async () => {
    const mdPath = filePath.replace(/\.docx?$/i, '.md');
    const ok = await (window as any).electronAPI?.writeFile(mdPath, markdown);
    if (ok) { setExported(true); setTimeout(() => setExported(false), 2500); }
  }, [filePath, markdown]);

  const fg   = dark ? '#CCCCCC' : '#1A1A1A';
  const bg   = dark ? '#1A1A1A' : '#F8F8F8';
  const muted = dark ? '#888' : '#999';

  const docCss = `
    .gw-doc { font-family: Georgia, 'Times New Roman', serif; font-size: 15px;
      line-height: 1.8; color: ${fg}; max-width: 680px; margin: 0 auto; padding: 48px 32px 80px; }
    .gw-doc h1,.gw-doc h2,.gw-doc h3,.gw-doc h4 { font-family: ${SYS_FONT}; font-weight: 600;
      margin: 1.6em 0 0.4em; line-height: 1.3; }
    .gw-doc h1 { font-size: 1.6em; } .gw-doc h2 { font-size: 1.25em; }
    .gw-doc h3 { font-size: 1.05em; } .gw-doc p { margin: 0 0 0.9em; }
    .gw-doc table { border-collapse: collapse; width: 100%; margin: 1em 0; font-size: 13px; }
    .gw-doc th { background: ${dark ? '#2A2A2A' : '#EFEFEF'}; font-family: ${SYS_FONT}; font-size: 11px;
      font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; }
    .gw-doc th,.gw-doc td { border: 1px solid ${dark ? '#333' : '#DDD'}; padding: 6px 10px; text-align: left; }
    .gw-doc tr:nth-child(even) { background: ${dark ? '#202020' : '#FAFAFA'}; }
    .gw-doc img { max-width: 100%; height: auto; border-radius: 4px; }
    .gw-doc a { color: ${dark ? '#4A90D9' : '#1A6ECC'}; }
    .gw-doc ul,.gw-doc ol { padding-left: 1.6em; margin: 0 0 0.9em; }
    .gw-doc li { margin-bottom: 0.3em; }
    .gw-doc blockquote { border-left: 3px solid ${muted}; margin: 1em 0; padding: 0.2em 1em;
      color: ${muted}; font-style: italic; }
    .gw-doc pre,.gw-doc code { font-family: 'SF Mono',Consolas,monospace; font-size: 13px;
      background: ${dark ? '#252525' : '#F0F0F0'}; border-radius: 4px; }
    .gw-doc pre { padding: 12px 16px; overflow-x: auto; }
    .gw-doc code { padding: 1px 4px; }
  `;

  const floatBtn: React.CSSProperties = { padding: '7px 16px', fontFamily: SYS_FONT,
    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
    border: 'none', borderRadius: 0, cursor: 'pointer', transition: 'opacity 0.15s' };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'auto', background: bg }}>
      <style>{docCss}</style>
      <div className="gw-doc" dangerouslySetInnerHTML={{ __html: html }} />
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 10, display: 'flex', gap: 8 }}>
        {(window as any).electronAPI && (
          <button onClick={() => setEditMode(true)}
            style={{ ...floatBtn, background: 'transparent',
              color: dark ? '#CCCCCC' : '#1A1A1A',
              border: `0.5px solid ${dark ? '#555' : '#CCC'}` }}>
            Edit
          </button>
        )}
        {markdown && (
          <button onClick={handleExport}
            style={{ ...floatBtn, background: dark ? '#CCCCCC' : '#1A1A1A',
              color: dark ? '#1A1A1A' : '#F8F8F8', opacity: exported ? 0.5 : 1 }}>
            {exported ? 'Exported ✓' : 'Export .md'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── XlsxView ── */
function XlsxView({ sheets, filePath, P, dark }: {
  sheets: { name: string; html: string }[]; filePath: string; P: Palette; dark: boolean;
}) {
  const [active,   setActive]   = useState(0);
  const [editMode, setEditMode] = useState(false);

  if (editMode) return <ExcelEditor filePath={filePath} P={P} dark={dark} onExit={() => setEditMode(false)} />;

  const tblCss = `
    .gw-xl table { border-collapse: collapse; font-family: ${SYS_FONT}; font-size: 12px;
      width: max-content; min-width: 100%; }
    .gw-xl th { position: sticky; top: 0; background: ${dark ? '#252525' : '#EFEFEF'};
      font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;
      color: ${dark ? '#888' : '#666'}; z-index: 1; }
    .gw-xl th,.gw-xl td { border: 1px solid ${dark ? '#2E2E2E' : '#E0E0E0'};
      padding: 5px 10px; text-align: left; white-space: nowrap; color: ${dark ? '#CCC' : '#1A1A1A'}; }
    .gw-xl tr:nth-child(even) td { background: ${dark ? '#1E1E1E' : '#FAFAFA'}; }
    .gw-xl tr:hover td { background: ${dark ? '#2A2A2A' : '#F4F4F4'}; }
  `;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: P.bg }}>
      <div style={{ display: 'flex', borderBottom: `0.5px solid ${P.border}`,
        background: P.chrome, flexShrink: 0, overflowX: 'auto' }}>
        {sheets.map((s, i) => (
          <button key={s.name} onClick={() => setActive(i)}
            style={{ padding: '8px 16px', fontFamily: SYS_FONT, fontSize: 11,
              fontWeight: active === i ? 700 : 500,
              color: active === i ? P.fg : P.menuFg,
              background: active === i ? `${P.fg}10` : 'transparent',
              border: 'none', borderBottom: active === i ? `2px solid ${P.fg}` : '2px solid transparent',
              cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.1s' }}>
            {s.name}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        {(window as any).electronAPI && (
          <button onClick={() => setEditMode(true)}
            style={{ padding: '0 14px', fontFamily: SYS_FONT, fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em', textTransform: 'uppercase', flexShrink: 0,
              background: 'transparent', color: P.menuFg, border: 'none', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = P.fg}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = P.menuFg}>
            Edit
          </button>
        )}
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
        <style>{tblCss}</style>
        <div className="gw-xl" dangerouslySetInnerHTML={{ __html: sheets[active]?.html ?? '' }} />
      </div>
    </div>
  );
}

/* ── OfficeViewer ── */
export function OfficeViewer({ entry, P, dark }: Props) {
  const [result,  setResult]  = useState<ParseResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!entry.path) return;
    setLoading(true); setResult(null);
    (window as any).electronAPI?.docviewer?.parseOffice(entry.path)
      .then((r: ParseResult) => setResult(r))
      .catch((e: Error) => setResult({ ok: false, error: e.message }))
      .finally(() => setLoading(false));
  }, [entry.path]);

  const center: React.CSSProperties = { display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    height: '100%', gap: 8, color: P.dim, fontFamily: SYS_FONT, fontSize: 14 };

  if (loading) return <div style={center}>正在解析文档…</div>;
  if (!result || !result.ok) return (
    <div style={center}>
      <div>无法预览此文件</div>
      <div style={{ fontSize: 12, color: P.dim, maxWidth: 340, textAlign: 'center' }}>
        {!result ? '未知错误' : result.error}
      </div>
    </div>
  );

  if (result.ext === '.docx')
    return <DocxView html={result.html} markdown={result.markdown}
             filePath={entry.path} P={P} dark={dark} />;

  return <XlsxView sheets={result.sheets} filePath={entry.path} P={P} dark={dark} />;
}

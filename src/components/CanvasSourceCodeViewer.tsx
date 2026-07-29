import { useEffect, useMemo, useRef, useState } from 'react';

const EVENT_NAME = 'gsyen-open-source-code';
const FONT = '"JetBrains Mono","SFMono-Regular","Cascadia Code","Consolas",monospace';
const UI_FONT = '"HarmonyOS Sans SC","Inter","Microsoft YaHei UI",system-ui,sans-serif';

type SourceRequest = {
  path: string;
  title?: string;
  lineStart?: number;
  lineEnd?: number;
};

type ViewerState = SourceRequest & {
  code: string;
  error: string;
  loading: boolean;
};

export function openSourceCode(detail: SourceRequest) {
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail }));
}

async function readSourceFile(filePath: string) {
  const api = (window as any).electronAPI;
  const normalized = filePath.replace(/\\/g, '/');
  const isAbsolute = /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('/');
  if (api?.readFile) {
    const appPath = !isAbsolute && api.getAppPath ? String(await api.getAppPath()).replace(/\\/g, '/') : '';
    const text = await api.readFile(isAbsolute ? normalized : `${appPath}/${normalized}`);
    if (typeof text === 'string' && text.length > 0) return text;
  }
  const res = await fetch(`/@fs/${normalized}`);
  if (!res.ok) throw new Error(`Cannot read source: ${res.status} ${res.statusText}`);
  return res.text();
}

export function CanvasSourceCodeViewer() {
  const [state, setState] = useState<ViewerState | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<SourceRequest>).detail;
      if (!detail?.path) return;
      setState({ ...detail, code: '', error: '', loading: true });
      readSourceFile(detail.path)
        .then(code => setState({ ...detail, code, error: '', loading: false }))
        .catch(err => setState({ ...detail, code: '', error: String(err?.message ?? err), loading: false }));
    };
    window.addEventListener(EVENT_NAME, onOpen);
    return () => window.removeEventListener(EVENT_NAME, onOpen);
  }, []);

  useEffect(() => {
    if (!state) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setState(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  const lines = useMemo(() => state?.code.split(/\r?\n/) ?? [], [state?.code]);

  useEffect(() => {
    if (!state || state.loading || state.error || !state.lineStart) return;
    window.requestAnimationFrame(() => {
      const line = scrollerRef.current?.querySelector<HTMLElement>(`[data-line="${state.lineStart}"]`);
      line?.scrollIntoView({ block: 'center' });
    });
  }, [state]);

  if (!state) return null;

  const start = state.lineStart ?? 0;
  const end = state.lineEnd ?? start;

  return (
    <div className="nodrag nopan" onMouseDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
      style={{ position: 'absolute', inset: 28, zIndex: 10000, display: 'flex', flexDirection: 'column',
        background: '#F8F8F8', color: '#1A1A1A', border: '1px solid rgba(26,26,26,0.16)',
        boxShadow: '0 22px 80px rgba(32,30,42,0.22)', fontFamily: UI_FONT }}>
      <div style={{ height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
        padding: '0 16px', borderBottom: '1px solid rgba(26,26,26,0.10)', background: '#EFEFEF' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 760, lineHeight: 1.2 }}>{state.title ?? state.path}</div>
          <div style={{ marginTop: 2, fontFamily: FONT, fontSize: 10, color: 'rgba(26,26,26,0.44)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {state.path}
          </div>
        </div>
        <div style={{ fontFamily: FONT, fontSize: 10, color: 'rgba(26,26,26,0.45)' }}>
          {state.loading ? 'SOURCE PEEK' : state.error ? 'ERROR' : `READ ONLY · ${start ? `L${start}-L${end} · ` : ''}${lines.length} lines`}
        </div>
        <button type="button" onClick={() => setState(null)}
          style={{ height: 28, padding: '0 12px', border: '1px solid rgba(26,26,26,0.14)',
            background: '#F8F8F8', color: '#1A1A1A', fontFamily: FONT, fontSize: 10,
            fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer' }}>
          CLOSE
        </button>
      </div>

      <div ref={scrollerRef} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 0', background: '#FFFFFF' }}>
        {state.loading ? (
          <div style={{ padding: '20px 18px', fontFamily: FONT, fontSize: 12, color: 'rgba(26,26,26,0.5)' }}>Loading source...</div>
        ) : state.error ? (
          <div style={{ padding: '20px 18px', fontFamily: FONT, fontSize: 12, color: '#991B1B' }}>{state.error}</div>
        ) : state.code.length === 0 ? (
          <div style={{ padding: '20px 18px', fontFamily: FONT, fontSize: 12, color: 'rgba(26,26,26,0.52)' }}>
            Empty source: {state.path}
          </div>
        ) : (
          <pre style={{ margin: 0, fontFamily: FONT, fontSize: 12, lineHeight: 1.58, tabSize: 2 }}>
            {lines.map((line, index) => {
              const lineNumber = index + 1;
              const inRange = start > 0 && lineNumber >= start && lineNumber <= end;
              return (
              <div key={index} data-line={lineNumber} style={{ display: 'flex', minHeight: 19, background: inRange ? 'rgba(153,27,27,0.075)' : 'transparent' }}>
                <span style={{ width: 54, flexShrink: 0, paddingRight: 14, textAlign: 'right', userSelect: 'none', color: inRange ? '#991B1B' : 'rgba(26,26,26,0.25)', fontWeight: inRange ? 700 : 400 }}>
                  {index + 1}
                </span>
                <code style={{ whiteSpace: 'pre', color: 'rgba(26,26,26,0.86)' }}>{line || ' '}</code>
              </div>
            );})}
          </pre>
        )}
      </div>
    </div>
  );
}

/**
 * CanvasDrawEditor — Excalidraw 白板编辑器
 * 懒加载（包体较重），数据序列化为 JSON 存入 canvasStore。
 */
import { lazy, Suspense, useRef, useCallback } from 'react';
import { canvasStore } from '../stores/canvasStore';
import '@excalidraw/excalidraw/index.css';

const Excalidraw = lazy(() =>
  import('@excalidraw/excalidraw').then(m => ({ default: m.Excalidraw }))
);

interface Props {
  docId: string;
  dark: boolean;
}

function parseDrawData(raw: string) {
  try {
    const d = JSON.parse(raw);
    if (d?.elements) return d;
  } catch { /* empty doc */ }
  return { elements: [], appState: { viewBackgroundColor: 'transparent' } };
}

export function CanvasDrawEditor({ docId, dark }: Props) {
  const doc      = canvasStore.getById(docId);
  const saveRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initial  = parseDrawData(doc?.content ?? '');

  const onChange = useCallback((elements: readonly object[], appState: object) => {
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(() => {
      canvasStore.update(docId, { content: JSON.stringify({ elements, appState }) });
    }, 800);
  }, [docId]);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Suspense fallback={
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
          height:'100%', color:'#666', fontFamily:'monospace', fontSize:14 }}>
          Loading Excalidraw…
        </div>
      }>
        <Excalidraw
          initialData={initial}
          onChange={onChange as any}
          theme={dark ? 'dark' : 'light'}
          UIOptions={{
            canvasActions: { export: false, loadScene: false, saveAsImage: true },
          }}
        />
      </Suspense>
    </div>
  );
}

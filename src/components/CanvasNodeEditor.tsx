import { useCallback, useRef, useEffect, useState, forwardRef, useImperativeHandle } from 'react';
import {
  ReactFlow, Background, Panel, BackgroundVariant, ReactFlowProvider,
  addEdge, useNodesState, useEdgesState, useReactFlow, useViewport,
  type Node, type Edge, type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CanvasNodeCard, type CardData } from './CanvasNodeCard';
import { canvasStore } from '../stores/canvasStore';

const NODE_TYPES = { card: CanvasNodeCard };

const EDGE_DEFAULTS = {
  style: { stroke: 'rgba(0,0,0,0.15)', strokeWidth: 1.5 },
  animated: false,
};

/* ── Right toolbar ── */
function CanvasRightControls({ dark }: { dark: boolean }) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const bg  = dark ? 'rgba(30,30,30,0.92)' : 'rgba(255,255,255,0.92)';
  const bdr = dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const ic  = dark ? '#888' : '#666';

  const btn = (onClick: () => void, title: string, svg: React.ReactNode) => (
    <button title={title} onClick={onClick}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.65'; }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
      style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: bg, border: `0.5px solid ${bdr}`, borderRadius: 7, cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(0,0,0,0.07)', color: ic, transition: 'opacity 0.12s',
      }}>{svg}</button>
  );

  return (
    <Panel position="top-right" style={{ display: 'flex', flexDirection: 'column', gap: 5, margin: '14px 14px 0 0' }}>
      {btn(() => zoomIn({ duration: 200 }), 'Zoom In',
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="6.5" y1="2" x2="6.5" y2="11"/><line x1="2" y1="6.5" x2="11" y2="6.5"/></svg>)}
      {btn(() => fitView({ duration: 300, padding: 0.15 }), 'Fit View',
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M1.5 4V1.5H4M9 1.5h2.5V4M11.5 9v2.5H9M4 11.5H1.5V9"/></svg>)}
      {btn(() => zoomOut({ duration: 200 }), 'Zoom Out',
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <line x1="2" y1="6.5" x2="11" y2="6.5"/></svg>)}
    </Panel>
  );
}

/* ── Bottom hint (2 states) ── */
function CanvasHint({ dark }: { dark: boolean }) {
  const { fitView } = useReactFlow();
  const { x, y, zoom } = useViewport();
  const hasMoved = Math.abs(x) > 30 || Math.abs(y) > 30 || Math.abs(zoom - 1) > 0.08;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'h' && e.key !== 'H') return;
      if (['TEXTAREA', 'INPUT'].includes((e.target as HTMLElement).tagName)) return;
      fitView({ duration: 350, padding: 0.15 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fitView]);

  const txt: React.CSSProperties = {
    fontSize: 11, fontFamily: 'ui-monospace, monospace', letterSpacing: '0.04em',
    color: dark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)',
    transition: 'opacity 0.3s',
  };
  const kbdStyle: React.CSSProperties = {
    padding: '1px 5px', borderRadius: 4, fontSize: 10,
    background: dark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)',
    border: dark ? '0.5px solid rgba(255,255,255,0.14)' : '0.5px solid rgba(0,0,0,0.14)',
  };

  return (
    <Panel position="bottom-center" style={{ pointerEvents: 'none', textAlign: 'center', paddingBottom: 16 }}>
      {hasMoved && (
        <div style={{ ...txt, marginBottom: 5 }}>
          按 <kbd style={kbdStyle}>H</kbd> 回到中心
        </div>
      )}
      <div style={txt}>双击画布新建卡片</div>
    </Panel>
  );
}

/* ── Inner component (inside ReactFlowProvider context) ── */
interface InnerProps {
  nodes: Node[]; edges: Edge[];
  onNodesChange: (e: any) => void;
  onEdgesChange: (e: any) => void;
  onConnect: (c: Connection) => void;
  addCard: (pos?: { x: number; y: number }) => void;
  dark: boolean;
}

function CanvasFlowInner({ nodes, edges, onNodesChange, onEdgesChange, onConnect, addCard, dark }: InnerProps) {
  const { screenToFlowPosition } = useReactFlow();

  const onDblClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.react-flow__node, .react-flow__edge, .react-flow__controls, .react-flow__panel')) return;
    const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addCard({ x: pos.x - 100, y: pos.y - 40 });
  }, [screenToFlowPosition, addCard]);

  const bgColor  = dark ? '#1A1A1A' : '#F0EDE8';
  const dotColor = dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
  const vars     = dark
    ? { '--cn-bg': '#1E1E1E', '--cn-fg': '#CCCCCC', '--cn-border': '#383838', '--cn-dim': '#666' }
    : { '--cn-bg': '#FFFFFF', '--cn-fg': '#1A1A1A', '--cn-border': 'rgba(0,0,0,0.08)', '--cn-dim': '#AAA' };

  return (
    <div onDoubleClick={onDblClick} style={{ width: '100%', height: '100%', background: bgColor, ...vars } as React.CSSProperties}>
      {/* 覆盖 ReactFlow 默认 grab 光标：空白处用箭头，拖拽时用 grabbing */}
      <style>{`
        .react-flow__pane { cursor: default !important; }
        .react-flow__pane.dragging { cursor: grabbing !important; }
        .react-flow__node { cursor: default; }
        .react-flow__node:hover .react-flow__handle { opacity: 0.6; }
      `}</style>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={NODE_TYPES}
        defaultEdgeOptions={EDGE_DEFAULTS}
        colorMode={dark ? 'dark' : 'light'}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
        panOnDrag={[1, 2]}
        panOnScroll
      >
        <Background variant={BackgroundVariant.Dots} color={dotColor} gap={24} size={1.5} />
        <CanvasRightControls dark={dark} />
        <CanvasHint dark={dark} />
      </ReactFlow>
    </div>
  );
}

/* ── Exported component ── */
interface SavedGraph { nodes: Node[]; edges: Edge[] }

function loadGraph(docId: string): SavedGraph {
  try {
    const doc = canvasStore.getById(docId);
    if (doc?.content) return JSON.parse(doc.content);
  } catch { /* empty */ }
  return { nodes: [], edges: [] };
}

export interface CanvasNodeEditorRef { addCard: () => void }

export const CanvasNodeEditor = forwardRef<CanvasNodeEditorRef, { docId: string; dark: boolean }>(
  ({ docId, dark }, ref) => {
    const initial = loadGraph(docId);
    const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const scheduleSave = useCallback((ns: Node[], es: Edge[]) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        canvasStore.update(docId, { content: JSON.stringify({ nodes: ns, edges: es }) });
      }, 600);
    }, [docId]);

    const onConnect = useCallback((conn: Connection) =>
      setEdges(es => addEdge({ ...conn, ...EDGE_DEFAULTS }, es)), [setEdges]);

    const addCard = useCallback((pos?: { x: number; y: number }) => {
      const id = `card-${Date.now()}`;
      setNodes(ns => {
        const next = [...ns, {
          id, type: 'card',
          position: pos ?? { x: 80 + Math.random() * 200, y: 80 + Math.random() * 120 },
          data: { text: '', color: '', defaultEditing: true } satisfies CardData,
        }];
        scheduleSave(next, edges);
        return next;
      });
    }, [setNodes, scheduleSave, edges]);

    useImperativeHandle(ref, () => ({ addCard }), [addCard]);

    return (
      <ReactFlowProvider>
        <CanvasFlowInner
          nodes={nodes} edges={edges}
          onNodesChange={e => { onNodesChange(e); scheduleSave(nodes, edges); }}
          onEdgesChange={e => { onEdgesChange(e); scheduleSave(nodes, edges); }}
          onConnect={onConnect}
          addCard={addCard}
          dark={dark}
        />
      </ReactFlowProvider>
    );
  }
);

CanvasNodeEditor.displayName = 'CanvasNodeEditor';

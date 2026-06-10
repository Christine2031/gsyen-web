import { useCallback, useEffect, useRef } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Node, type Edge, type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { CanvasNodeCard, type CardData } from './CanvasNodeCard';
import { canvasStore } from '../stores/canvasStore';

const NODE_TYPES = { card: CanvasNodeCard };

interface SavedGraph { nodes: Node[]; edges: Edge[] }

function loadGraph(docId: string): SavedGraph {
  try {
    const doc = canvasStore.getById(docId);
    if (doc?.content) return JSON.parse(doc.content);
  } catch { /* empty */ }
  return { nodes: [], edges: [] };
}

interface Props { docId: string; dark: boolean }

export function CanvasNodeEditor({ docId, dark }: Props) {
  const initial       = loadGraph(docId);
  const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleSave = useCallback((ns: Node[], es: Edge[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      canvasStore.update(docId, { content: JSON.stringify({ nodes: ns, edges: es }) });
    }, 600);
  }, [docId]);

  useEffect(() => { scheduleSave(nodes, edges); }, [nodes, edges, scheduleSave]);

  const onConnect = useCallback((conn: Connection) => {
    setEdges(es => addEdge({ ...conn, animated: false }, es));
  }, [setEdges]);

  const addCard = useCallback(() => {
    const id = `card-${Date.now()}`;
    const onChange = (text: string) => {
      setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, text } } : n));
    };
    const newNode: Node = {
      id, type: 'card',
      position: { x: 120 + Math.random() * 200, y: 100 + Math.random() * 160 },
      data: { text: '', color: '', dark, onChange } satisfies CardData,
    };
    setNodes(ns => [...ns, newNode]);
  }, [dark, setNodes]);

  // sync dark prop into existing nodes
  useEffect(() => {
    setNodes(ns => ns.map(n => ({ ...n, data: { ...n.data, dark } })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark]);

  const bg  = dark ? '#1a1a1a' : '#f6f5f2';
  const dot = dark ? '#2e2e2e' : '#dddbd5';

  return (
    <div style={{ width: '100%', height: '100%', background: bg }}>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={NODE_TYPES}
        fitView
        colorMode={dark ? 'dark' : 'light'}
      >
        <Background color={dot} gap={20} size={1.2} />
        <Controls />
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
      </ReactFlow>

      {/* Add card button */}
      <button
        onClick={addCard}
        style={{
          position: 'absolute', bottom: 56, right: 16, zIndex: 10,
          background: '#4488CC', color: '#fff', border: 'none',
          borderRadius: 8, padding: '8px 16px', fontSize: 13,
          cursor: 'pointer', fontFamily: 'inherit', fontWeight: 500,
          boxShadow: '0 2px 8px rgba(68,136,204,0.4)',
        }}
      >
        + 卡片
      </button>
    </div>
  );
}

import { useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
  ReactFlow,
  Panel,
  useOnViewportChange,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type Node,
  type Viewport,
} from '@xyflow/react';
import { CanvasNodeCard } from './CanvasNodeCard';
import { CanvasBox } from './CanvasBox';
import { CanvasRightControls } from './CanvasFlowPanels';
import { EDGE_DEFAULTS, buildRelationView } from './CanvasNodeRelationView';
import { CanvasSourceCodeViewer } from './CanvasSourceCodeViewer';
import { CanvasAskBar, type CanvasAskMessage } from './CanvasAskBar';

const NODE_TYPES = { card: CanvasNodeCard, box: CanvasBox };

function StarBackground({ color }: { color: string }) {
  const { x, y, zoom } = useViewport();
  const gap = 24 * zoom;
  const arm = 2 * zoom;
  const px = ((x % gap) + gap) % gap;
  const py = ((y % gap) + gap) % gap;
  const cx = gap / 2, cy = gap / 2;
  const d = `M ${cx},${cy - arm} A ${arm},${arm} 0 0 0 ${cx + arm},${cy} A ${arm},${arm} 0 0 0 ${cx},${cy + arm} A ${arm},${arm} 0 0 0 ${cx - arm},${cy} A ${arm},${arm} 0 0 0 ${cx},${cy - arm} Z`;

  return (
    <Panel position="top-left" style={{ inset: 0, margin: 0, pointerEvents: 'none', zIndex: -1, overflow: 'hidden' }}>
      <svg width="100%" height="100%">
        <defs>
          <pattern id="star-bg" x={px} y={py} width={gap} height={gap} patternUnits="userSpaceOnUse">
            <path d={d} fill={color} />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#star-bg)" />
      </svg>
    </Panel>
  );
}

interface InnerProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange: (e: any) => void;
  onEdgesChange: (e: any) => void;
  onConnect: (c: Connection) => void;
  onNodeDrag: (_event: globalThis.MouseEvent | TouchEvent, node: Node) => void;
  onNodeDragStop: (_event: globalThis.MouseEvent | TouchEvent, node: Node) => void;
  onViewportChange?: (vp: Viewport) => void;
  focusPortalId?: string | null;
  onPortalNodeDoubleClick?: (nodeId: string) => void;
  onAskCanvas?: (query: string) => void | Promise<void>;
  askMessages?: CanvasAskMessage[];
  askBusy?: boolean;
  dark: boolean;
}

export function CanvasFlowInner({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeDrag,
  onNodeDragStop,
  onViewportChange,
  focusPortalId,
  onPortalNodeDoubleClick,
  onAskCanvas,
  askMessages,
  askBusy,
  dark,
}: InnerProps) {
  useOnViewportChange({ onChange: vp => onViewportChange?.(vp) });
  const { fitView } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const didInitialFitRef = useRef(false);
  const lastPortalFitRef = useRef<string | null>(null);
  const relationView = useMemo(() => buildRelationView(nodes, edges, focusPortalId), [edges, focusPortalId, nodes]);

  useEffect(() => {
    if (didInitialFitRef.current) return;
    const visibleNodes = nodes.filter(node => !node.hidden);
    if (visibleNodes.length === 0) return;
    const timer = window.setTimeout(() => {
      fitView({
        nodes: visibleNodes.map(node => ({ id: node.id })),
        duration: 0,
        padding: 0.18,
      });
      didInitialFitRef.current = true;
    }, 80);
    return () => window.clearTimeout(timer);
  }, [fitView, nodes]);

  useEffect(() => {
    if (!focusPortalId) {
      lastPortalFitRef.current = null;
      return;
    }
    if (lastPortalFitRef.current === focusPortalId) return;

    const focusNode = relationView.nodes.find(node => node.id === focusPortalId);
    const childIds = (focusNode?.data as any)?.childIds;
    const visibleIds = new Set([
      focusPortalId,
      ...(Array.isArray(childIds) ? childIds.filter(Boolean) : []),
    ]);
    const fitNodes = relationView.nodes
      .filter(node => visibleIds.has(node.id) && !node.hidden)
      .map(node => ({ id: node.id }));
    if (fitNodes.length === 0) return;

    lastPortalFitRef.current = focusPortalId;
    const timer = window.setTimeout(() => {
      fitView({ nodes: fitNodes, duration: 220, padding: 0.2 });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [fitView, focusPortalId, relationView.nodes]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const suppressCtx = (e: globalThis.MouseEvent) => {
      e.preventDefault();
    };
    el.addEventListener('contextmenu', suppressCtx, { capture: true });
    return () => {
      el.removeEventListener('contextmenu', suppressCtx, { capture: true });
    };
  }, []);

  const bgColor = '#EEEDF6';
  const dotColor = '#C8C7D6';
  const vars = {
    '--cn-bg': '#FFFFFF',
    '--cn-fg': '#1A1A1A',
    '--cn-border': 'rgba(0,0,0,0.08)',
    '--cn-dim': '#AAA',
  } as CSSProperties;

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height: '100%', background: bgColor, ...vars }}>
      <style>{`
        .react-flow__pane { cursor: default !important; }
        .react-flow__pane.dragging { cursor: grabbing !important; }
        .react-flow__node { cursor: default; }
        .react-flow__node:hover .react-flow__handle[data-handletype="source"]:not(.gsyen-side-aware-handle) { opacity: 0.55 !important; }
        .react-flow__node.selected .react-flow__handle[data-handletype="source"]:not(.gsyen-side-aware-handle) { opacity: 0.75 !important; }
      `}</style>
      <ReactFlow
        nodes={relationView.nodes}
        edges={relationView.edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeDoubleClick={(_event, node) => {
          const ids = (node.data as any).childIds;
          if (Array.isArray(ids) && ids.length > 0) onPortalNodeDoubleClick?.(node.id);
        }}
        nodeTypes={NODE_TYPES}
        defaultEdgeOptions={EDGE_DEFAULTS}
        colorMode={dark ? 'dark' : 'light'}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
        proOptions={{ hideAttribution: true }}
        panOnDrag={[1, 2]}
        panOnScroll
      >
        <StarBackground color={dotColor} />
        <CanvasRightControls dark={dark} />
        {onAskCanvas && <CanvasAskBar busy={askBusy} messages={askMessages} onSubmit={onAskCanvas} />}
      </ReactFlow>
      <CanvasSourceCodeViewer />
    </div>
  );
}


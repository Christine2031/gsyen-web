import { useCallback, useMemo, useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react';
import {
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Node,
  type Viewport,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { CardData } from './CanvasNodeCard';
import type { CardBorder, CardSize } from './CanvasCardData';
import { CanvasFlowInner } from './CanvasFlowInner';
import {
  ABSORB_PREVIEW_RATIO,
  SIZE_DIM,
  absorbCandidateId,
  attachToCollection,
  clearAbsorbPreview,
  markAbsorbPreview,
} from './CanvasNodeCollection';
import { EDGE_DEFAULTS } from './CanvasNodeRelationView';
import { canvasStore } from '../stores/canvasStore';
import { toObsidian, loadGraph } from './canvasObsidian';
import { searchLocalCode } from './canvasLocalCodeSearch';
import { applyCanvasAskResults } from './canvasAskGraph';
import {
  isCanvasCodeAsk,
  loadCanvasSession,
  takePendingCanvasAsk,
  type PendingCanvasAsk,
} from './canvasCodeAskCommand';
import { runCanvasModelTurn } from './canvasSessionGateway';
import type { CanvasAskMessage } from './CanvasAskBar';

export interface CanvasNodeEditorRef { addCard: () => void }
const READY_MESSAGE: CanvasAskMessage = {
  id: 'canvas-ask-ready',
  role: 'assistant',
  text: '灵阁 Session 已连接当前 canvas。输入问题，我会在图上展开相关代码。',
};

function portalChildren(node: Node) {
  const ids = (node.data as CardData).childIds;
  return Array.isArray(ids) ? ids.filter(Boolean) : [];
}

function portalDescendants(rootId: string, nodes: Node[]) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const out = new Set<string>();
  const visit = (id: string) => {
    const node = byId.get(id);
    if (!node) return;
    for (const childId of portalChildren(node)) {
      if (out.has(childId)) continue;
      out.add(childId);
      visit(childId);
    }
  };
  visit(rootId);
  return out;
}

function replaceCanvasReply(messages: CanvasAskMessage[], id: string, text: string) {
  const next = messages.filter(message => message.id !== READY_MESSAGE.id);
  const existing = next.find(message => message.id === id);
  if (existing) {
    return next.map(message => message.id === id ? { ...message, text } : message).slice(-6);
  }
  return [...next, { id, role: 'assistant' as const, text }].slice(-6);
}

export const CanvasNodeEditor = forwardRef<CanvasNodeEditorRef, { docId: string; dark: boolean; onViewportChange?: (vp: Viewport) => void }>(
  ({ docId, dark, onViewportChange }, ref) => {
    const initial = loadGraph(docId);
    const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges);
    const [focusPortalId, setFocusPortalId] = useState<string | null>(
      () => initial.nodes.find(n => Boolean((n.data as CardData).portalExpanded))?.id ?? null
    );
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const absorbPreviewRef = useRef<string | null>(null);
    const askSessionIdRef = useRef<string | undefined>(undefined);
    const [askBusy, setAskBusy] = useState(false);
    const [askMessages, setAskMessages] = useState<CanvasAskMessage[]>([READY_MESSAGE]);

    const scheduleSave = useCallback((ns: Node[], es: typeof edges) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() =>
        canvasStore.update(docId, { content: JSON.stringify(toObsidian(ns, es)) }), 600);
    }, [docId]);

    const onConnect = useCallback((conn: Connection) => {
      setEdges(es => {
        const next = addEdge({ ...conn, id: `edge-${Date.now()}`, ...EDGE_DEFAULTS }, es);
        scheduleSave(nodes, next);
        return next;
      });
    }, [nodes, scheduleSave, setEdges]);

    useEffect(() => {
      scheduleSave(nodes, edges);
    }, [nodes, edges, scheduleSave]);

    const addCardNode = useCallback((pos: { x: number; y: number }, size: CardSize, border: CardBorder) => {
      const id = `card-${Date.now()}`;
      const { w, h } = SIZE_DIM[size];
      const data: CardData = {
        cardType: 'solid', cardSize: size, contentType: 'note',
        text: '', entityName: '', entitySub: 'NOTE',
        status: '草稿', statusColor: 'gray',
        cardBorder: border, cardElevation: 'flat', cardOpacity: 'solid',
        cardCorner: 'sm', cardDensity: 'compact', cardState: 'normal',
        width: w, height: h,
      };
      setNodes(ns => {
        const next = [...ns, { id, type: 'card', position: pos, data }];
        scheduleSave(next, edges);
        return next;
      });
    }, [setNodes, scheduleSave, edges]);

    const addA = useCallback((pos: { x: number; y: number }, size: CardSize) => {
      addCardNode(pos, size, 'solid');
    }, [addCardNode]);

    const handleNodeDrag = useCallback((_event: globalThis.MouseEvent | TouchEvent, node: Node) => {
      setNodes(ns => {
        const targetId = absorbCandidateId(ns, node, ABSORB_PREVIEW_RATIO);
        if (targetId === absorbPreviewRef.current) return ns;
        absorbPreviewRef.current = targetId;
        return markAbsorbPreview(ns, targetId);
      });
    }, [setNodes]);

    const handleNodeDragStop = useCallback((_event: globalThis.MouseEvent | TouchEvent, node: Node) => {
      absorbPreviewRef.current = null;
      setNodes(ns => {
        const next = clearAbsorbPreview(attachToCollection(ns, node));
        scheduleSave(next, edges);
        return next;
      });
    }, [setNodes, scheduleSave, edges]);

    const addCard = useCallback(() => {
      addA({ x: 80 + Math.random() * 200, y: 80 + Math.random() * 120 }, 'S');
    }, [addA]);

    const togglePortal = useCallback((nodeId: string) => {
      const target = nodes.find(n => n.id === nodeId);
      if (!target || portalChildren(target).length === 0) return;
      const focusedInsideTarget = Boolean(focusPortalId && portalDescendants(nodeId, nodes).has(focusPortalId));
      const collapsing = focusPortalId === nodeId || focusedInsideTarget;
      const parentPortalId = (target.data as CardData).parentPortalId;
      const nextFocusId = collapsing ? parentPortalId ?? null : nodeId;
      setFocusPortalId(nextFocusId);
      setNodes(ns => {
        const target = ns.find(n => n.id === nodeId);
        if (!target || portalChildren(target).length === 0) return ns;
        const focusNode = nextFocusId ? ns.find(n => n.id === nextFocusId) : null;
        const visible = new Set(nextFocusId && focusNode ? [nextFocusId, ...portalChildren(focusNode)] : []);
        const descendants = portalDescendants(nodeId, ns);
        const next = ns.map(n => {
          const data = n.data as CardData;
          const hasParent = Boolean(data.parentPortalId);
          const isPortal = portalChildren(n).length > 0;
          const nextData = isPortal
            ? { ...data, portalExpanded: nextFocusId === n.id }
            : data;
          const hidden = nextFocusId && visible.has(n.id)
            ? false
            : nextFocusId && hasParent
              ? true
              : collapsing && descendants.has(n.id)
                ? true
                : n.hidden;
          return hidden === n.hidden && nextData === data ? n : { ...n, hidden, data: nextData };
        });
        scheduleSave(next, edges);
        return next;
      });
    }, [edges, focusPortalId, nodes, scheduleSave, setNodes]);

    const handleAskCanvas = useCallback(async (query: string, sessionId?: string, existingSession = false) => {
      const stamp = Date.now();
      const replyId = `ask-ai-${stamp}`;
      if (sessionId) askSessionIdRef.current = sessionId;
      if (existingSession) {
        const loaded = loadCanvasSession(sessionId);
        setAskMessages(loaded.length ? loaded.slice(-6) : [READY_MESSAGE]);
      } else {
        const userMessage: CanvasAskMessage = { id: `ask-user-${stamp}`, role: 'user', text: query };
        setAskMessages(prev => [...prev.filter(message => message.id !== READY_MESSAGE.id), userMessage].slice(-6));
      }
      setAskBusy(true);
      try {
        const codeAsk = isCanvasCodeAsk(query);
        let context = '用户正在 GYEN-Human-Map.canvas 里提问。请用当前主 session 的模型回答，并结合画布上下文。';
        if (codeAsk) {
          const results = await searchLocalCode(query);
          const next = applyCanvasAskResults(nodes, edges, query, results);
          if (next.focusPortalId) setFocusPortalId(next.focusPortalId);
          setNodes(next.nodes);
          setEdges(next.edges);
          scheduleSave(next.nodes, next.edges);
          const ranges = results.map(result =>
            `- ${result.title}: ${result.sourcePath} L${result.lineStart}-L${result.lineEnd}`
          ).join('\n');
          context = results.length > 0
            ? `Canvas 已展开 ${results.length} 张本地代码卡。请解释为什么这些代码相关，并优先引用这些文件和行号：\n${ranges}`
            : 'Canvas 本地代码图没有找到匹配卡。请直接按主 session 上下文回答，并建议用户换一个更具体的代码词。';
        }
        setAskMessages(prev => replaceCanvasReply(prev, replyId, '正在连接主 session 的模型...'));
        const saved = await runCanvasModelTurn({
          sessionId: askSessionIdRef.current,
          query,
          lang: 'zh',
          context,
          userAlreadySaved: existingSession,
          onToken: text => setAskMessages(prev => replaceCanvasReply(prev, replyId, text)),
        });
        askSessionIdRef.current = saved.sessionId;
        setAskMessages(saved.canvasMessages.slice(-6));
      } finally {
        setAskBusy(false);
      }
    }, [edges, nodes, scheduleSave, setEdges, setNodes]);

    useEffect(() => {
      const run = (pending: PendingCanvasAsk | null) => {
        if (!pending || pending.docId !== docId) return;
        void handleAskCanvas(pending.query, pending.sessionId, true);
      };
      run(takePendingCanvasAsk(docId));
      const onAsk = (event: Event) => run((event as CustomEvent<PendingCanvasAsk>).detail);
      window.addEventListener('gsyen-canvas-ask', onAsk);
      return () => window.removeEventListener('gsyen-canvas-ask', onAsk);
    }, [docId, handleAskCanvas]);

    const renderNodes = useMemo(() => nodes.map(n => ({
      ...n,
      data: {
        ...n.data,
        onPortalToggle: togglePortal,
        portalFocusActive: focusPortalId === n.id,
      },
    })), [focusPortalId, nodes, togglePortal]);

    useImperativeHandle(ref, () => ({ addCard }), [addCard]);

    return (
      <ReactFlowProvider>
        <CanvasFlowInner
          nodes={renderNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          onViewportChange={onViewportChange}
          focusPortalId={focusPortalId}
          onPortalNodeDoubleClick={togglePortal}
          onAskCanvas={handleAskCanvas}
          askMessages={askMessages}
          askBusy={askBusy}
          dark={dark}
        />
      </ReactFlowProvider>
    );
  }
);

CanvasNodeEditor.displayName = 'CanvasNodeEditor';


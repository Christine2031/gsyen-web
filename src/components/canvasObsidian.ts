import { MarkerType, type Node, type Edge } from '@xyflow/react';
import type { BoxData, CardData } from './CanvasCardData';
import { canvasStore } from '../stores/canvasStore';

export interface SavedGraph { nodes: Node[]; edges: Edge[] }

const SIDE:   Record<string, string> = { top: 't', right: 'r', bottom: 'b', left: 'l' };
const SIDE_R: Record<string, string> = { t: 'top', r: 'right', b: 'bottom', l: 'left' };

const EDGE_COLOR = 'rgba(126,136,154,0.26)';
const EDGE_STYLE = { stroke: EDGE_COLOR, strokeWidth: 2.2, strokeLinecap: 'round' as const };
const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: EDGE_COLOR, width: 14, height: 14 };

function obsidianNodeText(n: any): string {
  if (n.type === 'file')  return `📎 ${n.file ?? ''}`;
  if (n.type === 'link')  return `🔗 ${n.url ?? ''}`;
  if (n.type === 'group') return `▣ ${n.label ?? 'Group'}`;
  return n.text ?? '';
}

export function fromObsidian(raw: any): SavedGraph {
  const nodes: Node[] = (raw.nodes ?? []).map((n: any) => ({
    id: n.id, type: n.type === 'group' || n.type === 'box' ? 'box' : 'card',
    position: { x: n.x ?? 0, y: n.y ?? 0 },
    parentId: n.parentId,
    hidden: n.hidden,
    style: n.width || n.height ? { width: n.width, height: n.height } : undefined,
    data: n.type === 'group' || n.type === 'box' ? {
      label: n.label ?? '集合',
      moduleColor: n.moduleColor ?? 'green',
      childCount: n.childCount ?? 0,
      collapsed: Boolean(n.collapsed),
      collectionId: n.collectionId ?? n.id,
      width: n.width ?? 420,
      height: n.height ?? 280,
      _obs: { ...n, type: 'group' },
    } as BoxData : {
      text: obsidianNodeText(n),
      color: n.color ?? '',
      width: n.width ?? 250, height: n.height ?? 100,
      cardType:      'solid',
      cardSize:      n.cardSize,
      childIds:      Array.isArray(n.childIds) ? n.childIds : undefined,
      parentPortalId:n.parentPortalId,
      portalExpanded:Boolean(n.portalExpanded),
      sourcePath:    n.sourcePath,
      entityName:    n.entityName,
      entitySub:     n.entitySub,
      connectorName: n.connectorName,
      connectorType: n.connectorType,
      flowA: n.flowA, flowB: n.flowB,
      contentType:   n.contentType ?? 'note',
      cardBorder:    n.cardBorder,
      cardAccent:    n.cardAccent,
      cardElevation: n.cardElevation,
      cardOpacity:   n.cardOpacity,
      cardCorner:    n.cardCorner,
      cardDensity:   n.cardDensity,
      cardState:     n.cardState,
      _obs: { ...n, type: 'text', cardType: 'solid' },
    },
  }));
  const edges: Edge[] = (raw.edges ?? []).map((e: any) => ({
    id: e.id, source: e.fromNode, target: e.toNode,
    sourceHandle: `src-${SIDE[e.fromSide] ?? 'r'}`,
    targetHandle: `tgt-${SIDE[e.toSide] ?? 'l'}`,
    label: e.label,
    style: EDGE_STYLE,
    markerEnd: EDGE_MARKER,
    data: { _obs: e },
  }));
  return { nodes, edges };
}

export function toObsidian(nodes: Node[], edges: Edge[]) {
  return {
    nodes: nodes.map(n => {
      if (n.type === 'box') {
        const d = n.data as BoxData & { _obs?: any };
        const x = Math.round(n.position.x);
        const y = Math.round(n.position.y);
        const obj: any = {
          id: n.id,
          type: 'group',
          x,
          y,
          width: d.width ?? 420,
          height: d.height ?? 280,
          label: d.label ?? '集合',
          moduleColor: d.moduleColor ?? 'green',
          childCount: d.childCount ?? 0,
          collapsed: Boolean(d.collapsed),
          collectionId: d.collectionId ?? n.id,
        };
        if (n.parentId) obj.parentId = n.parentId;
        if (n.hidden) obj.hidden = n.hidden;
        return obj;
      }

      const d = n.data as CardData & { _obs?: any };
      const x = Math.round(n.position.x);
      const y = Math.round(n.position.y);

      const obj: any = { id: n.id, type: 'text', x, y,
        width: d.width ?? 250, height: d.height ?? 100, text: d.text ?? '' };
      if (n.parentId)      obj.parentId      = n.parentId;
      if (n.hidden)        obj.hidden        = n.hidden;
      if (d.color)         obj.color         = d.color;
      obj.cardType = 'solid';
      if (d.cardSize)      obj.cardSize      = d.cardSize;
      if (Array.isArray(d.childIds) && d.childIds.length) obj.childIds = d.childIds;
      if (d.parentPortalId)obj.parentPortalId= d.parentPortalId;
      if (d.portalExpanded)obj.portalExpanded= d.portalExpanded;
      if (d.sourcePath)    obj.sourcePath    = d.sourcePath;
      if (d.entityName)    obj.entityName    = d.entityName;
      if (d.entitySub)     obj.entitySub     = d.entitySub;
      if (d.connectorName) obj.connectorName = d.connectorName;
      if (d.connectorType) obj.connectorType = d.connectorType;
      if (d.flowA)         obj.flowA         = d.flowA;
      if (d.flowB)         obj.flowB         = d.flowB;
      if (d.contentType)   obj.contentType   = d.contentType;
      if (d.cardBorder)    obj.cardBorder    = d.cardBorder;
      if (d.cardAccent)    obj.cardAccent    = d.cardAccent;
      if (d.cardElevation) obj.cardElevation = d.cardElevation;
      if (d.cardOpacity)   obj.cardOpacity   = d.cardOpacity;
      if (d.cardCorner)    obj.cardCorner    = d.cardCorner;
      if (d.cardDensity)   obj.cardDensity   = d.cardDensity;
      if (d.cardState)     obj.cardState     = d.cardState;
      return obj;
    }),
    edges: edges.map(e => {
      const obs = (e.data as any)?._obs ?? {};
      const { color: _color, style: _style, markerEnd: _markerEnd, animated: _animated, ...restObs } = obs;
      return {
        ...restObs,
        id: e.id,
        fromNode: e.source,
        fromSide: SIDE_R[e.sourceHandle?.replace('src-', '') ?? 'r'] ?? 'right',
        toNode: e.target,
        toSide: SIDE_R[e.targetHandle?.replace('tgt-', '') ?? 'l'] ?? 'left',
      };
    }),
  };
}

export function loadGraph(docId: string): SavedGraph {
  try {
    const doc = canvasStore.getById(docId);
    if (!doc?.content) return { nodes: [], edges: [] };
    const raw = JSON.parse(doc.content);
    return fromObsidian(raw);
  } catch { return { nodes: [], edges: [] }; }
}
